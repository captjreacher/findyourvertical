export type CreatorIntelligencePackageContractVersion = 'v1';
export type CreatorIntelligencePackageVersion = '1.0.0';

export type FunctionalNarrativeRole =
  | 'entry'
  | 'relationship'
  | 'escalation'
  | (string & {});

export type CreatorJourneyType =
  | 'new_subscriber'
  | 'first_conversation'
  | 'first_purchase'
  | 'ppv_upsell'
  | 'renewal'
  | 'win_back'
  | 'vip_conversion'
  | 'high_spender';

export type CreatorOpportunityState = 'identified' | 'published' | 'superseded';

export interface CreatorIntelligenceIdentity {
  readonly sourceCreatorReference: string;
  readonly externalCorrelationReference?: string;
  readonly creatorDisplayName: string;
  readonly creatorHandle?: string;
}

export interface CreatorIntelligenceProvenance {
  readonly producerProduct: string;
  readonly contractVersion: CreatorIntelligencePackageContractVersion;
  readonly intelligenceResultVersion: string;
  readonly assessmentReference: string;
  readonly assessmentTemplateVersion?: string;
  readonly generatedAt: string;
  readonly publishedAt: string;
}

export interface CreatorIntelligencePositioningJourneyStep {
  readonly role: FunctionalNarrativeRole;
  readonly archetype: string;
  readonly rationale?: string;
}

export interface CreatorIntelligencePositioning {
  readonly primaryVertical: string;
  readonly archetypeJourney: readonly CreatorIntelligencePositioningJourneyStep[];
  readonly confidence: number;
  readonly rationale: readonly string[];
  readonly evidence?: readonly string[];
}

export interface CreatorIntelligenceDerivedScenarioArchetypeStep {
  readonly role: FunctionalNarrativeRole;
  readonly archetype: string;
}

export interface CreatorIntelligenceDerivedScenarioNarrativeStep {
  readonly role: FunctionalNarrativeRole;
  readonly beat: string;
}

export interface CreatorIntelligenceDerivedScenario {
  readonly stableScenarioReference: string;
  readonly name: string;
  readonly archetypeProgression: readonly CreatorIntelligenceDerivedScenarioArchetypeStep[];
  readonly narrativeProgression: readonly CreatorIntelligenceDerivedScenarioNarrativeStep[];
  readonly confidence: number;
  readonly rationale: readonly string[];
  readonly applicableJourneyTypes: readonly CreatorJourneyType[];
  readonly constraintsOrWarnings?: readonly string[];
}

export interface CreatorIntelligenceOpportunity {
  readonly stableOpportunityReference: string;
  readonly opportunityType: CreatorJourneyType;
  readonly recommendedJourneyType: CreatorJourneyType;
  readonly relatedDerivedScenarioReference: string;
  readonly rationale: readonly string[];
  readonly confidence: number;
  readonly priority: 'high' | 'medium' | 'low';
  readonly constraints?: readonly string[];
  readonly state: CreatorOpportunityState;
}

export interface CreatorIntelligencePackageV1 {
  readonly packageReference: string;
  readonly packageVersion: CreatorIntelligencePackageVersion;
  readonly identity: CreatorIntelligenceIdentity;
  readonly provenance: CreatorIntelligenceProvenance;
  readonly positioning: CreatorIntelligencePositioning;
  readonly derivedScenarios: readonly CreatorIntelligenceDerivedScenario[];
  readonly opportunities: readonly CreatorIntelligenceOpportunity[];
}

// ============================================================================
// Canonical downstream HANDOFF ENVELOPE (FYV → downstream products)
// ----------------------------------------------------------------------------
// The stable wire contract that other products (e.g. FunkMyFans) consume via the
// events outbox. It is deliberately narrow and snake_case (to match the persisted
// `public.events` payload and the `creator_intelligence_packages` row): it
// carries the OPAQUE references + lifecycle state, NOT FYV internals. The rich
// `CreatorIntelligencePackageV1` above stays available as an optional body shape
// for a future, fuller mapping; this envelope is what actually crosses the
// boundary today. Runtime values below have NO imports so this module stays
// resolvable by the node type-stripping test runner.
// ============================================================================

export const CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT =
  'creator.intelligence_package.published' as const;

export const CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX =
  'fyv.creator.intelligence.' as const;

export const CREATOR_ASSESSMENT_REFERENCE_PREFIX =
  'fyv.creator.assessment.' as const;

/**
 * Package lifecycle. Distinct from `CreatorOpportunityState` (which models an
 * individual opportunity inside the rich body); this is the PACKAGE's own state.
 * `draft` is intentionally excluded in this pass — publication is automatic and
 * only `published`/`superseded` rows exist.
 */
export type CreatorIntelligencePackageState = 'published' | 'superseded';

export const CREATOR_INTELLIGENCE_PACKAGE_STATES: readonly CreatorIntelligencePackageState[] =
  ['published', 'superseded'] as const;

export function isValidCreatorIntelligencePackageState(
  state: string,
): state is CreatorIntelligencePackageState {
  return (CREATOR_INTELLIGENCE_PACKAGE_STATES as readonly string[]).includes(state);
}

/** Only `published` packages may cross the downstream boundary. */
export function isConsumablePackageState(state: string): state is 'published' {
  return state === 'published';
}

/**
 * A `package_reference` is OPAQUE and UUID-based with no parsable business
 * meaning (no dates, no handles). Canonical shape: `fyv.creator.intelligence.<uuid>`.
 */
const PACKAGE_REFERENCE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidPackageReference(reference: string): boolean {
  if (typeof reference !== 'string') return false;
  if (!reference.startsWith(CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX)) return false;
  const suffix = reference.slice(CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX.length);
  return PACKAGE_REFERENCE_UUID_RE.test(suffix);
}

export function buildAssessmentReference(assessmentId: string): string {
  return `${CREATOR_ASSESSMENT_REFERENCE_PREFIX}${assessmentId}`;
}

/** The persisted/emitted canonical envelope (snake_case wire contract). */
export interface CreatorIntelligencePackageHandoffEnvelopeV1 {
  readonly source_product: 'FYV';
  readonly package_id: string;
  readonly package_reference: string;
  readonly package_state: CreatorIntelligencePackageState;
  readonly creator_reference: string;
  readonly assessment_reference?: string;
  readonly version: string;
}

/** The `creator.intelligence_package.published` event body written to the outbox. */
export interface CreatorIntelligencePackagePublishedEvent {
  readonly event_type: typeof CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT;
  readonly source_product: 'FYV';
  readonly creator_reference: string;
  readonly package_reference: string;
  readonly package_id: string;
  readonly package_state: 'published';
}

export function buildCreatorIntelligencePackagePublishedEvent(input: {
  creatorReference: string;
  packageReference: string;
  packageId: string;
}): CreatorIntelligencePackagePublishedEvent {
  return {
    event_type: CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT,
    source_product: 'FYV',
    creator_reference: input.creatorReference,
    package_reference: input.packageReference,
    package_id: input.packageId,
    package_state: 'published',
  };
}

/** Throws unless a package in this state may be consumed downstream. */
export function assertConsumablePackage(state: string): void {
  if (!isValidCreatorIntelligencePackageState(state)) {
    throw new Error(`Unknown creator intelligence package state: ${state}`);
  }
  if (!isConsumablePackageState(state)) {
    throw new Error(
      `Creator intelligence package is not consumable (state=${state}); ` +
        'only published packages may be consumed downstream.',
    );
  }
}
