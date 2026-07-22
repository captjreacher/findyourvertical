// ============================================================================
// CreatorHomeValidationSummary
// ----------------------------------------------------------------------------
// Compact, creator-facing surface that shows the routine validation summary
// right on the authenticated home page. Phase 1 scope keeps it small:
//   - "Why now" headline derived from Validation Status
//   - One CTA pointing to the cockpit / next step
//   - Status chip + experiment count chip
//
// Lives separately from CreatorProfileRecommendationPanel so the cockpit
// (agency-side) and the home (creator-side) surfaces can evolve independently.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  STATUS_PRESENTATION,
  getCreatorValidationStatus,
  listMyExperiments,
  type CreatorValidationStatusRow,
  type ValidationStatus,
} from '@/lib/recommendations';

export interface CreatorHomeValidationSummaryProps {
  creatorId: string;
  /** HREF for the primary CTA (default: cockpit profile view). */
  detailHref?: string;
}

interface SummaryState {
  status: ValidationStatus;
  completedCount: number;
  totalExperiments: number;
}

const EMPTY_STATE: SummaryState = {
  status: 'Not tested',
  completedCount: 0,
  totalExperiments: 0,
};

export function CreatorHomeValidationSummary({
  creatorId,
  detailHref = '/cockpit/creators/me',
}: CreatorHomeValidationSummaryProps) {
  const [summary, setSummary] = useState<SummaryState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [statusRow, experiments] = await Promise.all([
          getCreatorValidationStatus(creatorId).catch(() => null),
          listMyExperiments(creatorId).catch(() => []),
        ]);
        if (!mounted) return;
        const status: ValidationStatus = statusRow?.status ?? 'Not tested';
        const completed = (experiments ?? []).filter(e => e.status === 'Completed').length;
        setSummary({
          status,
          completedCount: completed,
          totalExperiments: (experiments ?? []).length,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [creatorId]);

  const presentation = STATUS_PRESENTATION[summary.status];
  const cta = ctaFor(summary.status);

  if (loading) {
    return (
      <section
        className="rounded-2xl border border-white/10 bg-surface p-5"
        aria-live="polite"
        data-testid="creator-home-validation-summary-loading"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Validation</p>
        <p className="mt-2 text-sm text-charcoal-2">Loading your validation status…</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-surface p-5"
      data-testid="creator-home-validation-summary"
      data-status={summary.status}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Validation</p>
          <h2 className="mt-1 text-lg font-bold text-charcoal">{cta.headline}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${presentation.tone}`}>
          {presentation.label}
        </span>
      </header>
      <p className="mt-2 text-sm leading-6 text-charcoal-2">{presentation.description}</p>
      <p className="mt-2 text-xs text-charcoal-2">
        {summary.totalExperiments === 0
          ? 'No content experiments yet.'
          : `${summary.completedCount} of ${summary.totalExperiments} experiment${summary.totalExperiments === 1 ? '' : 's'} completed.`}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to={detailHref}
          className="btn-primary text-sm"
          data-testid="creator-home-validation-cta"
        >
          {cta.label}
        </Link>
        <span className="text-[10px] uppercase tracking-wide text-charcoal-2">
          Predicted Fit is assessment-derived. Validated Fit uses your real usage.
        </span>
      </div>
    </section>
  );
}

function ctaFor(status: ValidationStatus): { headline: string; label: string } {
  switch (status) {
    case 'Not tested':
      return {
        headline: 'Start validating your first direction',
        label: 'Create a 3-post experiment',
      };
    case 'Experiment planned':
      return {
        headline: 'Ship your planned experiment',
        label: 'Mark experiment in progress',
      };
    case 'Testing':
      return {
        headline: 'Finish and submit feedback',
        label: 'Complete experiment',
      };
    case 'Early evidence':
      return {
        headline: 'Run a second experiment',
        label: 'Open validation dashboard',
      };
    case 'Validated':
      return {
        headline: 'Validated — review what worked',
        label: 'View evidence + signals',
      };
    case 'Contradicted':
      return {
        headline: 'Mixed evidence — review carefully',
        label: 'Investigate the contradictions',
      };
    case 'Inconclusive':
      return {
        headline: 'Run a sharper experiment',
        label: 'View dashboard',
      };
  }
}
