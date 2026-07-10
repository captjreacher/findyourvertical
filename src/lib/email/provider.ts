import { ManualNoopEmailProvider } from './manualProvider.ts';
import type { EmailProvider } from './types.ts';

/**
 * Provider-neutral selection point. Until a transactional email provider is
 * configured, the safe manual/no-op default is returned so nothing is ever sent
 * silently and we never misreport delivery.
 *
 * IMPORTANT: a real provider (Resend/SES/Postmark/etc.) must run SERVER-SIDE
 * only (a Cloudflare Worker route reading a Worker secret) — never in the
 * browser, and never with hard-coded credentials. To add one, slot its
 * implementation here behind a server-side configuration check; do not change
 * the browser default away from manual-noop.
 */
export function resolveEmailProvider(): EmailProvider {
  return new ManualNoopEmailProvider();
}
