import type { EmailMessage, EmailProvider, EmailSendResult } from './types.ts';

/**
 * Safe default provider. It NEVER sends and NEVER claims to send — it records
 * that the message must be delivered manually (copy the link/email and send it).
 * This is browser-safe: no network, no credentials.
 */
export class ManualNoopEmailProvider implements EmailProvider {
  readonly name = 'manual-noop';

  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return {
      delivered: false,
      mode: 'manual',
      provider: this.name,
      reason: 'no_provider_configured',
    };
  }
}
