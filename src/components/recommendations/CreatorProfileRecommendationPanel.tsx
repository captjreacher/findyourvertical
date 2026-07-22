// ============================================================================
// CreatorProfileRecommendationPanel
// ----------------------------------------------------------------------------
// Orchestration component for the recommendation evidence + content
// experiments surface inside CreatorProfileView. Loads evidence + experiments
// + status, then renders the dashboard, evidence section, and experiment list.
//
// Self-contained so CreatorProfileView can mount it as a leaf without
// duplicating the fetch logic.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  getCreatorValidationStatus,
  listMyLiveEvidence,
  listMyExperiments,
  listMySubmittedFeedbackIds,
  submitExperimentFeedback,
  transitionExperiment,
  updateExperiment,
  upsertRecommendationEvidence,
  deriveStatusFromCounts,
  type ContentExperiment,
  type CreatorValidationStatusRow,
  type RecommendationEvidence,
  type ValidationStatus,
  type ExperimentStatus,
} from '@/lib/recommendations';
import { RecommendationEvidenceSection } from './RecommendationEvidenceSection';
import { ContentExperimentCard } from './ContentExperimentCard';
import { ValidationDashboard, type ValidationDashboardBucket } from './ValidationDashboard';
import { aggregateDashboardBuckets } from './buckets';
import { supabase } from '@/lib/supabase';
import type { CreatorAssessment } from '@/types/creator';

export interface CreatorProfileRecommendationPanelProps {
  creatorProfileId: string;
  /** Optional: creator-facing primary CTA label (e.g. "Open your portfolio"). */
  primaryActionLabel?: string;
  /** Action builder for "Compare Predicted Fit with Validated Fit" link. */
  onCompareAction?: () => void;
}

