// ── Report Preview Tab ──
// Sprint FYV-3.2A: placeholder.
// Implemented in FYV-3.2D.

import { useCreatorIntelligence } from '../context';

export function ReportTab() {
  const { storedReport, tierReport } = useCreatorIntelligence();
  const hasReport = Boolean(storedReport ?? tierReport);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {hasReport
          ? 'Report data is available. An interactive report preview with tier selector will be displayed here.'
          : 'No report data available yet.'}
      </p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-surface-2 p-6 text-center text-sm text-gray-500">
        Implemented in FYV-3.2D
      </div>
    </div>
  );
}
