// ─────────────────────────────────────────────────────────────────────────────
// FYV-ONBOARDING-FIRST — shared onboarding contract (pure, isomorphic)
//
// Dependency-free + side-effect-free so it can be unit-tested directly by Node's
// type-stripping runner and reused by the browser dashboard/onboarding UI.
// ─────────────────────────────────────────────────────────────────────────────

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'review_required'
  | 'complete';

export const ONBOARDING_STATUSES: readonly OnboardingStatus[] = [
  'not_started',
  'in_progress',
  'submitted',
  'review_required',
  'complete',
] as const;

/** Row shape of public.creator_onboarding_cases (client-side view). */
export interface CreatorOnboardingCase {
  id: string;
  created_at: string;
  updated_at: string;
  creator_profile_id: string;
  status: OnboardingStatus;
  responses: Record<string, unknown>;
  review_notes: string | null;
  source: 'agency' | 'creator';
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
}

// ── Invitation redemption (distinct, safe failure codes) ─────────────────────

export type RedemptionCode =
  | 'authentication_required'
  | 'invalid'
  | 'revoked'
  | 'expired'
  | 'creator_mismatch'
  | 'already_accepted';

export interface RedemptionResult {
  ok: boolean;
  code?: RedemptionCode;
  onboarding_case_id?: string;
  status?: OnboardingStatus;
}

/** Distinct, human-readable messaging for every safe-failure code. */
export const REDEMPTION_MESSAGES: Record<RedemptionCode, string> = {
  authentication_required: 'Please sign in with your creator email to open this onboarding link.',
  invalid: 'This onboarding link is not valid. Please ask the team for a fresh link.',
  revoked: 'This onboarding link has been revoked. Please ask the team for a new one.',
  expired: 'This onboarding link has expired. Please ask the team for a new one.',
  creator_mismatch: 'This onboarding link belongs to a different account. Sign in with the invited email.',
  already_accepted: 'This onboarding link has already been used — continue from your dashboard.',
};

export function describeRedemption(result: RedemptionResult): string {
  if (result.ok) return 'Onboarding link accepted.';
  return REDEMPTION_MESSAGES[result.code ?? 'invalid'] ?? REDEMPTION_MESSAGES.invalid;
}

/**
 * Where the accept screen should route after attempting redemption. On success,
 * or when the same owner re-uses a spent link (already_accepted with a case id),
 * we resume via authenticated ownership at /my/onboarding — never the token.
 */
export function redemptionRedirect(result: RedemptionResult): '/my/onboarding' | null {
  if (result.ok) return '/my/onboarding';
  if (result.code === 'already_accepted' && result.onboarding_case_id) return '/my/onboarding';
  return null;
}

// ── Dashboard hero (onboarding-first until complete) ─────────────────────────

export interface HeroAction {
  label: string;
  /** Hash-route path (without the leading #). */
  to: string;
  variant: 'primary' | 'secondary';
}

export interface OnboardingHero {
  kind: 'onboarding' | 'workspace';
  status: OnboardingStatus;
  heading: string;
  body: string;
  /** Short status/reassurance line (e.g. review messaging). */
  note?: string;
  actions: HeroAction[];
}

const ONBOARDING_ROUTE = '/my/onboarding';

/**
 * Derive the /my hero. A null case (no onboarding started yet) is treated as
 * not_started. While onboarding is incomplete the hero prioritises onboarding;
 * once complete it becomes the creator-workspace hero.
 */
