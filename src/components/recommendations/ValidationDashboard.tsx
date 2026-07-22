// ============================================================================
// Validation Dashboard — portfolio-level summary
// ----------------------------------------------------------------------------
// Aggregates content experiment counts into the dashboard summary. Pure
// presentation; the data layer is already driven by derivedState or the
// creator_validation_status row.
// ============================================================================

import {
  STATUS_PRESENTATION,
  type ValidationStatus,
} from '@/lib/recommendations';

export interface ValidationDashboardBucket {
  status: ValidationStatus;
  count: number;
  /** Optional helpers used to drive the recommended-next action routing. */
  primaryCreatorProfileId?: string | null;
  primaryRecommendationId?: string | null;
}

export interface ValidationDashboardProps {
  buckets: ReadonlyArray<ValidationDashboardBucket>;
  totalRecommendations: number;
  onBucketClick?: (status: ValidationStatus) => void;
}

const DASHBOARD_ORDER: readonly ValidationStatus[] = [
  'Not tested',
  'Experiment planned',
  'Testing',
  'Early evidence',
  'Validated',
  'Contradicted',
  'Inconclusive',
];

export function ValidationDashboard({
  buckets,
  totalRecommendations,
  onBucketClick,
}: ValidationDashboardProps) {
  const totals = buckets.reduce<Record<ValidationStatus, number>>(
    (acc, bucket) => {
      acc[bucket.status] = (acc[bucket.status] ?? 0) + bucket.count;
      return acc;
    },
    {
      'Not tested': 0, 'Experiment planned': 0, Testing: 0, 'Early evidence': 0,
      Validated: 0, Contradicted: 0, Inconclusive: 0,
    },
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5" data-testid="validation-dashboard">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Validation Dashboard</p>
          <h2 className="mt-1 text-lg font-bold text-charcoal">
            {totalRecommendations} recommendation{totalRecommendations === 1 ? '' : 's'} tracked
          </h2>
        </div>
        <p className="text-xs text-charcoal-2">
          Predicted Fit is assessment-derived. Validated Fit only emerges from real creator usage.
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DASHBOARD_ORDER.map(status => {
          const count = totals[status] ?? 0;
          const presentation = STATUS_PRESENTATION[status];
          return (
            <li key={status}>
              <button
                type="button"
                onClick={() => onBucketClick?.(status)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${presentation.tone} hover:border-accent/40`}
                data-testid="dashboard-bucket"
                data-status={status}
                data-count={count}
                disabled={count === 0}
              >
                <p className="text-xs font-semibold uppercase tracking-wide">{presentation.label}</p>
                <p className="mt-1 text-2xl font-bold">{count}</p>
                <p className="mt-1 text-[10px] leading-4">{presentation.description}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
