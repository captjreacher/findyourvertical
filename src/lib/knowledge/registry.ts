// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Registry
//   FYV-3.4A: Foundation registry + safe-fallback getters
//   FYV-3.4B: Registers recommendations, opportunities, risks catalogues
//
// Assembles the typed KnowledgeRegistry from the individual knowledge maps
// and exposes safe-fallback getters. Consumers never see undefined — every
// getter returns a well-typed knowledge entry even for unknown keys.
//
// SCOPE: Foundation only. No scoring, report, assessment, Cockpit, or
// database code imports or consumes this module yet.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContentVertical, CreatorArchetype } from '@/types/creator';
import type {
  ArchetypeKnowledge,
  AudienceKnowledge,
  AudienceProfileKey,
  KnowledgeRegistry,
  Opportunity,
  Recommendation,
  Risk,
  VerticalKnowledge,
} from './types';
import { ARCHETYPE_KNOWLEDGE, FALLBACK_ARCHETYPE_KNOWLEDGE } from './archetypes';
import { VERTICAL_KNOWLEDGE, FALLBACK_VERTICAL_KNOWLEDGE } from './verticals';
import { AUDIENCE_KNOWLEDGE } from './audiences';
import { RECOMMENDATION_MAP } from './recommendations';
import { OPPORTUNITY_MAP } from './opportunities';
import { RISK_MAP } from './risks';

// ── Assembled registry ──────────────────────────────────────────────────────

export const knowledgeRegistry: KnowledgeRegistry = {
  archetypes: ARCHETYPE_KNOWLEDGE,
  verticals: VERTICAL_KNOWLEDGE,
  audiences: AUDIENCE_KNOWLEDGE,
  recommendations: RECOMMENDATION_MAP,
  opportunities: OPPORTUNITY_MAP,
  risks: RISK_MAP,
};

// ── Safe-fallback getters ───────────────────────────────────────────────────
// These accept `string` so callers with loosely-typed data (e.g. user input
// or JSON from the database) don't need a cast. Unknown keys get a neutral
// fallback — never undefined.

/**
 * Returns ArchetypeKnowledge for the given archetype.
 * Falls back to the neutral 'Other' profile for unknown keys.
 */
export function getArchetypeKnowledge(archetype: string): ArchetypeKnowledge {
  return ARCHETYPE_KNOWLEDGE[archetype as CreatorArchetype] ?? FALLBACK_ARCHETYPE_KNOWLEDGE;
}

/**
 * Returns VerticalKnowledge for the given content vertical.
 * Falls back to a neutral 'Unspecified' profile for unknown keys.
 */
export function getVerticalKnowledge(vertical: string): VerticalKnowledge {
  return VERTICAL_KNOWLEDGE[vertical as ContentVertical] ?? FALLBACK_VERTICAL_KNOWLEDGE;
}

/**
 * Returns AudienceKnowledge for the given audience strategy.
 * Falls back to the neutral 'default' profile for unknown keys.
 */
export function getAudienceKnowledge(key: string): AudienceKnowledge {
  return AUDIENCE_KNOWLEDGE[key as AudienceProfileKey] ?? AUDIENCE_KNOWLEDGE['default'];
}

/**
 * Returns a Recommendation by id, or undefined if not found.
 */
export function getRecommendation(id: string): Recommendation | undefined {
  return RECOMMENDATION_MAP[id];
}

/**
 * Returns an Opportunity by id, or undefined if not found.
 */
export function getOpportunity(id: string): Opportunity | undefined {
  return OPPORTUNITY_MAP[id];
}

/**
 * Returns a Risk by id, or undefined if not found.
 */
export function getRisk(id: string): Risk | undefined {
  return RISK_MAP[id];
}
