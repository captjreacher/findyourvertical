import { useState } from 'react';
import { createOnboardingInvitation } from '@/lib/creators-api';
import {
  deliverOnboardingInvitation,
  type OnboardingInvitationDelivery,
} from '@/lib/email/deliverOnboardingInvitation';

/**
 * Agency action: create a single-use onboarding invitation for a creator, then
 * run the generated link through the email delivery boundary. There is no
 * transactional email provider configured, so the boundary's manual/no-op
 * default is used and nothing is sent automatically.
 *
 * The UI keeps the secure raw token out of view and only exposes the accept
 * path / full onboarding link that the operator can copy.
 */
export function OnboardingInviteAction({
  profileId,
  firstName,
  email,
}: {
  profileId: string;
  firstName?: string | null;
  email?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [acceptPath, setAcceptPath] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [delivery, setDelivery] = useState<OnboardingInvitationDelivery | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'link' | 'email' | null>(null);

  const generate = async () => {
    setBusy(true);
    setError('');
    setCopied(null);

    try {
      const invitation = await createOnboardingInvitation(profileId);
      const url = `${window.location.origin}/#${invitation.accept_path}`;
      const result = await deliverOnboardingInvitation({ firstName, acceptUrl: url, to: email ?? '' });

      setLink(url);
      setAcceptPath(invitation.accept_path);
      setExpiresAt(invitation.expires_at);
      setDelivery(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an onboarding link.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: 'link' | 'email', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(current => (current === what ? null : current)), 1200);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const invitationExpired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
  const sent = delivery?.result.delivered ?? false;

  return (
    <div className="cockpit-card-pad border-accent/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="cockpit-section-title">Creator Onboarding</h2>
        <button onClick={generate} disabled={busy} className="btn-primary text-xs">
          {busy ? 'Generating…' : link ? 'Regenerate link' : 'Create onboarding link'}
        </button>
      </div>

      <p className="mt-2 text-sm text-charcoal-2">
        Generates a single-use onboarding invitation for the creator. If an active
        case already exists, the invitation resumes that case.
      </p>

      {error && (
        <p className="mt-2 text-sm text-pink" role="alert">
          {error}
        </p>
      )}

      {link && delivery && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3 py-2">
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              Invitation generated
            </span>
            {sent ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                Email sent
              </span>
            ) : (
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
                Email not sent · manual delivery
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${invitationExpired ? 'bg-pink/15 text-pink' : 'bg-accent/15 text-accent'}`}>
              {invitationExpired ? 'Expired' : 'Active'}
            </span>
          </div>

          <div>
            <label className="text-xs text-charcoal-2">
              Onboarding accept path
              {expiresAt ? ` (expires ${new Date(expiresAt).toLocaleDateString()})` : ''}
            </label>
            <div className="mt-1 flex gap-2">
              <input readOnly value={acceptPath} onFocus={e => e.currentTarget.select()} className="field-control w-full text-xs" />
              <button onClick={() => void copy('link', acceptPath)} className="btn-secondary whitespace-nowrap text-xs">
                {copied === 'link' ? 'Copied' : 'Copy path'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-charcoal-2">Onboarding link</label>
            <div className="mt-1 flex gap-2">
              <input readOnly value={link} onFocus={e => e.currentTarget.select()} className="field-control w-full text-xs" />
              <button onClick={() => void copy('link', link)} className="btn-secondary whitespace-nowrap text-xs">
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-charcoal-2">
              Invitation email (subject: “{delivery.email.subject}”)
            </label>
            <div className="mt-1 flex gap-2">
              <button onClick={() => void copy('email', delivery.email.html)} className="btn-secondary text-xs">
                {copied === 'email' ? 'Copied email HTML' : 'Copy email HTML'}
              </button>
            </div>
          </div>

          {!sent && (
            <p className="text-xs text-warn">
              Styled invitation email prepared, but email delivery is <strong>not</strong> configured (provider: {delivery.result.provider}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
