// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1B — Persona generation Worker boundary
//
// The ONLY server endpoint this sprint adds: POST /api/personas/generate.
// Everything else falls through to the static SPA assets (see wrangler.jsonc:
// run_worker_first is scoped to /api/*).
//
// Flow:
//   1. Validate the Supabase bearer token server-side; resolve the linked creator.
//   2. Load the creator's ACTIVE locked snapshot + its selected variations
//      (never recompute from mutable assessment state).
//   3. Enforce the exact deterministic 3-2-1 source set.
//   4. request RPC (idempotent) → provider adapter → strict validation.
//   5. complete RPC (atomic: six personas + mark complete) OR fail RPC
//      (sanitised reason, guaranteed zero persona rows).
//
// Service-role key + provider key live only as Worker secrets — never in the
// browser bundle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildInputSnapshot,
  choosePortfolioSources,
  computeRequestDigest,
  PERSONA_PROMPT_VERSION,
  PERSONA_SCHEMA_VERSION,
  PortfolioError,
  validatePersonaPortfolio,
  type PortfolioSource,
  type SelectedVariation,
} from '../src/lib/persona-portfolio.ts';
import { generatePortfolio, ProviderError, resolveProviderMethod, type ProviderDeps } from './provider.ts';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PERSONA_PROVIDER?: string;
  PERSONA_PROVIDER_BASE_URL?: string;
  PERSONA_PROVIDER_API_KEY?: string;
  PERSONA_MODEL?: string;
  PERSONA_APP_ENV?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

export interface WorkerDeps {
  fetch: typeof fetch;
}

const GENERATE_PATH = '/api/personas/generate';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Service-role REST helpers (PostgREST + Auth) ─────────────────────────────

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

async function resolveAuthUserId(
  env: Env,
  token: string,
  deps: WorkerDeps,
): Promise<string | null> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return typeof user?.id === 'string' && user.id ? user.id : null;
}

