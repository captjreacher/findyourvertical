// ─────────────────────────────────────────────────────────────────────────────
// FYV email delivery boundary — provider-neutral types.
//
// There is NO transactional email provider configured in this repo. This module
// defines the seam a real provider would implement. The default is a manual/
// no-op provider that never sends, so we can always distinguish "invitation link
// generated" from "email sent".
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional non-sensitive tags for provider-side categorisation/audit. */
  tags?: Record<string, string>;
}

/** 'manual' = not delivered by a provider (operator must send). 'sent' = a real provider delivered it. */
export type EmailDeliveryMode = 'manual' | 'sent';

export interface EmailSendResult {
  /** True ONLY when a real provider actually delivered the message. */
  delivered: boolean;
  mode: EmailDeliveryMode;
  /** Provider identifier, e.g. 'manual-noop'. */
  provider: string;
  /** Machine-readable reason when not delivered (e.g. 'no_provider_configured'). */
  reason?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