export function CreatorProfileRecommendationPanel(props: CreatorProfileRecommendationPanelProps) {
  const { creatorProfileId, primaryActionLabel, onCompareAction } = props;

  const [status, setStatus] = useState<CreatorValidationStatusRow | null>(null);
  const [evidence, setEvidence] = useState<RecommendationEvidence[]>([]);
  const [experiments, setExperiments] = useState<ContentExperiment[]>([]);
  // Per-experiment feedback presence. Indexed by experiment_id so each
  // ContentExperimentCard can decide INDEPENDENTLY whether to show the
  // feedback form. The aggregate `creator_validation_status.completed_count`
  // is the WRONG source — using it would suppress the form for every
  // Completed experiment after the first one. See the test in
  // `tests/recommendations.test.ts` ("Creator panel per-experiment
  // hasFeedback" group) for the regression guard.
  const [feedbackExperimentIds, setFeedbackExperimentIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const [statusRow, evidenceRows, experimentRows] = await Promise.all([
        getCreatorValidationStatus(creatorProfileId).catch(() => null),
        listMyLiveEvidence(creatorProfileId).catch(() => []),
        listMyExperiments(creatorProfileId).catch(() => []),
      ]);
      // Feedback ids are decoded via the same pure helper the test suite
      // exercises, so a malformed row can never silently cause the wrong
      // experiments to be marked as "already submitted".
      try {
        const ids = await listMySubmittedFeedbackIds(creatorProfileId);
        setFeedbackExperimentIds(new Set(ids));
      } catch {
        setFeedbackExperimentIds(new Set());
      }
      setStatus(statusRow ?? deriveStatusFromCounts({ experiments: experimentRows }).counters);
      setEvidence(evidenceRows);
      setExperiments(experimentRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendation signals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorProfileId]);

  const portfolioEvidence: RecommendationEvidence | null = evidence.find(
    e => e.recommendation_type === 'creator_profile' && !e.is_superseded,
  ) ?? evidence[0] ?? null;

  const validationStatus: ValidationStatus = status?.status ?? 'Not tested';

  const { completedCount, totalRecommendations, buckets, nextAction } = useMemo(
    () => derivePortfolioSummary(evidence, experiments, status),
    [evidence, experiments, status],
  );

  // Lazy: seed a LEGACY row when no live evidence exists yet. The legacy
  // fallback deliberately writes `predicted_fit_score = null` (no full
  // intelligence graph in this seed path) and a generic explanation, so the
  // UI shows "Not yet calculated" until a NEW assessment unlocks the real
  // predictor. Idempotent: the partial unique index lets the soft-supersede
  // + insert flow accumulate history instead of clobbering.
  const ensureSeededEvidence = async () => {
    if (portfolioEvidence) return;
    try {
      const { data: assessment } = await supabase
        .from('creator_assessments')
        .select('*')
        .eq('creator_profile_id', creatorProfileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: CreatorAssessment | null; error: unknown };

      if (!assessment) return;

      const assessmentResponses = (assessment.responses ?? {}) as Record<string, unknown>;
      const recommendedLabel = (assessmentResponses.full_name as string | undefined) ?? 'This creator profile';

      await upsertRecommendationEvidence({
        creator_id: creatorProfileId,
        recommendation_type: 'creator_profile',
        recommended_entity_id: creatorProfileId,
        recommended_entity_label: recommendedLabel,
        explanation_summary:
          'Recommendation evidence is not yet calculated for this direction. '
          + 'Run a new assessment to unlock Predicted Fit.',
        supporting_signals: [],
        source_question_keys: [],
        source_assessment_id: assessment.id,
        // Real intelligence assessment is not re-implemented in this seed path.
        // Passing `null` keeps Predicted Fit strictly honest: the row records
        // provenance (source_assessment_id, generation_method) but no fabricated
        // numeric score.
        intelligence: null,
      });
      await reload();
    } catch (err) {
      void err; // non-fatal — keep current rendering until the creator re-validates
    }
  };

  // Fire once on mount if no portfolioEvidence exists.
  useEffect(() => {
    if (!loading && !portfolioEvidence) {
      void ensureSeededEvidence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, portfolioEvidence == null]);

  if (loading) {
    return (
      <section className="cockpit-card-pad" data-testid="recommendation-panel-loading">
        <p className="text-xs text-charcoal-2">Loading recommendation evidence…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="cockpit-card-pad border-pink/30 bg-pink/5" role="alert">
        <p className="text-xs font-semibold uppercase tracking-wide text-pink">Recommendation panel</p>
        <p className="mt-2 text-sm text-charcoal-2">{error}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="creator-profile-recommendation-panel">
      <ValidationDashboard
        buckets={buckets}
        totalRecommendations={totalRecommendations}
      />

      <RecommendationEvidenceSection
        recommendedEntityLabel={portfolioEvidence?.recommended_entity_label ?? 'This creator profile'}
        subtitle={portfolioEvidence?.explanation_summary ?? null}
        evidence={portfolioEvidence}
        validationStatus={validationStatus}
        contentExperimentCount={completedCount}
        nextAction={{
          label: nextAction.label,
          reason: nextAction.reason,
        }}
        onPrimaryAction={primaryActionLabel ? () => writeNoop() : null}
      />

      <section className="cockpit-card-pad">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Content experiments</p>
            <h2 className="cockpit-section-title mt-1">
              {experiments.length === 0 ? 'No experiments yet' : `${experiments.length} experiment${experiments.length === 1 ? '' : 's'} on file`}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {onCompareAction && (
              <button
                type="button"
                onClick={onCompareAction}
                className="btn-secondary text-xs"
                data-testid="compare-predicted-validated"
              >
                Compare Predicted Fit vs Validated Fit
              </button>
            )}
          </div>
        </header>
        {experiments.length === 0 ? (
          <p className="text-sm text-charcoal-2">
            Create a 3-post micro-experiment linked to this creator profile to start validating
            directions with real creator usage evidence.
          </p>
        ) : (
          <div className="space-y-4">
            {experiments.map(exp => (
              <ContentExperimentCard
                key={exp.id}
                experiment={exp}
                // PER-EXPERIMENT gate: form hides only when THIS specific
                // experiment_id has a feedback row. Aggregate counters
                // (e.g. status.completed_count) would incorrectly hide the
                // form for every experiment after the first completion.
                hasFeedback={feedbackExperimentIds.has(exp.id)}
                busy={busy}
                onTransition={async (next: ExperimentStatus) => {
                  setBusy(true);
                  try {
                    await transitionExperiment(exp.id, creatorProfileId, next);
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onSubmitFeedback={async input => {
                  setBusy(true);
                  try {
                    await submitExperimentFeedback({ experiment_id: exp.id, ...input });
                    // Optimistic update so this card's form hides
                    // immediately without waiting for the round-trip.
                    // `reload()` below reconciles with the DB.
                    setFeedbackExperimentIds(prev => {
                      if (prev.has(exp.id)) return prev;
                      const next2 = new Set(prev);
                      next2.add(exp.id);
                      return next2;
                    });
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                onEdit={async patch => {
                  setBusy(true);
                  try {
                    await updateExperiment(exp.id, creatorProfileId, patch);
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function writeNoop() {
  /* intentional no-op default action */
}

interface PortfolioSummary {
  completedCount: number;
  totalRecommendations: number;
  buckets: ValidationDashboardBucket[];
  nextAction: { label: string; reason: string };
}

function derivePortfolioSummary(
  evidence: ReadonlyArray<RecommendationEvidence>,
  experiments: ReadonlyArray<ContentExperiment>,
  status: CreatorValidationStatusRow | null,
): PortfolioSummary {
  const live = evidence.filter(e => !e.is_superseded && !e.agency_archived);
  const total = live.length;
  const completed = experiments.filter(e => e.status === 'Completed').length;
  const nextAction = nextActionFor(status?.status ?? 'Not tested');

  return {
    completedCount: completed,
    totalRecommendations: total,
    buckets: aggregateDashboardBuckets(status, total, experiments),
    nextAction,
  };
}

function nextActionFor(status: ValidationStatus): PortfolioSummary['nextAction'] {
  switch (status) {
    case 'Not tested':
      return {
        label: 'Create a 3-post experiment',
        reason: 'No real-world evidence yet — start with a small micro-test on this direction.',
      };
    case 'Experiment planned':
      return {
        label: 'Start the planned experiment',
        reason: 'The plan is ready. Move it into progress once the first piece of content ships.',
      };
    case 'Testing':
      return {
        label: 'Complete in-progress experiment',
        reason: 'Mark the experiment complete once you have shipped the planned posts.',
      };
    case 'Early evidence':
      return {
        label: 'Run a second experiment',
        reason: 'A single experiment cannot validate a direction. Add a second to start building.',
      };
    case 'Validated':
      return {
        label: 'Compare Predicted with Validated Fit',
        reason: 'Validated directions are ready to brief — contrast with Prior Predicted Fit to confirm.',
      };
    case 'Contradicted':
      return {
        label: 'Investigate contradictions',
        reason: 'Mixed signals mean the direction may not be reliable; document the differences.',
      };
    case 'Inconclusive':
      return {
        label: 'Run a focused experiment',
        reason: 'Past experiments produced low or mixed signals; try a sharper hypothesis.',
      };
  }
}


