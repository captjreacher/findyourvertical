// FYV-ONBOARD-2 — pure contract tests for the public assessment-invite path.
// Run with: node --experimental-strip-types --test tests/public-assessment-invite.test.ts
//
// These tests exercise the isomorphic seam only: URL construction, input
// validation, and success-copy selection. They do NOT touch the DB, network,
// or any React runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_ASSESSMENT_ORIGIN,
  buildPublicAssessmentInviteUrl,
  validatePublicAssessmentInviteInput,
  successCopyForDelivery,
  type PublicAssessmentInviteResult,
} from '../src/lib/public-assessment-invite.ts';

// ── URL builder ──────────────────────────────────────────────────────────────

test('invite URL default origin matches AssessmentTemplates.PUBLIC_ASSESSMENT_ORIGIN', () => {
  // Locked so agency-issued and self-issued URLs stay identical in shape.
  assert.equal(PUBLIC_ASSESSMENT_ORIGIN, 'https://findyourvertical.online');
});

test('invite URL is /a/<slug>?ref=<code> with optional email prefill', () => {
  const url = buildPublicAssessmentInviteUrl({
    templateSlug: 'default',
    inviteCode: 'abc123',
    creatorEmail: 'emma@example.com',
  });
  assert.equal(
    url,
    'https://findyourvertical.online/a/default?ref=abc123&email=emma%40example.com',
  );
});

test('invite URL omits email when creatorEmail is null/empty', () => {
  const url = buildPublicAssessmentInviteUrl({
    templateSlug: 'default',
    inviteCode: 'abc123',
    creatorEmail: null,
  });
  assert.equal(url, 'https://findyourvertical.online/a/default?ref=abc123');
});

test('invite URL URL-encodes template slug', () => {
  const url = buildPublicAssessmentInviteUrl({
    templateSlug: 'creator/pro edition',
    inviteCode: 'x',
    creatorEmail: null,
  });
  // Slash must be encoded; space encoded as %20 (URLSearchParams handles ref).
  assert.ok(url.includes('/a/creator%2Fpro%20edition?ref=x'), url);
});

test('invite URL accepts a custom origin override (test/staging use)', () => {
  const url = buildPublicAssessmentInviteUrl({
    templateSlug: 'default',
    inviteCode: 'code',
    creatorEmail: null,
    origin: 'https://staging.example.com',
  });
  assert.equal(url, 'https://staging.example.com/a/default?ref=code');
});

// ── Input validator ─────────────────────────────────────────────────────────

test('validator rejects empty name', () => {
  assert.equal(validatePublicAssessmentInviteInput({ name: '   ', email: 'a@b.co' }), 'Name is required');
});

test('validator rejects name over 200 chars', () => {
  const err = validatePublicAssessmentInviteInput({ name: 'x'.repeat(201), email: 'a@b.co' });
  assert.equal(err, 'Name is too long');
});

test('validator rejects empty email', () => {
  assert.equal(validatePublicAssessmentInviteInput({ name: 'Emma', email: '' }), 'Email is required');
});

test('validator rejects malformed email', () => {
  for (const bad of ['not-an-email', 'a@', '@b.co', 'a@b', 'a@.co', 'a b@c.co']) {
    assert.equal(
      validatePublicAssessmentInviteInput({ name: 'Emma', email: bad }),
      'A valid email is required',
      `expected reject: ${bad}`,
    );
  }
});

test('validator accepts a well-formed submission with optional handle', () => {
  assert.equal(
    validatePublicAssessmentInviteInput({
      name: 'Emma Rose',
      email: 'Emma.Rose+fyv@Example.Com',
      onlyfansHandle: '@leahsiren',
    }),
    null,
  );
});

test('validator rejects handle over 200 chars', () => {
  assert.equal(
    validatePublicAssessmentInviteInput({
      name: 'Emma',
      email: 'emma@example.com',
      onlyfansHandle: 'x'.repeat(201),
    }),
    'Handle is too long',
  );
});

// ── Success-copy selector ───────────────────────────────────────────────────

test('delivered state shows we-emailed-you copy and hides fallback', () => {
  const copy = successCopyForDelivery({ state: 'delivered', url: 'https://x' });
  assert.equal(copy.heading, 'Your assessment invite is ready.');
  assert.match(copy.body, /emailed your secure sign-in link/);
  assert.match(copy.body, /begin your assessment immediately/);
  assert.equal(copy.showEmailFallback, false);
});

test('manual state shows email-not-configured fallback', () => {
  const copy = successCopyForDelivery({ state: 'manual', url: 'https://x' });
  assert.match(copy.body, /Email delivery is not configured/);
  assert.match(copy.body, /Use the secure invitation link below/);
  assert.equal(copy.showEmailFallback, true);
});

test('error state shows the same manual fallback so URL is always usable', () => {
  const copy = successCopyForDelivery({ state: 'error', url: 'https://x', reason: 'boom' });
  assert.match(copy.body, /Email delivery is not configured/);
  assert.equal(copy.showEmailFallback, true);
});

// ── RPC result shape (compile-time lock) ────────────────────────────────────

test('PublicAssessmentInviteResult has the exact fields the RPC returns', () => {
  // Compile-time contract: this object must satisfy the type. If the RPC
  // adds/removes a field, both this type and this test must be updated in
  // lockstep — a deliberate friction point.
  const value: PublicAssessmentInviteResult = {
    invite_link_id: '11111111-1111-1111-1111-111111111111',
    invite_code: 'abcd1234',
    template_id: '22222222-2222-2222-2222-222222222222',
    template_slug: 'default',
    creator_profile_id: '33333333-3333-3333-3333-333333333333',
    creator_email: 'emma@example.com',
    creator_name: 'Emma Rose',
    expires_at: '2027-01-01T00:00:00Z',
    reused: false,
    source: 'public',
  };
  assert.equal(value.source, 'public');
  assert.equal(typeof value.reused, 'boolean');
});
