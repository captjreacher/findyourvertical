import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { redeemOnboardingInvitation } from '@/lib/creators-api';
import { describeRedemption, redemptionRedirect } from '@/lib/onboarding';
import brandLogo from '@/assets/fyv-brand-logo.png';

/**
 * Invitation landing screen. Rendered under CreatorGate, so the creator is
 * already authenticated and linked to their profile — the token is a one-time
 * entry mechanism, never the identity. On success (or a same-owner re-use of a
 * spent link) we resume via authenticated ownership at /my/onboarding.
 */
export function OnboardingAccept() {
  useCreatorSession(); // establishes the authenticated creator context
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [message, setMessage] = useState('Opening your onboarding…');
  const [failed, setFailed] = useState(false);
  const ran = useRef(false); // guard single-use token against StrictMode double-invoke

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!token) {
        setFailed(true);
        setMessage(describeRedemption({ ok: false, code: 'invalid' }));
        return;
      }
      try {
        const result = await redeemOnboardingInvitation(token);
        const dest = redemptionRedirect(result);
        if (dest) {
          navigate(dest, { replace: true });
          return;
        }
        setFailed(true);
        setMessage(describeRedemption(result));
      } catch {
        setFailed(true);
        setMessage('We could not open this onboarding link. Please try again or contact the team.');
      }
    })();
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4 text-charcoal">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-2xl shadow-black/25">
        <img src={brandLogo} alt="Find Your Vertical" className="mx-auto mb-5 h-14 w-auto object-contain" />
        {!failed ? (
          <p className="animate-pulse text-sm text-charcoal-2" role="status">{message}</p>
        ) : (
          <>
            <h1 className="text-lg font-bold text-charcoal">This onboarding link didn't work</h1>
            <p className="mt-2 text-sm text-charcoal-2">{message}</p>
            <Link to="/my" className="btn-primary mt-4 inline-flex text-sm">Go to your dashboard</Link>
          </>
        )}
      </div>
    </div>
  );
}
