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
  heading: string;
  body: string;
  supportingMessage?: string;
  actions: HeroAction[];
}

export type PersonaPortfolioStatus = 'none' | 'pending' | 'generating' | 'completed' | 'failed';

/**
 * Derive the next incomplete creator-journey stage shown on /my. Assessment
 * completion is deliberately not treated as a review state: character choices,
 * portfolio creation, and service activation use their own persisted signals.
 */
export function deriveOnboardingHero(input: {
  characterComplete: boolean;
  portfolio: PersonaPortfolioStatus;
}): OnboardingHero {
  if (!input.characterComplete) {
    return {
      heading: 'Complete your onboarding',
      body: 'Choose the character possibilities that feel right for you and continue building your Persona Portfolio.',
      supportingMessage: 'This helps shape how FunkMyFans can support your content, audience growth and creator operations.',
      actions: [
        { label: 'Continue onboarding', to: '/my/characters', variant: 'primary' },
        { label: 'Explore FunkMyFans services', to: '/creator-services', variant: 'secondary' },
      ],
    };
  }

  if (input.portfolio === 'pending' || input.portfolio === 'generating') {
    return {
      heading: 'Your Persona Portfolio is being created',
      body: 'Your chosen character directions are being turned into a set of draft personas.',
      actions: [{ label: 'View portfolio progress', to: '/my/personas', variant: 'primary' }],
    };
  }

  if (input.portfolio === 'completed') {
    return {
      heading: 'Explore service activation',
      body: 'Your Persona Portfolio is ready. Explore the FunkMyFans services that could support your next stage of growth.',
      actions: [{ label: 'Explore FunkMyFans services', to: '/creator-services', variant: 'primary' }],
    };
  }

  return {
    heading: 'Set up your Persona Portfolio',
    body: 'Turn your chosen character possibilities into six distinct draft personas.',
    actions: [
      { label: 'Create Persona Portfolio', to: '/my/characters', variant: 'primary' },
      { label: 'Explore FunkMyFans services', to: '/creator-services', variant: 'secondary' },
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
  onboardingComplete: boolean;
  hasCompletedPortfolio: boolean;
}): ProgressStep[] {
  const assessment: ProgressState = input.hasAssessment ? 'done' : 'current';

  let onboarding: ProgressState = 'upcoming';
  if (input.onboardingComplete) onboarding = 'done';
  else if (input.hasAssessment) onboarding = 'current';

  let portfolio: ProgressState = 'upcoming';
  if (input.hasCompletedPortfolio) portfolio = 'done';
  else if (input.onboardingComplete) portfolio = 'current';

  let services: ProgressState = 'upcoming';
  if (input.onboardingComplete && input.hasCompletedPortfolio) services = 'current';

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
