// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Enrichment (Sprint FYV-3.4C)
//
// Bridges the intelligence engine and the knowledge registry. Builds a
// SelectorProfile from the intelligence result's existing data, runs the
// selectors, and returns a typed KnowledgeEnrichment.
//
// DESIGN DECISIONS
//   - Uses EnrichmentInput (minimal structural types) rather than importing
//     full ArchetypeFit / TraitWeight from @/types/creator. This keeps the
//     enrichment module decoupled and avoids circular import concerns.
//   - Trait significance threshold (default 55) determines which traits are
//     passed to the selector profile. Traits below this weight are considered
//     too weak to drive knowledge selection.
//   - Always returns a valid KnowledgeEnrichment — never throws. If the
//     input is empty, the selectors return empty arrays.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  EnrichmentInput,
  KnowledgeEnrichment,
  SelectorProfile,
} from './types';
import {
  recommendationsForProfile,
  opportunitiesForProfile,
  risksForProfile,
} from './selector';
import { RECOMMENDATIONS } from './recommendations';
import { OPPORTUNITIES } from './opportunities';
import { RISKS } from './risks';

/** Default weight threshold for a trait to be considered significant. */
const TRAIT_SIGNIFICANCE_THRESHOLD = 55;

/**
 * Builds a SelectorProfile from the intelligence result's existing data.
 *
 * Extracts:
 * - Top archetype from archetype_fits (highest fit_score)
 * - Top vertical from the report's top_verticals
 * - Significant traits (weight >= threshold)
 * - Audience strategy from assessment responses
 *
 * Returns a profile that the selectors can query against.
 */
export function buildSelectorProfile(
  input: EnrichmentInput,
  traitThreshold: number = TRAIT_SIGNIFICANCE_THRESHOLD,
): SelectorProfile {
  const topArchetype = input.archetypeFits[0]?.archetype;
  const topVertical = input.topVerticals[0]?.name;

  const significantTraits = input.traits
    .filter(t => t.weight >= traitThreshold)
    .sort((a, b) => b.weight - a.weight)
    .map(t => t.trait);

  return {
    archetype: topArchetype,
    vertical: topVertical,
    traits: significantTraits,
    audienceStrategy: input.audienceStrategy ?? undefined,
  };
}

/**
 * Enriches an intelligence result with knowledge-selected recommendations,
 * opportunities, and risks.
 *
 * This is the primary integration point between the intelligence engine
 * and the knowledge registry. Called by createCreatorIntelligenceResult()
 * after the report is built.
 *
 * Always returns a valid KnowledgeEnrichment — never throws.
 * If the input is empty or has no matching data, the result contains
 * empty arrays and the profile reflects what was available.
 */
export function enrichWithKnowledge(input: EnrichmentInput): KnowledgeEnrichment {
  const profile = buildSelectorProfile(input);

  return {
    profile,
    recommendations: recommendationsForProfile(profile),
    opportunities: opportunitiesForProfile(profile),
    risks: risksForProfile(profile),
    catalogueCoverage: {
      recommendationsEvaluated: RECOMMENDATIONS.length,
      opportunitiesEvaluated: OPPORTUNITIES.length,
      risksEvaluated: RISKS.length,
    },
  };
}
