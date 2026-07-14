// FYV-ONBOARD-2 — static contract checks over the migration + wiring.
// Run with: node --experimental-strip-types --test tests/public-assessment-invite-migration.test.ts
//
// No database and no runtime required. These tests grep the migration SQL,
// the shared contract module, the API helper, and the AuthGate component to
// lock the invariants that Mike (or a future refactor) MUST NOT regress:
//
//   * migration is additive + transaction-wrapped
//   * RPC is SECURITY DEFINER with fixed search_path and grants only to
//     anon+authenticated (revoke from PUBLIC)
//   * fully qualified table refs; no privilege expansion on any existing
//     table (no new anon INSERT policy on creator_profiles or links)
//   * dedupe partial unique index on events(correlation_id) scoped to
//     'creator.assessment_invite.self_requested'
//   * plaintext invite_code never appears in the emitted event payload
//   * AuthGate uses the new helper + renders the spec's success state
//   * legacy createCreatorInviteRequest is marked @deprecated (not deleted)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../supabase/migrations/20260714010000_fyv_public_assessment_invite.sql');
const contract = read('../src/lib/public-assessment-invite.ts');
const api = read('../src/lib/creators-api.ts');
const authGate = read('../src/components/cockpit/AuthGate.tsx');
const emailBuilder = read('../src/lib/email/assessmentInvitationEmail.ts');
const emailDeliver = read('../src/lib/email/deliverAssessmentInvitation.ts');

// Strip -- line comments and /* ... */ block comments from SQL when running
// negative checks over the executable body (so prose in comments never trips
// asserts about what the code actually does).
const exec = sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');
const has = (src: string, re: RegExp, msg: string) => assert.ok(re.test(src), msg);
const missing = (src: string, re: RegExp, msg: string) => assert.ok(!re.test(src), msg);

// ── Migration structure ──────────────────────────────────────────────────────

