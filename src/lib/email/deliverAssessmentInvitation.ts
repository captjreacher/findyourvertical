import { resolveEmailProvider } from './provider.ts';
import {
  buildAssessmentInvitationEmail,
  type AssessmentInvitationEmailInput,
} from './assessmentInvitationEmail.ts';
import type { EmailMessage, EmailSendResult } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// FYV-ONBOARD-2 — Wire the assessment invitation link through the email
// boundary. Mirrors deliverOnboardingInvitation for the assessment-invite flow.
//
// Delivery is BEST-EFFORT and NEVER blocks the caller: even if the provider
// throws, the assembled email + a synthetic error result are still returned so
// the UI can surface the copy-link fallback and let the visitor proceed. The
// secure assessment URL is always shown regardless of delivery outcome.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssessmentInvitationDelivery {
  /** The composed invitation email (subject/html/text) — always produced. */
  email: EmailMessage;
  /** The provider result. With the manual/no-op default, delivered=false. */
  result: EmailSendResult;
  /** The secure link is always generated; this is independent of email delivery. */
  linkGenerated: true;
}

/**
 * Compose and (best-effort) send the assessment-invitation email. Returns
 * `linkGenerated: true` always; reports `result.delivered: true` only when a
 * real provider actually sent it. A caught provider exception is normalised
 * into a `manual` result with `reason: 'send_failed'` so the caller can still
 * surface the URL and continue.
 */
export async function deliverAssessmentInvitation(
  input: AssessmentInvitationEmailInput,
): Promise<AssessmentInvitationDelivery> {
  const email = buildAssessmentInvitationEmail(input);
  let result: EmailSendResult;
  try {
    result = await resolveEmailProvider().send(email);
  } catch (err) {
    result = {
      delivered: false,
      mode: 'manual',
      provider: 'unknown',
      reason: `send_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { email, result, linkGenerated: true };
}
