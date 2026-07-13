import { useState } from 'react';
import { createCreatorAccessInvitation, type CreatorAccessInvitationResult } from '@/lib/creators-api';

/**
 * Agency action: map a FYV creator identity to a canonical FMF creator id and
 * issue a single-use FYV access invitation (draft → invited). The secure raw
 * token is never shown on its own — only the full accept link the operator can
 * copy/send. No email provider is configured, so nothing is sent automatically.
 *
 * Identity is CANONICAL: the FMF creator id is the funk-my-brand of_creators.id
 * (a uuid), never a BetterFans username / handle / alias.
 */
export function CreatorAccessInviteAction({
  profileId,
  email,
}: {
  profileId: string;
  email?: string | null;
}) {
  const [fmfCreatorId, setFmfCreatorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreatorAccessInvitationResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const invitation = await createCreatorAccessInvitation(profileId, fmfCreatorId.trim(), email);
      setResult(invitation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an access invitation.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fmfCreatorId.trim());

  return (
    <div className="cockpit-card-pad border-accent/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="cockpit-section-title">FYV Access Invitation</h2>
        <button onClick={generate} disabled={busy || !uuidLike} className="btn-primary text-xs">
          {busy ? 'Generating…' : result ? 'Regenerate link' : 'Create access link'}
        </button>
      </div>

      <p className="mt-2 text-sm text-charcoal-2">
        Links this creator’s FYV identity to their FMF creator id and issues a
        single-use magic link to access FindYourVertical. Enter the canonical FMF
        creator id (a uuid) — not a BetterFans username.
      </p>

      <div className="mt-3">
        <label className="text-xs text-charcoal-2">FMF creator id</label>
        <input
          value={fmfCreatorId}
          onChange={e => setFmfCreatorId(e.target.value)}
          placeholder="20fdee3c-6998-4e8a-8611-04ab88949301"
          className="field-control mt-1 w-full text-xs"
        />
      </div>

      {error && <p className="mt-2 text-sm text-pink" role="alert">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3 py-2">
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              Invitation generated · {result.relationshipState}
            </span>
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
              Email not sent · manual delivery
            </span>
          </div>

          <div>
            <label className="text-xs text-charcoal-2">
              Access link
              {result.expiresAt ? ` (expires ${new Date(result.expiresAt).toLocaleDateString()})` : ''}
            </label>
            <div className="mt-1 flex gap-2">
              <input readOnly value={result.acceptUrl} onFocus={e => e.currentTarget.select()} className="field-control w-full text-xs" />
              <button onClick={() => void copy(result.acceptUrl)} className="btn-secondary whitespace-nowrap text-xs">
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>

          <p className="text-xs text-charcoal-2">
            Linked FMF creator id: <span className="font-mono">{result.fmfCreatorId}</span>
          </p>
        </div>
      )}
    </div>
  );
}
