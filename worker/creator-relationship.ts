// ─────────────────────────────────────────────────────────────────────────────
// FYV Creator Relationship & Access Layer — Worker boundary
//
// HTTP surface for the FYV-owned creator access lifecycle. All privileged writes
// go through the SECURITY DEFINER RPCs added in migration 20260714000000; this
// layer only authenticates the caller and translates HTTP ↔ RPC.
//
//   POST /api/creators/:creatorId/invite     (agency)  draft → invited
//   GET  /api/creators/invite/accept?token=  (public)  validate only, no consume
//   POST /api/creators/invite/accept         (public)  invited → accepted + auth
//   POST /api/creators/:creatorId/activate   (auth)    accepted → active
//
// Agency/creator-scoped calls forward the caller's Supabase JWT so the RPC's own
// is_agency()/current_creator_profile_id() gating applies. The public acceptance
// flow uses the service role: it validates the single-use token, provisions (or
// resolves) the Supabase auth user for the invited email, associates it with the
// FYV creator identity, and returns a magic link that signs the creator in.
//
// Service-role + anon keys live only as Worker secrets — never in the browser.
// ─────────────────────────────────────────────────────────────────────────────

export interface RelEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Optional canonical app origin for building links (defaults to request origin). */
  APP_BASE_URL?: string;
}

export interface RelDeps {
  fetch: typeof fetch;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function bearer(request: Request): string {
  const h = request.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

function appBase(env: RelEnv, request: Request): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

function serviceHeaders(env: RelEnv): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

interface RpcResult {
  ok: boolean;
  status: number;
  data: any;
}

/** Call an RPC as the SERVICE role (privileged). */
async function rpcAsService(env: RelEnv, fn: string, args: Record<string, unknown>, deps: RelDeps): Promise<RpcResult> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(args),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/** Call an RPC forwarding the CALLER's JWT (role `authenticated`), so RLS/gating applies. */
async function rpcAsUser(env: RelEnv, token: string, fn: string, args: Record<string, unknown>, deps: RelDeps): Promise<RpcResult> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/** Map a PostgREST/plpgsql error (SQLSTATE in data.code) to an HTTP status. */
function statusForPgError(data: any): number {
  const code = (data && (data.code || data.error_code)) as string | undefined;
  switch (code) {
    case '42501': return 403; // insufficient_privilege (agency required)
    case '22023': return 400; // invalid_parameter_value
    case 'P0002': return 404; // no_data_found (not found)
    case 'P0001': return 409; // raise_exception (conflict, e.g. remapped FMF id)
    default: return 400;
  }
}

// ── Auth admin helpers (GoTrue, service role) ────────────────────────────────

/** Create the auth user for `email`, or resolve the existing one. email_confirm=true. */
async function ensureAuthUser(env: RelEnv, email: string, deps: RelDeps): Promise<string | null> {
  const create = await deps.fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (create.ok) {
    const u: any = await create.json().catch(() => ({}));
    const id = u?.id ?? u?.user?.id;
    if (typeof id === 'string' && id) return id;
  }
  // Already exists (409/422) or id not returned → resolve by scanning the admin list.
  const list = await deps.fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: serviceHeaders(env),
  });
  if (!list.ok) return null;
  const body: any = await list.json().catch(() => ({}));
  const users: any[] = Array.isArray(body) ? body : (body?.users ?? []);
  const match = users.find(u => typeof u?.email === 'string' && u.email.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

/** Generate a magic link that signs the creator in and lands on `next`. */
async function generateMagicLink(env: RelEnv, email: string, redirectTo: string, deps: RelDeps): Promise<string | null> {
  const res = await deps.fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify({ type: 'magiclink', email, options: { redirect_to: redirectTo } }),
  });
  if (!res.ok) return null;
  const body: any = await res.json().catch(() => ({}));
  return body?.action_link ?? body?.properties?.action_link ?? null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** POST /api/creators/:creatorId/invite — agency-only. Body: { fmfCreatorId, email? }. */
export async function handleInvite(
  request: Request,
  env: RelEnv,
  params: { creatorId: string },
  deps: RelDeps = { fetch: globalThis.fetch },
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const token = bearer(request);
  if (!token) return json({ error: 'unauthenticated' }, 401);
  if (!UUID_RE.test(params.creatorId)) return json({ error: 'invalid_creator_id' }, 400);

  let body: { fmfCreatorId?: unknown; email?: unknown };
  try { body = (await request.json()) as any; } catch { return json({ error: 'invalid_body' }, 400); }
  const fmfCreatorId = typeof body.fmfCreatorId === 'string' ? body.fmfCreatorId.trim() : '';
  if (!UUID_RE.test(fmfCreatorId)) return json({ error: 'invalid_fmf_creator_id' }, 400);
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;

  const r = await rpcAsUser(env, token, 'create_creator_access_invitation', {
    p_fyv_creator_id: params.creatorId,
    p_fmf_creator_id: fmfCreatorId,
    p_email: email,
  }, deps);
  if (!r.ok) return json({ error: 'invite_failed', code: r.data?.code, message: r.data?.message }, statusForPgError(r.data));

  const acceptPath: string = r.data?.accept_path ?? '';
  const acceptUrl = `${appBase(env, request)}/#${acceptPath}`;
  return json({
    ok: true,
    relationshipId: r.data?.relationship_id,
    invitationId: r.data?.invitation_id,
    relationshipState: r.data?.relationship_state ?? 'invited',
    fmfCreatorId: r.data?.fmf_creator_id,
    email: r.data?.email,
    expiresAt: r.data?.expires_at,
    acceptPath,
    acceptUrl,
  }, 200);
}

/** GET /api/creators/invite/accept?token=… — public. Validates WITHOUT consuming. */
export async function handleValidateInvite(
  request: Request,
  env: RelEnv,
  deps: RelDeps = { fetch: globalThis.fetch },
): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!token) return json({ ok: false, code: 'invalid' }, 200);
  const r = await rpcAsService(env, 'validate_creator_access_invitation', { p_token: token }, deps);
  if (!r.ok) return json({ ok: false, code: 'invalid' }, 200);
  const d = r.data ?? {};
  return json({
    ok: d.ok === true,
    code: d.code,
    email: d.email,
    relationshipState: d.relationship_state,
  }, 200);
}

