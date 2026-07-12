// ============================================================================
// Creator Intelligence Snapshot — contract + derivation (FYV → FMF handoff)
// ----------------------------------------------------------------------------
// Pure, isomorphic helpers for the FYV-owned publish boundary. FYV writes the
// snapshot + opportunity projections into its OWN database (creator_intelligence_
// snapshots / _opportunity_projections, keyed to of_creators) and emits a
// `creator.intelligence_package.published` integration event. FMF later consumes
// that event and resolves the creator via `external_identity` (platform account),
// NOT via FYV UUIDs — so this module never encodes FMF-internal ids.
//
// Only type-only imports here, so the node type-stripping test runner can load it.
// ============================================================================
import type { ReportData } from '@/types/creator';

export const CREATOR_INTELLIGENCE_CONTRACT_VERSION = 'creator-intelligence-package-v1' as const;
export const CREATOR_INTELLIGENCE_VERSION = '1.0.0' as const;
export const CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT =
  'creator.intelligence_package.published' as const;
export const CREATOR_INTELLIGENCE_HANDOFF_UNRESOLVED_EVENT =
  'creator.intelligence_package.handoff_unresolved' as const;

const MAX_OPPORTUNITIES = 5;

export interface IntelligenceOpportunity {
  title: string;
  priority: number;
  rationale: string;
  confidence: number;
  journey_type: string;
  opportunity_type: string;
  source_scenario_reference: string;
  source_opportunity_reference: string;
}

/** The FYV-derived intelligence CONTENT (business layer builds this; the RPC wraps
 *  it with the canonical envelope + references before persisting). */
export interface IntelligencePackageContent {
  derived_scenario: string;
  primary_vertical: string;
  archetype_journey: string;
  intelligence_summary: string;
  available_opportunities: IntelligenceOpportunity[];
}

export interface ExternalIdentity {
  platform_provider: string;
  platform_account_id: string;
  reference: string;
}

export function slugify(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Namespaced creator reference for the source system (FYV). */
export function buildCreatorReference(creatorProfileId: string): string {
  return `fyv:${creatorProfileId}`;
}

/** Cross-system resolvable identity (FMF resolves its own creator from this). */
export function buildExternalIdentity(platformProvider: string, platformAccountId: string): ExternalIdentity {
  return {
    platform_provider: platformProvider,
    platform_account_id: platformAccountId,
    reference: `${platformProvider}:${platformAccountId}`,
  };
}

export function buildPackageReference(slug: string, version: string): string {
  return `fyv/${slug}/intelligence-package/${version}`;
}

export function buildAssessmentReference(slug: string, version: string): string {
  return `fyv/${slug}/assessment/${version}`;
}

/**
 * Derive the lean, downstream-facing intelligence content from a completed FYV
 * report. Deterministic and pure. Excludes internal scoring, raw answers, and
 * workflow/routing state (only interpreted, creator-facing signals cross the boundary).
 */
export function buildIntelligencePackageContent(report: ReportData): IntelligencePackageContent {
  const verticals = (report.top_verticals ?? []).slice(0, MAX_OPPORTUNITIES);
  const primaryVertical = verticals[0]?.name ?? report.archetype;
  const journey = report.creator_archetype_summary
    ? `${report.creator_archetype_summary.primary_archetype} -> ${report.creator_archetype_summary.secondary_archetype}`
    : report.archetype;
  const summary = report.executive_summary?.likely_creator_style
    ? `${report.archetype}: ${report.executive_summary.likely_creator_style}.` +
      (report.executive_summary.recommended_next_step ? ` ${report.executive_summary.recommended_next_step}` : '')
    : `${report.archetype} positioned for ${primaryVertical}.`;
  const confidence = clampPercent(report.classification_confidence ?? 70);

  return {
    derived_scenario: `${report.archetype} entry with ${primaryVertical} monetisation focus`,
    primary_vertical: primaryVertical,
    archetype_journey: journey,
    intelligence_summary: summary.trim(),
    available_opportunities: verticals.map((vertical, index) => {
      const slug = slugify(vertical.name);
      return {
        title: `Lean into ${vertical.name}`,
        priority: index + 1,
        rationale: vertical.rationale,
        confidence,
        // v1 taxonomy defaults; refined once richer opportunity intelligence exists.
        journey_type: 'new_subscriber',
        opportunity_type: 'growth',
        source_scenario_reference: `scenario_${slug}`,
        source_opportunity_reference: slug,
      };
    }),
  };
}

export interface PublishedEventPayload {
  event_type: typeof CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT;
  source_product: 'FYV';
  creator_reference: string;
  external_identity: ExternalIdentity;
  package_reference: string;
  package_id: string;
  package_state: 'published';
  contract_version: typeof CREATOR_INTELLIGENCE_CONTRACT_VERSION;
  intelligence_version: string;
}

/** Mirror of the event payload the publish RPC persists (source of truth is the RPC). */
export function buildPublishedEventPayload(input: {
  creatorProfileId: string;
  externalIdentity: ExternalIdentity;
  packageReference: string;
  packageId: string;
  intelligenceVersion?: string;
}): PublishedEventPayload {
  return {
    event_type: CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT,
    source_product: 'FYV',
    creator_reference: buildCreatorReference(input.creatorProfileId),
    external_identity: input.externalIdentity,
    package_reference: input.packageReference,
    package_id: input.packageId,
    package_state: 'published',
    contract_version: CREATOR_INTELLIGENCE_CONTRACT_VERSION,
    intelligence_version: input.intelligenceVersion ?? CREATOR_INTELLIGENCE_VERSION,
  };
}
