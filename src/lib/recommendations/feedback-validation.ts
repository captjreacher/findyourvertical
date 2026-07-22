// ============================================================================
// Feedback validation — PURE module
// ----------------------------------------------------------------------------
// Lives in its own module (no `@/lib/supabase` import) so node:test can import
// it without pulling the rest of the service layer. `feedback.ts` re-exports
// this function for app code; tests should import it from this file directly.
// ============================================================================

import type { ValidatedFitFeedback } from './validated-fit.ts';

export interface FeedbackValidationIssue {
  field: keyof ValidatedFitFeedback | 'experiment_id';
  message: string;
}

export interface SubmitFeedbackInput extends ValidatedFitFeedback {
  experiment_id: string;
  notes?: string | null;
}

const BOUNDED_FIELDS: ReadonlyArray<keyof ValidatedFitFeedback> = [
  'creator_energy_score',
  'authenticity_score',
  'creation_friction_score',
  'willingness_to_continue_score',
  'audience_response_score',
];

/**
 * Pure validator. Returns zero issues when valid; never throws.
 * Use this to gate the submit button + show inline errors.
 */
export function validateFeedbackInput(input: Partial<SubmitFeedbackInput>): FeedbackValidationIssue[] {
  const issues: FeedbackValidationIssue[] = [];

  if (!input.experiment_id || typeof input.experiment_id !== 'string') {
    issues.push({ field: 'experiment_id', message: 'Experiment id is required.' });
  }

  for (const field of BOUNDED_FIELDS) {
    const raw = input[field];
    // audience_response_score is OPTIONAL — null is allowed (treated neutral).
    if (field === 'audience_response_score' && (raw == null)) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      issues.push({ field, message: `${humanise(field)} must be a number.` });
      continue;
    }
    if (raw < 1 || raw > 5) {
      issues.push({ field, message: `${humanise(field)} must be between 1 and 5.` });
    }
  }

  return issues;
}

function humanise(field: keyof ValidatedFitFeedback): string {
  switch (field) {
    case 'creator_energy_score':         return 'Creator Energy';
    case 'authenticity_score':           return 'Authenticity';
    case 'creation_friction_score':      return 'Creation Friction';
    case 'willingness_to_continue_score':return 'Willingness to Continue';
    case 'audience_response_score':      return 'Audience Response';
  }
}

// ---------------------------------------------------------------------------
// Per-experiment feedback index
// ---------------------------------------------------------------------------
// The recommendation panel must HIDE the feedback form on a Completed
// experiment ONLY when a feedback row exists for THAT specific experiment —
// not when any experiment for the creator has feedback. The aggregate
// `creator_validation_status.completed_count` is the wrong gate (it would
// hide the form for every experiment after the first).
//
// This pure helper lives next to the existing pure validator so the test
// runner can exercise it without pulling in the supabase client.

/** Minimum shape of an experiment_feedback row we care about for the index. */
export interface ExperimentFeedbackRef {
  experiment_id?: string | null;
}

/**
 * Return the set of experiment_ids that have a feedback row attached.
 * Tolerates rows that lack `experiment_id` (defensive — schema drift).
 */
export function buildExperimentFeedbackIndex(
  feedback: ReadonlyArray<ExperimentFeedbackRef>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of feedback) {
    const id = row?.experiment_id;
    if (typeof id === 'string' && id.length > 0) {
      ids.add(id);
    }
  }
  return ids;
}
