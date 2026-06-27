// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Selector Engine (Sprint FYV-3.4B)
//
// Pure selector functions for multi-criteria knowledge queries.
// Combine multiple criteria, rank results by relevance, and degrade safely.
// Never throw when knowledge is incomplete — always return an empty array
// for unmatched queries.
//
// SCOPE: Service layer only. The intelligence engine does not consume these
// selectors yet — that wiring happens in FYV-3.4C.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Opportunity,
  Recommendation,
  Risk,
  SelectorProfile,
} from './types';
import { RECOMMENDATIONS } from './recommendations';
import { OPPORTUNITIES } from './opportunities';
import { RISKS } from './risks';

// ── Scoring helpers ─────────────────────────────────────────────────────────

/** Priority to numeric weight for ranking. */
const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

/** Severity to numeric weight for ranking. */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

/**
 * Returns true if the filter array is empty (universally applicable)
 * or the candidate is a member.
 */
function matchesOrUniversal<T extends string>(filter: readonly T[], candidate: string | undefined): boolean {
  if (filter.length === 0) return true;
  if (!candidate) return false;
  return (filter as readonly string[]).includes(candidate);
}

/**
 * Count how many candidates appear in the filter array.
 * Returns the filter length if the filter is empty (universal match).
 */
function overlapCount<T extends string>(filter: readonly T[], candidates: readonly string[]): number {
  if (filter.length === 0) return candidates.length > 0 ? 1 : 0;
  return candidates.filter(c => (filter as readonly string[]).includes(c)).length;
}

// ── Recommendation selectors ────────────────────────────────────────────────

/**
 * Score a recommendation against a selector profile.
 * Higher score = more relevant. Returns 0 if no match dimension hits.
 */
function scoreRecommendation(rec: Recommendation, profile: SelectorProfile): number {
  let score = 0;

  // Archetype match
  if (matchesOrUniversal(rec.applicableArchetypes, profile.archetype)) {
    score += rec.applicableArchetypes.length === 0 ? 5 : 15;
  } else {
    return 0; // Hard filter: if archetype is specified and doesn't match, skip
  }

  // Vertical match
  if (matchesOrUniversal(rec.applicableVerticals, profile.vertical)) {
    score += rec.applicableVerticals.length === 0 ? 3 : 12;
  }

  // Audience match
  if (profile.audienceStrategy && matchesOrUniversal(rec.applicableAudiences, profile.audienceStrategy)) {
    score += rec.applicableAudiences.length === 0 ? 2 : 10;
  }

  // Trait overlap
  const traitOverlap = overlapCount(rec.applicableTraits, profile.traits ?? []);
  score += traitOverlap * 8;

  // Priority boost
  score += PRIORITY_WEIGHT[rec.priority] ?? 0;

  return score;
}

/**
 * Returns recommendations relevant to the given archetype.
 * Results are ranked by relevance score, highest first.
 */
export function recommendationsForArchetype(archetype: string): Recommendation[] {
  return recommendationsForProfile({ archetype });
}

/**
 * Returns recommendations relevant to the given content vertical.
 * Results are ranked by relevance score, highest first.
 */
export function recommendationsForVertical(vertical: string): Recommendation[] {
  return RECOMMENDATIONS
    .filter(rec => matchesOrUniversal(rec.applicableVerticals, vertical))
    .sort((a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0));
}

/**
 * Returns recommendations relevant to the given creator trait.
 * Results are ranked by relevance score, highest first.
 */
export function recommendationsForTrait(trait: string): Recommendation[] {
  return RECOMMENDATIONS
    .filter(rec =>
      rec.applicableTraits.length === 0
      || (rec.applicableTraits as readonly string[]).includes(trait)
    )
    .sort((a, b) => (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0));
}

/**
 * Returns recommendations matching a multi-criteria profile.
 * Combines archetype, vertical, audience, and trait signals.
 * Results are ranked by combined relevance score, highest first.
 * Returns an empty array for unmatched or empty profiles.
 */
export function recommendationsForProfile(profile: SelectorProfile): Recommendation[] {
  if (!profile.archetype && !profile.vertical && !profile.audienceStrategy && (!profile.traits || profile.traits.length === 0)) {
    return [];
  }

  return RECOMMENDATIONS
    .map(rec => ({ rec, score: scoreRecommendation(rec, profile) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ rec }) => rec);
}

// ── Opportunity selectors ───────────────────────────────────────────────────

/**
 * Score an opportunity against a selector profile.
 */
function scoreOpportunity(opp: Opportunity, profile: SelectorProfile): number {
  let score = 0;

  // Archetype match
  if (matchesOrUniversal(opp.relatedArchetypes, profile.archetype)) {
    score += opp.relatedArchetypes.length === 0 ? 5 : 15;
  }

  // Vertical match
  if (matchesOrUniversal(opp.relatedVerticals, profile.vertical)) {
    score += opp.relatedVerticals.length === 0 ? 3 : 12;
  }

  // Trait overlap
  const traitOverlap = overlapCount(opp.relatedTraits, profile.traits ?? []);
  score += traitOverlap * 8;

  // Priority boost
  score += PRIORITY_WEIGHT[opp.priority] ?? 0;

  return score;
}

/**
 * Returns opportunities matching a multi-criteria profile.
 * Results are ranked by combined relevance score, highest first.
 * Returns an empty array for unmatched or empty profiles.
 */
export function opportunitiesForProfile(profile: SelectorProfile): Opportunity[] {
  if (!profile.archetype && !profile.vertical && (!profile.traits || profile.traits.length === 0)) {
    return [];
  }

  return OPPORTUNITIES
    .map(opp => ({ opp, score: scoreOpportunity(opp, profile) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ opp }) => opp);
}

// ── Risk selectors ──────────────────────────────────────────────────────────

/**
 * Score a risk against a selector profile.
 */
function scoreRisk(risk: Risk, profile: SelectorProfile): number {
  let score = 0;

  // Archetype match
  if (matchesOrUniversal(risk.relatedArchetypes, profile.archetype)) {
    score += risk.relatedArchetypes.length === 0 ? 5 : 15;
  }

  // Vertical match
  if (matchesOrUniversal(risk.relatedVerticals, profile.vertical)) {
    score += risk.relatedVerticals.length === 0 ? 3 : 12;
  }

  // Trait overlap
  const traitOverlap = overlapCount(risk.relatedTraits, profile.traits ?? []);
  score += traitOverlap * 8;

  // Severity boost (risks prioritise by severity, not priority)
  score += SEVERITY_WEIGHT[risk.severity] ?? 0;

  return score;
}

/**
 * Returns risks matching a multi-criteria profile.
 * Results are ranked by combined relevance score (severity-weighted), highest first.
 * Returns an empty array for unmatched or empty profiles.
 */
export function risksForProfile(profile: SelectorProfile): Risk[] {
  if (!profile.archetype && !profile.vertical && (!profile.traits || profile.traits.length === 0)) {
    return [];
  }

  return RISKS
    .map(risk => ({ risk, score: scoreRisk(risk, profile) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ risk }) => risk);
}

// ── Convenience exports ─────────────────────────────────────────────────────

/** All selector functions grouped for namespaced usage. */
export const selectors = {
  recommendationsForArchetype,
  recommendationsForVertical,
  recommendationsForTrait,
  recommendationsForProfile,
  opportunitiesForProfile,
  risksForProfile,
} as const;
