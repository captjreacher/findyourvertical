// Deterministic tests for the Worker generation boundary (fake fetch; no network,
// no live AI). Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGenerate, type Env } from '../worker/index.ts';

const SNAP = '11111111-1111-1111-1111-111111111111';

function selectionRows(count: { p: number; s: number; t: number } = { p: 3, s: 2, t: 1 }) {
  const rows: unknown[] = [];
  const mk = (id: string, rank: string, order: number) => ({
    variation_id: id, archetype: `${rank}-arch`, archetype_rank: rank,
    archetype_variations: { name: `Var ${id}`, description: `desc ${id}`, display_order: order },
  });
  for (let i = 0; i < count.p; i += 1) rows.push(mk(`p${i}`, 'primary', i));
  for (let i = 0; i < count.s; i += 1) rows.push(mk(`s${i}`, 'secondary', i));
  for (let i = 0; i < count.t; i += 1) rows.push(mk(`t${i}`, 'third', i));
  return rows;
}

interface Overrides {
  authOk?: boolean;
  profiles?: unknown[];
  snapshot?: unknown[];
  selections?: unknown[];
  request?: unknown;
  complete?: { ok: boolean; data: unknown };
  chatContent?: string | null; // for openai provider
  chatOk?: boolean;
}

function harness(o: Overrides = {}) {
  const calls: string[] = [];
  const R = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: string | URL | Request) => {
    const u = typeof input === 'string' ? input : input.toString();
    calls.push(u);
    if (u.includes('/auth/v1/user')) return (o.authOk ?? true) ? R({ id: 'auth-1' }) : R({}, 401);
    if (u.includes('/rest/v1/creator_profiles')) return R(o.profiles ?? [{ id: 'prof-1', full_name: 'Emma', model_name: null, first_name: 'Emma' }]);
    if (u.includes('/rest/v1/creator_archetype_snapshots')) return R(o.snapshot ?? [{ id: SNAP, creator_profile_id: 'prof-1', primary_archetype: 'A', secondary_archetype: 'B', third_archetype: 'C', status: 'active' }]);
    if (u.includes('/rest/v1/creator_variation_selections')) return R(o.selections ?? selectionRows());
    if (u.includes('/rest/v1/rpc/request_creator_persona_generation')) return R(o.request ?? { generation_id: 'gen-1', status: 'generating', started: true, already_completed: false });
    if (u.includes('/rest/v1/rpc/complete_creator_persona_generation')) return o.complete ? R(o.complete.data, o.complete.ok ? 200 : 400) : R({ generation_id: 'gen-1', status: 'completed', persona_count: 6 });
    if (u.includes('/rest/v1/rpc/fail_creator_persona_generation')) return R({ generation_id: 'gen-1', status: 'failed' });
    if (u.includes('/chat/completions')) {
      if (o.chatOk === false) return R({ error: 'boom' }, 500);
      const content = o.chatContent ?? JSON.stringify({ personas: [] });
      return R({ choices: [{ message: { content } }] });
    }
    return R({ error: 'unexpected ' + u }, 500);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const fixtureEnv: Env = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
  PERSONA_PROVIDER: 'fixture', PERSONA_APP_ENV: 'development',
};
const openaiEnv: Env = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
  PERSONA_PROVIDER: 'openai', PERSONA_PROVIDER_BASE_URL: 'https://prov', PERSONA_PROVIDER_API_KEY: 'k', PERSONA_MODEL: 'm', PERSONA_APP_ENV: 'development',
};

function req(body: unknown, token = 'tok') {
  return new Request('https://app/api/personas/generate', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('happy path returns 200 completed with six personas', async () => {
  const { fetchImpl, calls } = harness();
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { status: string; personaCount: number };
  assert.equal(j.status, 'completed');
  assert.equal(j.personaCount, 6);
  assert.ok(calls.some(c => c.includes('complete_creator_persona_generation')));
});

test('missing bearer token → 401', async () => {
  const { fetchImpl } = harness();
  const res = await handleGenerate(
    new Request('https://app/api/personas/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 401);
});

test('invalid token → 401', async () => {
  const { fetchImpl } = harness({ authOk: false });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 401);
});

test('non-creator auth user → 403', async () => {
  const { fetchImpl } = harness({ profiles: [] });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 403);
});

test('snapshot owned by someone else → 404', async () => {
  const { fetchImpl } = harness({ snapshot: [{ id: SNAP, creator_profile_id: 'other', primary_archetype: 'A', secondary_archetype: 'B', third_archetype: 'C', status: 'active' }] });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 404);
});

test('inactive snapshot → 409', async () => {
  const { fetchImpl } = harness({ snapshot: [{ id: SNAP, creator_profile_id: 'prof-1', primary_archetype: 'A', secondary_archetype: 'B', third_archetype: 'C', status: 'superseded' }] });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 409);
});

test('incomplete selection → 422 (before any provider call)', async () => {
  const { fetchImpl, calls } = harness({ selections: selectionRows({ p: 2, s: 2, t: 1 }) });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 422);
  assert.ok(!calls.some(c => c.includes('complete_creator_persona_generation')));
});

test('invalid snapshot id → 400', async () => {
  const { fetchImpl } = harness();
  const res = await handleGenerate(req({ snapshotId: 'nope' }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 400);
});

test('already completed → 200 reused, no provider/complete call', async () => {
  const { fetchImpl, calls } = harness({ request: { generation_id: 'gen-1', status: 'completed', started: false, already_completed: true } });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { reused?: boolean };
  assert.equal(j.reused, true);
  assert.ok(!calls.some(c => c.includes('complete_creator_persona_generation')));
});

test('in-progress generation → 202', async () => {
  const { fetchImpl } = harness({ request: { generation_id: 'gen-1', status: 'generating', started: false, already_completed: false } });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 202);
});

test('invalid model JSON (wrong count) → fail RPC called, 422', async () => {
  const { fetchImpl, calls } = harness({ chatContent: JSON.stringify({ personas: [{ source_variation_id: 'p0' }] }) });
  const res = await handleGenerate(req({ snapshotId: SNAP }), openaiEnv, { fetch: fetchImpl });
  assert.equal(res.status, 422);
  assert.ok(calls.some(c => c.includes('fail_creator_persona_generation')));
  assert.ok(!calls.some(c => c.includes('complete_creator_persona_generation')));
});

test('provider HTTP failure → fail RPC called, 502', async () => {
  const { fetchImpl, calls } = harness({ chatOk: false });
  const res = await handleGenerate(req({ snapshotId: SNAP }), openaiEnv, { fetch: fetchImpl });
  assert.equal(res.status, 502);
  assert.ok(calls.some(c => c.includes('fail_creator_persona_generation')));
});

test('concurrent completion race (complete rejects with not-generating) → 200 reused', async () => {
  const { fetchImpl } = harness({ complete: { ok: false, data: { message: 'generation is not in the generating state' } } });
  const res = await handleGenerate(req({ snapshotId: SNAP }), fixtureEnv, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { reused?: boolean };
  assert.equal(j.reused, true);
});
