// FYV-ONBOARD-2 — email builder + delivery boundary tests.
// Run with: node --experimental-strip-types --test tests/public-assessment-invite-email.test.ts
//
// The email seam is provider-neutral. These tests assert:
//   * subject copy is locked to the spec ("Your assessment invite is ready")
//   * the URL is embedded in both HTML and text bodies exactly as passed
//   * FYV brand tokens are used (dark bg, brand pink CTA)
//   * name interpolation is HTML-escaped
//   * delivery ALWAYS returns linkGenerated:true (so callers can render the URL)
//   * delivery normalises provider throws into a manual result (never blocks)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssessmentInvitationEmail,
  ASSESSMENT_INVITATION_SUBJECT,
} from '../src/lib/email/assessmentInvitationEmail.ts';
import { deliverAssessmentInvitation } from '../src/lib/email/deliverAssessmentInvitation.ts';
import { FYV_EMAIL_BRAND } from '../src/lib/email/onboardingInvitationEmail.ts';
import { ManualNoopEmailProvider } from '../src/lib/email/manualProvider.ts';
import { resolveEmailProvider } from '../src/lib/email/provider.ts';

const URL = 'https://findyourvertical.online/a/default?ref=deadbeef1234&email=emma%40example.com';

test('subject is locked to the approved copy', () => {
  assert.equal(ASSESSMENT_INVITATION_SUBJECT, 'Your assessment invite is ready');
});

test('builder interpolates name + link and applies FYV brand tokens', () => {
  const email = buildAssessmentInvitationEmail({ firstName: 'Emma', assessmentUrl: URL, to: 'emma@example.com' });
  assert.equal(email.subject, ASSESSMENT_INVITATION_SUBJECT);
  assert.equal(email.to, 'emma@example.com');
  assert.match(email.html, /Hi Emma,/);
  // HTML escapes `&` in query params to `&amp;`; assert on a stable substring
  // that survives escaping so the test isn't fragile against escaping choices.
  assert.ok(email.html.includes('ref=deadbeef1234'), 'html embeds the assessment invite code');
  assert.ok(email.html.includes('/a/default'), 'html embeds the assessment route');
  assert.match(email.html, /Start Assessment/);
  assert.ok(email.html.includes(FYV_EMAIL_BRAND.primary), 'uses brand pink');
  assert.ok(email.html.includes(FYV_EMAIL_BRAND.background), 'uses dark background');
  assert.match(email.text, /Start Assessment:/);
  // Plain-text body is not HTML-escaped, so the exact URL round-trips.
  assert.ok(email.text.includes(URL));
  assert.equal(email.tags?.template, 'assessment_invitation');
});

test('builder falls back to "there" when firstName is missing/empty', () => {
  const empty = buildAssessmentInvitationEmail({ assessmentUrl: URL });
  assert.match(empty.html, /Hi there,/);
  assert.match(empty.text, /Hi there,/);
  const blank = buildAssessmentInvitationEmail({ firstName: '  ', assessmentUrl: URL });
  assert.match(blank.html, /Hi there,/);
});

test('builder HTML-escapes the recipient name', () => {
  const email = buildAssessmentInvitationEmail({
    firstName: '<script>alert(1)</script>',
    assessmentUrl: URL,
  });
  assert.ok(!email.html.includes('<script>alert(1)</script>'), 'raw script tag must not appear');
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('default provider is ManualNoopEmailProvider (never sends silently)', () => {
  const provider = resolveEmailProvider();
  assert.ok(provider instanceof ManualNoopEmailProvider);
});

test('deliver returns linkGenerated:true and result.delivered:false with default provider', async () => {
  const delivery = await deliverAssessmentInvitation({ assessmentUrl: URL, firstName: 'Emma' });
  assert.equal(delivery.linkGenerated, true);
  assert.equal(delivery.result.delivered, false);
  assert.equal(delivery.result.mode, 'manual');
  assert.equal(delivery.result.reason, 'no_provider_configured');
  assert.equal(delivery.email.subject, ASSESSMENT_INVITATION_SUBJECT);
  // See note on the builder test — `&` is HTML-escaped in the anchor href.
  assert.ok(delivery.email.html.includes('ref=deadbeef1234'));
  assert.ok(delivery.email.text.includes(URL));
});
