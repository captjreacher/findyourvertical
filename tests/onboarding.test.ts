// Deterministic tests for the pure onboarding contract.
// Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveOnboardingHero,
  deriveProgress,
  describeRedemption,
  redemptionRedirect,
  REDEMPTION_MESSAGES,
  buildOnboardingAcceptPath,
  CREATOR_NAV,
  ONBOARDING_STATUSES,
} from '../src/lib/onboarding.ts';

test('hero: incomplete character choices are the next onboarding step', () => {
  const h = deriveOnboardingHero({ characterComplete: false, portfolio: 'none' });
  assert.equal(h.heading, 'Complete your onboarding');
  assert.equal(h.body, 'Choose the character possibilities that feel right for you and continue building your Persona Portfolio.');
  assert.equal(h.supportingMessage, 'This helps shape how FunkMyFans can support your content, audience growth and creator operations.');
  assert.deepEqual(h.actions, [
    { label: 'Continue onboarding', to: '/my/characters', variant: 'primary' },
    { label: 'Explore FunkMyFans services', to: '/creator-services', variant: 'secondary' },
  ]);
  assert.doesNotMatch(JSON.stringify(h), /awaiting|review|approval/i);
});

test('hero: completed choices advance to Persona Portfolio setup', () => {
  const h = deriveOnboardingHero({ characterComplete: true, portfolio: 'none' });
  assert.equal(h.heading, 'Set up your Persona Portfolio');
  assert.equal(h.actions[0].to, '/my/characters');
});

test('hero: active generation advances to portfolio progress', () => {
  for (const portfolio of ['pending', 'generating'] as const) {
    const h = deriveOnboardingHero({ characterComplete: true, portfolio });
    assert.equal(h.heading, 'Your Persona Portfolio is being created');
    assert.equal(h.actions[0].to, '/my/personas');
  }
});

test('hero: completed portfolio advances to service activation without claiming activation', () => {
  const h = deriveOnboardingHero({ characterComplete: true, portfolio: 'completed' });
  assert.equal(h.heading, 'Explore service activation');
  assert.equal(h.actions[0].to, '/creator-services');
  assert.doesNotMatch(JSON.stringify(h), /workspace is ready|services are active/i);
});

test('progress reflects real signals', () => {
  const fresh = deriveProgress({ hasAssessment: true, onboardingComplete: false, hasCompletedPortfolio: false });
  assert.deepEqual(fresh.map(s => s.state), ['done', 'current', 'upcoming', 'upcoming']);

  const done = deriveProgress({ hasAssessment: true, onboardingComplete: true, hasCompletedPortfolio: false });
  assert.deepEqual(done.map(s => s.state), ['done', 'done', 'current', 'upcoming']);

  const full = deriveProgress({ hasAssessment: true, onboardingComplete: true, hasCompletedPortfolio: true });
  assert.deepEqual(full.map(s => s.state), ['done', 'done', 'done', 'current']);
});

test('redemption codes each map to a distinct message', () => {
  const codes = Object.keys(REDEMPTION_MESSAGES);
  assert.equal(codes.length, 6);
  const messages = new Set(Object.values(REDEMPTION_MESSAGES));
  assert.equal(messages.size, 6, 'all redemption messages are distinct');

  assert.equal(describeRedemption({ ok: true }), 'Onboarding link accepted.');
  assert.equal(describeRedemption({ ok: false, code: 'expired' }), REDEMPTION_MESSAGES.expired);
});

test('redemption redirect: success and same-owner reuse resume via ownership', () => {
  assert.equal(redemptionRedirect({ ok: true, onboarding_case_id: 'c1' }), '/my/onboarding');
  assert.equal(redemptionRedirect({ ok: false, code: 'already_accepted', onboarding_case_id: 'c1' }), '/my/onboarding');
  assert.equal(redemptionRedirect({ ok: false, code: 'expired' }), null);
  assert.equal(redemptionRedirect({ ok: false, code: 'creator_mismatch' }), null);
});

test('accept path encodes the raw token', () => {
  assert.equal(buildOnboardingAcceptPath('abc123'), '/my/onboarding/accept?token=abc123');
  assert.ok(buildOnboardingAcceptPath('a b/c').includes('token=a%20b%2Fc'));
});

test('nav has the required items in order', () => {
  assert.deepEqual(
    CREATOR_NAV.map(n => n.label),
    ['Home', 'Onboarding', 'My Report', 'Assessments', 'Creator Services', 'Persona Portfolio', 'Account'],
  );
  assert.equal(ONBOARDING_STATUSES.length, 5);
});
