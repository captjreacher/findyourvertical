// Public homepage → self-service assessment entry (static contract checks).
//
// Run with: node --experimental-strip-types --test tests/public-home-assessment-entry.test.ts
//
// These lock the wiring that exposes the ALREADY-BUILT assessment sales flow on
// the public homepage, so a future refactor cannot (a) invent a second
// assessment workflow, (b) leak internal delivery/provider language to public
// creators, or (c) weaken the cockpit authorization boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const home = read('../src/pages/PublicHomePage.tsx');
const start = read('../src/components/public/PublicAssessmentStart.tsx');
const gate = read('../src/components/cockpit/AuthGate.tsx');
const api = read('../src/lib/creators-api.ts');
const contract = read('../src/lib/public-assessment-invite.ts');

const has = (src: string, re: RegExp, msg: string) => assert.ok(re.test(src), msg);
const missing = (src: string, re: RegExp, msg: string) => assert.ok(!re.test(src), msg);

// ── Homepage CTA hierarchy ───────────────────────────────────────────────────

test('homepage makes the assessment start the primary CTA', () => {
  has(home, /Complete My Assessment/, 'primary CTA label');
  has(home, /<PublicAssessmentStart/, 'primary CTA drives the existing start flow');
  // The CTA must drive the flow, not just decorate the page: it targets the
  // start card (the site runs under a HashRouter, so it moves the page itself).
  has(home, /document\.getElementById\(ASSESSMENT_START_SECTION_ID\)/, 'CTA targets the start card');
  has(home, /scrollIntoView\(/, 'CTA reveals the start card');
});

test('Creator Login stays available for existing creators', () => {
  has(home, /to="\/auth\/login"/, 'creator login route linked');
  has(home, /Creator Login/, 'creator login label present');
  // Returning-creator entry must survive the new primary CTA.
  const loginLinks = (home.match(/to="\/auth\/login"/g) ?? []).length;
  assert.ok(loginLinks >= 2, `expected the creator login path to be reachable more than once, saw ${loginLinks}`);
});

// ── Existing issuance contract is reused as-is ───────────────────────────────

test('assessment start reuses the existing issuance contract unchanged', () => {
  has(start, /createPublicAssessmentInvite\(\{/, 'calls the existing RPC helper');
  has(start, /buildPublicAssessmentInviteUrl\(\{/, 'builds the canonical invite URL');
  has(start, /templateSlug: invite\.template_slug/, 'uses the RPC-returned template slug');
  has(start, /inviteCode: invite\.invite_code/, 'uses the RPC-returned invite code');
  has(start, /creatorEmail: invite\.creator_email \?\? request\.email/, 'preserves the email prefill behaviour');
  has(start, /onlyfansHandle: request\.onlyfansHandle \|\| null/, 'preserves the optional handle contract');
  missing(start, /createCreatorInviteRequest/, 'no second/legacy invite workflow');
  // Exactly one producer of the RPC seam — no duplicated acquisition logic.
  has(api, /publicSupabase[^)]*\)\.rpc\(\s*['"]create_public_assessment_invite['"]/, 'RPC invoked from the anon path');
  has(contract, /export const PUBLIC_ASSESSMENT_ORIGIN\s*=\s*'https:\/\/findmyvertical\.com'/, 'canonical public origin');
  has(contract, /`\$\{origin\}\/a\/\$\{encodeURIComponent\(input\.templateSlug\)\}\?\$\{params\.toString\(\)\}`/, 'URL shape unchanged');
});

test('the homepage never re-implements the assessment flow itself', () => {
  missing(home, /createPublicAssessmentInvite/, 'no RPC call in the page');
  missing(home, /buildPublicAssessmentInviteUrl/, 'no URL assembly in the page');
  missing(home, /deliverAssessmentInvitation/, 'no email delivery in the page');
});

// ── Email/manual delivery never blocks the creator ───────────────────────────

test('successful issuance always exposes a usable assessment/start action', () => {
  has(start, /data-testid="start-assessment-cta"/, 'start action rendered');
  has(start, /Start My Assessment/, 'start action labelled');
  has(start, /href=\{success\.url\}/, 'start action uses the generated secure URL');
});

test('a manual or failed email delivery does not block assessment access', () => {
  // Manual (undelivered) results fall through to the same success state that
  // renders the URL; provider exceptions are normalised rather than rethrown.
  has(start, /attempted\.result\.delivered\s*\?\s*\{ state: 'delivered', url \}\s*:\s*\{ state: 'manual', url \}/,
    'delivery outcome only selects copy variants');
  has(start, /delivery = \{\s*\n\s*state: 'error',/, 'provider exceptions become an error state variant');
  has(start, /assessmentUrl: url/, 'delivery attempt always receives the generated URL');
  // Both variants render the same ready-state card containing the URL.
  has(start, /success && copy \?/, 'single success branch covers every delivery state');
  has(start, /role="status"/, 'success state announced without an error role');
});

// ── Public copy must not leak internal implementation language ───────────────

test('public success state never says "Email delivery is not configured"', () => {
  for (const [name, src] of [['card', start], ['contract', contract], ['homepage', home]] as const) {
    missing(src, /Email delivery is not configured/i, `${name} must not expose the internal message`);
    missing(src, /manual delivery/i, `${name} must not expose manual-delivery wording`);
    missing(src, /smtp/i, `${name} must not mention SMTP`);
  }
  has(contract, /heading: 'Your assessment is ready\.'/, 'customer-facing success heading');
  has(contract, /heading: 'Your assessment is ready\.'[\s\S]*heading: 'Your assessment is ready\.'/,
    'every delivery variant shares the ready heading');
});

// ── Sales-flow messaging, self-service only ──────────────────────────────────

test('homepage messaging follows the assessment → report → plan sales flow', () => {
  has(home, /complete the creator assessment/i, 'assessment step');
  has(home, /verticals that fit you|vertical(s)? that best fit/i, 'vertical discovery promise');
  has(home, /personalised starter report/i, 'free/personalised report promise');
  has(home, /Creator Portal/, 'portal continuation');
  has(home, /Personal Vertical Plan/, 'commercial next step');
});

test('homepage introduces no coaching/consulting/manual-approval sales motion', () => {
  missing(home, /coaching|consulting|representation|management support|strategy call|book a call|discovery call/i,
    'no service/coaching motion');
  missing(home, /pending|approval|review your details|we'll be in touch/i, 'no approval queue or manual gate');
  missing(home, /Funk My Fans/i, 'FunkMyFans is not a homepage sales CTA');
  missing(home, /mailto:/i, 'no contact-sales fallback');
});

// ── Cockpit boundary unchanged ───────────────────────────────────────────────

test('AuthGate still gates the cockpit on session + is_agency()', () => {
  has(gate, /export function AuthGate/, 'gate exported');
  has(gate, /supabase\.auth\.getSession\(\)/, 'session check retained');
  has(gate, /checkIsAgency\(\)/, 'agency allowlist check retained');
  has(gate, /agencyStatus === 'denied'/, 'denied branch retained');
  has(gate, /agencyStatus === 'error'/, 'verification-failure branch retained');
  has(gate, /return <>\{children\}/, 'children only rendered once authorized');
  missing(gate, /createPublicAssessmentInvite|deliverAssessmentInvitation/, 'no public acquisition in the gate');
  // The gate must not quietly default to allowing access.
  missing(gate, /setAgencyStatus\('agency'\)/, 'agency status is never assumed');
});
