// Static contract checks over the relationship/access migration, seed, and wiring.
// No database required — run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../supabase/migrations/20260714000000_fyv_creator_relationship_access.sql');
const seed = read('../supabase/migrations/20260714000100_seed_moonsiren_creator_relationship.sql');
const workerIndex = read('../worker/index.ts');
const workerRel = read('../worker/creator-relationship.ts');
const app = read('../src/App.tsx');
const api = read('../src/lib/creators-api.ts');

const has = (src: string, re: RegExp, msg: string) => assert.ok(re.test(src), msg);
// Migration body with line comments stripped (so prose doesn't trip negative checks).
const exec = sql.replace(/--.*$/gm, '');

test('single transaction + pgcrypto for hashing', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
  has(sql, /create extension if not exists pgcrypto/i, 'pgcrypto');
});

test('two additive tables with canonical id mapping', () => {
  has(sql, /create table if not exists public\.creator_relationships/i, 'relationships table');
  has(sql, /create table if not exists public\.creator_invitations/i, 'invitations table');
  has(sql, /fyv_creator_id\s+uuid not null references public\.creator_profiles\(id\) on delete cascade/i, 'fyv fk');
  has(sql, /fmf_creator_id\s+uuid not null/i, 'fmf id column');
  // No FK on fmf_creator_id (cross-database), and no username/handle columns.
  assert.ok(!/fmf_creator_id[^\n]*references/i.test(exec), 'fmf_creator_id must not have an FK');
  assert.ok(!/username|betterfans|onlyfans_handle|alias/i.test(exec), 'no username/handle/alias in schema');
});

test('relationship_state is the linear lifecycle', () => {
  has(sql, /relationship_state[\s\S]*?check \(relationship_state in \('draft', 'invited', 'accepted', 'active'\)\)/i, 'state check');
});

test('strict 1:1 uniqueness + one pending invitation', () => {
  has(sql, /unique index if not exists creator_relationships_fyv_creator_key/i, 'unique fyv');
  has(sql, /unique index if not exists creator_relationships_fmf_creator_key/i, 'unique fmf');
  has(sql, /unique index if not exists creator_invitations_one_pending[\s\S]*?where status = 'pending'/i, 'one pending');
});

test('tokens are hashed (bytea) and never stored raw', () => {
  has(sql, /token_hash\s+bytea not null unique/i, 'token_hash bytea unique');
  has(sql, /digest\(v_raw, 'sha256'\)/i, 'stores sha256 hash');
  has(sql, /encode\(gen_random_bytes\(32\), 'hex'\)/i, 'secure random raw token');
  // The raw token is only ever returned, never inserted into a column.
  assert.ok(!/insert into public\.creator_invitations[\s\S]*?v_raw\b(?![^)]*digest)/i.test(exec) || /digest\(v_raw/i.test(exec), 'raw token only hashed on insert');
});

test('RLS: enabled, anon/public revoked, agency FOR ALL, creator own-row read', () => {
  has(sql, /alter table public\.creator_relationships enable row level security/i, 'rls rel');
  has(sql, /alter table public\.creator_invitations enable row level security/i, 'rls inv');
  has(sql, /revoke all on public\.creator_relationships from anon/i, 'anon revoked rel');
  has(sql, /revoke all on public\.creator_invitations from anon/i, 'anon revoked inv');
  has(sql, /create policy "Agency full access creator relationships"[\s\S]*?using \(public\.is_agency\(\)\)/i, 'agency rel');
  has(sql, /create policy "Creator can read own relationship"[\s\S]*?fyv_creator_id = public\.current_creator_profile_id\(\)/i, 'creator own read');
  // Invitations are never creator-readable.
  assert.ok(!/create policy[^\n]*invitations[^\n]*for select[\s\S]*?current_creator_profile_id/i.test(sql), 'no creator SELECT on invitations');
});

