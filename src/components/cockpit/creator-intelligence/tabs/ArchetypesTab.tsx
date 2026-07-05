// ── Archetype Engine Tab ──
// Sprint FYV-3.2D: sidebar + detail panel layout for archetype fits with
// supporting/contradicting evidence, sort/filter, and validation inspection.

import { useState, useMemo } from 'react';
import type { ArchetypeFit, AssessmentEvidence } from '@/types/creator';
import { useCreatorIntelligence } from '../context';

/* ── helpers ── */

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${
            pct >= 70 ? 'bg-success' : pct >= 50 ? 'bg-warn' : 'bg-pink'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-charcoal-2 w-10 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

function polarityStyle(polarity: 'positive' | 'negative' | 'neutral') {
  return polarity === 'positive'
    ? 'border-l-green-500'
    : polarity === 'negative'
      ? 'border-l-pink'
      : 'border-l-charcoal-2';
}

type SortMode = 'score' | 'confidence' | 'name';

function validationBadgeClass(status: ArchetypeFit['validation_status']): string {
  switch (status) {
    case 'validated': return 'bg-success/10 text-success';
    case 'contradicted': return 'bg-pink/10 text-pink';
    case 'selected_only': return 'bg-warn/10 text-warn';
    case 'inferred': return 'bg-accent/10 text-accent';
    default: return 'bg-surface-3 text-charcoal-2';
  }
}

/* ── EvidenceRow ── */

function EvidenceRow({ e }: { e: AssessmentEvidence }) {
  return (
    <div className={`bg-surface-1 rounded p-2 border-l-4 ${polarityStyle(e.polarity)}`}>
      <div className="flex justify-between gap-2 mb-0.5">
        <span className="text-xs text-charcoal-2 truncate">
          {String(e.value).slice(0, 120)}
        </span>
        <span className={`text-[10px] font-medium shrink-0 ${
          e.polarity === 'positive' ? 'text-success' : e.polarity === 'negative' ? 'text-pink' : 'text-charcoal-2'
        }`}>
          {e.polarity === 'positive' ? '+' : e.polarity === 'negative' ? '−' : ''}{e.strength} pts
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-charcoal-2">
        <span>{e.dimension.replace(/_/g, ' ')}</span>
        <span>{e.source_question_key}</span>
        <span>{e.confidence}% conf</span>
      </div>
    </div>
  );
}

/* ── ArchetypeDetail ── */

function ArchetypeDetail({
  fit,
  evidence,
}: {
  fit: ArchetypeFit;
  evidence: AssessmentEvidence[];
}) {
  const supporting = evidence.filter(e => fit.supporting_evidence_ids.includes(e.id));
  const contradicting = evidence.filter(e => fit.contradicting_evidence_ids.includes(e.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-charcoal">{fit.archetype}</h3>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-2">
          <span>
            Fit:{' '}
            <span className={`font-semibold ${
              fit.fit_score >= 70 ? 'text-success' : fit.fit_score >= 50 ? 'text-warn' : 'text-pink'
            }`}>
              {fit.fit_score}%
            </span>
          </span>
          <span>Confidence: <span className="font-semibold text-charcoal">{fit.confidence}%</span></span>
          <span className="capitalize">
            Status:{' '}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${validationBadgeClass(fit.validation_status)}`}>
              {fit.validation_status.replace(/_/g, ' ')}
            </span>
          </span>
          <span>Selected by creator: {fit.selected_by_creator ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* Supporting evidence */}
      {supporting.length > 0 ? (
        <div>
          <div className="text-xs font-semibold text-success mb-2">
            Supporting Evidence ({supporting.length})
          </div>
          <div className="space-y-2">
            {supporting.map(e => <EvidenceRow key={e.id} e={e} />)}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 bg-surface-2 p-3 text-xs text-charcoal-2">
          No supporting evidence linked.
        </div>
      )}

      {/* Contradicting evidence */}
      {contradicting.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-pink mb-2">
            Contradicting Evidence ({contradicting.length})
          </div>
          <div className="space-y-2">
            {contradicting.map(e => <EvidenceRow key={e.id} e={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── main tab ── */

export function ArchetypesTab() {
  const { intelligence, selectedAssessment } = useCreatorIntelligence();
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>('score');
  const [filterStatus, setFilterStatus] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const fits = intelligence?.archetype_fits ?? [];
  const evidence = intelligence?.evidence ?? [];

  const selectedFit = useMemo(
    () => fits.find(f => f.archetype === selectedArchetype) ?? null,
    [fits, selectedArchetype],
  );

  // Filter + sort
  const visible = useMemo(() => {
    let result = fits;

    if (showSelectedOnly) {
      result = result.filter(f => f.selected_by_creator);
    }

    if (filterStatus) {
      result = result.filter(f => f.validation_status === filterStatus);
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'confidence': return b.confidence - a.confidence;
        case 'name': return a.archetype.localeCompare(b.archetype);
        default: return b.fit_score - a.fit_score;
      }
    });
  }, [fits, sortBy, filterStatus, showSelectedOnly]);

  // ── empty states ──

  if (!selectedAssessment) {
    return (
      <div className="rounded-lg border border-white/10 bg-surface p-8 text-center">
        <p className="text-sm text-charcoal-2">No assessment selected.</p>
      </div>
    );
  }

  if (fits.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          No archetype fits computed. The intelligence engine requires traits and
          evidence to calculate archetype matches.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Sort by</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortMode)}
            className="field-control text-sm"
          >
            <option value="score">Fit score</option>
            <option value="confidence">Confidence</option>
            <option value="name">Name</option>
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Status</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="field-control text-sm"
          >
            <option value="">All statuses</option>
            <option value="validated">Validated</option>
            <option value="inferred">Inferred</option>
            <option value="selected_only">Selected only</option>
            <option value="contradicted">Contradicted</option>
          </select>
        </label>

        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={showSelectedOnly}
            onChange={e => setShowSelectedOnly(e.target.checked)}
            className="rounded border-white/10 text-accent focus:ring-accent"
          />
          <span className="text-xs font-medium text-charcoal-2">Creator-selected only</span>
        </label>

        <span className="text-xs text-charcoal-2 pb-2">
          {visible.length === fits.length
            ? `${fits.length} archetypes`
            : `${visible.length} of ${fits.length} archetypes`}
        </span>
      </div>

      {/* ── layout ── */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-surface-2 p-8 text-center text-sm text-charcoal-2">
          No archetypes match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-3">
              Archetypes
            </h3>
            {visible.map(f => {
              const isActive = selectedArchetype === f.archetype;
              return (
                <button
                  key={f.archetype}
                  onClick={() => setSelectedArchetype(isActive ? null : f.archetype)}
                  className={`w-full text-left rounded-lg p-3 transition-colors ${
                    isActive
                      ? 'bg-accent/10 border border-accent/30'
                      : 'bg-surface-2 border border-transparent hover:bg-surface-3'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-charcoal">{f.archetype}</span>
                      {f.selected_by_creator && (
                        <span className="ml-1.5 rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">creator</span>
                      )}
                    </div>
                    <span className={`text-xs font-bold tabular-nums shrink-0 ${
                      f.fit_score >= 70 ? 'text-success' : f.fit_score >= 50 ? 'text-warn' : 'text-pink'
                    }`}>
                      {f.fit_score}%
                    </span>
                  </div>
                  <ConfidenceBar value={f.fit_score} />
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${validationBadgeClass(f.validation_status)}`}>
                      {f.validation_status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-charcoal-2">{f.confidence}% conf</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selectedFit ? (
              <ArchetypeDetail fit={selectedFit} evidence={evidence} />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px] rounded-lg border border-dashed border-white/10 bg-surface-2">
                <p className="text-sm text-charcoal-2">
                  Select an archetype to view supporting and contradicting evidence.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
