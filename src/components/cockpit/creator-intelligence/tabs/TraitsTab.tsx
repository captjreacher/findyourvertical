// ── Trait Engine Tab ──
// Sprint FYV-3.2C: trait inspector showing Creator DNA traits with scores,
// confidence, evidence, contributing answers, and domain grouping.

import { useState, useMemo } from 'react';
import type { TraitWeight, AssessmentEvidence, CreatorTrait } from '@/types/creator';
import { useCreatorIntelligence } from '../context';

/* ── helpers ── */

const TRAIT_DOMAINS: Record<CreatorTrait, string> = {
  visibility_comfort: 'Visibility',
  social_energy: 'Social',
  authenticity: 'Authenticity',
  emotional_familiarity: 'Connection',
  trust_building: 'Connection',
  body_confidence: 'Confidence',
  routine_discipline: 'Discipline',
  visual_discipline: 'Discipline',
  monetisation_fit: 'Commercial',
  positioning_clarity: 'Brand',
  fan_connection: 'Connection',
  coachability: 'Growth',
  risk_awareness: 'Risk',
};

function traitDomain(t: CreatorTrait): string {
  return TRAIT_DOMAINS[t] ?? 'General';
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all ${
            pct >= 70 ? 'bg-success' : pct >= 50 ? 'bg-warn' : 'bg-pink'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-charcoal-2 w-10 text-right tabular-nums">{pct}%</span>
    </div>
  );
}

type SortMode = 'weight' | 'name' | 'evidence';

/* ── TraitCard ── */

function TraitCard({
  trait,
  evidence,
  expanded,
  onToggle,
}: {
  trait: TraitWeight;
  evidence: AssessmentEvidence[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const relatedEvidence = evidence.filter(e =>
    trait.evidence_ids.includes(e.id) || e.tags.includes(trait.trait));

  const positiveEvidence = relatedEvidence.filter(e => e.polarity === 'positive');
  const negativeEvidence = relatedEvidence.filter(e => e.polarity === 'negative');
  const neutralEvidence = relatedEvidence.filter(e => e.polarity === 'neutral');

  return (
    <div className="bg-surface-2 rounded-lg overflow-hidden">
      <button
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-surface-3 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-charcoal capitalize">
              {trait.trait.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-charcoal-2">
              {traitDomain(trait.trait)}
            </span>
            <span className="text-xs text-charcoal-2">{trait.weight}/100</span>
          </div>
          <ConfidenceBar value={trait.weight} />
        </div>
        <div className="flex items-center gap-4 text-xs text-charcoal-2 shrink-0">
          <span>{relatedEvidence.length} evidence</span>
          <span className="text-charcoal-2">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-3">
          {/* Rationale */}
          <div>
            <div className="text-xs font-semibold text-charcoal-2 mb-1">Rationale</div>
            <p className="text-sm text-charcoal-2 leading-relaxed">{trait.rationale}</p>
          </div>

          {/* Evidence summary */}
          {relatedEvidence.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-charcoal-2 mb-2">
                Contributing Evidence ({relatedEvidence.length})
              </div>

              {positiveEvidence.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-semibold text-success mb-1">
                    Positive ({positiveEvidence.length})
                  </div>
                  <div className="space-y-1.5">
                    {positiveEvidence.slice(0, 5).map(e => (
                      <div key={e.id} className="bg-surface-1 rounded p-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-charcoal truncate">{String(e.value).slice(0, 120)}</span>
                          <span className="text-green-600 font-medium shrink-0">+{e.strength}</span>
                        </div>
                        <div className="text-[10px] text-charcoal-2 mt-0.5">
                          {e.source_question_key} &middot; {e.dimension}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {negativeEvidence.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-semibold text-pink mb-1">
                    Negative / Contradicting ({negativeEvidence.length})
                  </div>
                  <div className="space-y-1.5">
                    {negativeEvidence.slice(0, 5).map(e => (
                      <div key={e.id} className="bg-surface-1 rounded p-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-charcoal truncate">{String(e.value).slice(0, 120)}</span>
                          <span className="text-pink font-medium shrink-0">−{e.strength}</span>
                        </div>
                        <div className="text-[10px] text-charcoal-2 mt-0.5">
                          {e.source_question_key} &middot; {e.dimension}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {neutralEvidence.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-charcoal-2 mb-1">
                    Neutral ({neutralEvidence.length})
                  </div>
                  <div className="space-y-1.5">
                    {neutralEvidence.slice(0, 3).map(e => (
                      <div key={e.id} className="bg-surface-1 rounded p-2 text-xs">
                        <span className="text-charcoal-2">{String(e.value).slice(0, 120)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evidence ID list (compact) */}
          {trait.evidence_ids.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-charcoal-2 mb-1">
                All Evidence IDs ({trait.evidence_ids.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {trait.evidence_ids.map(id => (
                  <code key={id} className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded text-charcoal-2 font-mono">
                    {id}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── main tab ── */

export function TraitsTab() {
  const { intelligence, selectedAssessment } = useCreatorIntelligence();
  const [expandedTrait, setExpandedTrait] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('weight');

  const traits = intelligence?.traits ?? [];
  const evidence = intelligence?.evidence ?? [];

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = traits;

    if (q) {
      result = result.filter(t =>
        t.trait.toLowerCase().includes(q) ||
        t.rationale.toLowerCase().includes(q) ||
        traitDomain(t.trait).toLowerCase().includes(q));
    }

    if (domainFilter) {
      result = result.filter(t => traitDomain(t.trait) === domainFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.trait.localeCompare(b.trait);
        case 'evidence': return b.evidence_ids.length - a.evidence_ids.length;
        default: return b.weight - a.weight;
      }
    });
  }, [traits, search, domainFilter, sortBy]);

  const domains = useMemo(
    () => [...new Set(traits.map(t => traitDomain(t.trait)))].sort(),
    [traits]);

  // ── empty states ──

  if (!selectedAssessment) {
    return (
      <div className="rounded-lg border border-white/10 bg-surface p-8 text-center">
        <p className="text-sm text-charcoal-2">No assessment selected.</p>
      </div>
    );
  }

  if (traits.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          No traits inferred. The intelligence engine requires evidence signals
          to generate trait weights.
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
            placeholder="Search traits, rationale…"
            className="field-control w-full text-sm"
          />
        </label>

        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Domain</span>
          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            className="field-control text-sm"
          >
            <option value="">All domains</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-2 mb-1">Sort by</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortMode)}
            className="field-control text-sm"
          >
            <option value="weight">Score</option>
            <option value="name">Name</option>
            <option value="evidence">Evidence count</option>
          </select>
        </label>

        <span className="text-xs text-charcoal-2 pb-2">
          {filtered.length === traits.length
            ? `${traits.length} traits`
            : `${filtered.length} of ${traits.length} traits`}
        </span>
      </div>

      {/* ── results ── */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-surface-2 p-8 text-center text-sm text-charcoal-2">
          No traits match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <TraitCard
              key={t.trait}
              trait={t}
              evidence={evidence}
              expanded={expandedTrait === t.trait}
              onToggle={() =>
                setExpandedTrait(expandedTrait === t.trait ? null : t.trait)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
