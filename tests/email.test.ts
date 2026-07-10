// Deterministic tests for the provider-neutral email boundary.
// Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOnboardingInvitationEmail,
  ONBOARDING_INVITATION_SUBJECT,
  FYV_EMAIL_BRAND,
} from '../src/lib/email/onboardingInvitationEmail.ts';
import { ManualNoopEmailProvider } from '../src/lib/email/manualProvider.ts';
import { resolveEmailProvider } from '../src/lib/email/provider.ts';
import { deliverOnboardingInvitation } from '../src/lib/email/deliverOnboardingInvitation.ts';

const URL = 'https://app.example.com/#/my/onboarding/accept?token=deadbeef';

test('subject matches the approved copy', () => {
  assert.equal(ONBOARDING_INVITATION_SUBJECT, 'Complete your creator setup');
});

test('builder interpolates name + link and uses the FYV brand style', () => {
  const email = buildOnboardingInvitationEmail({ firstName: 'Emma', acceptUrl: URL, to: 'emma@example.com' });
  assert.equal(email.subject, 'Complete your creator setup');
  assert.equal(email.to, 'emma@example.com');
  assert.match(email.html, /Hi Emma,/);
  assert.ok(email.html.includes(URL), 'html contains the accept URL');
  assert.match(email.html, /Start Creator Onboarding/);
  assert.ok(email.html.includes(FYV_EMAIL_BRAND.primary), 'uses brand pink');
  assert.ok(email.html.includes(FYV_EMAIL_BRAND.background), 'uses dark background');
  assert.match(email.text, /Start Creator Onboarding/);
  assert.ok(email.text.includes(URL));
  assert.match(email.text, /progress will be saved/);
  assert.equal(email.tags?.template, 'onboarding_invitation');
});

test('missing first name falls back to "there"; to defaults to empty', () => {
  const email = buildOnboardingInvitationEmail({ acceptUrl: URL });
  assert.match(email.html, /Hi there,/);
  assert.equal(email.to, '');
});

test('first name is HTML-escaped', () => {
  const email = buildOnboardingInvitationEmail({ firstName: '<script>x</script>', acceptUrl: URL });
  assert.ok(!email.html.includes('<script>x</script>'), 'raw HTML must not be injected');
  assert.match(email.html, /&lt;script&gt;/);
});

test('manual/no-op provider never reports delivery', async () => {
  const result = await new ManualNoopEmailProvider().send({ to: 'x@y.z', subject: 's', html: 'h', text: 't' });
  assert.equal(result.delivered, false);
  assert.equal(result.mode, 'manual');
  assert.equal(result.provider, 'manual-noop');
  assert.equal(result.reason, 'no_provider_configured');
});

test('default provider is the manual/no-op one', () => {
  assert.equal(resolveEmailProvider().name, 'manual-noop');
});

test('delivery boundary always generates the link/email but does not send by default', async () => {
  const delivery = await deliverOnboardingInvitation({ firstName: 'Emma', acceptUrl: URL, to: 'emma@example.com' });
  assert.equal(delivery.linkGenerated, true);
  assert.equal(delivery.result.delivered, false, 'nothing is sent with the manual default');
  assert.equal(delivery.result.mode, 'manual');
  assert.equal(delivery.email.subject, 'Complete your creator setup');
  assert.ok(delivery.email.html.includes(URL));
});
