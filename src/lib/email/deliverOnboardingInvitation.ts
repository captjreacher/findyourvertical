import { resolveEmailProvider } from './provider.ts';
import { buildOnboardingInvitationEmail, type OnboardingInvitationEmailInput } from './onboardingInvitationEmail.ts';
import type { EmailMessage, EmailSendResult } from './types.ts';

export interface OnboardingInvitationDelivery {
  /** The composed invitation email (subject/html/text) — always produced. */
  email: EmailMessage;
  /** The provider result. With the manual/no-op default, delivered=false. */
  result: EmailSendResult;
  /** The secure link is always generated; this is independent of email delivery. */
  linkGenerated: true;
}

/**
 * Wire the invitation link through the email boundary. This ALWAYS composes the
 * templated email and returns `linkGenerated: true`; it only reports `delivered:
 * true` if a real provider actually sent it. With the default manual/no-op
 * provider, `result.delivered` is false and the caller must surface a clear
 * "link generated — not emailed" state and let the operator send it manually.
 */
export async function deliverOnboardingInvitation(
  input: OnboardingInvitationEmailInput,
): Promise<OnboardingInvitationDelivery> {
  const email = buildOnboardingInvitationEmail(input);
  const result = await resolveEmailProvider().send(email);
  return { email, result, linkGenerated: true };
}
