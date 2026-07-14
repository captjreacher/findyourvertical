import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { createPublicAssessmentInvite } from '@/lib/creators-api';
import {
  buildPublicAssessmentInviteUrl,
  successCopyForDelivery,
  type PublicAssessmentInviteDeliveryState,
  type PublicAssessmentInviteResult,
} from '@/lib/public-assessment-invite';
import { deliverAssessmentInvitation } from '@/lib/email/deliverAssessmentInvitation';
import { checkIsAgency, signInWithOtp, signOut, supabase } from '@/lib/supabase';
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

// FYV-ONBOARD-2 — success-state shape returned by the public-assessment-invite
// flow. Kept minimal: the RPC result + the delivery state + the assembled URL.
interface InviteSuccess {
  invite: PublicAssessmentInviteResult;
  url: string;
  delivery: PublicAssessmentInviteDeliveryState;
  firstName: string;
}

function firstNameFrom(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Cockpit is agency-only. A valid session is necessary but NOT sufficient:
  // the user must also be in the agency allowlist (is_agency()).
  const [agencyStatus, setAgencyStatus] = useState<'checking' | 'agency' | 'denied' | 'error'>('checking');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<AuthMessageKind | null>(null);
  const [inviteRequest, setInviteRequest] = useState(EMPTY_INVITE_REQUEST);
  const [requestingInvite, setRequestingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<InviteSuccess | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
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

  // FYV-ONBOARD-2 — public assessment-invite submit.
  // 1. Call the anon-callable create_public_assessment_invite RPC (issues an
  //    assessment invite immediately — no approval gate, no pending queue).
  // 2. Assemble the invite URL from the returned code + template slug (same
  //    shape as agency-issued invites via AssessmentTemplates).
  // 3. Best-effort email delivery through the existing PR#17 email seam. The
  //    UI ALWAYS shows the URL regardless of delivery outcome.
  const handleInviteRequest = async (e: FormEvent) => {
    e.preventDefault();
    setRequestingInvite(true);
    setInviteError(null);
    setInviteSuccess(null);
    setCopyState('idle');

    try {
      const invite = await createPublicAssessmentInvite({
        name: inviteRequest.name,
        email: inviteRequest.email,
        onlyfansHandle: inviteRequest.onlyfansHandle || null,
      });

      const url = buildPublicAssessmentInviteUrl({
        templateSlug: invite.template_slug,
        inviteCode: invite.invite_code,
        creatorEmail: invite.creator_email ?? inviteRequest.email,
      });

      const firstName = firstNameFrom(invite.creator_name ?? inviteRequest.name);

      // Delivery is best-effort. A provider failure is normalised inside the
      // deliverer into a manual result so the URL is always shown.
      let delivery: PublicAssessmentInviteDeliveryState;
      try {
        const attempted = await deliverAssessmentInvitation({
          to: invite.creator_email ?? inviteRequest.email.trim().toLowerCase(),
          firstName,
          assessmentUrl: url,
        });
        if (attempted.result.delivered) {
          delivery = { state: 'delivered', url };
        } else {
          delivery = { state: 'manual', url };
        }
      } catch (err) {
        // Even a truly unexpected exception must not lose the URL for the user.
        delivery = {
          state: 'error',
          url,
          reason: err instanceof Error ? err.message : 'unknown_error',
        };
      }

      setInviteSuccess({ invite, url, delivery, firstName });
      setInviteRequest(EMPTY_INVITE_REQUEST);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Unable to submit request. Please try again.');
    } finally {
      setRequestingInvite(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteSuccess) return;
    try {
      // Prefer the async clipboard API; fall back to a legacy input+execCommand
      // path only if the modern API is unavailable.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteSuccess.url);
      } else {
        const input = document.createElement('input');
        input.value = inviteSuccess.url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('error');
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
    const copy = inviteSuccess ? successCopyForDelivery(inviteSuccess.delivery) : null;

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
              {inviteSuccess && copy ? (
                // FYV-ONBOARD-2 — success state. Landing page layout unchanged;
                // only the section under "Get Your Assessment Invite" swaps to
                // this ready-to-start card when the RPC returns a working
                // invite. Two buttons per spec: Start Assessment + Copy Invite
                // Link. If email delivery is not configured, the fallback copy
                // instructs the visitor to use the URL directly.
                <div
                  role="status"
                  className="grid gap-3 rounded-2xl border border-success/40 bg-black/[0.15] p-4 shadow-xl shadow-black/20 sm:p-5"
                >
                  <div>
                    <h2 className="text-xl font-bold leading-tight text-charcoal">{copy.heading}</h2>
                    <p className="mt-2 text-sm leading-5 text-charcoal-2">{copy.body}</p>
                    {copy.showEmailFallback && (
                      <p className="mt-2 text-xs uppercase tracking-wide text-pink">Email not sent · manual delivery</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-surface-3/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">Your secure invitation link</p>
                    <p className="mt-1 break-all font-mono text-xs text-charcoal">{inviteSuccess.url}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <a
                      href={inviteSuccess.url}
                      className="btn-primary min-h-12 w-full text-center text-base shadow-black/25"
                      data-testid="start-assessment-cta"
                    >
                      Start Assessment
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="btn-secondary min-h-12 w-full text-base"
                      data-testid="copy-invite-link"
                    >
                      {copyState === 'copied'
                        ? 'Copied ✓'
                        : copyState === 'error'
                          ? 'Copy failed — select above'
                          : 'Copy Invite Link'}
                    </button>
                  </div>

                  {inviteSuccess.invite.reused && (
                    <p className="text-xs text-charcoal-2">
                      You've requested an invite recently — we've reused your existing link so you can pick up where you left off.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInviteSuccess(null);
                      setCopyState('idle');
                    }}
                    className="text-left text-xs text-charcoal-2 underline underline-offset-2 hover:text-charcoal"
                  >
                    Request another invite
                  </button>
                </div>
              ) : (
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
                  {inviteError && (
                    <p className="text-sm text-pink" role="alert">
                      {inviteError}
                    </p>
                  )}
                </form>
              )}

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
              <Link to="/my" className="btn-secondary min-h-11 w-full text-center">
                Existing creator? Sign in
              </Link>
            </div>
          </section>
        </main>
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
