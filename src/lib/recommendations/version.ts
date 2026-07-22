// ============================================================================
// FYV Recommendation Ruleset — VERSION PIN
// ----------------------------------------------------------------------------
// Single source of truth for the explainability / validation ruleset version.
// MUST stay in lockstep with the SQL function public.fyv_recommendation_version()
// defined in supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql.
//
// Future ruleset revisions (v2, v3) MUST:
//   1. Bump this constant.
//   2. Add a corresponding migration that bumps public.fyv_recommendation_version().
//   3. Keep v1 files untouched so a creator's stored evidence always reflects
//      the ruleset that produced it (no silent recompute, no silent rewrite).
// ============================================================================

export const RECOMMENDATION_RULESET_VERSION = 'fyv/recommendation/v1' as const;

/** Threshold below which Validated Fit is labelled "Insufficient evidence". */
export const VALIDATED_FIT_MIN_EVIDENCE_EXPERIMENTS = 1;

/**
 * Single-experiment banding (FROZEN): one experiment can NEVER publish a
 * "Validated" status — it can only earn "Early evidence". This is the
 * Phase 1 anti-pattern-guard documented in the migration.
 */
export const VALIDATED_MIN_COMPLETED_EXPERIMENTS = 4;

/** Validated Fit average required to pass into the "Validated" band. */
export const VALIDATED_FIT_THRESHOLD = 80;

/**
 * Spread (max-min) above which a completed-experiment batch is flagged
 * contradictory (per the migration's volatility check).
 */
export const CONTRADICTION_SPREAD_THRESHOLD = 20;

/**
 * Minimum number of burnout-marker feedbacks (willingness_to_continue = 1 AND
 * coalesce(audience_response_score, 0) >= 4) required across the COMPLETED
 * batch to elevate the entire direction to `Contradicted`. One off-day is not
 * contradiction; two or more escalate the batch-level flag. The migration's
 * `fyv_recalculate_creator_validated_fit` mirrors this number verbatim.
 */
export const VALIDATED_BURNOUT_MIN_MATCHES = 2;
