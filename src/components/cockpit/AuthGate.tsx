import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { createCreatorInviteRequest } from '@/lib/creators-api';
import { signInWithOtp, supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

type AuthMessageKind = 'success' | 'error';
const MAGIC_LINK_SUCCESS_MESSAGE = 'Magic link sent. Check your inbox.';
const LOGIN_ERROR_MESSAGE = 'Unable to send a magic link. Check the email address or contact the site owner for access.';
const EMPTY_INVITE_REQUEST = { name: '', email: '', onlyfansHandle: '' };
const INVITE_BENEFITS = [
  'Discover your strongest content niche',
  'Understand your growth potential',
  'Receive a personalised creator report',
  'Learn which mentoring and growth services suit you',
];

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2">
        <div className="animate-pulse text-charcoal-2">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-surface-2 px-4 py-6 text-charcoal sm:px-6 lg:px-8">
        <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_460px]">
          <section className="py-6">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-sm font-black text-white shadow-lg shadow-orange-950/40">
                FYV
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">MGRNZ</p>
                <p className="text-sm text-charcoal-2">Creator Advisory Platform</p>
              </div>
            </div>

            <p className="cockpit-eyebrow">Find Your Vertical</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-normal text-charcoal sm:text-6xl">
              Find Your Vertical
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Helping creators identify their strongest content opportunities, monetisation pathways, and growth potential.
            </p>
            <div className="mt-8 max-w-2xl space-y-5 text-sm leading-7 text-charcoal-2 sm:text-base">
              <p>
                Find Your Vertical is an assessment and advisory platform designed for creators who want clarity, direction, and a practical plan for growth.
              </p>
              <p>
                Complete an assessment, receive a personalised creator report, and discover opportunities to improve positioning, monetisation, automation, and long-term creator success.
              </p>
            </div>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {['Positioning clarity', 'Monetisation pathways', 'Growth potential'].map(item => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-3xl border border-accent/35 bg-surface/95 p-5 shadow-2xl shadow-orange-950/25 backdrop-blur sm:p-6">
            <div className="mb-5 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Creator invitation</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-charcoal sm:text-3xl">
                Want personalised creator guidance?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Request an invitation and we'll review your profile for access to the Find Your Vertical assessment and creator growth programme.
              </p>
            </div>
            <ul className="mb-5 space-y-3 text-sm leading-6 text-slate-200">
              {INVITE_BENEFITS.map(benefit => (
                <li key={benefit} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 text-success">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            <form onSubmit={handleInviteRequest} className="space-y-3">
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
              <input
                value={inviteRequest.onlyfansHandle}
                onChange={e => setInviteRequest(current => ({ ...current, onlyfansHandle: e.target.value }))}
                placeholder="OnlyFans Handle (optional)"
                className="field-control w-full"
              />
              <button type="submit" disabled={requestingInvite} className="btn-primary min-h-12 w-full text-base shadow-orange-950/40">
                {requestingInvite ? 'Requesting...' : 'Get My Assessment Invite →'}
              </button>
            </form>
            {inviteMessage && (
              <p
                className={`mt-4 text-sm ${inviteMessageKind === 'error' ? 'text-pink' : 'text-success'}`}
                role={inviteMessageKind === 'error' ? 'alert' : 'status'}
              >
                {inviteMessage}
              </p>
            )}

            <div className="my-5 h-px bg-white/10" />

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3">
                <h2 className="text-base font-bold text-charcoal">Already invited?</h2>
                <p className="mt-1 text-sm text-charcoal-2">Sign in with your invited email address.</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-3">
                <input
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
                  placeholder="you@agency.com"
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
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
