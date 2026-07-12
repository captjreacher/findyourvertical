// Static contract checks over the publish-snapshot migration + completion wiring.
// No database required — run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260713000000_fyv_publish_intelligence_snapshot_fn.sql', import.meta.url),
  'utf8',
);
const api = readFileSync(new URL('../src/lib/creators-api.ts', import.meta.url), 'utf8');

const has = (re: RegExp, msg: string) => assert.ok(re.test(sql), msg);

test('single transaction', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
});

test('publish RPC is SECURITY DEFINER with pinned search_path', () => {
  has(/create or replace function public\.fyv_publish_intelligence_snapshot/i, 'rpc defined');
  has(/security definer/i, 'security definer');
  has(/set search_path = public, pg_temp/i, 'search_path pinned');
});

test('resolves the FMF shadow creator via onlyfans_handle == of_creators.username', () => {
  has(/from public\.creator_profiles where id = p_creator_profile_id/i, 'load handle');
  has(/from public\.of_creators\s+where lower\(username\) = lower\(v_handle\)/i, 'resolve of_creators by username');
});

test('writes ONLY existing tables; no packages table, no new tables, no FMF-onboarding writes', () => {
  // Strip line comments so documentation prose does not trip the negative checks.
  const exec = sql.replace(/--.*$/gm, '');
  assert.ok(!/create table/i.test(exec), 'no table creation');
  assert.ok(!/creator_intelligence_packages/i.test(exec), 'no packages table');
  assert.ok(!/publish_creator_intelligence_package\b/i.test(exec), 'no old RPC name');
  // must not mutate onboarding lifecycle / of_creators
  assert.ok(!/update public\.of_creators/i.test(exec), 'no of_creators update');
  assert.ok(!/onboarding_status/i.test(exec), 'no onboarding_status writes');
  assert.ok(!/superseded_at/i.test(exec), 'does not touch superseded_at in this pass');
});

test('idempotent reconcile: snapshot + projections ON CONFLICT DO NOTHING', () => {
  has(/insert into public\.creator_intelligence_snapshots[\s\S]*?on conflict \(creator_id, source_package_reference\) do nothing/i, 'snapshot upsert');
  has(/insert into public\.creator_intelligence_opportunity_projections[\s\S]*?on conflict \(intelligence_snapshot_id, source_opportunity_reference\) do nothing/i, 'projection upsert');
});

test('event is append-only + deterministically deduped (correlation_id)', () => {
  has(/create unique index if not exists events_cip_published_correlation_uidx[\s\S]*?where event_type = 'creator\.intelligence_package\.published'/i, 'dedupe unique index');
  has(/insert into public\.events[\s\S]*?'creator\.intelligence_package\.published'[\s\S]*?where not exists/i, 'event insert deduped');
});

test('event payload carries namespaced creator_reference + external_identity', () => {
  has(/'creator_reference', 'fyv:' \|\| p_creator_profile_id::text/i, 'namespaced creator_reference');
  has(/'external_identity', jsonb_build_object\([\s\S]*?'platform_provider'[\s\S]*?'platform_account_id'[\s\S]*?'reference'/i, 'external_identity block');
  has(/'contract_version', 'creator-intelligence-package-v1'/i, 'contract version');
});

test('unresolved mapping is a non-fatal diagnostic event', () => {
  has(/create or replace function public\.fyv_emit_intelligence_unresolved/i, 'unresolved emitter');
  has(/'creator\.intelligence_package\.handoff_unresolved'/i, 'unresolved event type');
  has(/exception when others then\s*null/i, 'diagnostics never throw');
  has(/return jsonb_build_object\('resolved', false/i, 'publish returns resolved:false without raising');
});

test('EXECUTE granted to anon (completion path) + service_role (backfill)', () => {
  has(/grant execute on function public\.fyv_publish_intelligence_snapshot\([^)]*\) to anon/i, 'anon execute');
  has(/grant execute on function public\.fyv_publish_intelligence_snapshot\([^)]*\) to service_role/i, 'service_role execute');
});

// ── Completion-flow wiring (static, over creators-api.ts) ────────────────────
test('submitAssessment calls the publisher, not the removed RPC/table', () => {
  assert.ok(/publishCreatorIntelligencePackage\(/.test(api), 'publisher wired');
  assert.ok(!/publish_creator_intelligence_package/.test(api), 'no reference to removed RPC');
  assert.ok(!/creator_intelligence_packages/.test(api), 'no reference to removed packages table');
  assert.ok(!/buildIntelligencePackageBody/.test(api), 'no reference to removed builder');
});
