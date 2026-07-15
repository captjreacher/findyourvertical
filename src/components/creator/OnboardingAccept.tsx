import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { redeemOnboardingInvitation } from '@/lib/creators-api';
import { describeRedemption, redemptionRedirect } from '@/lib/onboarding';
import brandLogo from '@/assets/fyv-brand-logo.png';
import { PublicLegalFooter } from '@/components/public/PublicSiteShell';

/**
 * Invitation landing screen. Rendered under CreatorGate, so the creator is
 * already authenticated and linked to their profile. The token is a one-time
 * entry mechanism, never identity.
 */
export function OnboardingAccept() {
  useCreatorSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [message, setMessage] = useState('Opening your onboarding...');
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

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
    <div className="fyv-public-shell min-h-screen px-4 py-6 text-charcoal">
      <main className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-2xl shadow-black/25">
          <img src={brandLogo} alt="Find Your Vertical" className="mx-auto mb-5 h-14 w-auto object-contain" />

          {!failed ? (
            <p className="animate-pulse text-sm text-charcoal-2" role="status">{message}</p>
          ) : (
            <>
              <h1 className="text-lg font-bold text-charcoal">This onboarding link did not work</h1>
              <p className="mt-2 text-sm text-charcoal-2">{message}</p>
              <Link to="/my" className="btn-primary mt-4 inline-flex text-sm">Go to your dashboard</Link>
            </>
          )}
        </div>
      </main>
      <PublicLegalFooter compact />
    </div>
  );
}
