// Deterministic tests for the relationship/access Worker boundary (fake fetch;
// no network, no live Supabase). Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleInvite,
  handleValidateInvite,
  handleAcceptInvite,
  handleActivate,
  routeCreatorRelationship,
  type RelEnv,
} from '../worker/creator-relationship.ts';

const FYV = '16bab1fb-df50-4101-9e2c-749ab7ed3d5e';
const FMF = '20fdee3c-6998-4e8a-8611-04ab88949301';

const env: RelEnv = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
};

interface Overrides {
  create?: { ok: boolean; data: unknown };
  validate?: { ok: boolean; data: unknown };
  accept?: { ok: boolean; data: unknown };
  activate?: { ok: boolean; data: unknown };
  adminCreate?: { ok: boolean; data: unknown };
  adminList?: { ok: boolean; data: unknown };
  genLink?: { ok: boolean; data: unknown };
}

function harness(o: Overrides = {}) {
  const calls: string[] = [];
  const R = (data: unknown, ok = true) =>
    new Response(JSON.stringify(data), { status: ok ? 200 : 400, headers: { 'content-type': 'application/json' } });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    calls.push(`${method} ${u}`);
    if (u.includes('/rest/v1/rpc/create_creator_access_invitation')) {
      const d = o.create ?? { ok: true, data: { relationship_id: 'rel-1', invitation_id: 'inv-1', relationship_state: 'invited', fmf_creator_id: FMF, email: 'e@x.co', expires_at: '2026-07-27T00:00:00Z', accept_path: '/accept-invite?token=RAWTOKEN' } };
      return R(d.data, d.ok);
    }
    if (u.includes('/rest/v1/rpc/validate_creator_access_invitation')) {
      const d = o.validate ?? { ok: true, data: { ok: true, email: 'e@x.co', relationship_state: 'invited' } };
      return R(d.data, d.ok);
    }
    if (u.includes('/rest/v1/rpc/accept_creator_access_invitation')) {
      const d = o.accept ?? { ok: true, data: { ok: true, relationship_state: 'accepted', email: 'e@x.co' } };
      return R(d.data, d.ok);
    }
    if (u.includes('/rest/v1/rpc/activate_creator_relationship')) {
      const d = o.activate ?? { ok: true, data: { ok: true, relationship_state: 'active' } };
      return R(d.data, d.ok);
    }
    if (u.includes('/auth/v1/admin/users')) {
      if (method === 'POST') { const d = o.adminCreate ?? { ok: true, data: { id: 'auth-9' } }; return R(d.data, d.ok); }
      const d = o.adminList ?? { ok: true, data: { users: [{ id: 'auth-9', email: 'e@x.co' }] } };
      return R(d.data, d.ok);
    }
    if (u.includes('/auth/v1/admin/generate_link')) {
      const d = o.genLink ?? { ok: true, data: { action_link: 'https://x.supabase.co/auth/v1/verify?token=zzz' } };
      return R(d.data, d.ok);
    }
    return R({ error: 'unexpected ' + u }, false);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const bearerReq = (path: string, method = 'POST', body?: unknown, token = 'tok') =>
  new Request(`https://app${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ── invite ───────────────────────────────────────────────────────────────────

test('invite: missing bearer → 401', async () => {
  const { fetchImpl } = harness();
  const req = new Request(`https://app/api/creators/${FYV}/invite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const res = await handleInvite(req, env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 401);
});

test('invite: invalid creator id → 400', async () => {
  const { fetchImpl } = harness();
  const res = await handleInvite(bearerReq('/api/creators/nope/invite', 'POST', { fmfCreatorId: FMF }), env, { creatorId: 'nope' }, { fetch: fetchImpl });
  assert.equal(res.status, 400);
});

test('invite: invalid fmf creator id → 400', async () => {
  const { fetchImpl } = harness();
  const res = await handleInvite(bearerReq(`/api/creators/${FYV}/invite`, 'POST', { fmfCreatorId: 'leahsiren' }), env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 400);
});

