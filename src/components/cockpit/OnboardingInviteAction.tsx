import { useState } from 'react';
import { createOnboardingInvitation } from '@/lib/creators-api';

/**
 * Agency action: create a single-use onboarding invitation for a creator and
 * copy the secure link. There is no transactional email provider in this repo,
 * so this ONLY generates a link — it never sends, and never claims to send, an
 * email. The raw token is shown once and is not stored.
 */
export function OnboardingInviteAction({ profileId }: { profileId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const invitation = await createOnboardingInvitation(profileId);
      setUrl(`${window.location.origin}/#${invitation.accept_path}`);
      setExpiresAt(invitation.expires_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an onboarding link.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="cockpit-card-pad border-accent/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="cockpit-section-title">Creator Onboarding</h2>
        <button onClick={() => void generate()} disabled={busy} className="btn-primary text-xs">
          {busy ? 'Generating…' : url ? 'Regenerate link' : 'Create onboarding link'}
        </button>
      </div>
      <p className="mt-2 text-sm text-charcoal-2">
        Generates a single-use onboarding invitation for this creator (resumes their active case if one already exists).
      </p>
      {error && <p className="mt-2 text-sm text-pink" role="alert">{error}</p>}
      {url && (
        <div className="mt-3">
          <label className="text-xs text-charcoal-2">
            Onboarding link{expiresAt ? ` (expires ${new Date(expiresAt).toLocaleDateString()})` : ''}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={e => e.currentTarget.select()}
              className="field-control w-full text-xs"
            />
            <button onClick={() => void copy()} className="btn-secondary whitespace-nowrap text-xs">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-warn">
            Email delivery is not configured — this only generated a link. It has <strong>not</strong> been emailed.
            Copy it and send it to the creator yourself.
          </p>
        </div>
      )}
    </div>
  );
}