async function restGet<T>(env: Env, path: string, deps: WorkerDeps): Promise<T> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: serviceHeaders(env),
  });
  if (!res.ok) {
    throw new ProviderError('data_read_failed', `Data read failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

async function rpc(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
  deps: WorkerDeps,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(args),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

interface CreatorProfileRow {
  id: string;
  full_name: string | null;
  model_name: string | null;
  first_name: string | null;
}

interface SnapshotRow {
  id: string;
  creator_profile_id: string;
  primary_archetype: string;
  secondary_archetype: string;
  third_archetype: string;
  status: string;
}

interface SelectionRow {
  variation_id: string;
  archetype: string;
  archetype_rank: SelectedVariation['rank'];
  archetype_variations: { name: string; description: string; display_order: number } | null;
}

// ── Core handler (exported for deterministic tests) ──────────────────────────

export async function handleGenerate(
  request: Request,
  env: Env,
  deps: WorkerDeps = { fetch: globalThis.fetch },
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let body: { snapshotId?: unknown };
  try {
    body = (await request.json()) as { snapshotId?: unknown };
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId.trim() : '';
  if (!UUID_RE.test(snapshotId)) return json({ error: 'invalid_snapshot_id' }, 400);

  // 1. Authenticate + resolve creator.
  const authUserId = await resolveAuthUserId(env, token, deps).catch(() => null);
  if (!authUserId) return json({ error: 'unauthenticated' }, 401);

  let generationId: string | null = null;
  try {
    const profiles = await restGet<CreatorProfileRow[]>(
      env,
      `creator_profiles?auth_user_id=eq.${authUserId}&select=id,full_name,model_name,first_name&limit=1`,
      deps,
    );
    const profile = profiles[0];
    if (!profile) return json({ error: 'not_a_creator' }, 403);

    // 2. Load + verify the active locked snapshot (ownership + active state).
    const snapshots = await restGet<SnapshotRow[]>(
      env,
      `creator_archetype_snapshots?id=eq.${snapshotId}&select=id,creator_profile_id,primary_archetype,secondary_archetype,third_archetype,status&limit=1`,
      deps,
    );
    const snapshot = snapshots[0];
    if (!snapshot || snapshot.creator_profile_id !== profile.id) {
      return json({ error: 'snapshot_not_found' }, 404);
    }
    if (snapshot.status !== 'active') return json({ error: 'snapshot_not_active' }, 409);

    // Load selected variations for this snapshot.
    const rows = await restGet<SelectionRow[]>(
      env,
      `creator_variation_selections?snapshot_id=eq.${snapshotId}&status=eq.selected&select=variation_id,archetype,archetype_rank,archetype_variations(name,description,display_order)`,
      deps,
    );
    const selections: SelectedVariation[] = rows
      .filter(r => r.archetype_variations)
      .map(r => ({
        variation_id: r.variation_id,
        archetype: r.archetype,
        rank: r.archetype_rank,
        name: r.archetype_variations!.name,
        description: r.archetype_variations!.description,
        display_order: r.archetype_variations!.display_order,
      }));

    // 3. Deterministic exact 3-2-1 source set (throws if incomplete).
    let sources: PortfolioSource[];
    try {
      sources = choosePortfolioSources(selections);
    } catch (err) {
      const code = err instanceof PortfolioError ? err.code : 'incomplete_selection';
      return json({ error: 'selection_incomplete', code }, 422);
    }

    const lockedArchetypes = {
      primary: snapshot.primary_archetype,
      secondary: snapshot.secondary_archetype,
      third: snapshot.third_archetype,
    };
    const context = { display_name: profile.full_name, model_name: profile.model_name };
    const method = resolveProviderMethod(env);
    const digest = computeRequestDigest({
      snapshotId,
      sourceVariationIds: sources.map(s => s.variation_id),
      promptVersion: PERSONA_PROMPT_VERSION,
      schemaVersion: PERSONA_SCHEMA_VERSION,
    });
    const inputSnapshot = buildInputSnapshot({
      snapshotId,
      lockedArchetypes,
      selections,
      sources,
      creatorContext: context,
    });

    // 4. Request (idempotent) — creates/reuses the single active generation.
    const requested = await rpc(
      env,
      'request_creator_persona_generation',
      {
        p_creator_profile_id: profile.id,
        p_snapshot_id: snapshotId,
        p_prompt_version: PERSONA_PROMPT_VERSION,
        p_schema_version: PERSONA_SCHEMA_VERSION,
        p_request_digest: digest,
        p_input_snapshot: inputSnapshot,
        p_generation_method: method,
        p_provider: method === 'fixture' ? 'fixture' : null,
        p_model: null,
      },
      deps,
    );
    if (!requested.ok) {
      const reason = (requested.data as { message?: string })?.message || '';
      if (/incomplete/i.test(reason)) return json({ error: 'selection_incomplete' }, 422);
      if (/not active/i.test(reason)) return json({ error: 'snapshot_not_active' }, 409);
      if (/belong/i.test(reason)) return json({ error: 'forbidden' }, 403);
      return json({ error: 'request_failed' }, 400);
    }

    const req = requested.data as {
      generation_id: string;
      status: string;
      started: boolean;
      already_completed: boolean;
    };
    generationId = req.generation_id;

    if (req.already_completed) {
      return json({ generationId, status: 'completed', reused: true, personaCount: 6 }, 200);
    }
    if (!req.started) {
      // Another request is already generating this portfolio.
      return json({ generationId, status: 'generating', inProgress: true }, 202);
    }

    // 5a. Provider call (behind adapter).
    const result = await generatePortfolio(
      { env, sources, context, lockedArchetypes },
      deps as ProviderDeps,
    );

    // 5b. Strict validation before ANY persistence of personas.
    const validation = validatePersonaPortfolio(result.raw, sources);
    if (!validation.ok) {
      await rpc(
        env,
        'fail_creator_persona_generation',
        { p_generation_id: generationId, p_failure_code: validation.code, p_failure_reason: validation.reason },
        deps,
      ).catch(() => undefined);
      return json({ error: 'invalid_generation_output', code: validation.code }, 422);
    }

    const personasPayload = validation.personas.map(p => ({
      source_variation_id: p.source_variation_id,
      source_archetype: p.source_archetype,
      archetype_rank: p.archetype_rank,
      portfolio_position: p.portfolio_position,
      display_name: p.display_name,
      persona_title: p.persona_title,
      one_line_premise: p.one_line_premise,
      profile: p.profile,
      sort_order: p.sort_order,
    }));
    const outputSnapshot = {
      provider: result.provider,
      model: result.model,
      method: result.method,
      prompt_version: PERSONA_PROMPT_VERSION,
      schema_version: PERSONA_SCHEMA_VERSION,
      raw: result.raw,
    };

    // 5c. Atomic completion (six personas + mark complete in one txn).
    const completed = await rpc(
      env,
      'complete_creator_persona_generation',
      {
        p_generation_id: generationId,
        p_output_snapshot: outputSnapshot,
        p_provider: result.provider,
        p_model: result.model,
        p_personas: personasPayload,
      },
      deps,
    );
    if (!completed.ok) {
      const reason = (completed.data as { message?: string })?.message || '';
      // A concurrent request already completed this generation → treat as success.
      if (/generating state/i.test(reason)) {
        return json({ generationId, status: 'completed', reused: true, personaCount: 6 }, 200);
      }
      await rpc(
        env,
        'fail_creator_persona_generation',
        { p_generation_id: generationId, p_failure_code: 'persist_failed', p_failure_reason: 'Persona persistence failed.' },
        deps,
      ).catch(() => undefined);
      return json({ error: 'persist_failed' }, 500);
    }

    return json({ generationId, status: 'completed', personaCount: 6 }, 200);
  } catch (err) {
    // Deliberate failure persistence: mark failed, guarantee zero persona rows.
    const code = err instanceof ProviderError ? err.code : 'generation_error';
    const reason = err instanceof ProviderError ? err.message : 'Persona generation failed.';
    if (generationId) {
      await rpc(
        env,
        'fail_creator_persona_generation',
        { p_generation_id: generationId, p_failure_code: code, p_failure_reason: reason },
        deps,
      ).catch(() => undefined);
    }
    const status = err instanceof ProviderError ? 502 : 500;
    return json({ error: 'generation_failed', code }, status);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === GENERATE_PATH) return handleGenerate(request, env);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    // SPA fallback (only reached if the Worker is invoked for a non-API path).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
