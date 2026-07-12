// ============================================================================
// Creator Intelligence publisher (FYV service layer)
// ----------------------------------------------------------------------------
// Orchestrates the FYV-owned handoff: derive the intelligence content from a
// completed report, then delegate the privileged, idempotent write (resolve the
// FMF shadow creator, reconcile snapshot + projections, emit the published event)
// to the SECURITY DEFINER RPC `fyv_publish_intelligence_snapshot`.
//
// NON-FATAL BY DESIGN: an unresolved mapping, a not-yet-deployed RPC, or any
// error must never break a completed assessment. Every failure path returns a
// status and logs a diagnostic; nothing throws. FMF consumption (resolving via
// external_identity, advancing onboarding lifecycle) is a separate downstream task.
// ============================================================================
import { publicSupabase } from './supabase';
import { buildIntelligencePackageContent, CREATOR_INTELLIGENCE_VERSION } from './intelligence-snapshot';
import type { ReportData } from '@/types/creator';

export type PublishStatus = 'published' | 'reused' | 'unresolved' | 'skipped' | 'error';

export interface PublishInput {
  creatorProfileId: string;
  assessmentId?: string | null;
  reportId?: string | null;
  /** When called from the completion flow the report is already in memory. */
  reportData?: ReportData | null;
  /** Deterministic reference date (defaults to today, UTC). Backfills pass the original date. */
  referenceDate?: string;
  intelligenceVersion?: string;
}

export interface PublishResult {
  status: PublishStatus;
  snapshotId?: string;
  packageReference?: string;
  eventEmitted?: boolean;
  reused?: boolean;
  reason?: string;
}

export async function publishCreatorIntelligencePackage(input: PublishInput): Promise<PublishResult> {
  try {
    if (!input.creatorProfileId) {
      return { status: 'skipped', reason: 'missing_creator_profile_id' };
    }

    let report: ReportData | null = input.reportData ?? null;
    if (!report && input.reportId) {
      const { data } = await (publicSupabase as any)
        .from('creator_reports')
        .select('report_json')
        .eq('id', input.reportId)
        .maybeSingle();
      report = (data?.report_json as ReportData | undefined) ?? null;
    }
    if (!report) {
      return { status: 'skipped', reason: 'no_report' };
    }

    const content = buildIntelligencePackageContent(report);
    const referenceDate = input.referenceDate ?? new Date().toISOString().slice(0, 10);
    const intelligenceVersion = input.intelligenceVersion ?? CREATOR_INTELLIGENCE_VERSION;

    const { data, error } = await (publicSupabase as any).rpc('fyv_publish_intelligence_snapshot', {
      p_creator_profile_id: input.creatorProfileId,
      p_content: content,
      p_reference_date: referenceDate,
      p_intelligence_version: intelligenceVersion,
    });

    if (error) {
      // Non-fatal: e.g. RPC not yet deployed, or a transient DB error.
      console.warn('[intelligence-publisher] publish failed (non-fatal):', error.message);
      return { status: 'error', reason: error.message };
    }

    const result = (data ?? {}) as {
      resolved?: boolean;
      reused?: boolean;
      snapshot_id?: string;
      package_reference?: string;
      event_emitted?: boolean;
      reason?: string;
    };

    if (result.resolved === false) {
      // Diagnostic already recorded by the RPC (handoff_unresolved event).
      return { status: 'unresolved', reason: result.reason };
    }

    return {
      status: result.reused ? 'reused' : 'published',
      snapshotId: result.snapshot_id,
      packageReference: result.package_reference,
      eventEmitted: result.event_emitted,
      reused: result.reused,
    };
  } catch (err) {
    console.warn(
      '[intelligence-publisher] unexpected error (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
}
