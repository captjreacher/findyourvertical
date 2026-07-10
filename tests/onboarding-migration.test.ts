// Static contract checks over the onboarding migration SQL (no DB needed).
// Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260711000000_fyv_creator_onboarding.sql', import.meta.url),
  'utf8',
);
const has = (re: RegExp, msg: string) => assert.ok(re.test(sql), msg);

test('single transaction', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
});

test('both tables created with RLS', () => {
  has(/create table if not exists public\.creator_onboarding_cases/i, 'cases table');
  has(/create table if not exists public\.creator_onboarding_invitations/i, 'invitations table');
  has(/alter table public\.creator_onboarding_cases enable row level security/i, 'cases RLS');
  has(/alter table public\.creator_onboarding_invitations enable row level security/i, 'invitations RLS');
});

test('anon + PUBLIC revoked; authenticated select-only; service_role writes', () => {
  for (const t of ['creator_onboarding_cases', 'creator_onboarding_invitations']) {
    has(new RegExp(`revoke all on public\\.${t} from public`, 'i'), `${t} revoke public`);
    has(new RegExp(`revoke all on public\\.${t} from anon`, 'i'), `${t} revoke anon`);
    has(new RegExp(`grant select on public\\.${t} to authenticated`, 'i'), `${t} select authed`);
    has(new RegExp(`grant select, insert, update, delete on public\\.${t} to service_role`, 'i'), `${t} service_role`);
  }
  assert.ok(!/grant .*insert.* on public\.creator_onboarding_(cases|invitations) to authenticated/i.test(sql));
});

test('one active case per creator + hashed single-use token', () => {
  has(/creator_onboarding_cases_one_active[\s\S]*?where status <> 'complete'/i, 'one-active partial unique');
  has(/token_hash\s+bytea not null unique/i, 'token_hash is bytea + unique');
  assert.ok(!/token_hash\s+text/i.test(sql), 'token is never stored as text');
  has(/gen_random_bytes\(32\)/i, 'raw token from gen_random_bytes');
  has(/digest\(v_raw, 'sha256'\)/i, 'stored token is a sha256 hash');
  has(/token_hash = digest\(p_token, 'sha256'\)/i, 'lookup hashes the presented token');
});

test('redemption is single-use with distinct safe failure codes', () => {
  has(/set accepted_at = now\(\)/i, 'accepted_at set on redemption');
  for (const code of ['invalid', 'revoked', 'expired', 'creator_mismatch', 'already_accepted']) {
    has(new RegExp(`'code', '${code}'`, 'i'), `distinct code ${code}`);
  }
  // creator-mismatch is checked before accepted-state.
  const mismatchIdx = sql.indexOf("'creator_mismatch'");
  const acceptedIdx = sql.indexOf("'already_accepted'");
  assert.ok(mismatchIdx > -1 && acceptedIdx > -1 && mismatchIdx < acceptedIdx, 'mismatch precedes accepted');
});

test('initiate has agency-only force_new with completed-case behaviour', () => {
  has(/initiate_creator_onboarding\(\s*p_creator_profile_id uuid,\s*p_force_new\s+boolean default false/i, 'force_new signature');
  has(/if not public\.is_agency\(\) then/i, 'agency gate');
  has(/status = 'complete'\s*\n\s*order by completed_at desc/i, 'returns latest completed when not force_new');
});

test('invitation.created event payload carries ONLY safe fields (no token/url/hash)', () => {
  const start = sql.indexOf("'onboarding.invitation.created'");
  assert.ok(start > -1, 'event emitted');
  // The jsonb payload block following the event type.
  const block = sql.slice(start, start + 500);
  for (const f of ['creator_profile_id', 'onboarding_case_id', 'invitation_id', 'expires_at', 'source']) {
    assert.ok(block.includes(f), `payload includes ${f}`);
  }
  assert.ok(!/raw_token/i.test(block), 'no raw token in event');
  assert.ok(!/accept_path/i.test(block), 'no URL/path in event');
  assert.ok(!/token_hash/i.test(block), 'no token hash in event');
});

test('creator RPCs authenticated-callable, not anon; agency RPCs not anon', () => {
  for (const fn of ['start_my_onboarding', 'get_my_onboarding_case', 'save_my_onboarding_progress', 'submit_my_onboarding', 'redeem_onboarding_invitation']) {
    has(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,120}?to authenticated`, 'i'), `${fn} to authenticated`);
  }
  for (const fn of ['redeem_onboarding_invitation', 'initiate_creator_onboarding', 'create_onboarding_invitation', 'complete_creator_onboarding']) {
    has(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,200}?from anon`, 'i'), `${fn} revoke anon`);
  }
});

test('security definer functions pin search_path', () => {
  const count = (sql.match(/set search_path = public, pg_temp/gi) || []).length;
  assert.ok(count >= 10, `expected >=10 search_path pins, got ${count}`);
});
