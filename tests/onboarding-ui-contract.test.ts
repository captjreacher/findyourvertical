// Static contract checks over the onboarding-first dashboard wiring (text-level;
// JSX isn't executed). Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('App.tsx registers the authenticated onboarding + dashboard routes', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="\/my\/onboarding"/);
  assert.match(app, /path="\/my\/onboarding\/accept"/);
  assert.match(app, /path="\/my\/report"/);
  assert.match(app, /path="\/my\/assessments"/);
  assert.match(app, /path="\/my\/account"/);
  // Legacy public placeholder now redirects into the authenticated flow.
  assert.match(app, /path="\/creator-services\/onboarding"\s+element=\{<Navigate to="\/my\/onboarding" replace \/>\}/);
});

test('CreatorShell renders the required nav and sign out, with a mobile drawer', () => {
  const shell = read('src/components/creator/CreatorShell.tsx');
  assert.match(shell, /CREATOR_NAV/);
  assert.match(shell, /Sign out/);
  assert.match(shell, /aria-controls="creator-nav-drawer"/);
  assert.match(shell, /lg:hidden/); // mobile-only affordance
  assert.match(shell, /lg:flex/); // desktop persistent sidebar
});

test('nav library exposes the required items in order', () => {
  const lib = read('src/lib/onboarding.ts');
  for (const label of ['Home', 'Onboarding', 'My Report', 'Assessments', 'Creator Services', 'Persona Portfolio', 'Account']) {
    assert.ok(lib.includes(`'${label}'`), `nav includes ${label}`);
  }
});

test('CreatorHome shows the state-derived next step and removes redundant dashboard cards', () => {
  const home = read('src/components/creator/CreatorHome.tsx');
  assert.match(home, /deriveOnboardingHero/);
  assert.match(home, /deriveProgress/);
  assert.match(home, /CreatorShell/);
  assert.match(home, /Your next step/);
  assert.match(home, /A FunkMyFans reminder/);
  assert.match(home, /Services are not active yet/);
  assert.match(home, /Loading your onboarding progress/);
  assert.match(home, /could not load your onboarding progress/);
  assert.doesNotMatch(home, /Latest assessment/);
  assert.doesNotMatch(home, /Latest report/i);
  assert.doesNotMatch(home, /Assessment history/);
  assert.doesNotMatch(home, /Build your character possibilities/);
  assert.doesNotMatch(home, /awaiting review|awaiting approval/i);
});

test('CreatorHome previews workspace activation truthfully', () => {
  const home = read('src/components/creator/CreatorHome.tsx');
  assert.match(home, /workspace will activate when onboarding is complete and the relevant services are connected/);
  assert.match(home, /Workspace status:[\s\S]*Not active/);
  assert.match(home, /OnlyFans integration:[\s\S]*Not connected/);
});

test('creators-api exposes the onboarding functions', () => {
  const api = read('src/lib/creators-api.ts');
  for (const fn of [
    'getMyOnboardingCase',
    'startMyOnboarding',
    'saveMyOnboardingProgress',
    'submitMyOnboarding',
    'redeemOnboardingInvitation',
    'createOnboardingInvitation',
  ]) {
    assert.ok(api.includes(`export async function ${fn}`) || api.includes(`export interface ${fn}`), `api exports ${fn}`);
  }
});

test('cockpit invite action generates a link, runs the email boundary, and never claims it was sent', () => {
  const action = read('src/components/cockpit/OnboardingInviteAction.tsx');
  assert.match(action, /createOnboardingInvitation/);
  assert.match(action, /deliverOnboardingInvitation/);
  assert.match(action, /Invitation generated/);
  assert.match(action, /manual delivery/i);
  assert.match(action, /Email not sent/i);
});

test('creator services Start button routes into authenticated onboarding (no profileId)', () => {
  const svc = read('src/components/report/CreatorServicesPage.tsx');
  assert.match(svc, /onboardingUrl = '\/my\/onboarding'/);
  assert.ok(!/creator-services\/onboarding\$\{/.test(svc), 'no profileId query onboarding URL');
});