export function deriveOnboardingHero(
  status: OnboardingStatus | null,
  opts: { hasReport?: boolean; reviewNotes?: string | null } = {},
): OnboardingHero {
  const effective: OnboardingStatus = status ?? 'not_started';
  const reportAction: HeroAction | null = opts.hasReport
    ? { label: 'View My Latest Report', to: '/my/report', variant: 'secondary' }
    : null;

  if (effective === 'complete') {
    return {
      kind: 'workspace',
      status: effective,
      heading: 'Your creator workspace is ready',
      body: 'Onboarding is complete. Explore your Persona Portfolio, manage your services, and revisit your report any time.',
      actions: [
        { label: 'View Persona Portfolio', to: '/my/personas', variant: 'primary' },
        { label: 'Manage Creator Services', to: '/creator-services', variant: 'secondary' },
        { label: 'View Latest Report', to: '/my/report', variant: 'secondary' },
      ],
    };
  }

  const base = {
    kind: 'onboarding' as const,
    status: effective,
    heading: 'Complete your creator setup',
    body: 'Your assessment is finished. Now complete onboarding so we can build your creator profile, service plan, and Persona Portfolio.',
  };

  if (effective === 'submitted') {
    return {
      ...base,
      heading: 'Onboarding submitted',
      body: 'Thanks — your onboarding is in with our team. We’ll review it and let you know the next step.',
      note: 'Submitted and awaiting review. There’s nothing else you need to do right now.',
      actions: [reportAction].filter(Boolean) as HeroAction[],
    };
  }

  if (effective === 'review_required') {
    return {
      ...base,
      heading: 'Action required',
      body: 'We’ve reviewed your onboarding and need a few changes before we continue.',
      note: opts.reviewNotes?.trim() ? opts.reviewNotes.trim() : 'Reopen onboarding to make the requested updates and resubmit.',
      actions: [
        { label: 'Continue Creator Onboarding', to: ONBOARDING_ROUTE, variant: 'primary' },
        ...(reportAction ? [reportAction] : []),
      ],
    };
  }

  // not_started / in_progress
  return {
    ...base,
    actions: [
      {
        label: effective === 'in_progress' ? 'Continue Creator Onboarding' : 'Start Creator Onboarding',
        to: ONBOARDING_ROUTE,
        variant: 'primary',
      },
      ...(reportAction ? [reportAction] : []),
    ],
  };
}

// ── Progress strip ───────────────────────────────────────────────────────────

export type ProgressState = 'done' | 'current' | 'upcoming';

export interface ProgressStep {
  key: 'assessment' | 'onboarding' | 'persona_portfolio' | 'services';
  label: string;
  state: ProgressState;
}

/**
 * Assessment complete → Onboarding → Persona Portfolio → Services ready.
 * Reflects the creator's real signals; steps with no signal stay 'upcoming'.
 */
export function deriveProgress(input: {
  hasAssessment: boolean;
  onboardingStatus: OnboardingStatus | null;
  hasCompletedPortfolio: boolean;
}): ProgressStep[] {
  const onboardingComplete = input.onboardingStatus === 'complete';
  const onboardingActive =
    input.onboardingStatus != null && input.onboardingStatus !== 'complete';

  const assessment: ProgressState = input.hasAssessment ? 'done' : 'current';

  let onboarding: ProgressState = 'upcoming';
  if (onboardingComplete) onboarding = 'done';
  else if (input.hasAssessment) onboarding = 'current';

  let portfolio: ProgressState = 'upcoming';
  if (input.hasCompletedPortfolio) portfolio = 'done';
  else if (onboardingComplete) portfolio = 'current';

  let services: ProgressState = 'upcoming';
  if (onboardingComplete && input.hasCompletedPortfolio) services = 'current';

  // Keep unused flag meaningful for readers; onboardingActive documents intent.
  void onboardingActive;

  return [
    { key: 'assessment', label: 'Assessment complete', state: assessment },
    { key: 'onboarding', label: 'Onboarding', state: onboarding },
    { key: 'persona_portfolio', label: 'Persona Portfolio', state: portfolio },
    { key: 'services', label: 'Services ready', state: services },
  ];
}

// ── Invitation accept path ───────────────────────────────────────────────────

/** Hash-route accept path carrying the single-use raw token. */
export function buildOnboardingAcceptPath(rawToken: string): string {
  return `/my/onboarding/accept?token=${encodeURIComponent(rawToken)}`;
}

// ── Creator sidebar nav (labels + order; routing handled by the shell) ───────

export interface CreatorNavItem {
  id: 'home' | 'onboarding' | 'report' | 'assessments' | 'services' | 'personas' | 'account';
  label: string;
  to: string;
}

export const CREATOR_NAV: readonly CreatorNavItem[] = [
  { id: 'home', label: 'Home', to: '/my' },
  { id: 'onboarding', label: 'Onboarding', to: '/my/onboarding' },
  { id: 'report', label: 'My Report', to: '/my/report' },
  { id: 'assessments', label: 'Assessments', to: '/my/assessments' },
  { id: 'services', label: 'Creator Services', to: '/creator-services' },
  { id: 'personas', label: 'Persona Portfolio', to: '/my/personas' },
  { id: 'account', label: 'Account', to: '/my/account' },
] as const;
