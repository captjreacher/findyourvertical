// ============================================================================
// Creator Intelligence Package — body projection + versioning helpers
// ----------------------------------------------------------------------------
// Pure, isomorphic logic for the FYV → downstream package boundary. This module
// deliberately has NO runtime imports (only type-only imports, which the node
// type-stripping test runner erases), so it stays unit-testable and safe to run
// inside the anon assessment-completion path.
//
// The lean body here is the downstream-facing intelligence output persisted as
// `creator_intelligence_packages.package_json`. It is NOT a copy of the internal
// report_json: it excludes raw assessment answers, internal scoring, workflow /
// routing state, and any FMF/MGRNZ-specific fields.
// ============================================================================
import type { ReportData } from '@/types/creator';
import type { CreatorIntelligencePackageState } from './contracts/creator-intelligence-package-v1';

export interface CreatorIntelligencePackageBody {
  version: string;
  creator_profile: {
    reference: string;
    primary_archetype: string;
    top_verticals: string[];
  };
  persona: {
    primary_archetype: string;
    secondary_archetype: string | null;
    positioning: string | null;
    confidence: string | null;
  };
  opportunities: { vertical: string; rationale: string }[];
  recommended_next_steps: string[];
}

const MAX_VERTICALS = 3;
const MAX_NEXT_STEPS = 5;

function dedupeStrings(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Project a completed report into the lean, downstream-facing package body.
 * Pure — no DB, no app singletons.
 */
export function buildIntelligencePackageBody(
  report: ReportData,
  ctx: { creatorReference: string; version?: string },
): CreatorIntelligencePackageBody {
  const topVerticals = (report.top_verticals ?? []).slice(0, MAX_VERTICALS);
  const nextSteps = dedupeStrings([
    ...(report.recommended_actions ?? []).map(action => action.title),
    report.executive_summary?.recommended_next_step,
  ]).slice(0, MAX_NEXT_STEPS);

  return {
    version: ctx.version ?? '1',
    creator_profile: {
      reference: ctx.creatorReference,
      primary_archetype: report.archetype,
      top_verticals: topVerticals.map(vertical => vertical.name),
    },
    persona: {
      primary_archetype:
        report.creator_archetype_summary?.primary_archetype ?? report.archetype,
      secondary_archetype: report.creator_archetype_summary?.secondary_archetype ?? null,
      positioning: report.archetype_description ?? null,
      confidence: report.result_confidence ?? null,
    },
    opportunities: topVerticals.map(vertical => ({
      vertical: vertical.name,
      rationale: vertical.rationale,
    })),
    recommended_next_steps: nextSteps,
  };
}

// ── Versioning helpers ───────────────────────────────────────────────────────
// A pure model of the DB supersede invariant (which the migration enforces via a
// partial unique index + the publish RPC). Used to unit-test the lifecycle:
// publishing supersedes the prior active package; only the latest stays active.
export interface IntelligencePackageRecord {
  id: string;
  package_state: CreatorIntelligencePackageState;
  created_at: string;
}

export function applyPublication(
  existing: readonly IntelligencePackageRecord[],
  next: IntelligencePackageRecord,
): IntelligencePackageRecord[] {
  const superseded: IntelligencePackageRecord[] = existing.map(pkg =>
    pkg.package_state === 'published'
      ? { ...pkg, package_state: 'superseded' as const }
      : pkg,
  );
  return [...superseded, next];
}

export function activePublishedPackages(
  records: readonly IntelligencePackageRecord[],
): IntelligencePackageRecord[] {
  return records.filter(record => record.package_state === 'published');
}
