import { supabase } from './supabase';
import {
  CREATOR_DNA_VERSION,
  CREATOR_INTELLIGENCE_VERSION,
  REPORT_GENERATION_SCHEMA_VERSION,
  SCORING_VERSION,
  computeGenerationDigest,
  type CreatorReportGenerationContext,
  type ReportTemplateEvaluationResult,
} from './report-generation';

export interface PersistReportTemplateEvaluationInput {
  creatorProfileId: string;
  assessmentId: string;
  creatorDnaProfileId?: string | null;
  reportTemplateVersionId: string;
  generationMode: 'template' | 'preview';
  context: CreatorReportGenerationContext;
  evaluation: ReportTemplateEvaluationResult;
}

/**
 * Persists an internal template/preview execution. RLS limits this path to FYV
 * agency operators; public assessment completion uses the dedicated legacy RPC.
 */
export async function persistReportTemplateEvaluation(
  input: PersistReportTemplateEvaluationInput,
): Promise<string> {
  const [inputDigest, outputDigest] = await Promise.all([
    computeGenerationDigest(input.context),
    computeGenerationDigest(input.evaluation),
  ]);
  const { data: run, error: runError } = await (supabase as any)
    .from('creator_report_generation_runs')
    .insert({
      creator_profile_id: input.creatorProfileId,
      assessment_id: input.assessmentId,
      creator_dna_profile_id: input.creatorDnaProfileId ?? null,
      report_template_version_id: input.reportTemplateVersionId,
      generation_mode: input.generationMode,
      status: 'running',
      scoring_version: SCORING_VERSION,
      intelligence_version: CREATOR_INTELLIGENCE_VERSION,
      creator_dna_version: CREATOR_DNA_VERSION,
      schema_version: REPORT_GENERATION_SCHEMA_VERSION,
      digest_algorithm: 'fyv-stable-json-sha256-v1',
      generation_context: input.context,
      input_digest: inputDigest,
    })
    .select('id')
    .single();

  if (runError) throw new Error(`Failed to start report generation run: ${runError.message}`);

  try {
    if (input.evaluation.executionTrace.length > 0) {
      const { error: traceError } = await (supabase as any)
        .from('creator_report_block_results')
        .insert(input.evaluation.executionTrace.map(trace => ({
          generation_run_id: run.id,
          section_id: trace.sectionId,
          block_id: trace.blockId,
          status: trace.status,
          rule_evaluation: trace.ruleEvaluation ?? {},
          evidence_snapshot: trace.evidenceSnapshot,
          missing_evidence: trace.missingEvidence,
          rendered_output: trace.renderedOutput === null ? null : { content: trace.renderedOutput },
          trace_snapshot: trace,
          fallback_used: trace.fallbackUsed,
          prompt_snapshot: null,
          prompt_version: null,
          provider: null,
          model: null,
        })));
      if (traceError) throw new Error(`Failed to persist report block traces: ${traceError.message}`);
    }

    const { error: completionError } = await (supabase as any)
      .from('creator_report_generation_runs')
      .update({
        status: 'completed',
        output_digest: outputDigest,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (completionError) throw new Error(`Failed to complete report generation run: ${completionError.message}`);
    return run.id as string;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown report generation failure';
    await (supabase as any)
      .from('creator_report_generation_runs')
      .update({
        status: 'failed',
        failure_code: 'template_evaluation_persistence_failed',
        failure_detail: detail,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    throw error;
  }
}
