import {
  MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1,
} from './creator-intelligence-package-v1.fixture';
import type {
  CreatorIntelligencePackageV1,
  CreatorOpportunityState,
  FunctionalNarrativeRole,
} from './creator-intelligence-package-v1';

type AssertTrue<T extends true> = T;

type KnownFunctionalNarrativeRole = 'entry' | 'relationship' | 'escalation';

type FixtureJourneyRoles =
  | (typeof MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1)['positioning']['archetypeJourney'][number]['role']
  | (typeof MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1)['derivedScenarios'][number]['archetypeProgression'][number]['role']
  | (typeof MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1)['derivedScenarios'][number]['narrativeProgression'][number]['role'];

type FixtureScenarioReferences = (typeof MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1)['derivedScenarios'][number]['stableScenarioReference'];
type FixtureOpportunityScenarioReferences = (typeof MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1)['opportunities'][number]['relatedDerivedScenarioReference'];

type FMFOperationalState = 'accepted' | 'configured' | 'generated' | 'active' | 'paused' | 'retired';

const packageVersion: '1.0.0' = MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1.packageVersion;
const contractVersion: 'v1' = MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1.provenance.contractVersion;
const validatedPackage: CreatorIntelligencePackageV1 = MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1;

type _KnownJourneyRolesRepresented = AssertTrue<Exclude<KnownFunctionalNarrativeRole, FixtureJourneyRoles> extends never ? true : false>;
type _OpportunityScenarioRefsAreValid = AssertTrue<Exclude<FixtureOpportunityScenarioReferences, FixtureScenarioReferences> extends never ? true : false>;
type _NoFMFOperationalStatesLeaked = AssertTrue<Extract<CreatorOpportunityState, FMFOperationalState> extends never ? true : false>;
type _FunctionalNarrativeRoleStillExtensible = FunctionalNarrativeRole extends string ? true : false;

export const creatorIntelligencePackageV1Validation = {
  packageVersion,
  contractVersion,
  validatedPackage,
} as const;

export function validateCreatorIntelligencePackageV1(pkg: CreatorIntelligencePackageV1): string[] {
  const errors: string[] = [];

  if (pkg.packageVersion !== '1.0.0') {
    errors.push('Package version must be explicit and set to 1.0.0.');
  }

  if (pkg.provenance.contractVersion !== 'v1') {
    errors.push('Contract version must be v1.');
  }

  const scenarioRefs = new Set(pkg.derivedScenarios.map(scenario => scenario.stableScenarioReference));
  for (const opportunity of pkg.opportunities) {
    if (!scenarioRefs.has(opportunity.relatedDerivedScenarioReference)) {
      errors.push(`Opportunity ${opportunity.stableOpportunityReference} references an unknown derived scenario.`);
    }
    if (['accepted', 'configured', 'generated', 'active', 'paused', 'retired'].includes(opportunity.state)) {
      errors.push(`Opportunity ${opportunity.stableOpportunityReference} leaks an FMF operational state.`);
    }
  }

  const journeyRoles = new Set<string>([
    ...pkg.positioning.archetypeJourney.map(step => step.role),
    ...pkg.derivedScenarios.flatMap(scenario => scenario.archetypeProgression.map(step => step.role)),
    ...pkg.derivedScenarios.flatMap(scenario => scenario.narrativeProgression.map(step => step.role)),
  ]);
  for (const role of ['entry', 'relationship', 'escalation']) {
    if (!journeyRoles.has(role)) {
      errors.push(`Fixture is missing the ${role} narrative role.`);
    }
  }

  return errors;
}

export const MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1_ERRORS = validateCreatorIntelligencePackageV1(
  MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1
);
