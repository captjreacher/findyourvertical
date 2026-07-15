import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  validateCreatorAccessInvite,
  acceptCreatorAccessInvite,
} from '@/lib/creators-api';
import { INVITATION_MESSAGES, type InvitationCode } from '@/lib/creator-relationship';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';

/**
 * Public FYV access-invite acceptance screen (unauthenticated).
 *
 * The single-use raw token arrives in the URL. We validate it (no consume) to
 * show the invited email, then on accept the Worker provisions the creator's
 * Supabase account, associates it with the FYV creator identity, advances the
 * relationship invited → accepted, and returns a magic link that signs the
 * creator in and lands them on /my. No BetterFans username is ever involved.
 */
type Phase = 'validating' | 'ready' | 'invalid' | 'accepting' | 'redirecting' | 'manual' | 'error';

function messageForCode(code?: string): string {
  return INVITATION_MESSAGES[(code as InvitationCode) ?? 'invalid'] ?? INVITATION_MESSAGES.invalid;
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [phase, setPhase] = useState<Phase>('validating');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!token) {
      setPhase('invalid');
      setMessage(messageForCode('invalid'));
      return;
    }
    (async () => {
      try {
        const result = await validateCreatorAccessInvite(token);
        if (!active) return;
        if (result.ok) {
          setEmail(result.email ?? '');
          setPhase('ready');
        } else {
          setPhase('invalid');
          setMessage(messageForCode(result.code));
        }
      } catch {
        if (!active) return;
        setPhase('error');
        setMessage('We could not check this invitation. Please try again.');
      }
    })();
    return () => { active = false; };
  }, [token]);

  const accept = async () => {
    setPhase('accepting');
    setMessage('');
    try {
      const result = await acceptCreatorAccessInvite(token);
      if (result.ok && result.magicLink) {
        setPhase('redirecting');
        window.location.href = result.magicLink;
        return;
      }
      if (result.ok) {
        // Account is ready but no magic link was returned — sign in by email.
        setEmail(result.email ?? email);
        setPhase('manual');
        return;
      }
      setPhase('invalid');
      setMessage(messageForCode(result.code));
    } catch {
      setPhase('error');
      setMessage('We could not accept this invitation. Please try again.');
    }
  };

  return (
    <PublicSiteShell eyebrow="Creator invitation" title="Access your creator account" description="Accept your invitation to unlock your personalised FYV experience." heroTitle="Your creator journey starts here" heroDescription="Turn your strengths into clearer positioning, personalised insight, and confident next steps.">
      <div>
        {phase === 'validating' && (
          <p className="mt-4 text-sm text-charcoal-2" role="status">Checking your invitation…</p>
        )}

        {phase === 'ready' && (
          <>
            <p className="mt-4 text-sm text-charcoal-2">
              You’ve been invited to access FindYourVertical
              {email ? <> as <span className="font-medium text-charcoal">{email}</span></> : null}.
              Accept to set up your account and sign in.
            </p>
            <button onClick={() => void accept()} className="btn-primary mt-6 w-full">
              Accept &amp; sign in
            </button>
          </>
        )}

        {phase === 'accepting' && (
          <p className="mt-4 text-sm text-charcoal-2" role="status">Setting up your account…</p>
        )}

        {phase === 'redirecting' && (
          <p className="mt-4 text-sm text-charcoal-2" role="status">Signing you in…</p>
        )}

        {phase === 'manual' && (
          <>
            <p className="mt-4 text-sm text-charcoal-2">
              Your account is ready. Sign in with your email
              {email ? <> (<span className="font-medium text-charcoal">{email}</span>)</> : null} to continue.
            </p>
            <Link to="/my" className="btn-primary mt-6 inline-block w-full text-center">Go to sign in</Link>
          </>
        )}

        {(phase === 'invalid' || phase === 'error') && (
          <p className="mt-4 text-sm text-pink" role="alert">{message}</p>
        )}
      </div>
    </PublicSiteShell>
  );
}
