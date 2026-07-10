// Static contract checks over the PERSONA-1B migration SQL. These do not need a
// database — they assert the security/idempotency shape is present in the file so
// regressions are caught in CI. Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260710010000_fyv_persona_1b_portfolio_generation.sql', import.meta.url),
  'utf8',
);

function has(re: RegExp, msg: string) {
  assert.ok(re.test(sql), msg);
}

test('wraps in a single transaction', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
});

test('creates both tables with RLS enabled', () => {
  has(/create table if not exists public\.creator_persona_generations/i, 'generations table');
  has(/create table if not exists public\.creator_personas/i, 'personas table');
  has(/alter table public\.creator_persona_generations enable row level security/i, 'generations RLS');
  has(/alter table public\.creator_personas enable row level security/i, 'personas RLS');
});

test('anon and PUBLIC are explicitly revoked on both tables', () => {
  has(/revoke all on public\.creator_persona_generations from public/i, 'gen revoke public');
  has(/revoke all on public\.creator_persona_generations from anon/i, 'gen revoke anon');
  has(/revoke all on public\.creator_personas from public/i, 'personas revoke public');
  has(/revoke all on public\.creator_personas from anon/i, 'personas revoke anon');
});

test('authenticated gets SELECT only; service_role gets write', () => {
  has(/grant select on public\.creator_persona_generations to authenticated/i, 'gen select authed');
  has(/grant select on public\.creator_personas to authenticated/i, 'personas select authed');
  has(/grant select, insert, update, delete on public\.creator_persona_generations to service_role/i, 'gen service_role');
  has(/grant select, insert, update, delete on public\.creator_personas to service_role/i, 'personas service_role');
  // No blanket write grant to authenticated.
  assert.ok(!/grant select, insert, update, delete on public\.creator_persona(s|_generations) to authenticated/i.test(sql));
});

test('creator policies are read-only (SELECT); agency has full access', () => {
  has(/"Creator can read own persona generations"[\s\S]*?for select/i, 'creator gen select');
  has(/"Creator can read own personas"[\s\S]*?for select/i, 'creator personas select');
  has(/"Agency full access persona generations"[\s\S]*?for all/i, 'agency gen');
  has(/"Agency full access personas"[\s\S]*?for all/i, 'agency personas');
  // Creators must NOT have insert/update/delete policies on these tables.
  assert.ok(!/Creator can (insert|update|delete) own persona/i.test(sql), 'no creator write policies');
});

test('idempotency: one active generation per snapshot + persona uniqueness', () => {
  has(/create unique index if not exists creator_persona_generations_one_active[\s\S]*?where lifecycle_status = 'active'/i, 'one-active partial unique');
  has(/unique \(generation_id, source_variation_id\)/i, 'one persona per source variation');
  has(/unique \(generation_id, portfolio_position\)/i, 'one persona per position');
});

test('RPCs are service-role only (request/complete/fail); viewed is creator-callable', () => {
  for (const fn of ['request_creator_persona_generation', 'complete_creator_persona_generation', 'fail_creator_persona_generation']) {
    has(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to service_role`, 'i'), `${fn} service_role`);
    has(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from anon`, 'i'), `${fn} revoke anon`);
    has(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from authenticated`, 'i'), `${fn} revoke authenticated`);
  }
  has(/grant execute on function public\.record_persona_portfolio_viewed\(uuid\) to authenticated/i, 'viewed authed');
});

test('completion is atomic + guarded; failure guarantees zero persona rows', () => {
  has(/jsonb_array_length\(p_personas\) <> 6/i, 'exactly six enforced');
  has(/status <> 'generating'/i, 'complete requires generating state');
  has(/delete from public\.creator_personas where generation_id = p_generation_id/i, 'fail deletes personas');
});

test('request enforces ownership, active snapshot, and 3-2-1 completeness', () => {
  has(/snapshot does not belong to creator/i, 'ownership check');
  has(/snapshot is not active/i, 'active check');
  has(/< 3 or .*< 2 or .*< 1/i, '3-2-1 completeness gate');
});

test('security definer functions pin search_path', () => {
  const count = (sql.match(/set search_path = public, pg_temp/gi) || []).length;
  assert.ok(count >= 5, `expected >=5 search_path pins, got ${count}`);
});
