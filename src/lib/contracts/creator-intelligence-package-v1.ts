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
