import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { checkIsAgency, signInWithOtp, signOut, supabase } from '@/lib/supabase';
import { claimCreatorProfile, getMyCreatorProfile } from '@/lib/creators-api';
import type { CreatorProfile } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

// ── Creator session context ─────────────────────────────────────────────────
// Provided by CreatorGate once an authenticated creator's identity is resolved
// to exactly one linked creator profile. Consumed by Creator Home (/my).
export interface CreatorSessionValue {
  session: Session;
  profile: CreatorProfile;
  reload: () => Promise<void>;
}

const CreatorSessionContext = createContext<CreatorSessionValue | null>(null);

export function useCreatorSession(): CreatorSessionValue {
  const value = useContext(CreatorSessionContext);
  if (!value) throw new Error('useCreatorSession must be used within a resolved CreatorGate');
  return value;
}

type Phase = 'loading' | 'unauthenticated' | 'agency' | 'creator' | 'error';

const DESTINATION = '/my';

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-2 px-4 py-6 text-charcoal">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

export function CreatorGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const resolvingFor = useRef<string | null>(null);

  const resolveCreator = useCallback(async (activeSession: Session) => {
    setPhase('loading');
    // Agency operators must never be silently linked to a creator profile.
    let agency = false;
    try {
      agency = await checkIsAgency();
    } catch {
      setErrorMessage('We could not verify your account. Please try again.');
      setPhase('error');
      return;
    }
    if (agency) {
      setPhase('agency');
      return;
    }
    // Resolve (or link) the creator's own profile — server-controlled by email.
    try {
      let ownProfile = await getMyCreatorProfile(activeSession.user.id);
      if (!ownProfile) {
        ownProfile = await claimCreatorProfile();
      }
      setProfile(ownProfile);
      setPhase('creator');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not load your account.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: current } }) => {
      if (!mounted) return;
      if (!current) {
        setPhase('unauthenticated');
        return;
      }
      setSession(current);
      resolvingFor.current = current.user.id;
      void resolveCreator(current);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      if (!next) {
        setSession(null);
        setProfile(null);
        resolvingFor.current = null;
        setPhase('unauthenticated');
        return;
      }
      // Avoid re-resolving on token refresh for the same user.
      if (resolvingFor.current === next.user.id && (phase === 'creator' || phase === 'agency')) {
        setSession(next);
        return;
      }
      setSession(next);
      resolvingFor.current = next.user.id;
      void resolveCreator(next);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveCreator]);

  const reload = useCallback(async () => {
    if (session) await resolveCreator(session);
  }, [session, resolveCreator]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setLoginMessage(null);
    setLoginError(null);
    const { error } = await signInWithOtp(email, DESTINATION);
    if (error) {
      setLoginError('Unable to send a magic link. Check the email address or contact us for access.');
    } else {
      setLoginMessage('Magic link sent. Check your inbox to sign in.');
    }
    setSending(false);
  };

  if (phase === 'loading') {
    return (
      <FullScreen>
        <div className="animate-pulse text-center text-sm text-charcoal-2">Loading your vertical…</div>
      </FullScreen>
    );
  }

  if (phase === 'unauthenticated') {
    return (
      <FullScreen>
        <div className="grid gap-5 rounded-3xl border border-white/10 bg-surface/92 p-6 shadow-2xl shadow-black/25">
          <img src={brandLogo} alt="Find Your Vertical" className="h-20 w-auto object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Welcome back</h1>
            <p className="mt-2 text-sm text-charcoal-2">
              Sign in with the email you used for your assessment. We'll send you a secure magic link — no password needed.
            </p>
          </div>
          <form onSubmit={handleLogin} className="grid gap-3">
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={event => {
                setEmail(event.target.value);
                setLoginMessage(null);
                setLoginError(null);
              }}
              placeholder="Email address"
              required
              className="field-control w-full"
            />
            <button type="submit" disabled={sending} className="btn-primary min-h-12 w-full text-base">
              {sending ? 'Sending…' : loginMessage ? 'Send again' : 'Send magic link'}
            </button>
          </form>
          {loginMessage && <p className="text-sm text-success" role="status">{loginMessage}</p>}
          {loginError && <p className="text-sm text-pink" role="alert">{loginError}</p>}
          <p className="text-xs text-charcoal-2">
            Access is invitation-only. If you don't have an account yet, ask us for an assessment invite.
          </p>
        </div>
      </FullScreen>
    );
  }

  if (phase === 'agency') {
    return (
      <FullScreen>
        <div className="grid gap-4 rounded-3xl border border-white/10 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
          <h1 className="text-xl font-bold text-charcoal">You're signed in as an agency operator</h1>
          <p className="text-sm text-charcoal-2">
            My Vertical is the creator area. Head to the agency cockpit to manage creators.
          </p>
          <div className="flex flex-col gap-2">
            <a href="#/cockpit" className="btn-primary w-full">Go to Cockpit</a>
            <button onClick={() => void signOut()} className="btn-secondary w-full">Sign out</button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreen>
        <div className="grid gap-4 rounded-3xl border border-pink/30 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
          <h1 className="text-xl font-bold text-charcoal">We couldn't open your vertical</h1>
          <p className="text-sm text-charcoal-2">{errorMessage}</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => void reload()} className="btn-primary w-full">Try again</button>
            <button onClick={() => void signOut()} className="btn-secondary w-full">Sign out</button>
          </div>
        </div>
      </FullScreen>
    );
  }

  // phase === 'creator'
  if (!session || !profile) {
    return (
      <FullScreen>
        <div className="animate-pulse text-center text-sm text-charcoal-2">Loading your vertical…</div>
      </FullScreen>
    );
  }

  return (
    <CreatorSessionContext.Provider value={{ session, profile, reload }}>
      {children}
    </CreatorSessionContext.Provider>
  );
}
