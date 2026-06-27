// ── Timeline Tab ──
// Sprint FYV-3.2A: placeholder.
// Implemented in FYV-3.2E.

import { useCreatorIntelligence } from '../context';

export function TimelineTab() {
  const { events } = useCreatorIntelligence();
  const count = events.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {count} lifecycle events recorded. A chronological timeline with
        event cards will be displayed here.
      </p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-surface-2 p-6 text-center text-sm text-gray-500">
        Implemented in FYV-3.2E
      </div>
    </div>
  );
}