test('migration is a single transaction (begin/commit balanced)', () => {
  assert.equal((sql.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1);
});

test('migration is additive: no drop/alter on existing tables', () => {
  // No destructive alters. Additive-only per Decisions doc.
  missing(exec, /drop\s+table/i, 'must not drop tables');
  missing(exec, /drop\s+column/i, 'must not drop columns');
  missing(exec, /alter\s+table\s+public\.(creator_profiles|creator_assessment_links|creator_assessment_templates|creator_invite_requests|events)/i,
    'must not alter existing tables');
});

test('migration does NOT touch RLS or grant new anon table privileges', () => {
  missing(exec, /alter\s+table[\s\S]*enable\s+row\s+level\s+security/i, 'no RLS enabling on existing tables');
  missing(exec, /create\s+policy/i, 'no new policies');
  // The ONLY anon-facing grant may be EXECUTE on the new function. Any GRANT
  // ON TABLE / ON ALL TABLES / at column level directed at anon would be a
  // regression.
  missing(exec, /grant[^;]*\bon\s+table\b[^;]*\bto\s+anon/i, 'no new table-level GRANTs to anon');
  missing(exec, /grant[^;]*\bon\s+all\s+tables\b[^;]*\bto\s+anon/i, 'no ON ALL TABLES anon grant');
  has(sql, /grant\s+execute\s+on\s+function\s+public\.create_public_assessment_invite\(text,\s*text,\s*text,\s*text\)\s+to\s+anon,\s*authenticated/i,
    'RPC EXECUTE granted to anon + authenticated only');
});

// ── RPC shape ────────────────────────────────────────────────────────────────

test('RPC is SECURITY DEFINER with fixed search_path=public,pg_temp', () => {
  has(sql, /create or replace function\s+public\.create_public_assessment_invite/i, 'RPC declared');
  has(sql, /security\s+definer/i, 'SECURITY DEFINER');
  has(sql, /set\s+search_path\s*=\s*public,\s*pg_temp/i, 'fixed search_path');
});

test('RPC signature accepts name/email/handle/template_slug and returns jsonb', () => {
  has(sql, /p_name\s+text/i, 'p_name');
  has(sql, /p_email\s+text/i, 'p_email');
  has(sql, /p_onlyfans_handle\s+text\s+default\s+null/i, 'p_onlyfans_handle default null');
  has(sql, /p_template_slug\s+text\s+default\s+null/i, 'p_template_slug default null');
  has(sql, /returns\s+jsonb/i, 'returns jsonb');
});

test('RPC revokes PUBLIC and grants EXECUTE only to anon + authenticated', () => {
  has(sql, /revoke\s+all\s+on\s+function\s+public\.create_public_assessment_invite\(text,\s*text,\s*text,\s*text\)\s+from\s+public/i,
    'revoke all from PUBLIC');
  has(sql, /grant\s+execute\s+on\s+function\s+public\.create_public_assessment_invite\(text,\s*text,\s*text,\s*text\)\s+to\s+anon,\s*authenticated/i,
    'grant execute to anon + authenticated');
});

test('RPC validates input server-side (name/email/handle length + shape)', () => {
  has(exec, /raise\s+exception\s+'Name is required'/i, 'name required check');
  has(exec, /raise\s+exception\s+'Email is required'/i, 'email required check');
  has(exec, /raise\s+exception\s+'A valid email is required'/i, 'email shape check');
  has(exec, /raise\s+exception\s+'Handle is too long'/i, 'handle length cap');
  has(exec, /using\s+errcode\s*=\s*'22023'/i, 'uses SQLSTATE 22023 for validation errors');
});

test('RPC resolves template by slug then default then earliest active', () => {
  has(exec, /where\s+slug\s*=\s*p_template_slug/i, 'slug precedence');
  has(exec, /order\s+by\s+is_default\s+desc/i, 'default flag preferred');
  has(exec, /order\s+by\s+is_default\s+desc\s+nulls\s+last,\s*created_at\s+asc/i, 'earliest-active fallback');
});

test('RPC dedupes within 30 minutes for the same profile+template', () => {
  has(exec, /interval\s+'30 minutes'/i, '30-minute dedupe window');
  has(exec, /status\s+not\s+in\s+\('Revoked',\s*'Expired',\s*'Completed'\)/i, 'skips terminal statuses');
  has(exec, /where\s+creator_profile_id\s*=\s*v_profile_id/i, 'scopes dedupe by profile');
  has(exec, /and\s+template_id\s*=\s*v_template\.id/i, 'and by template');
});

test('RPC uses fully qualified table references throughout', () => {
  has(exec, /from\s+public\.creator_assessment_templates/i, 'templates fq');
  has(exec, /from\s+public\.creator_profiles/i, 'profiles fq');
  has(exec, /from\s+public\.creator_assessment_links/i, 'links fq');
  has(exec, /insert\s+into\s+public\.events/i, 'events fq');
});

// ── Events outbox ────────────────────────────────────────────────────────────

test('events row uses source_system=findyourvertical + entity_type=creator_assessment_links', () => {
  has(exec, /'findyourvertical'/, 'source_system findyourvertical');
  has(exec, /'creator_assessment_links'/, 'entity_type creator_assessment_links');
});

test('event_type is the exact taxonomy name and correlation_id encodes profile+template+day', () => {
  has(exec, /'creator\.assessment_invite\.self_requested'/, 'canonical event_type');
  has(exec, /fyv\/assessment-invite\/self\//, 'correlation_id namespace');
  has(exec, /to_char\(\(v_now at time zone 'utc'\),\s*'YYYY-MM-DD'\)/i, 'per-day granularity');
});

test('event payload does NOT contain the plaintext invite_code', () => {
  // The payload jsonb_build_object block must reference invite_link_id, never
  // the raw invite_code. Extract just the payload block and check.
  const payloadBlock = exec.match(/jsonb_build_object\([\s\S]*?\)\s*,\s*v_correlation_id/);
  assert.ok(payloadBlock, 'payload block located');
  assert.ok(!/invite_code/i.test(payloadBlock![0]), 'plaintext invite_code MUST NOT appear in payload');
  assert.ok(/invite_link_id/.test(payloadBlock![0]), 'invite_link_id (uuid) is in payload');
});

test('events dedupe uses a partial unique index scoped to this event_type', () => {
  has(sql, /create unique index if not exists events_assessment_invite_self_correlation_uidx/i, 'index exists');
  has(sql, /on\s+public\.events\s*\(correlation_id\)/i, 'on correlation_id');
  has(sql, /where\s+event_type\s*=\s*'creator\.assessment_invite\.self_requested'/i, 'partial predicate scoped to this event_type');
});

test('events insert dedupes via WHERE NOT EXISTS (race-safe pattern used by PR#21)', () => {
  has(exec, /where\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.events/i, 'pre-check');
});

// ── Contract module ──────────────────────────────────────────────────────────

test('contract exposes URL builder, validator, and success-copy selector', () => {
  has(contract, /export const PUBLIC_ASSESSMENT_ORIGIN\s*=\s*'https:\/\/findyourvertical\.online'/,
    'origin locked');
  has(contract, /export function buildPublicAssessmentInviteUrl/, 'URL builder exported');
  has(contract, /export function validatePublicAssessmentInviteInput/, 'validator exported');
  has(contract, /export function successCopyForDelivery/, 'copy selector exported');
});

// ── API helper ───────────────────────────────────────────────────────────────

test('createPublicAssessmentInvite calls the RPC via publicSupabase (anon path)', () => {
  has(api, /export async function createPublicAssessmentInvite/, 'helper exported');
  has(api, /publicSupabase[^)]*\)\.rpc\(\s*['"]create_public_assessment_invite['"]/,
    'invokes the RPC via anon client');
  has(api, /validatePublicAssessmentInviteInput\(input\)/, 'runs pure validator before the network');
});

test('createCreatorInviteRequest is retained but marked @deprecated (not removed)', () => {
  has(api, /@deprecated FYV-ONBOARD-2/, 'has deprecation marker');
  has(api, /export async function createCreatorInviteRequest/, 'helper still exists (compile-time safety)');
});

// ── AuthGate wiring ──────────────────────────────────────────────────────────

test('AuthGate imports the new helper + delivery + contract (not the deprecated one)', () => {
  has(authGate, /createPublicAssessmentInvite/, 'uses new helper');
  has(authGate, /deliverAssessmentInvitation/, 'uses new email delivery');
  has(authGate, /successCopyForDelivery/, 'uses success-copy selector');
  has(authGate, /buildPublicAssessmentInviteUrl/, 'uses URL builder');
  missing(authGate, /createCreatorInviteRequest/, 'no longer imports the deprecated helper');
});

test('AuthGate renders the spec success state (heading + start + copy)', () => {
  // The literal heading string ("Your assessment invite is ready.") is locked
  // once in the contract module (successCopyForDelivery) and asserted by the
  // pure test. AuthGate just has to (a) call the selector, (b) render its
  // {heading} property, and (c) render the two named buttons.
  has(authGate, /successCopyForDelivery\(inviteSuccess\.delivery\)/, 'invokes the copy selector');
  has(authGate, /\{copy\.heading\}/, 'renders the selector-produced heading');
  has(authGate, /\{copy\.body\}/, 'renders the selector-produced body');
  has(authGate, /Start Assessment/, 'start button label');
  has(authGate, /Copy Invite Link/, 'copy button label');
  has(authGate, /data-testid="start-assessment-cta"/, 'testable start button');
  has(authGate, /data-testid="copy-invite-link"/, 'testable copy button');
});

test('AuthGate shows the email-not-configured fallback + reused-invite hint', () => {
  has(authGate, /Email not sent · manual delivery/, 'manual delivery badge');
  has(authGate, /reused your existing link/, 'retake-friendly reused hint');
});

test('AuthGate never renders the old pending-approval copy', () => {
  missing(authGate, /Invite request received\. We'll review your details before granting access\./,
    'old dead-end message removed');
  missing(authGate, /review your details before granting access/i, 'no residual approval-gate wording');
});

// ── Email seam ───────────────────────────────────────────────────────────────

test('assessment invitation email builder reuses onboarding brand tokens (single palette)', () => {
  has(emailBuilder, /from '\.\/onboardingInvitationEmail\.ts'/, 'imports shared FYV brand tokens');
  has(emailBuilder, /ASSESSMENT_INVITATION_SUBJECT/, 'exports subject');
  has(emailBuilder, /assessment_invitation/, 'tag namespace');
});

test('deliverAssessmentInvitation normalises provider throws into a manual result', () => {
  has(emailDeliver, /try\s*{\s*result\s*=\s*await\s+resolveEmailProvider\(\)\.send/, 'try/catch wraps send');
  has(emailDeliver, /reason:\s*`send_failed:/, 'normalises errors into a manual result');
});