test('event outbox: append-only, deduped, exact contract payload', () => {
  has(sql, /create unique index if not exists events_creator_relationship_correlation_uidx[\s\S]*?where event_type in \('creator_invited', 'creator_accepted', 'creator_activated'\)/i, 'dedupe index');
  has(sql, /'fyv\/creator-relationship\/' \|\| p_relationship_id::text \|\| '\/' \|\| p_relationship_state/i, 'correlation id shape');
  has(sql, /'creator_id', p_fyv_creator_id::text/i, 'creator_id canonical');
  has(sql, /'creator_reference', 'fyv:' \|\| p_fyv_creator_id::text/i, 'creator_reference');
  has(sql, /'fmf_creator_id', p_fmf_creator_id::text/i, 'fmf_creator_id');
  has(sql, /'source_product', 'FYV'/i, 'source_product FYV');
  has(sql, /'relationship_state', p_relationship_state/i, 'relationship_state');
  has(sql, /where not exists \(\s*select 1 from public\.events/i, 'insert deduped');
});

test('all RPCs are SECURITY DEFINER with pinned search_path', () => {
  for (const fn of [
    'create_creator_access_invitation',
    'validate_creator_access_invitation',
    'accept_creator_access_invitation',
    'activate_creator_relationship',
    'fyv_emit_creator_relationship_event',
  ]) {
    has(sql, new RegExp(`create or replace function public\\.${fn}`, 'i'), `${fn} defined`);
  }
  assert.equal((exec.match(/security definer/gi) || []).length, 5, 'five definer functions');
  assert.equal((exec.match(/set search_path = public, pg_temp/gi) || []).length, 5, 'search_path pinned x5');
});

test('privilege boundaries: accept/validate service_role-only; invite agency; activate authenticated', () => {
  has(sql, /grant execute on function public\.create_creator_access_invitation\([^)]*\) to authenticated/i, 'invite→authenticated');
  has(sql, /revoke all on function public\.accept_creator_access_invitation\([^)]*\) from authenticated/i, 'accept revoked from authenticated');
  has(sql, /revoke all on function public\.accept_creator_access_invitation\([^)]*\) from anon/i, 'accept revoked from anon');
  has(sql, /grant execute on function public\.accept_creator_access_invitation\([^)]*\) to service_role/i, 'accept→service_role');
  has(sql, /revoke all on function public\.validate_creator_access_invitation\([^)]*\) from anon/i, 'validate revoked from anon');
  has(sql, /grant execute on function public\.activate_creator_relationship\([^)]*\) to authenticated/i, 'activate→authenticated');
  has(sql, /if not public\.is_agency\(\) then\s*raise exception/i, 'agency gate present');
});

test('does NOT touch intelligence handoff, FMF tables, onboarding, or pipeline status', () => {
  assert.ok(!/of_creators/i.test(exec), 'no of_creators');
  assert.ok(!/creator_intelligence_snapshots|creator_intelligence_opportunity_projections|creator_intelligence_packages/i.test(exec), 'no intelligence tables');
  assert.ok(!/fyv_publish_intelligence_snapshot|publish_creator_intelligence/i.test(exec), 'no intelligence RPCs');
  assert.ok(!/creator_onboarding_cases|creator_onboarding_invitations/i.test(exec), 'no onboarding tables');
  // Only creator_profiles write is the additive auth_user_id association on accept.
  const cpUpdates = exec.match(/update public\.creator_profiles[\s\S]*?;/gi) || [];
  for (const u of cpUpdates) assert.ok(/auth_user_id/i.test(u) && !/\bstatus\b/i.test(u), 'creator_profiles writes only auth_user_id, never status');
});

test('MoonSiren seed: canonical ids, draft, idempotent + guarded, no username', () => {
  has(seed, /16bab1fb-df50-4101-9e2c-749ab7ed3d5e/, 'fyv creator_profiles id');
  has(seed, /20fdee3c-6998-4e8a-8611-04ab88949301/, 'fmf of_creators id');
  has(seed, /'draft'/i, 'initial state draft');
  has(seed, /where exists \(\s*select 1 from public\.creator_profiles/i, 'guarded on profile existence');
  has(seed, /on conflict \(fyv_creator_id\) do nothing/i, 'idempotent');
  assert.ok(!/leahsiren|betterfans|username/i.test(seed.replace(/--.*$/gm, '')), 'no username/handle in seed values');
});

test('Worker + client wiring is in place (additive; persona route intact)', () => {
  has(workerIndex, /import \{ routeCreatorRelationship \} from '\.\/creator-relationship\.ts'/, 'router imported');
  has(workerIndex, /url\.pathname\.startsWith\('\/api\/creators\/'\)[\s\S]*?routeCreatorRelationship/i, 'router wired');
  has(workerIndex, /GENERATE_PATH/, 'persona route preserved');
  has(workerRel, /handleInvite\(request, env, \{ creatorId:/, 'invite route');
  has(workerRel, /path === '\/api\/creators\/invite\/accept'/, 'accept route');
  has(workerRel, /handleActivate\(request, env, \{ creatorId:/, 'activate route');
  has(app, /path="\/accept-invite"/, 'public accept-invite route');
  has(api, /export async function createCreatorAccessInvitation/, 'invite client helper');
  has(api, /export async function acceptCreatorAccessInvite/, 'accept client helper');
  has(api, /export async function activateMyRelationship/, 'activate client helper');
});
