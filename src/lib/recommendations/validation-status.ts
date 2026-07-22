// ============================================================================
// Validation Status — derived state machine (single source of truth)
// ----------------------------------------------------------------------------
// 7 states: Not tested, Experiment planned, Testing, Early evidence, Validated,
// Contradicted, Inconclusive.
//
// IMPORTANT: state is DERIVED from completed/in_progress/planned counts and
// the latest Validated Fit. It is NEVER directly settable. The UI never lets
// an operator hand-set a state — it just lets them mark experiments complete
// or abandon, and the recalc RPC + this function re-derive the state.
//
// Mirrors public.fyv_recalculate_creator_validated_fit() in
// supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql.
// If you change the rules, change BOTH places (and bump the ruleset version).
// ============================================================================

import {
  RECOMMENDATION_RULESET_VERSION,
  VALIDATED_FIT_THRESHOLD,
  VALIDATED_MIN_COMPLETED_EXPERIMENTS,
} from './version.ts';
import type { ValidatedFitResult } from './validated-fit.ts';
import type { ExperimentStatus } from './content-experiments.ts';

export type ValidationStatus =
  | 'Not tested'
  | 'Experiment planned'
  | 'Testing'
  | 'Early evidence'
  | 'Validated'
  | 'Contradicted'
  | 'Inconclusive';

export const VALIDATION_STATUSES: readonly ValidationStatus[] = [
  'Not tested',
  'Experiment planned',
  'Testing',
  'Early evidence',
  'Validated',
  'Contradicted',
  'Inconclusive',
] as const;

export interface ValidationCounters {
  planned_count: number;
  in_progress_count: number;
  completed_count: number;
}

export interface DerivedStatusInput {
  counters: ValidationCounters;
  validatedFit: Pick<ValidatedFitResult, 'score' | 'is_contradictory' | 'completed_count'> | null;
}

/**
 * Canonical counter shape stored on `creator_validation_status`. Used for the
 * legacy fallback (`deriveStatusFromCounts`) and the live row reader
 * (`getCreatorValidationStatus` in `./index.ts`). ONE name for the shape.
 */
export interface CreatorValidationStatusRow {
  creator_id: string;
  status: ValidationStatus;
  planned_count: number;
  in_progress_count: number;
  completed_count: number;
  contradicting_count: number;
  validated_fit_score: number | null;
  is_contradictory: boolean;
  last_recalculated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Pure derivation. Returns the single status that ALL UI components must
 * render. Never stores a status explicitly; always re-derived on every read.
 */
export function deriveValidationStatus(input: DerivedStatusInput): ValidationStatus {
  const { counters, validatedFit } = input;
  const completed = counters.completed_count;
  const inProgress = counters.in_progress_count;
  const planned = counters.planned_count;
  const score = validatedFit?.score ?? null;
  const contradictory = validatedFit?.is_contradictory ?? false;

  if (completed === 0 && inProgress === 0 && planned === 0) return 'Not tested';
  if (completed === 0 && inProgress >= 1) return 'Testing';
  if (completed === 0 && planned >= 1) return 'Experiment planned';
  // Single experiment: ALWAYS Early evidence (anti-pattern guard).
  if (completed === 1) return 'Early evidence';

  if (
    completed >= VALIDATED_MIN_COMPLETED_EXPERIMENTS
    && score !== null
    && score >= VALIDATED_FIT_THRESHOLD
    && !contradictory
  ) return 'Validated';

  if (contradictory) return 'Contradicted';
  if (inProgress >= 1) return 'Testing';
  if (score !== null && score < 75) return 'Inconclusive';
  return 'Early evidence';
}

/**
 * Convenience: derive a ValidationStatus + counters bundle directly from a
 * creator's experiments when the aggregate row isn't available (legacy
 * profile, or before the trigger fires for the first time). Pure helper:
 * lives here so node:test can import it without pulling `@/lib/supabase`.
 */
export function deriveStatusFromCounts(input: {
  experiments: ReadonlyArray<{ status: ExperimentStatus }>;
}): { status: ValidationStatus; counters: CreatorValidationStatusRow } {
  let planned = 0;
  let inProgress = 0;
  let completed = 0;
  for (const exp of input.experiments) {
    if (exp.status === 'Planned') planned++;
    else if (exp.status === 'In progress') inProgress++;
    else if (exp.status === 'Completed') completed++;
  }
  const status = deriveValidationStatus({
    counters: { planned_count: planned, in_progress_count: inProgress, completed_count: completed },
    validatedFit: null,
  });
  const now = new Date().toISOString();
  return {
    status,
    counters: {
      creator_id: '',
      status,
      planned_count: planned,
      in_progress_count: inProgress,
      completed_count: completed,
      contradicting_count: 0,
      validated_fit_score: null,
      is_contradictory: false,
      last_recalculated_at: now,
      created_at: now,
      updated_at: now,
    },
  };
}

/**
 * Display copy + status chip class for each validation status.
 * The class names are pure Tailwind fragments — no theme strings to keep in sync.
 */
export const STATUS_PRESENTATION: Record<
  ValidationStatus,
  { tone: string; label: string; description: string; toneLabel: string }
> = {
  'Not tested': {
    tone: 'border-white/10 bg-surface-3 text-charcoal-2',
    toneLabel: 'neutral',
    label: 'Not tested',
    description: 'No content experiments yet for this direction.',
  },
  'Experiment planned': {
    tone: 'border-white/10 bg-surface-3 text-charcoal-2',
    toneLabel: 'neutral',
    label: 'Experiment planned',
    description: 'An experiment is queued but no content has shipped.',
  },
  Testing: {
    tone: 'border-accent/30 bg-accent/10 text-accent',
    toneLabel: 'progress',
    label: 'Testing',
    description: 'Content is being created. Real-world performance will follow.',
  },
  'Early evidence': {
    tone: 'border-warn/30 bg-warn/10 text-warn',
    toneLabel: 'progress',
    label: 'Early evidence',
    description: 'One experiment has completed. Single experiments do not validate a direction.',
  },
  Validated: {
    tone: 'border-success/30 bg-success/10 text-success',
    toneLabel: 'success',
    label: 'Validated',
    description: 'Multiple completed experiments with consistent positive evidence.',
  },
  Contradicted: {
    tone: 'border-pink/30 bg-pink/10 text-pink',
    toneLabel: 'danger',
    label: 'Contradicted',
    description: 'Completed experiments disagree — the direction is uncertain.',
  },
  Inconclusive: {
    tone: 'border-white/10 bg-surface-3 text-charcoal-2',
    toneLabel: 'neutral',
    label: 'Inconclusive',
    description: 'Completed experiments produced low or mixed signals.',
  },
};

export const VALIDATION_STATUS_RULESET_DOC = {
  version: RECOMMENDATION_RULESET_VERSION,
  rules: [
    'Status is derived; never hand-set.',
    'One experiment cannot validate a direction (anti-pattern guard).',
    `${VALIDATED_MIN_COMPLETED_EXPERIMENTS}+ completed + avg ${VALIDATED_FIT_THRESHOLD}+ + not-contradictory = Validated.`,
    'Contradicted beats Validated when any batch-level marker fires.',
    'Inconclusive = completed>=2 + avg<75 + not-contradictory + not still testing.',
  ],
} as const;
