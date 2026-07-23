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
import {
  authCallbackUrl,
  checkIsAgency,
  consumeAuthRedirectPath,
  normalizeRedirectPath,
  signOut,
  storeAuthRedirectPath,
  supabase,
} from '@/lib/supabase';
import { claimCreatorProfile, getMyCreatorProfile } from '@/lib/creators-api';
import type { CreatorProfile } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';
import maximisedAiExplode from '@/assets/maximisedai-explode.png';
import mgrnzLogoBadge from '@/assets/mgrnz-logo-badge.png';

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
type AuthMessageKind = 'success' | 'error';

const DESTINATION = '/my';
const RESET_DESTINATION = '/auth/login';
const BENEFITS = ['Creator Access', 'Invitation-only workspace', 'Private vertical intelligence'];
const FOOTER_LINKS = [
  { label: 'About', href: '/#/about' },
  { label: 'Privacy', href: '/#/privacy' },
  { label: 'Terms', href: '/#/terms' },
];

function FullScreen({ children }: { children: ReactNode }) {
  const isLoginRoute = window.location.hash.replace(/^#/, '').startsWith('/auth/login');

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <header className="border-b border-white/10 bg-black/88 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <a href="#/auth/login" aria-label="Find Your Vertical creator login" className="shrink-0">
            <img src={brandLogo} alt="Find Your Vertical" className="fyv-logo-mark h-20 w-auto object-contain sm:h-24" />
          </a>
          {isLoginRoute ? (
            <button type="button" aria-current="page" className="btn-primary min-h-11 cursor-default px-5">
              Creator Sign In
            </button>
          ) : (
            <a href="#/auth/login" className="btn-primary min-h-11 px-5">
              Creator Sign In
            </a>
          )}
        </div>
      </header>

      <main className="px-4 py-5 sm:px-6 lg:py-6">
        <div className="mx-auto min-h-[calc(100vh-10.5rem)] w-full max-w-6xl">{children}</div>
      </main>

      <footer className="border-t border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-xs text-charcoal-2 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="https://www.maximisedai.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit MaximisedAI"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <img src={maximisedAiExplode} alt="" className="h-8 w-8 object-contain" />
            <span>Powered by MaximisedAI</span>
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
            {FOOTER_LINKS.map(link => (
              <a key={link.label} href={link.href} className="transition-colors hover:text-charcoal">
                {link.label}
              </a>
            ))}
            <a
              href="https://mgrnz.com/"
              className="inline-flex items-center gap-2 transition-colors hover:text-charcoal"
              target="_blank"
              rel="noreferrer"
            >
              <span>A component of</span>
              <img src={mgrnzLogoBadge} alt="MGRNZ.com" className="h-7 w-20 object-contain" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function CreatorGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<AuthMessageKind | null>(null);
  const resolvingFor = useRef<string | null>(null);

  const setAuthMessage = (kind: AuthMessageKind, copy: string) => {
    setMessageKind(kind);
    setMessage(copy);
  };

  const clearAuthMessage = () => {
    setMessage(null);
    setMessageKind(null);
  };

  const resolveCreator = useCallback(async (activeSession: Session) => {
    setErrorMessage('');
    const agency = await checkIsAgency().catch(() => false);
    if (agency) {
      setPhase('agency');
      return;
    }

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

  const handleGoogleLogin = async () => {
    setSending(true);
    clearAuthMessage();
    storeAuthRedirectPath(DESTINATION);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authCallbackUrl(DESTINATION) },
    });
    if (error) {
      setAuthMessage('error', 'Unable to start Google sign-in. Please try again.');
      if (import.meta.env.DEV) {
        console.error('[Google OAuth] signInWithOAuth error', error);
      }
      setSending(false);
    }
  };

  const handlePasswordLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    clearAuthMessage();

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMessage('error', 'Unable to sign in with those details.');
      setSending(false);
      return;
    }

    setPassword('');
    setSending(false);

    // Explicitly route the user to their post-auth destination. The CreatorGate
    // mount also reacts to onAuthStateChange and remounts itself via
    // <Navigate to="/my" replace /> on /auth/login, but Supabase's
    // onAuthStateChange relies on BroadcastChannel/storage events that can be
    // dropped or delayed by some browsers (notably Playwright's WebKit
    // runtime), leaving the URL pinned at /auth/login. Hash navigation here
    // routes immediately after Supabase confirms the session is valid, so the
    // user lands on /my (or any pre-auth redirect stored by OAuth / invite
    // links) regardless of event timing. Guard against the no-op assignment
    // when onAuthStateChange already routed us, so we never double-fire.
    const target = normalizeRedirectPath(consumeAuthRedirectPath() ?? DESTINATION);
    if (window.location.hash !== `#${target}`) {
      window.location.hash = target;
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setAuthMessage('error', 'Enter your email address first.');
      return;
    }

    setResetting(true);
    clearAuthMessage();
    storeAuthRedirectPath(RESET_DESTINATION);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(RESET_DESTINATION),
    });

    if (error) {
      setAuthMessage('error', 'Unable to send password reset instructions.');
    } else {
      setAuthMessage('success', 'Password reset instructions sent. Check your inbox.');
    }
    setResetting(false);
  };

  if (phase === 'loading') {
    return (
      <FullScreen>
        <div className="flex min-h-[45vh] items-center justify-center text-sm text-charcoal-2" role="status">
          Loading your vertical...
        </div>
      </FullScreen>
    );
  }

  if (phase === 'unauthenticated') {
    return (
      <FullScreen>
        <div className="grid min-h-[calc(100vh-10.5rem)] items-center gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="order-2 flex min-h-0 flex-col justify-center lg:order-1">
            <div className="mx-auto w-full max-w-xl py-2 lg:py-4">
              <div className="text-center">
                <img
                  src={brandLogo}
                  alt="Find Your Vertical"
                  className="fyv-logo-mark mx-auto h-36 w-auto object-contain sm:h-40 lg:h-44"
                />
                <p className="mt-3 font-display text-2xl font-bold text-charcoal sm:text-3xl">
                  Find the Creator in You
                </p>
              </div>

              <div className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-surface/75 p-5 shadow-xl shadow-black/20 lg:mt-8">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Creator Access</p>
                <div>
                  <h1 className="text-3xl font-bold leading-tight tracking-normal text-charcoal">Welcome back</h1>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-charcoal-2">
                    Sign in to return to your private creator workspace, vertical intelligence, reports, and next steps.
                  </p>
                </div>
                <div className="grid gap-2">
                  {BENEFITS.map(item => (
                    <div key={item} className="flex items-center gap-3 text-sm text-charcoal-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-surface/92 p-5 shadow-2xl shadow-black/25 sm:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-charcoal-2">Creator sign in</p>
                <h2 className="text-2xl font-bold tracking-normal text-charcoal">Continue to FYV</h2>
              </div>

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={sending}
                  className="inline-flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-base font-semibold text-black shadow-lg shadow-black/10 transition-colors hover:bg-white/90 active:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-black/10 text-sm font-bold">G</span>
                  Continue with Google
                </button>
                <div className="grid gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-charcoal-2">Future providers</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled className="btn-secondary min-h-10 opacity-55">Apple</button>
                    <button type="button" disabled className="btn-secondary min-h-10 opacity-55">Microsoft</button>
                  </div>
                </div>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-charcoal-2">
                <span className="h-px flex-1 bg-white/10" />
                Email
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={handlePasswordLogin} className="grid gap-3">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    clearAuthMessage();
                  }}
                  placeholder="Email address"
                  required
                  className="field-control w-full"
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    clearAuthMessage();
                  }}
                  placeholder="Password"
                  required
                  className="field-control w-full"
                />
                <button type="submit" disabled={sending} className="btn-secondary min-h-11 w-full">
                  Sign in with email
                </button>
              </form>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal-2">
                <span>Access is invitation-only.</span>
                <button
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={resetting}
                  className="font-semibold text-charcoal underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {resetting ? 'Sending reset...' : 'Forgot password?'}
                </button>
              </div>

              {message && (
                <p className={messageKind === 'success' ? 'mt-4 text-sm text-success' : 'mt-4 text-sm text-pink'} role={messageKind === 'success' ? 'status' : 'alert'}>
                  {message}
                </p>
              )}
            </div>
          </section>
        </div>
      </FullScreen>
    );
  }

  if (phase === 'agency') {
    return (
      <FullScreen>
        <div className="flex min-h-[calc(100vh-10.5rem)] items-center justify-center">
          <div className="grid w-full max-w-md gap-4 rounded-2xl border border-white/10 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
            <h1 className="text-xl font-bold text-charcoal">You're signed in as an agency operator</h1>
            <p className="text-sm text-charcoal-2">
              My Vertical is the creator area. Head to the agency cockpit to manage creators.
            </p>
            <div className="flex flex-col gap-2">
              <a href="#/cockpit" className="btn-primary w-full">Go to Cockpit</a>
              <button onClick={() => void signOut()} className="btn-secondary w-full">Sign out</button>
            </div>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreen>
        <div className="flex min-h-[calc(100vh-10.5rem)] items-center justify-center">
          <div className="grid w-full max-w-md gap-4 rounded-2xl border border-pink/30 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
            <h1 className="text-xl font-bold text-charcoal">We couldn't open your vertical</h1>
            <p className="text-sm text-charcoal-2">{errorMessage}</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => void reload()} className="btn-primary w-full">Try again</button>
              <button onClick={() => void signOut()} className="btn-secondary w-full">Sign out</button>
            </div>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (!session || !profile) {
    return (
      <FullScreen>
        <div className="flex min-h-[45vh] items-center justify-center text-sm text-charcoal-2" role="status">
          Loading your vertical...
        </div>
      </FullScreen>
    );
  }

  return (
    <CreatorSessionContext.Provider value={{ session, profile, reload }}>
      {children}
    </CreatorSessionContext.Provider>
  );
}
