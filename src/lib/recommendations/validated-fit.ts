// ============================================================================
// Validated Fit — versioned, deterministic, replaceable
// ----------------------------------------------------------------------------
// v1 formula (docs in supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql,
// mirrored here so creator-side previews and tests don't need a DB round-trip):
//
//   per_experiment_score = (
//     creator_energy_score
//     + authenticity_score
//     + (6 - creation_friction_score)            -- lower friction = better; inverted
//     + willingness_to_continue_score
//     + (audience_response_score ?? 3)          -- missing audience response treated as neutral
//   ) / 25 * 100
//
//   validated_fit_score = round(mean over COMPLETED experiments)
//
// Volatility check: when completed_count >= 2 AND max-min > 20, the batch is
// flagged contradictory. Single experiments can NEVER trigger this rule.
// A per-experiment burnout marker (willingness=1 AND audience>=4) also flags.
//
// Rules:
//   - NEVER include assessment evidence. This formula is purely usage-derived.
//   - One experiment produces an integer score but the state machine still
//     labels it "Early evidence" — see ./validation-status.ts.
// ============================================================================

import {
  CONTRADICTION_SPREAD_THRESHOLD,
  RECOMMENDATION_RULESET_VERSION,
  VALIDATED_BURNOUT_MIN_MATCHES,
} from './version.ts';

export interface ValidatedFitFeedback {
  creator_energy_score: number;            // 1..5
  authenticity_score: number;              // 1..5
  creation_friction_score: number;         // 1..5 (lower = better -> INVERTED)
  willingness_to_continue_score: number;   // 1..5
  audience_response_score?: number | null; // 1..5 (optional; default 3 = neutral)
}

export interface ValidatedFitInput {
  /** Only feedback rows whose experiment is COMPLETED participate. */
  feedbacks: ReadonlyArray<ValidatedFitFeedback>;
  /** Count of completed experiments (must equal feedbacks.length for v1). */
  completed_experiment_count?: number | null;
}

export interface ValidatedFitResult {
  /** Whole percent 0-100. `null` only when no completed experiments. */
  score: number | null;
  /** Number of completed experiments contributed to the score. */
  completed_count: number;
  /** min(per_experiment_scores). `null` when score is `null`. */
  min_per_experiment: number | null;
  /** max(per_experiment_scores). `null` when score is `null`. */
  max_per_experiment: number | null;
  /** Spread = max - min. `null` when score is `null`. */
  spread: number | null;
  /** True iff any of the contradictory conditions trigger. */
  is_contradictory: boolean;
  ruleset_version: typeof RECOMMENDATION_RULESET_VERSION;
}

function clamp01to5(n: number | null | undefined): number {
  if (!Number.isFinite(n ?? NaN)) return 3;
  return Math.max(1, Math.min(5, Math.round(n as number)));
}

function scorePerExperiment(feedback: ValidatedFitFeedback): number {
  const energy = clamp01to5(feedback.creator_energy_score);
  const auth = clamp01to5(feedback.authenticity_score);
  const invertedFriction = 6 - clamp01to5(feedback.creation_friction_score);
  const willingness = clamp01to5(feedback.willingness_to_continue_score);
  const audience = feedback.audience_response_score == null
    ? 3
    : clamp01to5(feedback.audience_response_score);

  const total = energy + auth + invertedFriction + willingness + audience;
  return Math.max(0, Math.min(100, Math.round((total / 25) * 100)));
}

function hasBurnoutMarker(feedback: ValidatedFitFeedback): boolean {
  return (
    clamp01to5(feedback.willingness_to_continue_score) === 1
    && (feedback.audience_response_score ?? 0) >= 4
  );
}

/**
 * Compute Validated Fit from completed-experiment feedback.
 * Pure. Mirrors the SQL function `fyv_recalculate_creator_validated_fit` for
 * the mean/spread/contradictory branches.
 */
export function calculateValidatedFit(input: ValidatedFitInput): ValidatedFitResult {
  const feedbacks = input.feedbacks ?? [];
  if (feedbacks.length === 0) {
    return {
      score: null,
      completed_count: 0,
      min_per_experiment: null,
      max_per_experiment: null,
      spread: null,
      is_contradictory: false,
      ruleset_version: RECOMMENDATION_RULESET_VERSION,
    };
  }

  const perExperiment = feedbacks.map(scorePerExperiment);
  const total = perExperiment.reduce((sum, n) => sum + n, 0);
  const score = Math.round(total / perExperiment.length);
  const min = Math.min(...perExperiment);
  const max = Math.max(...perExperiment);
  const spread = max - min;

  let contradictory = false;
  // Single-experiment rule: never trigger contradictory from one data point.
  if (feedbacks.length >= 2 && spread > CONTRADICTION_SPREAD_THRESHOLD) {
    contradictory = true;
  }
  // Per-experiment burnout rule: requires >=2 such matches in the batch to
  // elevate to contradictory. One exhaustion-with-loving-audience feedback is
  // NOT contradictory by itself — a creator might genuinely have one bad day.
  const burnoutMatchCount = feedbacks.filter(hasBurnoutMarker).length;
  if (
    feedbacks.length >= 2
    && burnoutMatchCount >= VALIDATED_BURNOUT_MIN_MATCHES
  ) {
    contradictory = true;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    completed_count: perExperiment.length,
    min_per_experiment: min,
    max_per_experiment: max,
    spread,
    is_contradictory: contradictory,
    ruleset_version: RECOMMENDATION_RULESET_VERSION,
  };
}

export const VALIDATED_FIT_RULESET_DOC = {
  version: RECOMMENDATION_RULESET_VERSION,
  weights: {
    creator_energy: 1,
    authenticity: 1,
    // Inverted: lower friction (1) → higher contribution (5). Higher friction
    // (5) → lower contribution (1).
    creation_friction_inverted: '6 - creation_friction_score',
    willingness_to_continue: 1,
    audience_response: 1,
    denominator: 25,
  },
  contradiction: {
    min_experiments_for_volatility: 2,
    spread_threshold: CONTRADICTION_SPREAD_THRESHOLD,
    burnout_marker: 'willingness_to_continue = 1 AND audience_response >= 4',
    burnout_marker_min_matches: VALIDATED_BURNOUT_MIN_MATCHES,
    docs:
      'A single burnout-with-loving-audience feedback is NOT contradictory by itself; ' +
      `elevating to Contradicted requires ${VALIDATED_BURNOUT_MIN_MATCHES}+ such matches in the batch.`,
  },
} as const;
