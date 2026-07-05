import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { createCreatorInviteRequest } from '@/lib/creators-api';
import { signInWithOtp, supabase } from '@/lib/supabase';
import brandLogo from '@/assets/fyv-brand-logo.png';
import type { Session } from '@supabase/supabase-js';

type AuthMessageKind = 'success' | 'error';
const MAGIC_LINK_SUCCESS_MESSAGE = 'Magic link sent. Check your inbox.';
const LOGIN_ERROR_MESSAGE = 'Unable to send a magic link. Check the email address or contact the site owner for access.';
const EMPTY_INVITE_REQUEST = { name: '', email: '', onlyfansHandle: '' };
const INVITE_BENEFITS = [
  'Discover your strongest niche opportunities',
  'Understand your growth potential',
  'Receive a personalised creator report',
];
const CAPABILITY_CHIPS = ['Find Your Content Niche', 'Business Mentoring', 'Scale & Systems'];

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<AuthMessageKind | null>(null);
  const [inviteRequest, setInviteRequest] = useState(EMPTY_INVITE_REQUEST);
  const [requestingInvite, setRequestingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteMessageKind, setInviteMessageKind] = useState<AuthMessageKind | null>(null);
  const loginSectionRef = useRef<HTMLDivElement | null>(null);
  const loginEmailRef = useRef<HTMLInputElement | null>(null);

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

  const handleInviteRequest = async (e: FormEvent) => {
    e.preventDefault();
    setRequestingInvite(true);
    setInviteMessage(null);
    setInviteMessageKind(null);

    try {
      await createCreatorInviteRequest({
        name: inviteRequest.name,
        email: inviteRequest.email,
        onlyfansHandle: inviteRequest.onlyfansHandle || null,
      });
      setInviteRequest(EMPTY_INVITE_REQUEST);
      setInviteMessage("Invite request received. We'll review your details before granting access.");
      setInviteMessageKind('success');
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to submit invite request. Please try again.');
      setInviteMessageKind('error');
    } finally {
      setRequestingInvite(false);
    }
  };

  const handleAdminLoginClick = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => loginEmailRef.current?.focus(), 250);
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
      <div className="min-h-screen bg-surface-2 px-4 py-4 text-charcoal sm:px-6 lg:px-8">
        <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl items-center">
          <section className="grid w-full gap-5 rounded-3xl border border-white/10 bg-surface/92 p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-5 lg:grid-cols-[0.92fr_1.08fr] lg:p-6">
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-3">
                <img
                  src={brandLogo}
                  alt="Find Your Vertical"
                  className="fyv-logo-mark h-32 w-72 object-contain"
                />
                <div className="sr-only">
                  <p className="text-lg font-bold leading-tight text-charcoal">Find Your Vertical</p>
                  <p className="text-sm text-charcoal-2">Creator Growth Framework</p>
                </div>
              </div>

              <h1 className="mt-5 max-w-xl text-2xl font-bold leading-tight tracking-normal text-charcoal sm:text-3xl">
                Find the creator niche you're most likely to succeed in.
              </h1>
              <div className="mt-4 max-w-xl space-y-3 text-sm leading-6 text-charcoal-2">
                <p>
                  Find Your Vertical helps creators identify their strongest content opportunities, business readiness, growth potential, and monetisation pathways.
                </p>
                <p>
                  Complete an assessment, receive a personalised report, and discover opportunities to grow faster.
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {CAPABILITY_CHIPS.map(item => (
                  <span key={item} className="rounded-full border border-white/10 bg-surface-3 px-3 py-1.5 text-xs font-semibold text-charcoal">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <form onSubmit={handleInviteRequest} className="grid gap-3 rounded-2xl border border-accent/35 bg-black/[0.15] p-4 shadow-xl shadow-black/20 sm:p-5">
                <div>
                  <h2 className="text-xl font-bold leading-tight text-charcoal">Get Your Assessment Invite</h2>
                  <p className="mt-1 text-sm font-semibold text-accent">Thinking about becoming a creator?</p>
                  <p className="mt-2 text-sm leading-5 text-charcoal-2">
                    Request an invitation to complete the Find Your Vertical assessment.
                  </p>
                </div>

                <ul className="grid gap-1.5 text-sm leading-5 text-charcoal">
                  {INVITE_BENEFITS.map(benefit => (
                    <li key={benefit} className="flex gap-2.5">
                      <span aria-hidden="true" className="text-success">✓</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={inviteRequest.name}
                    onChange={e => setInviteRequest(current => ({ ...current, name: e.target.value }))}
                    placeholder="Name"
                    required
                    className="field-control w-full"
                  />
                  <input
                    type="email"
                    value={inviteRequest.email}
                    onChange={e => setInviteRequest(current => ({ ...current, email: e.target.value }))}
                    placeholder="Email"
                    required
                    className="field-control w-full"
                  />
                </div>
                <input
                  value={inviteRequest.onlyfansHandle}
                  onChange={e => setInviteRequest(current => ({ ...current, onlyfansHandle: e.target.value }))}
                  placeholder="OnlyFans Handle (optional)"
                  className="field-control w-full"
                />
                <button type="submit" disabled={requestingInvite} className="btn-primary min-h-12 w-full text-base shadow-black/25">
                  {requestingInvite ? 'Requesting...' : 'Get My Assessment Invite →'}
                </button>
                {inviteMessage && (
                  <p
                    className={`text-sm ${inviteMessageKind === 'error' ? 'text-pink' : 'text-success'}`}
                    role={inviteMessageKind === 'error' ? 'alert' : 'status'}
                  >
                    {inviteMessage}
                  </p>
                )}
              </form>

              <div ref={loginSectionRef} className="rounded-2xl border border-white/10 bg-surface-3/70 p-3.5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-charcoal">Already Invited?</h2>
                    <p className="mt-1 text-sm text-charcoal-2">Enter the email address that received your invitation.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAdminLoginClick}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                  >
                    Admin / Invite Login
                  </button>
                </div>
                <form onSubmit={handleLogin} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <input
                    ref={loginEmailRef}
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
                  <button type="submit" disabled={sending} className="btn-secondary w-full">
                    {sending ? 'Sending...' : messageKind === 'success' ? 'Send Again' : 'Send Magic Link'}
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
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
