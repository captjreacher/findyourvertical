// Static contract checks over the Creator Intelligence Package migration + the
// completion-flow wiring. These need no database — they assert the security /
// atomicity / boundary shape is present so regressions are caught in CI.
// Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260712000000_fyv_creator_intelligence_package.sql', import.meta.url),
  'utf8',
);
const api = readFileSync(
  new URL('../src/lib/creators-api.ts', import.meta.url),
  'utf8',
);

function has(re: RegExp, msg: string) {
  assert.ok(re.test(sql), msg);
}

test('wraps in a single transaction', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
});

test('creates the package table with RLS + updated_at trigger', () => {
  has(/create table if not exists public\.creator_intelligence_packages/i, 'table');
  has(/alter table public\.creator_intelligence_packages enable row level security/i, 'RLS enabled');
  has(/create trigger trg_creator_intelligence_packages_updated_at[\s\S]*?public\.set_updated_at\(\)/i, 'updated_at trigger');
});

test('lifecycle is published/superseded only (CHECK, no draft this pass)', () => {
  has(/package_state[\s\S]*?check \(package_state in \('published', 'superseded'\)\)/i, 'state CHECK');
  assert.ok(!/'draft'/.test(sql), 'no draft state in this pass');
});

test('one active published package per creator (partial unique index)', () => {
  has(/create unique index if not exists creator_intelligence_packages_one_published[\s\S]*?where package_state = 'published'/i, 'one-published partial unique');
});

test('package_reference uniqueness + creator lookup index', () => {
  has(/unique \(package_reference\)/i, 'unique package_reference');
  has(/idx_creator_intelligence_packages_profile[\s\S]*?\(creator_profile_id, created_at desc\)/i, 'creator lookup index');
});

test('anon + PUBLIC revoked; creator read-only; agency full access', () => {
  has(/revoke all on public\.creator_intelligence_packages from public/i, 'revoke public');
  has(/revoke all on public\.creator_intelligence_packages from anon/i, 'revoke anon');
  has(/grant select on public\.creator_intelligence_packages to authenticated/i, 'authenticated select');
  has(/"Agency full access intelligence packages"[\s\S]*?for all/i, 'agency policy');
  has(/"Creator can read own intelligence packages"[\s\S]*?for select[\s\S]*?current_creator_profile_id\(\)/i, 'creator read policy');
  assert.ok(!/Creator can (insert|update|delete) own intelligence/i.test(sql), 'no creator write policy');
});

test('package_reference is opaque, UUID-based, server-generated (no dates)', () => {
  has(/'fyv\.creator\.intelligence\.' \|\| gen_random_uuid\(\)/i, 'opaque uuid reference');
});

test('publish RPC is atomic, security definer, supersede + insert + emit', () => {
  has(/create or replace function public\.publish_creator_intelligence_package/i, 'rpc defined');
  has(/security definer/i, 'security definer');
  has(/set search_path = public, pg_temp/i, 'search_path pinned');
  has(/update public\.creator_intelligence_packages[\s\S]*?set package_state = 'superseded'/i, 'supersede prior active');
  has(/insert into public\.creator_intelligence_packages[\s\S]*?'published'/i, 'insert published package');
  has(/insert into public\.events[\s\S]*?'creator\.intelligence_package\.published'/i, 'emit published event');
});

test('publish RPC validates a real assessment completion', () => {
  has(/assessment_id is required/i, 'assessment id required');
  has(/assessment does not belong to creator/i, 'assessment ownership check');
});

test('event payload carries the canonical handoff fields', () => {
  for (const key of ['event_type', 'source_product', 'creator_reference', 'package_reference', 'package_id', 'package_state']) {
    assert.ok(new RegExp(`'${key}'`).test(sql), `payload missing ${key}`);
  }
  has(/'source_product', +'FYV'/i, 'source_product is FYV');
});

test('outbox dedup: at most one published event per package_reference', () => {
  has(/create unique index if not exists events_intelligence_package_published_ref[\s\S]*?payload ->> 'package_reference'[\s\S]*?where event_type = 'creator\.intelligence_package\.published'/i, 'events dedup index');
});

test('EXECUTE granted to anon (public completion path) + service_role', () => {
  has(/grant execute on function public\.publish_creator_intelligence_package\([^)]*\) to anon/i, 'anon execute');
  has(/grant execute on function public\.publish_creator_intelligence_package\([^)]*\) to service_role/i, 'service_role execute');
});

test('migration does NOT touch report_json / creator_reports (no coupling)', () => {
  // Strip line comments: the header legitimately *mentions* these to document
  // the boundary. We assert no EXECUTABLE statement references them.
  const exec = sql.replace(/--.*$/gm, '');
  assert.ok(!/creator_reports/i.test(exec), 'must not reference/alter creator_reports');
  assert.ok(!/report_json/i.test(exec), 'must not embed lifecycle in report_json');
});

// ── Completion-flow wiring (static, over creators-api.ts) ────────────────────
test('submitAssessment publishes the package before the completion event', () => {
  const publishAt = api.indexOf('publish_creator_intelligence_package');
  const completedAt = api.indexOf("'creator.assessment.completed'");
  assert.ok(publishAt > -1, 'publish RPC wired into creators-api');
  assert.ok(completedAt > -1, 'existing completion event still present (unchanged)');
  assert.ok(publishAt < completedAt, 'package publish must run before the completion event');
});

test('a hard publish failure throws (prevents successful completion)', () => {
  assert.ok(
    /if \(publishError\)[\s\S]*?throw new Error\(`Failed to publish creator intelligence package/i.test(api),
    'publish failure must throw',
  );
});
