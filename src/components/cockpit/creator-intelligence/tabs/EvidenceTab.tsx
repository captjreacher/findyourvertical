// ── Evidence Tab ──
// Sprint FYV-3.2C: explainable evidence trace showing how raw responses become
// evidence and how evidence impacts traits and archetypes.

import { useState, useMemo } from 'react';
import type {
  AssessmentEvidence,
  EvidenceDimension,
} from '@/types/creator';
import { useCreatorIntelligence } from '../context';

/* ── helpers ── */

const DIMENSION_LABELS: Record<EvidenceDimension, string> = {
  identity: 'Identity',
  positioning: 'Positioning',
  audience: 'Audience',
  content_engine: 'Content Engine',
  commercial_readiness: 'Commercial Readiness',
  growth_potential: 'Growth Potential',
  future_vision: 'Future Vision',
  confidence: 'Confidence',
  boundaries: 'Boundaries',
  archetype_validation: 'Archetype Validation',
};

function dimLabel(d: EvidenceDimension | string): string {
  return DIMENSION_LABELS[d as EvidenceDimension] ?? d.replace(/_/g, ' ');
}

type GroupingMode = 'dimension' | 'section' | 'source';

function groupKey(e: AssessmentEvidence, mode: GroupingMode): string {
  switch (mode) {
    case 'section': return e.section ?? 'Unknown';
    case 'source': return e.source_question_key ?? 'Unknown';
    default: return dimLabel(e.dimension);
  }
}

/* ── EvidenceCard ── */

function EvidenceCard({ e }: { e: AssessmentEvidence }) {
  const polarityColor =
    e.polarity === 'positive'
      ? 'border-l-green-500'
      : e.polarity === 'negative'
        ? 'border-l-pink'
        : 'border-l-charcoal-2';

  return (
    <div className={`bg-surface-2 rounded-lg p-3 border-l-4 ${polarityColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">
            {dimLabel(e.dimension)}
          </span>
          {e.validates_archetype && (
            <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {e.validates_archetype}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-charcoal-2">{e.strength} pts</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              e.polarity === 'positive'
                ? 'bg-success/10 text-success'
                : e.polarity === 'negative'
                  ? 'bg-pink/10 text-pink'
                  : 'bg-surface-3 text-charcoal-2'
            }`}
          >
            {e.polarity}
          </span>
        </div>
      </div>

      {/* Value */}
      <p className="text-sm text-charcoal-2 leading-relaxed">
        {typeof e.value === 'boolean'
          ? e.value ? 'Yes' : 'No'
          : Array.isArray(e.value)
            ? e.value.join(', ')
            : String(e.value).slice(0, 300)}
      </p>

      {/* Tags */}
      {e.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {e.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-charcoal-2">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Detail row */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-charcoal-2 font-mono">
        <span>src: {e.source_question_key}</span>
        <span>key: {e.response_key}</span>
        <span>section: {e.section}</span>
        <span>conf: {e.confidence}%</span>
      </div>
    </div>
  );
}

/* ── main tab ── */

export function EvidenceTab() {
  const { intelligence, selectedAssessment } = useCreatorIntelligence();

  const [grouping, setGrouping] = useState<GroupingMode>('dimension');
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(true); // start expanded

  const evidence = intelligence?.evidence ?? [];

  // Build groups
  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const map = new Map<string, AssessmentEvidence[]>();
    for (const e of evidence) {
      // Search filter
      if (q) {
        const haystack = [
          dimLabel(e.dimension),
          e.section,
          e.source_question_key,
          e.response_key,
          String(e.value),
          ...e.tags,
          e.validates_archetype,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      const key = groupKey(e, grouping);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [evidence, grouping, search]);

  // Sync open groups
  useMemo(() => {
    if (expandAll) {
      setOpenGroups(new Set(groups.map(([k]) => k)));
    }
  }, [expandAll, groups]);

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const groupedCount = groups.reduce((sum, [, items]) => sum + items.length, 0);

  // ── empty states ──

  if (!selectedAssessment) {
    return (
      <div className="rounded-lg border border-white/10 bg-surface p-8 text-center">
        <p className="text-sm text-charcoal-2">No assessment selected.</p>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          No evidence signals extracted. The intelligence engine may need a
          question snapshot with scoring dimensions configured.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search evidence, dimensions, tags…"
            className="field-control w-full text-sm"
          />
        </label>

        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Group by</span>
          <select
            value={grouping}
            onChange={e => setGrouping(e.target.value as GroupingMode)}
            className="field-control text-sm"
          >
            <option value="dimension">Dimension</option>
            <option value="section">Section</option>
            <option value="source">Source question</option>
          </select>
        </label>

        <button
          onClick={() => setExpandAll(v => !v)}
          className="text-xs font-medium text-accent hover:underline pb-2"
        >
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>

        <span className="text-xs text-charcoal-2 pb-2">
          {groupedCount === evidence.length
            ? `${evidence.length} signals`
            : `${groupedCount} of ${evidence.length} signals`}
        </span>
      </div>

      {/* ── polarity summary ── */}
      <div className="flex gap-3 text-[10px] text-charcoal-2">
        <span>{evidence.filter(e => e.polarity === 'positive').length} positive</span>
        <span>{evidence.filter(e => e.polarity === 'negative').length} negative</span>
        <span>{evidence.filter(e => e.polarity === 'neutral').length} neutral</span>
      </div>

      {/* ── groups ── */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-surface-2 p-8 text-center text-sm text-charcoal-2">
          No evidence matches the current search.
        </div>
      ) : (
        groups.map(([groupName, items]) => {
          const isOpen = openGroups.has(groupName);
          return (
            <div key={groupName} className="bg-surface-2 rounded-lg overflow-hidden">
              <button
                className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-surface-3 transition-colors"
                onClick={() => toggleGroup(groupName)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-charcoal capitalize">{groupName}</span>
                  <span className="text-xs text-charcoal-2">{items.length} signal{items.length !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-xs text-charcoal-2">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/10 pt-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map(e => <EvidenceCard key={e.id} e={e} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
