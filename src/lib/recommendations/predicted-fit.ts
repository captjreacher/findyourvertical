// ============================================================================
// Predicted Fit — versioned, deterministic, replaceable
// ----------------------------------------------------------------------------
// v1 formula (frozen by RECOMMENDATION_RULESET_VERSION):
//
//   predicted_fit_score =
//     round( archetype_fits[topArchetype].fit_score * 0.7
//          + intelligence_confidence_score            * 0.3 )
//
// Rules:
//   - Inputs MUST be assessment-derived. Likes, views, audience-response scores,
//     monetisation, or creator feedback NEVER participate.
//   - Round to whole percentages for the UI; we never claim false precision.
//   - If no canonical assessment exists, return `null` — the UI shows
//     "Not yet calculated", NEVER a fabricated number.
//
// Phase 1 contract:
//   - Always imports creator_intelligence.ts / scoring.ts. No net-new heuristic.
//   - Replace this file to upgrade the formula; bump the ruleset version.
// ============================================================================

import type { CreatorIntelligenceResult } from '@/types/creator';
import { RECOMMENDATION_RULESET_VERSION } from './version.ts';

export interface PredictedFitInput {
  intelligence: Pick<
    CreatorIntelligenceResult,
    'archetype_fits' | 'confidence'
  > | null;
  /** Optional specific archetype to score (e.g. when surfaced per vertical). */
  archetype?: string | null;
}

export interface PredictedFitResult {
  /** 0-100 whole percent. `null` means not yet calculated (legacy / pre-snapshot). */
  score: number | null;
  /** 0-100 whole percent. Reflects whether the PREDICTOR, not the prediction. */
  confidence: number | null;
  ruleset_version: typeof RECOMMENDATION_RULESET_VERSION;
  /** What we scored; useful for the UI's "Top match" copy. */
  source_archetype: string | null;
}

const WEIGHT_FIT = 0.7;
const WEIGHT_CONFIDENCE = 0.3;

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Compute Predicted Fit for one recommended entity.
 * Pure — no side effects, no Supabase calls, no time-dependent values.
 *
 * Always use this function from UI; never inline the formula.
 */
export function calculatePredictedFit(input: PredictedFitInput): PredictedFitResult {
  const intelligence = input.intelligence;

  if (!intelligence) {
    return {
      score: null,
      confidence: null,
      ruleset_version: RECOMMENDATION_RULESET_VERSION,
      source_archetype: input.archetype ?? null,
    };
  }

  const fits = intelligence.archetype_fits ?? [];
  const intelligenceConfidence = clampPercent(intelligence.confidence?.score ?? 0);
  if (fits.length === 0) {
    // No archetype fit to anchor a Predicted Fit score — but the
    // predictor's own confidence still passes through so the UI can
    // surface how reliable the underlying intelligence package was.
    return {
      score: null,
      confidence: intelligenceConfidence,
      ruleset_version: RECOMMENDATION_RULESET_VERSION,
      source_archetype: input.archetype ?? null,
    };
  }

  const target = input.archetype
    ? fits.find(fit => fit.archetype === input.archetype) ?? fits[0]
    : fits[0];

  const fitScore = clampPercent(target.fit_score);

  const weighted = fitScore * WEIGHT_FIT + intelligenceConfidence * WEIGHT_CONFIDENCE;
  return {
    score: clampPercent(weighted),
    confidence: clampPercent(intelligenceConfidence),
    ruleset_version: RECOMMENDATION_RULESET_VERSION,
    source_archetype: target.archetype ?? null,
  };
}

export const PREDICTED_FIT_RULESET_DOC = {
  version: RECOMMENDATION_RULESET_VERSION,
  weights: { archetype_fit: WEIGHT_FIT, confidence: WEIGHT_CONFIDENCE },
  inputs: ['archetype_fits[].fit_score', 'confidence.score'],
  excludes: [
    'creator_variation_selections',
    'audience engagement metrics',
    'content performance metrics',
    'monetisation_breakdown',
    'creator feedback',
  ],
} as const;
