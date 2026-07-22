// ============================================================================
// Recommendation Evidence — CRUD service
// ----------------------------------------------------------------------------
// Persists "Why this was recommended" provenance per (creator, entity). Reads
// through creator-side RLS scope; writes insert or update.
// ============================================================================

import { supabase } from '@/lib/supabase';
import type { CreatorIntelligenceResult } from '@/types/creator';
import { calculatePredictedFit } from './predicted-fit.ts';
import type { PredictedFitResult } from './predicted-fit.ts';
import { RECOMMENDATION_RULESET_VERSION } from './version.ts';

export type RecommendationType =
  | 'creator_profile'
  | 'creator_vertical'
  | 'archetype';

export type SignalType =
  | 'interest'
  | 'experience'
  | 'strength'
  | 'motivation'
  | 'preferred_working_style'
  | 'communication_style'
  | 'content_preference'
  | 'audience_preference'
  | 'constraint'
  | 'contradiction';

export type SignalDirection = 'positive' | 'negative' | 'neutral';

export interface RecommendationSignal {
  signal_type: SignalType;
  label: string;
  description: string;
  weight: number;            // 0..100
  direction: SignalDirection;
  source_reference: string;  // question_key, assessment_question_key, or 'snapshot'
  confidence: number;       // 0..100
}

export interface RecommendationEvidence {
  id: string;
  creator_id: string;
  recommendation_type: RecommendationType;
  recommended_entity_id: string;
  recommended_entity_label: string;
  predicted_fit_score: number | null;
  predicted_fit_confidence: number | null;
  explanation_summary: string;
  supporting_signals: RecommendationSignal[];
  source_question_keys: string[];
  source_assessment_id: string | null;
  generation_method: 'fyv_ruleset_v1' | 'creator_edited' | 'agency_overridden';
  model_version: typeof RECOMMENDATION_RULESET_VERSION;
  validated_fit_score: number | null;
  last_validated_at: string | null;
  is_superseded: boolean;
  agency_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertEvidenceInput {
  creator_id: string;
  recommendation_type: RecommendationType;
  recommended_entity_id: string;
  recommended_entity_label: string;
  explanation_summary: string;
  supporting_signals: RecommendationSignal[];
  source_question_keys: string[];
  source_assessment_id: string | null;
  generation_method?: RecommendationEvidence['generation_method'];
  intelligence: Pick<CreatorIntelligenceResult, 'archetype_fits' | 'confidence'> | null;
  /** Override predicted fit (rare; usually derived from intelligence). */
  predicted_fit_override?: { score: number; confidence: number | null } | null;
}

const TABLE = 'creator_recommendation_evidence';

/**
 * Upsert recommendation evidence for one (creator, type, entity) tuple.
 * Derives predicted_fit from the bundled intelligence payload unless an override
 * is provided. Validates + clamps values for the DB constraints.
 *
 * Provenance safety: the DB unique constraint on this tuple is a PARTIAL unique
 * index `where is_superseded = false and agency_archived = false`. So if a live
 * row already exists we SOFT-SUPERSEDE it (set is_superseded=true on the prior
 * row) and insert a brand new row. The prior row's source_assessment_id /
 * generation_method stay intact for audit. This matches the agency cockpit's
 * creator-edit flow: edits never destroy the original recommendation evidence.
 *
 * Race window: two concurrent calls can both succeed in `find live row →
 * supersede → insert` because the partial unique index allows superseded rows
 * to repeat the key. Worst-case: same evidence is recorded twice with the same
 * payload; the latest is queried by `listMyLiveEvidence`. Acceptable for Phase 1
 * (single-user creator portal). Production would push this into a
 * SECURITY DEFINER RPC to make the (supersede + insert) atomic.
 */
export async function upsertRecommendationEvidence(
  input: UpsertEvidenceInput,
): Promise<RecommendationEvidence> {
  const fit: PredictedFitResult = input.predicted_fit_override
    ? {
        score: clampPercent(input.predicted_fit_override.score),
        confidence: input.predicted_fit_override.confidence != null
          ? clampPercent(input.predicted_fit_override.confidence)
          : null,
        ruleset_version: RECOMMENDATION_RULESET_VERSION,
        source_archetype: input.recommended_entity_label,
      }
    : calculatePredictedFit({
        intelligence: input.intelligence,
        archetype: input.recommended_entity_label,
      });

  const generationMethod = input.generation_method ?? 'fyv_ruleset_v1';

  // 1. Soft-supersede any live row for the same tuple (preserves provenance).
  await supersedeEvidenceRowByKey(
    input.creator_id,
    input.recommendation_type,
    input.recommended_entity_id,
  ).catch(() => undefined);

  // 2. Insert a fresh live row.
  const payload = {
    creator_id: input.creator_id,
    recommendation_type: input.recommendation_type,
    recommended_entity_id: input.recommended_entity_id,
    recommended_entity_label: input.recommended_entity_label,
    predicted_fit_score: fit.score,
    predicted_fit_confidence: fit.confidence,
    explanation_summary: input.explanation_summary.trim(),
    supporting_signals: input.supporting_signals.slice(0, 12), // sanity cap
    source_question_keys: dedupe(input.source_question_keys),
    source_assessment_id: input.source_assessment_id,
    generation_method: generationMethod,
    model_version: RECOMMENDATION_RULESET_VERSION,
    is_superseded: false,
    agency_archived: false,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Failed to save recommendation evidence: ${error.message}`);
  return data as RecommendationEvidence;
}

/**
 * Soft-supersede the LIVE row (if any) for a (creator, type, entity) tuple.
 * Internal helper. Never mutates superseded rows. Never throws on missing row.
 */
async function supersedeEvidenceRowByKey(
  creatorId: string,
  recommendationType: UpsertEvidenceInput['recommendation_type'],
  recommendedEntityId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      is_superseded: true,
      updated_at: new Date().toISOString(),
    })
    .eq('creator_id', creatorId)
    .eq('recommendation_type', recommendationType)
    .eq('recommended_entity_id', recommendedEntityId)
    .eq('is_superseded', false);
  if (error) throw new Error(`Failed to supersede prior evidence: ${error.message}`);
}

/** Read all live (non-superseded, non-archived) evidence rows for the current creator. */
export async function listMyLiveEvidence(
  creatorId: string,
  options?: { recommendationType?: RecommendationType },
): Promise<RecommendationEvidence[]> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('creator_id', creatorId)
    .eq('is_superseded', false)
    .eq('agency_archived', false)
    .order('created_at', { ascending: false });
  if (options?.recommendationType) {
    query = query.eq('recommendation_type', options.recommendationType);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load recommendation evidence: ${error.message}`);
  return (data ?? []) as RecommendationEvidence[];
}

/** Mark a single evidence row superseded when the creator edits the recommendation. */
export async function supersedeEvidenceRow(
  evidenceId: string,
  creatorId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ is_superseded: true, updated_at: new Date().toISOString() })
    .eq('id', evidenceId)
    .eq('creator_id', creatorId);
  if (error) throw new Error(`Failed to archive evidence row: ${error.message}`);
}

/**
 * Aggregate a per-creator evidence payload from CreatorIntelligence + assessment.
 * MOVED to `./evidence-builder.ts` so node:test can import the pure helper
 * without pulling `@/lib/supabase`. This file keeps the CRUD service only.
 * Re-exported via `./index.ts` for app code.
 */
export { buildEvidenceSignals } from './evidence-builder.ts';

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
