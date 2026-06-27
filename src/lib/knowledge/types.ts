// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Types (Sprint FYV-3.4A)
//
// SCOPE
//   Typed shapes for the reusable Creator Intelligence Knowledge Registry.
//   This module is foundation-only: it defines structure, not behaviour. No
//   scoring, report, assessment, Cockpit, or database code depends on it yet.
//
// DESIGN RULES
//   - Knowledge is keyed off the existing canonical unions in `@/types/creator`
//     (CreatorArchetype, ContentVertical, AudienceStrategy) so the compiler
//     enforces completeness. A missing archetype is a type error, not a runtime
//     surprise.
//   - Fallback sentinels ('Other' for archetypes, 'Unspecified' for verticals,
//     'default' for audiences) keep getters total for unknown keys.
//   - Keep entries small, descriptive, and free of platform-specific or
//     explicit content — this is positioning/coaching strategy, not media.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AudienceStrategy,
  ContentVertical,
  CreatorArchetype,
} from '@/types/creator';

/**
 * Baseline strategic knowledge for a single creator archetype.
 * One entry exists for every member of CREATOR_ARCHETYPES (all 29).
 */
export interface ArchetypeKnowledge {
  /** Canonical archetype key. Always a real CreatorArchetype member. */
  archetype: CreatorArchetype;
  /** One-line positioning: who this creator is to a fan. */
  identity: string;
  /** What this archetype tends to do well. */
  strengths: string[];
  /** Common failure modes and limiting factors. */
  weaknesses: string[];
  /** Who is drawn to this archetype and why. */
  audience: string;
  /** How this archetype connects with fans (tone / cadence). */
  communicationStyle: string;
  /** Levers that convert attention into revenue for this archetype. */
  monetisationStrengths: string[];
  /** Content formats this archetype is naturally suited to. */
  contentStyles: string[];
  /** Risks that stall or damage growth for this archetype. */
  growthRisks: string[];
  /** Concrete coaching moves to strengthen this archetype. */
  coachingRecommendations: string[];
  /** How reliably this archetype can be inferred; caveats for consumers. */
  confidenceNotes: string;
}

/** Vertical key, widened to allow the fallback sentinel. */
export type VerticalKey = ContentVertical | 'Unspecified';

/**
 * Baseline strategic knowledge for a single content vertical.
 * One entry exists for every member of ContentVertical (all 10).
 */
export interface VerticalKnowledge {
  /** Vertical key, or 'Unspecified' for the fallback entry. */
  vertical: VerticalKey;
  /** Who this vertical attracts. */
  audience: string;
  /** Recurring content themes that anchor the vertical. */
  contentPillars: string[];
  /** Ways to expand reach within the vertical. */
  growthStrategies: string[];
  /** Where revenue typically comes from in this vertical. */
  monetisationOpportunities: string[];
  /** Tactics that keep fans subscribed over time. */
  retentionStrategies: string[];
  /** The hard parts of operating in this vertical. */
  creatorChallenges: string[];
  /** Signals that the vertical is working. */
  successIndicators: string[];
}

/** Audience profile key, widened to allow the neutral fallback. */
export type AudienceProfileKey = AudienceStrategy | 'default';

/**
 * Baseline strategic knowledge for an audience strategy.
 * Entries exist for every AudienceStrategy plus a neutral 'default'.
 */
export interface AudienceKnowledge {
  /** Audience profile key, or 'default' for the neutral/mixed fallback. */
  key: AudienceProfileKey;
  /** Human-readable label. */
  label: string;
  /** What this audience is fundamentally seeking. */
  motivations: string[];
  /** How this audience tends to spend. */
  buyingBehaviour: string;
  /** What keeps this audience around. */
  retentionDrivers: string[];
  /** How best to talk to this audience. */
  conversationStyle: string;
  /** Natural upsell paths for this audience. */
  upsellOpportunities: string[];
  /** Warning signs to watch with this audience. */
  riskIndicators: string[];
}

/**
 * The assembled registry. Each map is keyed by its canonical union so the
 * compiler guarantees every archetype / vertical / audience is represented.
 */
export interface KnowledgeRegistry {
  archetypes: Record<CreatorArchetype, ArchetypeKnowledge>;
  verticals: Record<ContentVertical, VerticalKnowledge>;
  audiences: Record<AudienceProfileKey, AudienceKnowledge>;
}
