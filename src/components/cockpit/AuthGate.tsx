import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { checkIsAgency, signInWithOtp, signOut, supabase } from '@/lib/supabase';
import brandLogo from '@/assets/fyv-brand-logo.png';
import type { Session } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — cockpit (/cockpit/*) security boundary.
//
// A valid Supabase session is necessary but NOT sufficient: the signed-in user
// must also be in the agency allowlist (is_agency()) to reach the cockpit.
//
// Public creator acquisition (assessment start / free report) is NOT handled
// here. It lives on the public homepage via
// components/public/PublicAssessmentStart, which is the single presentation of
// the self-service assessment-start flow. This gate only signs agency operators
// in and hard-denies everyone else.
// ─────────────────────────────────────────────────────────────────────────────

type AuthMessageKind = 'success' | 'error';
const MAGIC_LINK_SUCCESS_MESSAGE = 'Sign-in link sent. Check your inbox.';
const LOGIN_ERROR_MESSAGE = 'Unable to send a sign-in link. Check the email address or contact the site owner for access.';

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [agencyStatus, setAgencyStatus] = useState<'checking' | 'agency' | 'denied' | 'error'>('checking');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<AuthMessageKind | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAgencyStatus('checking');
      return;
    }
    let active = true;
    setAgencyStatus('checking');
    checkIsAgency()
      .then(ok => { if (active) setAgencyStatus(ok ? 'agency' : 'denied'); })
      .catch(() => { if (active) setAgencyStatus('error'); });
    return () => { active = false; };
  }, [session]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    setMessageKind(null);

    const { error } = await signInWithOtp(email, `${location.pathname}${location.search}`);

    if (error) {
      setMessage(LOGIN_ERROR_MESSAGE);
      setMessageKind('error');
    } else {
      setMessage(MAGIC_LINK_SUCCESS_MESSAGE);
      setMessageKind('success');
    }

    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2">
        <div className="animate-pulse text-charcoal-2">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4 py-10 text-charcoal">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface/92 p-6 shadow-2xl shadow-black/25">
          <img src={brandLogo} alt="Find My Vertical" className="fyv-logo-mark h-16 w-auto object-contain sm:h-20" />
          <h1 className="mt-5 text-xl font-bold text-charcoal">Agency operator sign in</h1>
          <p className="mt-2 text-sm leading-6 text-charcoal-2">
            The cockpit is available to agency operators. Enter your email address and we'll send you a secure sign-in
            link.
          </p>

          <form onSubmit={handleLogin} className="mt-5 grid gap-3">
            <label className="sr-only" htmlFor="cockpit-login-email">Email address</label>
            <input
              id="cockpit-login-email"
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setMessage(null);
                setMessageKind(null);
              }}
              placeholder="Email Address"
              required
              className="field-control w-full"
            />
            <button type="submit" disabled={sending} className="btn-primary w-full">
              {sending ? 'Sending...' : messageKind === 'success' ? 'Send Again' : 'Send Sign-In Link'}
            </button>
          </form>

          {message && (
            <p
              className={`mt-3 text-sm ${messageKind === 'error' ? 'text-pink' : 'text-success'}`}
              role={messageKind === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5">
            <a href="#/my" className="btn-secondary w-full text-center">Go to My Vertical</a>
            <p className="text-xs leading-5 text-charcoal-2">
              Creator looking to start an assessment?{' '}
              <a href="#/" className="font-semibold text-accent underline underline-offset-4">Go to Find My Vertical</a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (agencyStatus === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2">
        <div className="animate-pulse text-charcoal-2">Checking access…</div>
      </div>
    );
  }

  if (agencyStatus === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
          <h1 className="text-xl font-bold text-charcoal">This area is for agency operators</h1>
          <p className="mt-2 text-sm text-charcoal-2">
            Your account doesn't have cockpit access. If you're a creator, head to your own area.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <a href="#/my" className="btn-primary w-full">Go to My Vertical</a>
            <button onClick={() => void signOut()} className="btn-secondary w-full">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (agencyStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-md rounded-3xl border border-pink/30 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
          <h1 className="text-xl font-bold text-charcoal">We couldn't verify your access</h1>
          <p className="mt-2 text-sm text-charcoal-2">Please try again in a moment.</p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-4 w-full">Retry</button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
