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

test('hero: null/not_started prioritises starting onboarding', () => {
  for (const status of [null, 'not_started'] as const) {
    const h = deriveOnboardingHero(status, { hasReport: true });
    assert.equal(h.kind, 'onboarding');
    assert.equal(h.heading, 'Complete your creator setup');
    assert.equal(h.actions[0].label, 'Start Creator Onboarding');
    assert.equal(h.actions[0].to, '/my/onboarding');
    assert.equal(h.actions[0].variant, 'primary');
    assert.ok(h.actions.some(a => a.label === 'View My Latest Report'));
  }
});

test('hero: in_progress says Continue', () => {
  const h = deriveOnboardingHero('in_progress');
  assert.equal(h.actions[0].label, 'Continue Creator Onboarding');
  assert.equal(h.actions[0].to, '/my/onboarding');
});

test('hero: submitted shows review messaging, no onboarding CTA', () => {
  const h = deriveOnboardingHero('submitted', { hasReport: true });
  assert.equal(h.heading, 'Onboarding submitted');
  assert.ok(h.note && h.note.length > 0);
  assert.ok(!h.actions.some(a => a.to === '/my/onboarding'));
});

test('hero: review_required routes back into onboarding and surfaces notes', () => {
  const h = deriveOnboardingHero('review_required', { reviewNotes: 'Please add a headshot.' });
  assert.equal(h.heading, 'Action required');
  assert.equal(h.actions[0].label, 'Continue Creator Onboarding');
  assert.equal(h.actions[0].to, '/my/onboarding');
  assert.equal(h.note, 'Please add a headshot.');
});

test('hero: complete becomes the workspace hero with three actions', () => {
  const h = deriveOnboardingHero('complete');
  assert.equal(h.kind, 'workspace');
  assert.equal(h.heading, 'Your creator workspace is ready');
  const labels = h.actions.map(a => a.label);
  assert.deepEqual(labels, ['View Persona Portfolio', 'Manage Creator Services', 'View Latest Report']);
  assert.equal(h.actions[0].to, '/my/personas');
});

test('progress reflects real signals', () => {
  const fresh = deriveProgress({ hasAssessment: true, onboardingStatus: null, hasCompletedPortfolio: false });
  assert.deepEqual(fresh.map(s => s.state), ['done', 'current', 'upcoming', 'upcoming']);

  const onboarding = deriveProgress({ hasAssessment: true, onboardingStatus: 'in_progress', hasCompletedPortfolio: false });
  assert.equal(onboarding[1].state, 'current');

  const done = deriveProgress({ hasAssessment: true, onboardingStatus: 'complete', hasCompletedPortfolio: false });
  assert.deepEqual(done.map(s => s.state), ['done', 'done', 'current', 'upcoming']);

  const full = deriveProgress({ hasAssessment: true, onboardingStatus: 'complete', hasCompletedPortfolio: true });
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
