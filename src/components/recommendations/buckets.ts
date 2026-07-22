// ============================================================================
// Dashboard buckets — pure aggregator (no React, no Supabase)
// ----------------------------------------------------------------------------
// ValidationDashboard SUMS counts of duplicate ValidationStatus keys in its
// `totals` reducer. This helper enforces "one bucket per status" so the
// dashboard never inflates a count inadvertently.
//
// NOTE: uses RELATIVE imports (not the `@/` Vite alias) so the node test
// runner can resolve modules without the bundler.
// ============================================================================

import type { ContentExperiment } from '../../lib/recommendations/content-experiments.ts';
import type {
  CreatorValidationStatusRow,
  ValidationStatus,
} from '../../lib/recommendations/validation-status.ts';
import type { ValidationDashboardBucket } from './ValidationDashboard.ts';

export function aggregateDashboardBuckets(
  status: CreatorValidationStatusRow | null,
  totalRecommendations: number,
  experiments: ReadonlyArray<ContentExperiment>,
): ValidationDashboardBucket[] {
  const completed = experiments.filter(e => e.status === 'Completed').length;
  const inProgress = experiments.filter(e => e.status === 'In progress').length;
  const planned = experiments.filter(e => e.status === 'Planned').length;
  const abandoned = experiments.filter(e => e.status === 'Abandoned').length;

  const byStatus = new Map<ValidationStatus, number>();
  const statusKey: ValidationStatus = status?.status ?? 'Not tested';
  byStatus.set(statusKey, totalRecommendations);
  if (inProgress > 0) byStatus.set('Testing', inProgress);
  if (planned > 0) byStatus.set('Experiment planned', planned);
  if (completed > 0) byStatus.set('Early evidence', Math.min(completed, 1));
  if (completed >= 4) byStatus.set('Validated', totalRecommendations);
  if (abandoned > 0) byStatus.set('Inconclusive', abandoned);
  if (totalRecommendations === 0 && experiments.length === 0) {
    byStatus.set('Not tested', 1);
  }

  return Array.from(byStatus.entries()).map(([s, count]) => ({ status: s, count }));
}