/** POST /api/creators/invite/accept — public. Body: { token }. Provisions + signs in. */
export async function handleAcceptInvite(
  request: Request,
  env: RelEnv,
  deps: RelDeps = { fetch: globalThis.fetch },
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: { token?: unknown };
  try { body = (await request.json()) as any; } catch { return json({ error: 'invalid_body' }, 400); }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return json({ ok: false, code: 'invalid' }, 400);

  // 1. Validate (no consume) to obtain the invited email + confirm validity.
  const v = await rpcAsService(env, 'validate_creator_access_invitation', { p_token: token }, deps);
  const vd = v.data ?? {};
  if (!v.ok || vd.ok !== true) {
    const code = vd.code ?? 'invalid';
    const status = code === 'already_accepted' ? 409 : code === 'expired' || code === 'revoked' ? 410 : 400;
    return json({ ok: false, code }, status);
  }
  const email: string = vd.email;

  // 2. Provision (or resolve) the Supabase auth user for the invited email.
  const authUserId = await ensureAuthUser(env, email, deps).catch(() => null);
  if (!authUserId) return json({ ok: false, code: 'provisioning_failed' }, 502);

  // 3. Consume the invitation + associate the identity + transition to accepted.
  const a = await rpcAsService(env, 'accept_creator_access_invitation', {
    p_token: token,
    p_auth_user_id: authUserId,
  }, deps);
  const ad = a.data ?? {};
  if (!a.ok || ad.ok !== true) {
    const code = ad.code ?? 'accept_failed';
    const status = code === 'identity_conflict' ? 409 : 400;
    return json({ ok: false, code }, status);
  }

  // 4. Issue a magic link that signs the creator in and lands on /my.
  const redirectTo = `${appBase(env, request)}/auth/callback?next=/my`;
  const magicLink = await generateMagicLink(env, email, redirectTo, deps).catch(() => null);

  return json({
    ok: true,
    relationshipState: ad.relationship_state ?? 'accepted',
    email,
    magicLink,       // null if link generation failed — client falls back to OTP sign-in
    next: '/my',
  }, 200);
}

/** POST /api/creators/:creatorId/activate — auth. `me` = creator self; a uuid = agency. */
export async function handleActivate(
  request: Request,
  env: RelEnv,
  params: { creatorId: string },
  deps: RelDeps = { fetch: globalThis.fetch },
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const token = bearer(request);
  if (!token) return json({ error: 'unauthenticated' }, 401);

  const isSelf = params.creatorId === 'me';
  if (!isSelf && !UUID_RE.test(params.creatorId)) return json({ error: 'invalid_creator_id' }, 400);

  const r = await rpcAsUser(env, token, 'activate_creator_relationship', {
    p_fyv_creator_id: isSelf ? null : params.creatorId,
  }, deps);
  if (!r.ok) return json({ error: 'activate_failed', code: r.data?.code, message: r.data?.message }, statusForPgError(r.data));

  const d = r.data ?? {};
  if (d.ok !== true) return json({ ok: false, code: d.code, relationshipState: d.relationship_state }, 409);
  return json({ ok: true, relationshipState: d.relationship_state ?? 'active', already: d.already ?? false }, 200);
}

// ── Router (invoked from worker/index.ts) ────────────────────────────────────

/** Returns a Response if the path matches a relationship route, else null. */
export async function routeCreatorRelationship(
  request: Request,
  env: RelEnv,
  deps: RelDeps = { fetch: globalThis.fetch },
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/creators/invite/accept') {
    if (request.method === 'GET') return handleValidateInvite(request, env, deps);
    return handleAcceptInvite(request, env, deps);
  }

  const invite = path.match(/^\/api\/creators\/([^/]+)\/invite$/);
  if (invite) return handleInvite(request, env, { creatorId: decodeURIComponent(invite[1]) }, deps);

  const activate = path.match(/^\/api\/creators\/([^/]+)\/activate$/);
  if (activate) return handleActivate(request, env, { creatorId: decodeURIComponent(activate[1]) }, deps);

  return null;
}
