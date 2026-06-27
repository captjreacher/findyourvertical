// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Barrel Export
//   FYV-3.4A: Foundation types, data, registry, getters
//   FYV-3.4B: Recommendations, opportunities, risks, selectors
//
// Clean public surface for the knowledge registry.
//
// Usage (when wired in by a future sprint):
//   import {
//     getArchetypeKnowledge,
//     recommendationsForProfile,
//     opportunitiesForProfile,
//     risksForProfile,
//   } from '@/lib/knowledge';
//
//   import type {
//     ArchetypeKnowledge,
//     Recommendation,
//     SelectorProfile,
//   } from '@/lib/knowledge';
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  ArchetypeKnowledge,
  AudienceKnowledge,
  AudienceProfileKey,
  Difficulty,
  KnowledgeRegistry,
  Opportunity,
  Priority,
  Recommendation,
  Risk,
  SelectorProfile,
  Severity,
  VerticalKey,
  VerticalKnowledge,
} from './types';

// ── Data: Foundation (FYV-3.4A) ─────────────────────────────────────────────

export { ARCHETYPE_KNOWLEDGE, FALLBACK_ARCHETYPE_KNOWLEDGE } from './archetypes';
export { VERTICAL_KNOWLEDGE, FALLBACK_VERTICAL_KNOWLEDGE } from './verticals';
export { AUDIENCE_KNOWLEDGE } from './audiences';

// ── Data: Catalogues (FYV-3.4B) ─────────────────────────────────────────────

export { RECOMMENDATIONS, RECOMMENDATION_MAP } from './recommendations';
export { OPPORTUNITIES, OPPORTUNITY_MAP } from './opportunities';
export { RISKS, RISK_MAP } from './risks';

// ── Registry and safe-fallback getters ──────────────────────────────────────

export {
  knowledgeRegistry,
  getArchetypeKnowledge,
  getVerticalKnowledge,
  getAudienceKnowledge,
  getRecommendation,
  getOpportunity,
  getRisk,
} from './registry';

// ── Selectors (FYV-3.4B) ────────────────────────────────────────────────────

export {
  recommendationsForArchetype,
  recommendationsForVertical,
  recommendationsForTrait,
  recommendationsForProfile,
  opportunitiesForProfile,
  risksForProfile,
  selectors,
} from './selector';
