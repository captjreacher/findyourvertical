// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Types
//   FYV-3.4A: Foundation interfaces
//   FYV-3.4B: Recommendation, Opportunity, Risk, SelectorProfile
//
// SCOPE
//   Typed shapes for the reusable Creator Intelligence Knowledge Registry.
//   Foundation-only: defines structure, not behaviour. No scoring, report,
//   assessment, Cockpit, or database code depends on it yet.
//
// DESIGN RULES
//   - Knowledge keyed off canonical unions in @/types/creator so the compiler
//     enforces completeness.
//   - Catalogue entries (recommendations, opportunities, risks) use typed
//     arrays for applicability. An empty array means "universally applicable."
//   - SelectorProfile is the loose input shape selectors accept — mirrors what
//     the intelligence engine will eventually pass.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AudienceStrategy,
  ContentVertical,
  CreatorArchetype,
  CreatorTrait,
} from '@/types/creator';

// ── FYV-3.4A: Foundation interfaces ─────────────────────────────────────────

/**
 * Baseline strategic knowledge for a single creator archetype.
 * One entry exists for every member of CREATOR_ARCHETYPES (all 29).
 */
export interface ArchetypeKnowledge {
  archetype: CreatorArchetype;
  identity: string;
  strengths: string[];
  weaknesses: string[];
  audience: string;
  communicationStyle: string;
  monetisationStrengths: string[];
  contentStyles: string[];
  growthRisks: string[];
  coachingRecommendations: string[];
  confidenceNotes: string;
}

/** Vertical key, widened to allow the fallback sentinel. */
export type VerticalKey = ContentVertical | 'Unspecified';

/**
 * Baseline strategic knowledge for a single content vertical.
 * One entry exists for every member of ContentVertical (all 10).
 */
export interface VerticalKnowledge {
  vertical: VerticalKey;
  audience: string;
  contentPillars: string[];
  growthStrategies: string[];
  monetisationOpportunities: string[];
  retentionStrategies: string[];
  creatorChallenges: string[];
  successIndicators: string[];
}

/** Audience profile key, widened to allow the neutral fallback. */
export type AudienceProfileKey = AudienceStrategy | 'default';

/**
 * Baseline strategic knowledge for an audience strategy.
 * Entries exist for every AudienceStrategy plus a neutral 'default'.
 */
export interface AudienceKnowledge {
  key: AudienceProfileKey;
  label: string;
  motivations: string[];
  buyingBehaviour: string;
  retentionDrivers: string[];
  conversationStyle: string;
  upsellOpportunities: string[];
  riskIndicators: string[];
}

// ── FYV-3.4B: Catalogue entry types ─────────────────────────────────────────

/** Priority level used across recommendations, opportunities, and risks. */
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** Implementation difficulty for recommendations. */
export type Difficulty = 'easy' | 'moderate' | 'hard';

/** Risk severity level. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A structured coaching/strategy recommendation.
 *
 * Applicability arrays use typed unions — an empty array means
 * "universally applicable" (matches any profile).
 */
export interface Recommendation {
  id: string;
  title: string;
  description: string;
  applicableArchetypes: CreatorArchetype[];
  applicableVerticals: ContentVertical[];
  applicableAudiences: AudienceProfileKey[];
  applicableTraits: CreatorTrait[];
  priority: Priority;
  expectedImpact: string;
  implementationDifficulty: Difficulty;
  evidenceRequirements: string[];
  coachingNotes: string;
  reportSummary: string;
}

/**
 * A commercial opportunity record.
 *
 * relatedArchetypes / relatedVerticals / relatedTraits are typed arrays —
 * an empty array means the opportunity is universally relevant.
 */
export interface Opportunity {
  id: string;
  title: string;
  description: string;
  applicableConditions: string[];
  supportingEvidence: string[];
  expectedOutcome: string;
  recommendedActions: string[];
  priority: Priority;
  relatedArchetypes: CreatorArchetype[];
  relatedVerticals: ContentVertical[];
  relatedTraits: CreatorTrait[];
}

/**
 * A risk definition with detection and mitigation guidance.
 *
 * relatedArchetypes / relatedTraits / relatedVerticals are typed arrays —
 * an empty array means the risk is universally relevant.
 */
export interface Risk {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  detectionGuidance: string[];
  mitigation: string[];
  coachingGuidance: string;
  relatedArchetypes: CreatorArchetype[];
  relatedTraits: CreatorTrait[];
  relatedVerticals: ContentVertical[];
}

/**
 * Loose input shape that selectors accept. Mirrors what the intelligence
 * engine will eventually pass. All fields optional — selectors degrade
 * safely on incomplete input.
 */
export interface SelectorProfile {
  archetype?: string;
  vertical?: string;
  traits?: string[];
  audienceStrategy?: string;
}

// ── Registry shape ──────────────────────────────────────────────────────────

/**
 * The assembled registry. Each map is keyed by its canonical union so the
 * compiler guarantees every archetype / vertical / audience is represented.
 * Catalogues (recommendations, opportunities, risks) are keyed by id.
 */
export interface KnowledgeRegistry {
  archetypes: Record<CreatorArchetype, ArchetypeKnowledge>;
  verticals: Record<ContentVertical, VerticalKnowledge>;
  audiences: Record<AudienceProfileKey, AudienceKnowledge>;
  recommendations: Record<string, Recommendation>;
  opportunities: Record<string, Opportunity>;
  risks: Record<string, Risk>;
}
