// ============================================================================
// Content Experiments — CRUD service
// ----------------------------------------------------------------------------
// Lightweight content-test records tied to a creator's recommendation evidence.
// State transitions:
//   Draft → Planned → In progress → Completed (then truth-only has_feedback)
//                                       \→ Abandoned (terminal)
//
// The actual Validated Fit recalculation is server-side (the
// public.fyv_recalculate_creator_validated_fit trigger fires automatically),
// so we don't compute it here — we just expose the lifecycle + reads.
// ============================================================================

import { supabase } from '@/lib/supabase';

const TABLE = 'content_experiments';

export type ExperimentStatus =
  | 'Draft'
  | 'Planned'
  | 'In progress'
  | 'Completed'
  | 'Abandoned';

export const EXPERIMENT_STATUSES: readonly ExperimentStatus[] = [
  'Draft', 'Planned', 'In progress', 'Completed', 'Abandoned',
] as const;

/** Status transitions are forward-only; Completed can move to Abandoned only. */
const ALLOWED_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  'Draft':       ['Planned', 'Abandoned'],
  'Planned':     ['In progress', 'Abandoned'],
  'In progress': ['Completed', 'Abandoned'],
  'Completed':   ['Abandoned'], // soft re-label only; useful for skipping feedback accidentally
  'Abandoned':   [],           // terminal
};

export interface ContentExperiment {
  id: string;
  creator_id: string;
  recommendation_id: string | null;
  title: string;
  hypothesis: string | null;
  intended_audience: string | null;
  platform: string | null;
  content_format: string | null;
  message_angle: string | null;
  planned_content_count: number | null;
  status: ExperimentStatus;
  started_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExperimentInput {
  creator_id: string;
  title: string;
  hypothesis?: string | null;
  intended_audience?: string | null;
  platform?: string | null;
  content_format?: string | null;
  message_angle?: string | null;
  planned_content_count?: number | null;
  recommendation_id?: string | null;
  status?: ExperimentStatus;
}

export interface UpdateExperimentInput {
  title?: string;
  hypothesis?: string | null;
  intended_audience?: string | null;
  platform?: string | null;
  content_format?: string | null;
  message_angle?: string | null;
  planned_content_count?: number | null;
  status?: ExperimentStatus;
  started_at?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  notes?: string | null;
}

function asStatus(value: string): ExperimentStatus {
  return (EXPERIMENT_STATUSES as readonly string[]).includes(value)
    ? (value as ExperimentStatus)
    : 'Draft';
}

/**
 * Create a small "3-post experiment" seed. The plan fields can be edited
 * before the creator flips status to Planned or In progress.
 */
export async function createThreePostExperiment(
  creatorId: string,
  recommendationId: string | null,
  options: {
    title?: string;
    intended_audience?: string;
    platform?: string;
    content_format?: string;
    message_angle?: string;
    hypothesis?: string;
  } = {},
): Promise<ContentExperiment> {
  return createExperiment({
    creator_id: creatorId,
    recommendation_id: recommendationId,
    title: (options.title ?? '3-post content experiment').trim(),
    hypothesis: trimOrNull(options.hypothesis),
    intended_audience: trimOrNull(options.intended_audience),
    platform: trimOrNull(options.platform),
    content_format: trimOrNull(options.content_format ?? '3-post micro-test'),
    message_angle: trimOrNull(options.message_angle),
    planned_content_count: 3,
    status: 'Draft',
  });
}

export async function createExperiment(input: CreateExperimentInput): Promise<ContentExperiment> {
  if (!input.title.trim()) {
    throw new Error('Experiment title is required.');
  }
  const payload = {
    creator_id: input.creator_id,
    title: input.title.trim(),
    hypothesis: trimOrNull(input.hypothesis),
    intended_audience: trimOrNull(input.intended_audience),
    platform: trimOrNull(input.platform),
    content_format: trimOrNull(input.content_format),
    message_angle: trimOrNull(input.message_angle),
    planned_content_count: input.planned_content_count ?? null,
    recommendation_id: input.recommendation_id ?? null,
    status: input.status ?? 'Draft',
  };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(`Failed to create experiment: ${error.message}`);
  // Recalc RPC fires via the trigger.
  return hydrate(data);
}

export async function updateExperiment(
  id: string,
  creatorId: string,
  patch: UpdateExperimentInput,
): Promise<ContentExperiment> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .eq('creator_id', creatorId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update experiment: ${error.message}`);
  return hydrate(data);
}

/**
 * Move an experiment forward through the lifecycle. Validates the transition
 * (forward-only, plus Abandoned at any non-terminal state).
 */
export async function transitionExperiment(
  id: string,
  creatorId: string,
  next: ExperimentStatus,
): Promise<ContentExperiment> {
  const current = await getExperiment(id, creatorId);
  if (!current) throw new Error('Experiment not found.');
  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed.includes(next)) {
    throw new Error(
      `Cannot move experiment from "${current.status}" to "${next}". Allowed: ${
        allowed.length === 0 ? '(terminal)' : allowed.join(', ')
      }`,
    );
  }
  const patch: UpdateExperimentInput = { status: next };
  if (next === 'In progress' && !current.started_at) {
    patch.started_at = new Date().toISOString();
  }
  if (next === 'Completed' && !current.completed_at) {
    patch.completed_at = new Date().toISOString();
  }
  if (next === 'Abandoned' && !current.archived_at) {
    patch.archived_at = new Date().toISOString();
  }
  const updated = await updateExperiment(id, creatorId, patch);
  return updated;
}

export async function listMyExperiments(
  creatorId: string,
): Promise<ContentExperiment[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load experiments: ${error.message}`);
  return (data ?? []).map(hydrate);
}

export async function listCompletedExperiments(
  creatorId: string,
): Promise<ContentExperiment[]> {
  const all = await listMyExperiments(creatorId);
  return all.filter(exp => exp.status === 'Completed');
}

export async function getExperiment(
  id: string,
  creatorId: string,
): Promise<ContentExperiment | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load experiment: ${error.message}`);
  return data ? hydrate(data) : null;
}

function hydrate(row: any): ContentExperiment {
  return {
    id: row.id,
    creator_id: row.creator_id,
    recommendation_id: row.recommendation_id ?? null,
    title: row.title,
    hypothesis: row.hypothesis ?? null,
    intended_audience: row.intended_audience ?? null,
    platform: row.platform ?? null,
    content_format: row.content_format ?? null,
    message_angle: row.message_angle ?? null,
    planned_content_count: row.planned_content_count ?? null,
    status: asStatus(row.status),
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
    archived_at: row.archived_at ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}
