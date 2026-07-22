// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1C — Editable Vertical + Variation Workset (pure, isomorphic)
//
// Single source of truth for the editable workset's RULES and derived rank
// labels. The DB (public.creator_vertical_workset) stores position; this module
// is what tells the UI "Position 3 is Fourth" and "First vertical needs ≥3
// variations, total needs ≥6".
//
// Companion to src/lib/persona-portfolio.ts (which keeps the persona
// generator's 3-2-1 contract intact). Both modules are dependency-free so they
// can be bundled into the Worker AND exercised directly from Node's
// type-stripping test runner.
// ─────────────────────────────────────────────────────────────────────────────

import type { RankLabel, VerticalSourceLabel } from '@/types/creator';

/** Full rank order — position 1..6 → label. */
export const RANK_ORDER: readonly RankLabel[] = [
  'Primary',
  'Secondary',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
] as const;

/** Maximum number of active verticals in a single workset. */
export const MAX_WORKSET_SIZE = 6;

/** Minimum number of active verticals in a single workset. */
export const MIN_WORKSET_SIZE = 1;

/**
 * Per-position REQUIRED minimum for selected variations. Position 1 = Primary
 * (≥3); Position 2 = Secondary (≥2); Positions 3..6 = Third+ (≥1 each). These
 * minimums are DERIVED from position, not from the original snapshot columns.
 */
export const POSITION_MINIMUMS: readonly number[] = [3, 2, 1, 1, 1, 1];

/**
 * The minimum TOTAL selected variations across the whole workset, regardless
 * of how many verticals there are. 6 keeps the persona generator's 3-2-1
 * contract (`primary ≥3 + secondary ≥2 + third ≥1`) satisfiable for any
 * workset size.
 */
export const TOTAL_MINIMUM = 6;

/** Per-position ERROR/WARNING dialog messages; surfaced at validation time. */
export const POSITION_MINIMUM_LABEL: readonly string[] = [
  'at least 3',
  'at least 2',
  'at least 1',
  'at least 1',
  'at least 1',
  'at least 1',
];

/** Maps a 1-based position to its creator-facing rank label. */
export function rankLabelFor(position: number): RankLabel {
  if (!Number.isInteger(position) || position < 1 || position > RANK_ORDER.length) {
    throw new RangeError(`Position out of range: ${position}`);
  }
  return RANK_ORDER[position - 1];
}

/** Maps a 1-based position to its required minimum. */
export function minimumForPosition(position: number): number {
  if (
    !Number.isInteger(position)
    || position < 1
    || position > POSITION_MINIMUMS.length
  ) {
    throw new RangeError(`Position out of range: ${position}`);
  }
  return POSITION_MINIMUMS[position - 1];
}

/** Reverse: any acceptable rank label to its 1-based position. */
export function positionForRank(label: RankLabel): number {
  const index = RANK_ORDER.indexOf(label);
  if (index === -1) throw new RangeError(`Unknown rank label: ${label}`);
  return index + 1;
}

/** Creator-facing source-label copy (recommended / catalogue / created). */
export const SOURCE_LABEL_COPY: Record<VerticalSourceLabel, string> = {
  recommended: 'Recommended from assessment',
  catalogue: 'Selected from catalogue',
  created: 'Created by you',
};

/** A single vertical slot in the editor's input model. */
export interface VerticalSlot {
  /** Position 1..MAX_WORKSET_SIZE; drives the rank label. */
  position: number;
  /** Source kind displayed as a tag. */
  sourceLabel: VerticalSourceLabel;
  /** Display label in the workset. */
  verticalLabel: string;
  /** Underlying vertical type — system catalogue vs creator-owned. */
  verticalKind: 'system_reference' | 'creator_owned';
  /** Selected variation IDs for this vertical (mix of system OR owned). */
  selectedVariationIds: ReadonlyArray<string>;
}

/**
 * Aggregated per-vertical and total counts of selected variations.
 * `complete` is the single boolean the navigation gate uses.
 */
export interface VerticalValidation {
  /** Total selected variations across the whole workset. */
  totalSelected: number;
  /** Per-slot validation (minumum, count, met). */
  perSlot: VerticalPerSlotValidation[];
  /** True when every slot meets its position minimum AND total ≥ 6. */
  complete: boolean;
  /** First unmet requirement, if any — used for inline messaging. */
  firstIssue: VerticalValidationIssue | null;
}

export interface VerticalPerSlotValidation {
  position: number;
  rankLabel: RankLabel;
  selectedCount: number;
  minimum: number;
  met: boolean;
}

export interface VerticalValidationIssue {
  position: number;
  rankLabel: RankLabel;
  kind: 'slot_minimum' | 'total_minimum';
  message: string;
}

/**
 * Validate the current workset. Returns a complete per-slot breakdown plus a
 * single `complete` boolean. The first unmet requirement is exposed so the UI
 * can call out the specific blocker.
 *
 * Issue ordering (most fundamental first):
 *   1. Size — too few / too many verticals.
 *   2. Slot minimum — any single slot under its position minimum.
 *   3. Total minimum — overall count under TOTAL_MINIMUM.
 *
 * Size invalidity short-circuits the per-slot loop so an oversized payload
 * (e.g. 7 slots produced by a test) cannot crash on the position lookup.
 */
