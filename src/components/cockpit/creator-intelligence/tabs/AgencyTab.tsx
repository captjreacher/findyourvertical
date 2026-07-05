// ── Agency Review Tab ──
// Sprint FYV-3.2A: placeholder.
// Implemented in FYV-3.2D.

import { useCreatorIntelligence } from '../context';

export function AgencyTab() {
  const { storedReport } = useCreatorIntelligence();
  const reportJson = storedReport?.report_json as any;
  const hasScores = Boolean(reportJson?.internal_agency_scores);

  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal-2">
        {hasScores
          ? 'Internal agency scores and recommendation are available.'
          : 'No internal agency qualification data stored yet.'}
      </p>
      <div className="rounded-lg border border-dashed border-white/10 bg-surface-2 p-6 text-center text-sm text-charcoal-2">
        Implemented in FYV-3.2D
      </div>
    </div>
  );
}
