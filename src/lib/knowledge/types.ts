// ─────────────────────────────────────────────────────────────────────────────
// Creator Intelligence — Knowledge Registry: Types
//   FYV-3.4A: Foundation interfaces
//   FYV-3.4B: Recommendation, Opportunity, Risk, SelectorProfile
//   FYV-3.4C: KnowledgeEnrichment, EnrichmentInput
//
// SCOPE
//   Typed shapes for the reusable Creator Intelligence Knowledge Registry.
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

// ── FYV-3.4C: Enrichment types ──────────────────────────────────────────────

/**
 * Loose input shape for the enrichment function.
 * Uses minimal structural types (not full ArchetypeFit / TraitWeight) so
 * the enrichment module stays decoupled from @/types/creator at the value
 * level — only type-level imports are used.
 */
export interface EnrichmentInput {
  /** Archetype fits, sorted best-first. Only archetype + fit_score needed. */
  archetypeFits: Array<{ archetype: string; fit_score: number }>;
  /** Trait weights. Only trait name + weight needed. */
  traits: Array<{ trait: string; weight: number }>;
  /** Top verticals from the report. Only name needed. */
  topVerticals: Array<{ name: string }>;
  /** Audience strategy from the assessment responses (whales / masses / null). */
  audienceStrategy?: string | null;
}

/**
 * The knowledge enrichment result. Packages selector output for a specific
 * creator profile, ready for consumption by reports or UI.
 *
 * This is the output of enrichWithKnowledge() and lives on
 * CreatorIntelligenceResult.knowledge.
 */
export interface KnowledgeEnrichment {
  /** The selector profile derived from the intelligence result. */
  profile: SelectorProfile;
  /** Ranked coaching/strategy recommendations for this creator. */
  recommendations: Recommendation[];
  /** Ranked commercial opportunities for this creator. */
  opportunities: Opportunity[];
  /** Ranked risks for this creator. */
  risks: Risk[];
  /** How many catalogue entries were evaluated (for transparency). */
  catalogueCoverage: {
    recommendationsEvaluated: number;
    opportunitiesEvaluated: number;
    risksEvaluated: number;
  };
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
