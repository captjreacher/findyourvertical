import { useState, type FormEvent } from 'react';
import { createPublicAssessmentInvite } from '@/lib/creators-api';
import {
  buildPublicAssessmentInviteUrl,
  successCopyForDelivery,
  type PublicAssessmentInviteDeliveryState,
  type PublicAssessmentInviteResult,
} from '@/lib/public-assessment-invite';
import { deliverAssessmentInvitation } from '@/lib/email/deliverAssessmentInvitation';

// ─────────────────────────────────────────────────────────────────────────────
// FYV-ONBOARD-2 — public assessment-start card.
//
// This is the public self-service entry point for a new creator and the ONLY
// place the public acquisition flow is presented. It was extracted unchanged in
// behaviour from the legacy AuthGate landing page so the public homepage can
// own assessment acquisition; AuthGate remains the agency/cockpit boundary.
//
// Contract reused as-is (see src/lib/public-assessment-invite.ts):
//   1. createPublicAssessmentInvite() → anon-callable create_public_assessment_invite
//      RPC. It issues (or reuses) an assessment invite immediately — there is no
//      approval queue and no pending state.
//   2. buildPublicAssessmentInviteUrl() → the canonical /a/<slug>?ref=<code> URL,
//      byte-identical in shape to agency-issued invites.
//   3. deliverAssessmentInvitation() → best-effort email through the existing
//      email seam. Delivery NEVER blocks the visitor: the secure assessment URL
//      is always surfaced, and a provider failure is normalised to a manual
//      result rather than an error the creator can do anything about.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_ASSESSMENT_REQUEST = { name: '', email: '', onlyfansHandle: '' };

const ASSESSMENT_BENEFITS = [
  'Discover the verticals that best fit you',
  'Receive your personalised starter report',
  'Continue in your Creator Portal',
];

interface AssessmentStartSuccess {
  invite: PublicAssessmentInviteResult;
  url: string;
  delivery: PublicAssessmentInviteDeliveryState;
}

export interface PublicAssessmentStartProps {
  /** DOM id so a page-level CTA can scroll/focus the start card. */
  id?: string;
  className?: string;
}

export const PUBLIC_ASSESSMENT_START_ID = 'start-assessment';

