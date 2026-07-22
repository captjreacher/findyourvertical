// Public API barrel for the FYV recommendation explainability / validation
// feature (Phase 1). Centralises the import surface so UI screens pick one
// import path.

export {
  RECOMMENDATION_RULESET_VERSION,
  VALIDATED_FIT_MIN_EVIDENCE_EXPERIMENTS,
  VALIDATED_MIN_COMPLETED_EXPERIMENTS,
  VALIDATED_FIT_THRESHOLD,
  CONTRADICTION_SPREAD_THRESHOLD,
  VALIDATED_BURNOUT_MIN_MATCHES,
} from './version.ts';

export {
  calculatePredictedFit,
  PREDICTED_FIT_RULESET_DOC,
} from './predicted-fit.ts';

export type { PredictedFitInput, PredictedFitResult } from './predicted-fit.ts';

export {
  calculateValidatedFit,
  VALIDATED_FIT_RULESET_DOC,
} from './validated-fit.ts';

export type { ValidatedFitFeedback, ValidatedFitInput, ValidatedFitResult } from './validated-fit.ts';

export {
  deriveValidationStatus,
  deriveStatusFromCounts,
  STATUS_PRESENTATION,
  VALIDATION_STATUSES,
  VALIDATION_STATUS_RULESET_DOC,
} from './validation-status.ts';

export type {
  ValidationStatus,
  ValidationCounters,
  CreatorValidationStatusRow,
  DerivedStatusInput,
} from './validation-status.ts';

export {
  upsertRecommendationEvidence,
  listMyLiveEvidence,
  supersedeEvidenceRow,
} from './evidence.ts';

export { buildEvidenceSignals } from './evidence-builder.ts';

export type {
  RecommendationEvidence,
  RecommendationSignal,
  RecommendationType,
  SignalDirection,
  SignalType,
  UpsertEvidenceInput,
} from './evidence.ts';

export {
  createExperiment,
  createThreePostExperiment,
  transitionExperiment,
  updateExperiment,
  listMyExperiments,
  listCompletedExperiments,
  getExperiment,
  EXPERIMENT_STATUSES,
} from './content-experiments.ts';

export type {
  ContentExperiment,
  CreateExperimentInput,
  ExperimentStatus,
  UpdateExperimentInput,
} from './content-experiments.ts';

export {
  submitExperimentFeedback,
  listMySubmittedFeedbackIds,
  validateFeedbackInput,
  buildExperimentFeedbackIndex,
} from './feedback.ts';

export type {
  FeedbackValidationIssue,
  SubmitFeedbackInput,
  SubmitFeedbackResult,
  ExperimentFeedbackRef,
} from './feedback.ts';

import { supabase } from '@/lib/supabase';
import type { ValidationStatus, CreatorValidationStatusRow } from './validation-status.ts';
import type { ContentExperiment } from './content-experiments.ts';

/** Read the single aggregate status row for a creator. */
export async function getCreatorValidationStatus(
  creatorId: string,
): Promise<CreatorValidationStatusRow | null> {
  const { data, error } = await supabase
    .from('creator_validation_status')
    .select('*')
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load validation status: ${error.message}`);
  if (!data) return null;
  return rowToStatusRow(data as Record<string, unknown>);
}

function rowToStatusRow(row: Record<string, unknown>): CreatorValidationStatusRow {
  return {
    creator_id: String(row.creator_id ?? ''),
    status: String(row.status ?? 'Not tested') as ValidationStatus,
    planned_count: Number(row.planned_count ?? 0),
    in_progress_count: Number(row.in_progress_count ?? 0),
    completed_count: Number(row.completed_count ?? 0),
    contradicting_count: Number(row.contradicting_count ?? 0),
    validated_fit_score: row.validated_fit_score == null ? null : Number(row.validated_fit_score),
    is_contradictory: Boolean(row.is_contradictory),
    last_recalculated_at: String(row.last_recalculated_at ?? new Date().toISOString()),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

// Type helpers so UI code can `import { ContentExperimentStatus }` cleanly.
export type ExperimentStatusFilter =
  | 'all'
  | 'active'
  | 'completed'
  | 'abandoned';

export function filterExperiments(
  experiments: ReadonlyArray<ContentExperiment>,
  filter: ExperimentStatusFilter,
): ContentExperiment[] {
  switch (filter) {
    case 'all':       return experiments.slice();
    case 'active':    return experiments.filter(e => e.status === 'Draft' || e.status === 'Planned' || e.status === 'In progress');
    case 'completed': return experiments.filter(e => e.status === 'Completed');
    case 'abandoned': return experiments.filter(e => e.status === 'Abandoned');
  }
}