export function validateWorkset(slots: ReadonlyArray<VerticalSlot>): VerticalValidation {
  const sizeOk = isWorksetSizeValid(slots.length);

  // When size is invalid, skip per-slot breakdown (no reason to compute
  // meaningless records for an unviewable workset shape).
  if (!sizeOk) {
    const totalSelected = slots.reduce(
      (sum, s) => sum + s.selectedVariationIds.length,
      0,
    );
    return {
      totalSelected,
      perSlot: [],
      complete: false,
      firstIssue: slots.length < MIN_WORKSET_SIZE
        ? {
            position: 0,
            rankLabel: 'Primary',
            kind: 'slot_minimum',
            message: `Choose at least ${MIN_WORKSET_SIZE} vertical.`,
          }
        : {
            position: 0,
            rankLabel: 'Primary',
            kind: 'slot_minimum',
            message: `Choose at most ${MAX_WORKSET_SIZE} verticals.`,
          },
    };
  }

  const perSlot: VerticalPerSlotValidation[] = slots.map(slot => {
    const minimum = minimumForPosition(slot.position);
    const selectedCount = slot.selectedVariationIds.length;
    return {
      position: slot.position,
      rankLabel: rankLabelFor(slot.position),
      selectedCount,
      minimum,
      met: selectedCount >= minimum,
    };
  });
  const totalSelected = perSlot.reduce((sum, s) => sum + s.selectedCount, 0);
  const complete = perSlot.every(s => s.met) && totalSelected >= TOTAL_MINIMUM;

  const firstUnmetSlot = perSlot.find(s => !s.met);
  let firstIssue: VerticalValidationIssue | null = null;
  if (firstUnmetSlot) {
    firstIssue = {
      position: firstUnmetSlot.position,
      rankLabel: firstUnmetSlot.rankLabel,
      kind: 'slot_minimum',
      message: `${firstUnmetSlot.rankLabel} needs ${POSITION_MINIMUM_LABEL[firstUnmetSlot.position - 1]} variation${firstUnmetSlot.selectedCount === 1 ? '' : 's'} (you have ${firstUnmetSlot.selectedCount}).`,
    };
  } else if (totalSelected < TOTAL_MINIMUM) {
    firstIssue = {
      position: 0,
      rankLabel: 'Primary',
      kind: 'total_minimum',
      message: `Choose at least ${TOTAL_MINIMUM} variations total (you have ${totalSelected}).`,
    };
  }

  return { totalSelected, perSlot, complete, firstIssue };
}

/** True when a workset size is in [MIN_WORKSET_SIZE, MAX_WORKSET_SIZE]. */
export function isWorksetSizeValid(size: number): boolean {
  return Number.isInteger(size) && size >= MIN_WORKSET_SIZE && size <= MAX_WORKSET_SIZE;
}

/**
 * Reorder helper — moves an entry at `fromIndex` to `toIndex` after
 * removing it (stable for remaining items). Pure helper used by the up/down
 * reorder buttons in the UI.
 */
export function moveInOrder<T>(items: ReadonlyArray<T>, fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items.slice();
  if (fromIndex < 0 || fromIndex >= items.length) return items.slice();
  if (toIndex < 0 || toIndex > items.length) return items.slice();
  const next = items.slice();
  const [picked] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, picked);
  return next;
}

/** Convenience: format the source-label copy for UI display. */
export function sourceLabelCopy(label: VerticalSourceLabel): string {
  return SOURCE_LABEL_COPY[label];
}

// ─── FYV-PERSONA-1D — Creator-facing "Creative Direction" labelling ───────────
//
// The wizard redesign removes "Archetype / Primary / Secondary / Third" from
// creator-facing copy in favour of "Creative Direction". The internal rank
// labels stay intact (rankLabelFor / RANK_ORDER) so the projector and the
// existing tests still see consistent data; this just exposes a creator-friendly
// label and styling per 1-based position.

/** Number of Creative Directions we support in the workset (alias of MAX_WORKSET_SIZE
 * documented for creator-facing copy — same intent, friendlier vocabulary). */
export const CREATIVE_DIRECTION_LIMIT = MAX_WORKSET_SIZE;

/**
 * Maps a 1-based position to its creator-friendly label, e.g.
 * position 1 → "Creative Direction 1". The wizard displays these in place of
 * "Primary / Secondary / Third / …". Rank-label data is preserved on the
 * view model (rankLabelFor) for downstream persona-generator consumers.
 */
export function creativeDirectionLabel(position: number): string {
  if (!Number.isInteger(position) || position < 1 || position > CREATIVE_DIRECTION_LIMIT) {
    return position > CREATIVE_DIRECTION_LIMIT ? `Creative Direction ${position}` : 'Creative Direction';
  }
  return `Creative Direction ${position}`;
}

/**
 * Creator-facing badge styling for the Creative Direction position. Single
 * accent stripe so the rank does not leak through colour. Returned string is
 * Tailwind class-fragments only — colocate/neutral so the rank stays invisible.
 */
export const CREATIVE_DIRECTION_BADGE: readonly string[] = [
  'bg-accent/15 text-accent border-accent/30',
  'bg-accent/10 text-accent/90 border-accent/20',
  'bg-accent/10 text-accent/90 border-accent/20',
  'bg-accent/10 text-accent/90 border-accent/20',
  'bg-accent/10 text-accent/90 border-accent/20',
  'bg-accent/10 text-accent/90 border-accent/20',
] as const;

/** Convenience: pick the badge styling for a 1-based position. */
export function creativeDirectionBadge(position: number): string {
  if (!Number.isInteger(position) || position < 1) return CREATIVE_DIRECTION_BADGE[0];
  const index = Math.min(position - 1, CREATIVE_DIRECTION_BADGE.length - 1);
  return CREATIVE_DIRECTION_BADGE[index];
}

/**
 * Wizard-facing readiness check: are there enough TOTAL selected variations to
 * advance to the "Generate" step? This is what the Step 3 → Step 4 transition
 * gates — independent of the per-slot rules (POSITION_MINIMUMS), which the
 * simplified UI no longer surfaces.
 */
export function hasEnoughVariationsForPortfolio(totalSelected: number): boolean {
  return totalSelected >= TOTAL_MINIMUM;
}
