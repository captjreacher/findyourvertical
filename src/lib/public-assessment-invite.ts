// ─────────────────────────────────────────────────────────────────────────────
// FYV-ONBOARD-2 — Public assessment-invite contract (pure isomorphic).
//
// This module is the small, pure seam between the public landing form
// (AuthGate), the createPublicAssessmentInvite RPC in creators-api.ts, the
// assessment-invitation email builder, and any tests. Keep it dependency-free
// so both the browser and node --test can import it directly.
//
// The invite URL shape MUST match what agency's AssessmentTemplates modal
// already emits — see src/components/cockpit/AssessmentTemplates.tsx
// buildInviteUrl(). Both producers write to public.creator_assessment_links
// and downstream code cannot tell them apart.
// ─────────────────────────────────────────────────────────────────────────────

/** Public canonical origin for the FYV assessment wizard. Matches
 *  AssessmentTemplates.PUBLIC_ASSESSMENT_ORIGIN so agency-issued and
 *  self-issued invite URLs are identical in shape. */
export const PUBLIC_ASSESSMENT_ORIGIN = 'https://findyourvertical.online';

/** Shape returned by the create_public_assessment_invite RPC. */
export interface PublicAssessmentInviteResult {
  invite_link_id: string;
  invite_code: string;
  template_id: string;
  template_slug: string;
  creator_profile_id: string;
  creator_email: string | null;
  creator_name: string | null;
  expires_at: string | null;
  reused: boolean;
  source: 'public';
}

/** Input the browser-facing helper accepts. Only these three visitor-supplied
 *  values plus an optional template slug are surfaced by the landing form. */
export interface PublicAssessmentInviteInput {
  name: string;
  email: string;
  onlyfansHandle?: string | null;
  templateSlug?: string | null;
}

/** Deterministic invite-URL construction. Kept in one place so agency-issued
 *  and public-issued URLs stay byte-identical in shape. `email` is optional —
 *  the wizard prefills the email step when it's present. */
export function buildPublicAssessmentInviteUrl(input: {
  templateSlug: string;
  inviteCode: string;
  creatorEmail?: string | null;
  origin?: string;
}): string {
  const origin = input.origin ?? PUBLIC_ASSESSMENT_ORIGIN;
  const params = new URLSearchParams({ ref: input.inviteCode });
  if (input.creatorEmail) params.set('email', input.creatorEmail);
  return `${origin}/a/${encodeURIComponent(input.templateSlug)}?${params.toString()}`;
}

/** Pure input validator — used by both the RPC helper and node tests. Mirrors
 *  the server-side check inside create_public_assessment_invite so bad input
 *  never even reaches the network. Returns null on success or a short
 *  human-readable error string. */
export function validatePublicAssessmentInviteInput(
  input: PublicAssessmentInviteInput,
): string | null {
  const name = (input.name ?? '').trim();
  if (!name) return 'Name is required';
  if (name.length > 200) return 'Name is too long';

  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) return 'Email is required';
  if (email.length > 320) return 'Email is too long';
  // Same shape as the server-side check.
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email)) {
    return 'A valid email is required';
  }

  const handle = (input.onlyfansHandle ?? '').trim();
  if (handle.length > 200) return 'Handle is too long';

  return null;
}

/** Success-state variant surfaced by AuthGate after a submit. `delivered`
 *  toggles the "we've emailed your secure sign-in link" vs "Email delivery is
 *  not configured" branches per the spec. */
export type PublicAssessmentInviteDeliveryState =
  | { state: 'delivered'; url: string }
  | { state: 'manual'; url: string }
  | { state: 'error'; url: string; reason: string };

/** Compose the success message variants once so the UI and tests agree. */
export function successCopyForDelivery(
  delivery: PublicAssessmentInviteDeliveryState,
): { heading: string; body: string; showEmailFallback: boolean } {
  switch (delivery.state) {
    case 'delivered':
      return {
        heading: 'Your assessment invite is ready.',
        body: "We've emailed your secure sign-in link. You can begin your assessment immediately.",
        showEmailFallback: false,
      };
    case 'manual':
    case 'error':
      return {
        heading: 'Your assessment invite is ready.',
        body: 'Email delivery is not configured. Use the secure invitation link below.',
        showEmailFallback: true,
      };
  }
}
