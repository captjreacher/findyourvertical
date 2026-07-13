// Agency Admin identity + Creator Relationship console — pure logic, migration
// static contract, and cockpit wiring. No DB. Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveIdentityRole,
  isAgencyAdminRole,
  isCreatorRole,
  canAccessAgencyConsole,
  shouldEnterCreatorOnboarding,
} from '../src/lib/agency-identity.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const seed = read('../supabase/migrations/20260714000200_seed_agency_admin_mike.sql');
const app = read('../src/App.tsx');
const layout = read('../src/components/cockpit/CockpitLayout.tsx');
const view = read('../src/components/cockpit/CreatorRelationships.tsx');
const api = read('../src/lib/creators-api.ts');
const sb = read('../src/lib/supabase.ts');
const has = (src: string, re: RegExp, msg: string) => assert.ok(re.test(src), msg);

// ── Identity role derivation (reuses allowlist signals; no role enum) ─────────

test('resolveIdentityRole: agency membership wins; creator needs a profile', () => {
  assert.equal(resolveIdentityRole({ authenticated: false, isAgency: false, hasCreatorProfile: false }), 'guest');
  assert.equal(resolveIdentityRole({ authenticated: true, isAgency: true, hasCreatorProfile: false }), 'agency_admin');
  // Agency wins even if a profile somehow exists — never treated as a creator.
  assert.equal(resolveIdentityRole({ authenticated: true, isAgency: true, hasCreatorProfile: true }), 'agency_admin');
  assert.equal(resolveIdentityRole({ authenticated: true, isAgency: false, hasCreatorProfile: true }), 'creator');
  assert.equal(resolveIdentityRole({ authenticated: true, isAgency: false, hasCreatorProfile: false }), 'guest');
});

test('a creator cannot access the agency console; an admin can', () => {
  const creator = resolveIdentityRole({ authenticated: true, isAgency: false, hasCreatorProfile: true });
  const admin = resolveIdentityRole({ authenticated: true, isAgency: true, hasCreatorProfile: false });
  assert.ok(isCreatorRole(creator) && !canAccessAgencyConsole(creator), 'creator blocked from console');
  assert.ok(isAgencyAdminRole(admin) && canAccessAgencyConsole(admin), 'admin allowed in console');
});

test('an admin is never routed through creator onboarding', () => {
  const admin = resolveIdentityRole({ authenticated: true, isAgency: true, hasCreatorProfile: false });
  const creator = resolveIdentityRole({ authenticated: true, isAgency: false, hasCreatorProfile: true });
  assert.equal(shouldEnterCreatorOnboarding(admin), false);
  assert.equal(shouldEnterCreatorOnboarding(creator), true);
});

// ── Mike agency-admin seed (allowlist only; no role, no creator, no assessment) ─

test('seed is idempotent, guarded, and references the existing auth user by email', () => {
  assert.equal((seed.match(/\bbegin;/gi) || []).length, 1);
  assert.equal((seed.match(/\bcommit;/gi) || []).length, 1);
  has(seed, /insert into public\.agency_users \(auth_user_id\)/i, 'inserts allowlist membership');
  has(seed, /from auth\.users\s+where lower\(email\) = lower\('mike@mgrnz\.com'\)/i, 'resolves existing auth user by email');
  has(seed, /on conflict \(auth_user_id\) do nothing/i, 'idempotent');
});

test('seed does NOT create a user, creator profile, assessment, or role column', () => {
  const exec = seed.replace(/--.*$/gm, '');
  assert.ok(!/insert into public\.creator_profiles/i.test(exec), 'no creator profile insert');
  assert.ok(!/creator_assessments/i.test(exec), 'no assessment records');
  assert.ok(!/create table/i.test(exec), 'creates no table');
  assert.ok(!/create type/i.test(exec), 'creates no enum type');
  assert.ok(!/\balter table\b/i.test(exec), 'alters no table (no role column)');
  assert.ok(!/\brole\b/i.test(exec), 'introduces no role concept');
  assert.ok(!/insert into auth\.users/i.test(exec), 'does not create an auth user');
});

// ── Cockpit wiring: agency-gated console, reusing the existing invite endpoint ─

test('agency console route is under the AuthGate-gated cockpit; no /admin, no role', () => {
  has(app, /<Route path="\/cockpit\/\*" element=\{<AuthGate><CockpitLayout \/><\/AuthGate>\}>/, 'cockpit is AuthGate-gated');
  has(app, /<Route path="relationships" element=\{<CreatorRelationships \/>\} \/>/, 'relationships route present');
  has(app, /import\('\.\/components\/cockpit\/CreatorRelationships'\)/, 'view lazy-imported');
  assert.ok(!/path="\/admin/.test(app), 'no /admin console route');
});

test('cockpit nav exposes Relationships', () => {
  has(layout, /label: 'Relationships', to: '\/cockpit\/relationships'/, 'nav item added');
});

test('console reuses the existing invite endpoint + relationship reader (no competing system)', () => {
  has(view, /getCreatorRelationships/, 'reads relationships');
  has(view, /createCreatorAccessInvitation\(row\.fyv_creator_id, row\.fmf_creator_id\)/, 'reuses PR#21 invite helper with canonical ids');
  // The component must NOT define its own invite endpoint/fetch.
  assert.ok(!/fetch\(\s*['"`]\/api\/creators/.test(view), 'no direct competing invite endpoint in the view');
  has(api, /export async function getCreatorRelationships/, 'reader helper exists');
  has(api, /export async function createCreatorAccessInvitation/, 'PR#21 invite helper still present');
});

test('thin identity helpers reuse is_agency(); no new role RPC', () => {
  has(sb, /export async function isAgencyAdmin\(\): Promise<boolean> \{\s*return checkIsAgency\(\);/, 'isAgencyAdmin aliases is_agency');
  has(sb, /export async function isCreator\(\)/, 'isCreator helper present');
  has(sb, /rpc\('current_creator_profile_id'\)/, 'isCreator uses existing linkage rpc');
  assert.ok(!/rpc\('[^']*role[^']*'\)/i.test(sb), 'no new role rpc');
});

test('existing creator + PR#21 flows remain wired (additive only)', () => {
  for (const r of ['path="/my"', 'path="/my/onboarding"', 'path="/my/report"', 'path="/my/personas"', 'path="/accept-invite"']) {
    has(app, new RegExp(r.replace(/[/]/g, '\\/')), `${r} still present`);
  }
});
