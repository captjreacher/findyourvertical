// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1A — Top-three archetype derivation + selection completeness
//
// Pure, side-effect-free helpers (safe to unit test and to call in the browser).
//
// The ranked top-three archetypes are NOT persisted canonically anywhere — only
// a single archetype is stored per creator. The only ranked list in the system
// is CreatorIntelligenceResult.archetype_fits, recomputed by a pure function
// from the assessment responses. We recompute it here to build the creator's
// "creative basis", then the caller SNAPSHOTS it (creator_archetype_snapshots)
// so the basis stays stable and auditable even if scoring code later changes.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ArchetypeRank,
  CreatorArchetypeSnapshot,
  CreatorAssessment,
  CreatorVariationSelection,
} from '@/types/creator';
import { createCreatorIntelligenceResult } from './creator-intelligence';

/** Fixed order of the three ranks. */
export const RANK_ORDER: readonly ArchetypeRank[] = ['primary', 'secondary', 'third'] as const;

/**
 * Minimum variations a creator must select per rank to have enough creative
 * possibility for the future (unimplemented) persona portfolio. Never surface
 * these numbers as an "algorithm" to the creator — explain them naturally.
 */
export const RANK_MINIMUMS: Record<ArchetypeRank, number> = {
  primary: 3,
  secondary: 2,
  third: 1,
};

/** Creator-facing label for a rank. */
export const RANK_LABEL: Record<ArchetypeRank, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  third: 'Third',
};

export interface RankedArchetype {
  rank: ArchetypeRank;
  archetype: string;
}

// The 'Other' sentinel means "no archetype identified" — never a selectable
// creative direction, so it is excluded from the ranked basis.
const EXCLUDED_ARCHETYPES = new Set<string>(['Other']);

type AssessmentForDerivation = Pick<CreatorAssessment, 'id' | 'responses' | 'assessment_snapshot'>;

/**
 * Derive the creator's ranked top-three archetypes from an assessment.
 *
 * Deterministic for fixed inputs: sorts the recomputed fits by fit_score, then
 * confidence, then name (stable tiebreak), de-duplicates, drops 'Other', and
 * takes the top three. Returns fewer than three only if the engine cannot
 * produce three distinct archetypes (treated by callers as a blocking state).
 */
export function deriveRankedArchetypes(input: {
  creatorProfileId: string;
  assessment: AssessmentForDerivation | null | undefined;
}): RankedArchetype[] {
  const { creatorProfileId, assessment } = input;
  if (!assessment?.responses) return [];

  let fits: { archetype: string; fit_score: number; confidence: number }[] = [];
  try {
    const result = createCreatorIntelligenceResult({
      creatorProfileId,
      assessmentId: assessment.id,
      responses: assessment.responses,
      questions: assessment.assessment_snapshot?.question_snapshot ?? [],
    });
    fits = result.archetype_fits ?? [];
  } catch {
    return [];
  }

  const ordered = [...fits]
    .filter(fit => Boolean(fit.archetype) && !EXCLUDED_ARCHETYPES.has(fit.archetype))
    .sort(
      (a, b) =>
        b.fit_score - a.fit_score ||
        b.confidence - a.confidence ||
        a.archetype.localeCompare(b.archetype),
    );

  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const fit of ordered) {
    if (seen.has(fit.archetype)) continue;
    seen.add(fit.archetype);
    distinct.push(fit.archetype);
  }

  return distinct.slice(0, RANK_ORDER.length).map((archetype, index) => ({
    rank: RANK_ORDER[index],
    archetype,
  }));
}

/** Expand a persisted snapshot into the ordered [primary, secondary, third] list. */
export function snapshotToRankedArchetypes(
  snapshot: Pick<
    CreatorArchetypeSnapshot,
    'primary_archetype' | 'secondary_archetype' | 'third_archetype'
  >,
): RankedArchetype[] {
  return [
    { rank: 'primary', archetype: snapshot.primary_archetype },
    { rank: 'secondary', archetype: snapshot.secondary_archetype },
    { rank: 'third', archetype: snapshot.third_archetype },
  ];
}

export interface RankCompleteness {
  rank: ArchetypeRank;
  archetype: string;
  selectedCount: number;
  minimum: number;
  met: boolean;
}

export interface SelectionCompleteness {
  perRank: RankCompleteness[];
  totalSelected: number;
  /** True when every rank meets its minimum (>=3 primary, >=2 secondary, >=1 third). */
  complete: boolean;
}

/**
 * Compute per-rank and overall selection completeness. This is the single
 * source of truth for "has the creator finished this step" — completion is
 * derived from persisted selection counts, not a stored flag.
 */
export function summariseSelectionCompleteness(
  ranked: RankedArchetype[],
  selections: Pick<CreatorVariationSelection, 'archetype_rank' | 'status'>[],
): SelectionCompleteness {
  const active = selections.filter(selection => selection.status === 'selected');
  const perRank = ranked.map<RankCompleteness>(({ rank, archetype }) => {
    const selectedCount = active.filter(selection => selection.archetype_rank === rank).length;
    const minimum = RANK_MINIMUMS[rank];
    return { rank, archetype, selectedCount, minimum, met: selectedCount >= minimum };
  });
  const complete = perRank.length === RANK_ORDER.length && perRank.every(entry => entry.met);
  return { perRank, totalSelected: active.length, complete };
}
