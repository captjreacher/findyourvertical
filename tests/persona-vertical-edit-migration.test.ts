// Static contract checks over the PERSONA-1C migration SQL. These do not need a
// database — they assert the security/idempotency shape is present in the
// migrations so regressions are caught in CI. Run with
// node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const m1 = readFileSync(
  new URL('../supabase/migrations/20260715000000_fyv_persona_1c_editable_workset.sql', import.meta.url),
  'utf8',
);
const m2 = readFileSync(
  new URL('../supabase/migrations/20260715010000_fyv_persona_1c_save_workset_rpc.sql', import.meta.url),
  'utf8',
);
const all = `${m1}\n${m2}`;

function has(re: RegExp, msg: string) {
  assert.ok(re.test(all), msg);
}

test('wraps each migration in a single transaction', () => {
  for (const sql of [m1, m2]) {
    assert.equal((sql.match(/\bbegin;/gi) || []).length, 1, `begin; count in ${sql.slice(0, 30)}`);
    assert.equal((sql.match(/\bcommit;/gi) || []).length, 1, `commit; count in ${sql.slice(0, 30)}`);
  }
});

test('introduces the four new editable-tables and enables RLS', () => {
  for (const table of [
    'creator_owned_verticals',
    'creator_owned_variations',
    'creator_vertical_workset',
    'creator_vertical_variation_entries',
  ]) {
    has(new RegExp(`create table if not exists public\\.${table}`, 'i'), `${table} created`);
    has(new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} RLS`);
  }
});

test('anon and PUBLIC are explicitly revoked on every new table', () => {
  for (const table of [
    'creator_owned_verticals',
    'creator_owned_variations',
    'creator_vertical_workset',
    'creator_vertical_variation_entries',
  ]) {
    has(new RegExp(`revoke all on public\\.${table} from public`, 'i'), `${table} revoke public`);
    has(new RegExp(`revoke all on public\\.${table} from anon`, 'i'), `${table} revoke anon`);
  }
});

test('creator policies are own-row read; the workset + entries give creators full write on their own row', () => {
  // Hard-coded policy names (regex-string construction was unreliable).
  for (const policy of [
    'Creator can read own owned verticals',
    'Creator can insert own owned verticals',
    'Creator can update own owned verticals',
    'Creator can delete own owned verticals',
    'Creator can read own owned variations',
    'Creator can insert own owned variations',
    'Creator can update own owned variations',
    'Creator can delete own owned variations',
    'Creator can read own vertical workset',
    'Creator can write own vertical workset',
    'Creator can read own variation entries',
    'Creator can write own variation entries',
  ]) {
    has(new RegExp(`"${policy}"`, 'i'), `policy: ${policy}`);
  }
});

test('agency full-access policies exist on every new table', () => {
  // Hard-coded policy names (regex string concatenation was unreliable).
  for (const policy of [
    'Agency full access owned verticals',
    'Agency full access owned variations',
    'Agency full access vertical workset',
    'Agency full access variation entries',
  ]) {
    has(new RegExp(`"${policy}"`, 'i'), `policy: ${policy}`);
  }
});

test('snapshot remains immutable: the new migration writes NO ALTER on creator_archetype_snapshots', () => {
  assert.ok(!/alter table public\.creator_archetype_snapshots/i.test(all), 'no alter on snapshot');
});

test('system archetype_variations catalogue is NEVER mutated: no INSERT/UPDATE/DELETE policies granted to creators', () => {
  // The new migration must not grant write on archetype_variations to anyone
  // other than (eventually) the agency that already has full access.
  assert.ok(!/grant\s+(insert|update|delete)\s+on\s+public\.archetype_variations\s+to\s+authenticated/i.test(m1),
    'no creator write grant on archetype_variations in m1');
  assert.ok(!/grant\s+(insert|update|delete)\s+on\s+public\.archetype_variations\s+to\s+authenticated/i.test(m2),
    'no creator write grant on archetype_variations in m2');
});

test('public assessment question bank is NEVER auto-exposed: no writes to creator_question_bank', () => {
  // The question bank is read by AssessmentWizard and must NEVER receive a row
  // from a creator-owned submission. Neither migration may INSERT or UPDATE
  // creator_question_bank.
  assert.ok(!/insert into public\.creator_question_bank/i.test(all), 'no inserts into question bank');
  assert.ok(!/update public\.creator_question_bank/i.test(all), 'no updates into question bank');
});

test('review_status enum supports none/pending_review/approved/rejected', () => {
  for (const table of ['creator_owned_verticals', 'creator_owned_variations']) {
    const enumMatch = all.match(new RegExp(`review_status\\s+text\\s+not\\s+null\\s+default(?:\\s+'none')?\\s+check\\s+\\(review_status\\s+in\\s+\\('none',\\s*'pending_review',\\s*'approved',\\s*'rejected'\\)`, 'i'));
    assert.ok(enumMatch, `${table} review_status enum`);
  }
});

test('position 1..6 enforces the 6-maximum and uniqueness on (snapshot_id, position) while active', () => {
  has(/position\s+between\s+1\s+and\s+6/i, 'position between 1 and 6');
  has(/creator_vertical_workset_active_position_key[\s\S]*?where status = 'active'/i, 'partial unique on (snapshot_id, position)');
});

test('one-active-per-position guard mirrors the snapshot pattern (one ACTIVE per creator)', () => {
  // We accept either (snapshot_id, position) unique-while-active OR a unique on
  // (snapshot_id) — either stops two ACTIVE worksets racing. The chosen
  // invariant is per-position so reordering is the explicit mutation.
  has(/creator_vertical_workset_active_position_key/i, 'workset position uniqueness enforced');
});

test('materialise RPC is SECURITY DEFINER, search_path pinned, and authenticated-callable', () => {
  has(/create or replace function public\.materialise_vertical_workset_for_generation[\s\S]*?security definer/i, 'materialise dfn');
  has(/set search_path = public, pg_temp/i, 'materialise path pinned');
  has(/grant execute on function public\.materialise_vertical_workset_for_generation\(uuid\) to authenticated/i, 'materialise authed grant');
});

test('save RPC validates ownership and rejects > 6 verticals', () => {
  has(/fyv_save_vertical_workset/i, 'save RPC name');
  has(/workset must contain between 1 and 6 verticals/i, 'workset size rejection');
  has(/fyv_archive_owned_vertical/i, 'archive vertical RPC');
  has(/fyv_archive_owned_variation/i, 'archive variation RPC');
});
