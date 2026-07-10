import assert from 'node:assert/strict';
import { handleGenerate, type Env } from '../worker/index.ts';
import { generatePortfolio } from '../worker/provider.ts';
import { choosePortfolioSources, type SelectedVariation } from '../src/lib/persona-portfolio.ts';

const SNAP = '11111111-1111-1111-1111-111111111111';

function selectionRows() {
  const mk = (id: string, rank: string, order: number) => ({
    variation_id: id,
    archetype: `${rank}-arch`,
    archetype_rank: rank,
    archetype_variations: { name: `Var ${id}`, description: `desc ${id}`, display_order: order },
  });
  return [
    mk('v1', 'primary', 1), mk('v2', 'primary', 2), mk('v3', 'primary', 3),
    mk('v4', 'secondary', 1), mk('v5', 'secondary', 2),
    mk('v6', 'third', 1),
  ];
}

function makeFakeFetch(opts: { authOk?: boolean; rpc?: Record<string, unknown> } = {}) {
  const authOk = opts.authOk ?? true;
  const calls: string[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    calls.push(urlStr);
    const R = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

    if (urlStr.includes('/auth/v1/user')) {
      return authOk ? R({ id: 'auth-1' }) : R({ error: 'bad' }, 401);
    }
    if (urlStr.includes('/rest/v1/creator_profiles')) {
      return R([{ id: 'prof-1', full_name: 'Emma Rose', model_name: null, first_name: 'Emma' }]);
    }
    if (urlStr.includes('/rest/v1/creator_archetype_snapshots')) {
      return R([{ id: SNAP, creator_profile_id: 'prof-1', primary_archetype: 'A', secondary_archetype: 'B', third_archetype: 'C', status: 'active' }]);
    }
    if (urlStr.includes('/rest/v1/creator_variation_selections')) {
      return R(selectionRows());
    }
    if (urlStr.includes('/rest/v1/rpc/request_creator_persona_generation')) {
      return R(opts.rpc?.request ?? { generation_id: 'gen-1', status: 'generating', started: true, already_completed: false });
    }
    if (urlStr.includes('/rest/v1/rpc/complete_creator_persona_generation')) {
      return R(opts.rpc?.complete ?? { generation_id: 'gen-1', status: 'completed', persona_count: 6 });
    }
    if (urlStr.includes('/rest/v1/rpc/fail_creator_persona_generation')) {
      return R({ generation_id: 'gen-1', status: 'failed' });
    }
    return R({ error: 'unexpected ' + urlStr }, 500);
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const env: Env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  PERSONA_PROVIDER: 'fixture',
  PERSONA_APP_ENV: 'development',
};

function req(body: unknown, token = 'tok') {
  return new Request('https://app/api/personas/generate', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Fixture provider produces a valid portfolio for a source set.
const min: SelectedVariation[] = selectionRows().map(r => ({
  variation_id: r.variation_id, archetype: r.archetype, rank: r.archetype_rank as SelectedVariation['rank'],
  name: r.archetype_variations.name, description: r.archetype_variations.description, display_order: r.archetype_variations.display_order,
}));
const sources = choosePortfolioSources(min);
const provided = await generatePortfolio({ env, sources, context: { display_name: 'Emma Rose', model_name: null }, lockedArchetypes: { primary: 'A', secondary: 'B', third: 'C' } });
assert.equal((provided.raw as { personas: unknown[] }).personas.length, 6);
assert.equal(provided.method, 'fixture');

// Happy path → 200 completed.
{
  const { fetchImpl } = makeFakeFetch();
  const res = await handleGenerate(req({ snapshotId: SNAP }), env, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { status: string; personaCount: number };
  assert.equal(j.status, 'completed');
  assert.equal(j.personaCount, 6);
}

// Missing token → 401.
{
  const { fetchImpl } = makeFakeFetch();
  const res = await handleGenerate(
    new Request('https://app/api/personas/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshotId: SNAP }) }),
    env, { fetch: fetchImpl });
  assert.equal(res.status, 401);
}

// Bad token → 401.
{
  const { fetchImpl } = makeFakeFetch({ authOk: false });
  const res = await handleGenerate(req({ snapshotId: SNAP }), env, { fetch: fetchImpl });
  assert.equal(res.status, 401);
}

// Already completed → 200 reused.
{
  const { fetchImpl } = makeFakeFetch({ rpc: { request: { generation_id: 'gen-1', status: 'completed', started: false, already_completed: true } } });
  const res = await handleGenerate(req({ snapshotId: SNAP }), env, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { reused?: boolean };
  assert.equal(j.reused, true);
}

// In-progress → 202.
{
  const { fetchImpl } = makeFakeFetch({ rpc: { request: { generation_id: 'gen-1', status: 'generating', started: false, already_completed: false } } });
  const res = await handleGenerate(req({ snapshotId: SNAP }), env, { fetch: fetchImpl });
  assert.equal(res.status, 202);
}

// Invalid snapshot id → 400.
{
  const { fetchImpl } = makeFakeFetch();
  const res = await handleGenerate(req({ snapshotId: 'not-a-uuid' }), env, { fetch: fetchImpl });
  assert.equal(res.status, 400);
}

console.log('worker.smoke OK');
