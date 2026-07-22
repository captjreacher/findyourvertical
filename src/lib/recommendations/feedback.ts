// ============================================================================
// Experiment Feedback — submission service
// ----------------------------------------------------------------------------
// Always goes through the SECURITY DEFINER RPC `fyv_submit_experiment_feedback`
// so the cross-table update (feedback + status) is atomic and the server-side
// contract (1-5 scales, completed-experiment gating) is enforced.
//
// We re-export `validateFeedbackInput` from `feedback-validation.ts` so the
// UI can show inline errors before submit.
// ============================================================================

import { supabase } from '@/lib/supabase';
import {
  buildExperimentFeedbackIndex,
  validateFeedbackInput,
  type ExperimentFeedbackRef,
  type SubmitFeedbackInput,
} from './feedback-validation.ts';
export {
  buildExperimentFeedbackIndex,
  validateFeedbackInput,
  type FeedbackValidationIssue,
  type ExperimentFeedbackRef,
  type SubmitFeedbackInput,
} from './feedback-validation.ts';

const TABLE = 'experiment_feedback';

const RPC = 'fyv_submit_experiment_feedback';

export interface SubmitFeedbackResult {
  feedback_id: string;
  experiment_id: string;
  creator_id: string;
  validated_fit_score: number | null;
  status: string;
  completed_count: number;
  is_contradictory: boolean;
}

/**
 * Submit feedback through the SECURITY DEFINER RPC. The server enforces
 * ownership (via current_creator_profile_id()) and the completed-experiment
 * requirement; we don't need to duplicate those checks here.
 */
export async function submitExperimentFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  const issues = validateFeedbackInput(input);
  if (issues.length > 0) {
    throw new Error(issues.map(i => i.message).join(' '));
  }

  const { data, error } = await supabase.rpc(RPC, {
    p_experiment_id: input.experiment_id,
    p_creator_energy_score: input.creator_energy_score,
    p_authenticity_score: input.authenticity_score,
    p_creation_friction_score: input.creation_friction_score,
    p_willingness_to_continue_score: input.willingness_to_continue_score,
    p_audience_response_score: input.audience_response_score ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(`Failed to submit feedback: ${error.message}`);
  const row = (data ?? {}) as Partial<SubmitFeedbackResult>;
  return {
    feedback_id: String(row.feedback_id ?? ''),
    experiment_id: String(row.experiment_id ?? input.experiment_id),
    creator_id: String(row.creator_id ?? ''),
    validated_fit_score: typeof row.validated_fit_score === 'number' ? row.validated_fit_score : null,
    status: String(row.status ?? 'Not tested'),
    completed_count: typeof row.completed_count === 'number' ? row.completed_count : 0,
    is_contradictory: Boolean(row.is_contradictory),
  };
}

/**
 * Read the experiment_ids that already have feedback for this creator.
 *
 * The recommendation panel uses this to HIDE the per-experiment feedback
 * form when a feedback row exists for THAT specific experiment — not when
 * any experiment has feedback. The aggregate `creator_validation_status`
 * table is the wrong source for this check (it would suppress the form on
 * every experiment after the first).
 *
 * RLS scopes the read to `current_creator_profile_id()`, so this is safe
 * for the creator-facing panel.
 */
export async function listMySubmittedFeedbackIds(
  creatorId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('experiment_id')
    .eq('creator_id', creatorId);
  if (error) throw new Error(`Failed to load submitted feedback: ${error.message}`);
  const rows = (data ?? []) as ExperimentFeedbackRef[];
  return Array.from(buildExperimentFeedbackIndex(rows));
}