export function PublicAssessmentStart({ id = PUBLIC_ASSESSMENT_START_ID, className }: PublicAssessmentStartProps) {
  const [request, setRequest] = useState(EMPTY_ASSESSMENT_REQUEST);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<AssessmentStartSuccess | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Start the self-service assessment:
  // 1. Call the anon-callable create_public_assessment_invite RPC (issues an
  //    assessment invite immediately — no approval gate, no pending queue).
  // 2. Assemble the invite URL from the returned code + template slug (same
  //    shape as agency-issued invites via AssessmentTemplates).
  // 3. Best-effort email delivery. The UI ALWAYS shows the URL regardless of
  //    the delivery outcome so the creator can always proceed.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setCopyState('idle');

    try {
      const invite = await createPublicAssessmentInvite({
        name: request.name,
        email: request.email,
        onlyfansHandle: request.onlyfansHandle || null,
      });

      const url = buildPublicAssessmentInviteUrl({
        templateSlug: invite.template_slug,
        inviteCode: invite.invite_code,
        creatorEmail: invite.creator_email ?? request.email,
      });

      // Delivery is best-effort. A provider failure is normalised inside the
      // deliverer into a manual result so the URL is always shown.
      let delivery: PublicAssessmentInviteDeliveryState;
      try {
        const attempted = await deliverAssessmentInvitation({
          to: invite.creator_email ?? request.email.trim().toLowerCase(),
          firstName: firstNameFrom(invite.creator_name ?? request.name),
          assessmentUrl: url,
        });
        delivery = attempted.result.delivered ? { state: 'delivered', url } : { state: 'manual', url };
      } catch (err) {
        // Even a truly unexpected exception must not lose the URL for the user.
        delivery = {
          state: 'error',
          url,
          reason: err instanceof Error ? err.message : 'unknown_error',
        };
      }

      setSuccess({ invite, url, delivery });
      setRequest(EMPTY_ASSESSMENT_REQUEST);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to start your assessment. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!success) return;
    try {
      // Prefer the async clipboard API; fall back to a legacy input+execCommand
      // path only if the modern API is unavailable.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(success.url);
      } else {
        const input = document.createElement('input');
        input.value = success.url;
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

  const reset = () => {
    setSuccess(null);
    setCopyState('idle');
    setError(null);
  };

  const copy = success ? successCopyForDelivery(success.delivery) : null;

  return (
    <div id={id} className={`scroll-mt-6 ${className ?? ''}`.trim()}>
      {success && copy ? (
        // Success state. The creator can ALWAYS proceed: the secure assessment
        // URL is surfaced whether or not the invitation email was delivered.
        <div
          role="status"
          className="grid gap-4 rounded-2xl border border-success/40 bg-surface/92 p-5 shadow-xl shadow-black/20 sm:p-6"
        >
          <div>
            <h2 className="text-xl font-bold leading-tight text-charcoal">{copy.heading}</h2>
            <p className="mt-2 text-sm leading-6 text-charcoal-2">{copy.body}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface-3/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">
              Your secure assessment link
            </p>
            <p className="mt-1 break-all font-mono text-xs text-charcoal">{success.url}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={success.url}
              className="btn-primary min-h-12 w-full text-center text-base shadow-black/25"
              data-testid="start-assessment-cta"
            >
              Start My Assessment
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="btn-secondary min-h-12 w-full text-base"
              data-testid="copy-assessment-link"
            >
              {copyState === 'copied'
                ? 'Copied ✓'
                : copyState === 'error'
                  ? 'Copy failed — select above'
                  : 'Copy My Link'}
            </button>
          </div>

          {copy.showEmailFallback && (
            <p className="text-xs leading-5 text-charcoal-2">
              Keep this link handy — it opens your assessment any time.
            </p>
          )}

          {success.invite.reused && (
            <p className="text-xs leading-5 text-charcoal-2">
              You already started recently — we reused your existing link so you can pick up where you left off.
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            className="text-left text-xs text-charcoal-2 underline underline-offset-2 hover:text-charcoal"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-2xl border border-accent/35 bg-surface/92 p-5 shadow-2xl shadow-black/25 sm:p-6"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Free creator report</p>
            <h2 className="mt-2 text-xl font-bold leading-tight text-charcoal">Start Your Assessment</h2>
            <p className="mt-2 text-sm leading-6 text-charcoal-2">
              Complete the Find My Vertical assessment to discover the verticals that best fit you and receive your
              personalised starter report.
            </p>
          </div>

          <ul className="grid gap-1.5 text-sm leading-5 text-charcoal">
            {ASSESSMENT_BENEFITS.map(benefit => (
              <li key={benefit} className="flex gap-2.5">
                <span aria-hidden="true" className="text-success">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              value={request.name}
              onChange={e => setRequest(current => ({ ...current, name: e.target.value }))}
              placeholder="Name"
              autoComplete="name"
              required
              className="field-control w-full"
            />
            <input
              name="email"
              type="email"
              value={request.email}
              onChange={e => setRequest(current => ({ ...current, email: e.target.value }))}
              placeholder="Email"
              autoComplete="email"
              spellCheck={false}
              required
              className="field-control w-full"
            />
          </div>
          <input
            name="onlyfansHandle"
            value={request.onlyfansHandle}
            onChange={e => setRequest(current => ({ ...current, onlyfansHandle: e.target.value }))}
            placeholder="OnlyFans Handle (optional)"
            className="field-control w-full"
          />
          <button type="submit" disabled={submitting} className="btn-primary min-h-12 w-full text-base shadow-black/25">
            {submitting ? 'Starting…' : 'Start My Assessment'}
          </button>
          {error && (
            <p className="text-sm text-pink" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function firstNameFrom(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