test('invite: happy path → 200 with hash-route accept URL', async () => {
  const { fetchImpl, calls } = harness();
  const res = await handleInvite(bearerReq(`/api/creators/${FYV}/invite`, 'POST', { fmfCreatorId: FMF }), env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { ok: boolean; relationshipState: string; acceptUrl: string };
  assert.equal(j.ok, true);
  assert.equal(j.relationshipState, 'invited');
  assert.equal(j.acceptUrl, 'https://app/#/accept-invite?token=RAWTOKEN');
  assert.ok(calls.some(c => c.includes('create_creator_access_invitation')));
  assert.ok(calls.some(c => c.startsWith('POST') && c.includes('/auth/v1/admin/users')), 'provisions auth user at invite time');
});

test('invite: auth provisioning failure → 502', async () => {
  const { fetchImpl } = harness({ adminCreate: { ok: false, data: { msg: 'boom' } }, adminList: { ok: false, data: {} } });
  const res = await handleInvite(bearerReq(`/api/creators/${FYV}/invite`, 'POST', { fmfCreatorId: FMF }), env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 502);
  const j = await res.json() as { error: string; code: string };
  assert.equal(j.error, 'invite_failed');
  assert.equal(j.code, 'provisioning_failed');
});

test('invite: RPC agency-forbidden (42501) → 403', async () => {
  const { fetchImpl } = harness({ create: { ok: false, data: { code: '42501', message: 'agency access required' } } });
  const res = await handleInvite(bearerReq(`/api/creators/${FYV}/invite`, 'POST', { fmfCreatorId: FMF }), env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 403);
});

// ── validate (public GET) ─────────────────────────────────────────────────────

test('validate: no token → ok:false', async () => {
  const { fetchImpl } = harness();
  const res = await handleValidateInvite(new Request('https://app/api/creators/invite/accept'), env, { fetch: fetchImpl });
  const j = await res.json() as { ok: boolean };
  assert.equal(j.ok, false);
});

test('validate: happy → ok:true + email, no consume', async () => {
  const { fetchImpl, calls } = harness();
  const res = await handleValidateInvite(new Request('https://app/api/creators/invite/accept?token=RAW'), env, { fetch: fetchImpl });
  const j = await res.json() as { ok: boolean; email: string };
  assert.equal(j.ok, true);
  assert.equal(j.email, 'e@x.co');
  assert.ok(!calls.some(c => c.includes('accept_creator_access_invitation')), 'must not consume');
});

// ── accept (public POST) ──────────────────────────────────────────────────────

test('accept: happy → 200 accepted + magic link', async () => {
  const { fetchImpl, calls } = harness();
  const res = await handleAcceptInvite(new Request('https://app/api/creators/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'RAW' }) }), env, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { ok: boolean; relationshipState: string; magicLink: string | null };
  assert.equal(j.ok, true);
  assert.equal(j.relationshipState, 'accepted');
  assert.ok(j.magicLink && j.magicLink.includes('/auth/v1/verify'));
  assert.ok(calls.some(c => c.startsWith('POST') && c.includes('/auth/v1/admin/users')), 'provisions auth user');
  assert.ok(calls.some(c => c.includes('accept_creator_access_invitation')), 'consumes invitation');
});

test('accept: already accepted → 409', async () => {
  const { fetchImpl } = harness({ validate: { ok: true, data: { ok: false, code: 'already_accepted' } } });
  const res = await handleAcceptInvite(new Request('https://app/api/creators/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'RAW' }) }), env, { fetch: fetchImpl });
  assert.equal(res.status, 409);
});

test('accept: auth provisioning failure → 502', async () => {
  const { fetchImpl } = harness({ adminCreate: { ok: false, data: { msg: 'boom' } }, adminList: { ok: false, data: {} } });
  const res = await handleAcceptInvite(new Request('https://app/api/creators/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'RAW' }) }), env, { fetch: fetchImpl });
  assert.equal(res.status, 502);
});

test('accept: identity conflict → 409', async () => {
  const { fetchImpl } = harness({ accept: { ok: true, data: { ok: false, code: 'identity_conflict' } } });
  const res = await handleAcceptInvite(new Request('https://app/api/creators/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'RAW' }) }), env, { fetch: fetchImpl });
  assert.equal(res.status, 409);
});

test('accept: existing auth user resolved via admin list when create says exists', async () => {
  const { fetchImpl, calls } = harness({ adminCreate: { ok: false, data: { code: 'email_exists' } } });
  const res = await handleAcceptInvite(new Request('https://app/api/creators/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'RAW' }) }), env, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  assert.ok(calls.some(c => c.startsWith('GET') && c.includes('/auth/v1/admin/users')), 'falls back to list');
});

// ── activate ──────────────────────────────────────────────────────────────────

test('activate: missing bearer → 401', async () => {
  const { fetchImpl } = harness();
  const res = await handleActivate(new Request('https://app/api/creators/me/activate', { method: 'POST' }), env, { creatorId: 'me' }, { fetch: fetchImpl });
  assert.equal(res.status, 401);
});

test('activate: self (me) happy → 200 active', async () => {
  const { fetchImpl, calls } = harness();
  const res = await handleActivate(bearerReq('/api/creators/me/activate'), env, { creatorId: 'me' }, { fetch: fetchImpl });
  assert.equal(res.status, 200);
  const j = await res.json() as { ok: boolean; relationshipState: string };
  assert.equal(j.relationshipState, 'active');
  // self-activation forwards a null id to the RPC
  assert.ok(calls.some(c => c.includes('activate_creator_relationship')));
});

test('activate: agency by uuid happy → 200 active', async () => {
  const { fetchImpl } = harness();
  const res = await handleActivate(bearerReq(`/api/creators/${FYV}/activate`), env, { creatorId: FYV }, { fetch: fetchImpl });
  assert.equal(res.status, 200);
});

test('activate: not accepted yet → 409', async () => {
  const { fetchImpl } = harness({ activate: { ok: true, data: { ok: false, code: 'not_accepted', relationship_state: 'invited' } } });
  const res = await handleActivate(bearerReq('/api/creators/me/activate'), env, { creatorId: 'me' }, { fetch: fetchImpl });
  assert.equal(res.status, 409);
});

// ── router ────────────────────────────────────────────────────────────────────

test('router matches invite/accept/activate and ignores others', async () => {
  const { fetchImpl } = harness();
  const invite = await routeCreatorRelationship(bearerReq(`/api/creators/${FYV}/invite`, 'POST', { fmfCreatorId: FMF }), env, { fetch: fetchImpl });
  assert.ok(invite && invite.status === 200);
  const accept = await routeCreatorRelationship(new Request('https://app/api/creators/invite/accept?token=RAW'), env, { fetch: fetchImpl });
  assert.ok(accept && accept.status === 200);
  const none = await routeCreatorRelationship(new Request('https://app/api/creators/list'), env, { fetch: fetchImpl });
  assert.equal(none, null);
});
