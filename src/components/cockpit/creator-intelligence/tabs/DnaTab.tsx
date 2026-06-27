// ── Creator DNA Tab ──
// Sprint FYV-3.2D: expandable collapsible groups for Identity, Behaviour,
// Brand, and Commercial with full DNA field display.

import { useState, useMemo } from 'react';
import type { CreatorDnaProfile } from '@/types/creator';
import { useCreatorIntelligence } from '../context';

/* ── helpers ── */

function valueRender(value: string | number | string[] | null | undefined): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-sm text-gray-400 italic">Not set</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-sm text-gray-400 italic">None</span>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={i} className="px-2 py-1 rounded-full bg-surface-3 text-xs text-gray-700">{v}</span>
        ))}
      </div>
    );
  }

  return <span className="text-sm font-semibold text-gray-900">{String(value)}</span>;
}

function authenticityBandColor(band: string): string {
  switch (band) {
    case 'High Authenticity': return 'text-success';
    case 'Moderate Authenticity': return 'text-warn';
    case 'Potential Conflict': return 'text-pink';
    default: return 'text-gray-900';
  }
}

function opportunityBandColor(band: string): string {
  switch (band) {
    case 'High Priority': return 'text-accent';
    case 'Qualified': return 'text-success';
    case 'Needs Development': return 'text-warn';
    case 'Not Suitable Yet': return 'text-pink';
    default: return 'text-gray-900';
  }
}

/* ── DataRow ── */

function DataRow({
  label,
  value,
  specialClass,
}: {
  label: string;
  value: string | number | string[] | null | undefined;
  specialClass?: string;
}) {
  return (
    <div className="bg-surface-1 rounded p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={specialClass}>{valueRender(value)}</div>
    </div>
  );
}

/* ── DnaGroup ── */

interface DnaGroupItem {
  label: string;
  value: string | number | string[] | null | undefined;
  specialClass?: string;
}

function DnaGroup({
  title,
  items,
  expanded,
  onToggle,
}: {
  title: string;
  items: DnaGroupItem[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-surface-2 rounded-lg overflow-hidden">
      <button
        className="w-full text-left p-4 flex items-center justify-between hover:bg-surface-3 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-xs text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {items.map(({ label, value, specialClass }) => (
            <DataRow key={label} label={label} value={value} specialClass={specialClass} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── main tab ── */

export function DnaTab() {
  const { dnaProfiles, intelligence, selectedAssessment } = useCreatorIntelligence();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Prefer stored DNA profile, fall back to computed intelligence DNA
  const dna: CreatorDnaProfile | Omit<CreatorDnaProfile, 'id' | 'created_at'> | null =
    dnaProfiles[0] ?? intelligence?.creator_dna ?? null;

  const groups: { title: string; items: DnaGroupItem[] }[] = useMemo(() => {
    if (!dna) return [];

    return [
      {
        title: 'Identity',
        items: [
          { label: 'Primary DNA', value: dna.creator_dna_primary },
          { label: 'Secondary DNA', value: dna.creator_dna_secondary },
          { label: 'Confidence', value: dna.confidence != null ? `${dna.confidence}%` : null },
        ],
      },
      {
        title: 'Behaviour',
        items: [
          {
            label: 'Authenticity Band',
            value: dna.authenticity_band,
            specialClass: authenticityBandColor(dna.authenticity_band),
          },
          { label: 'Monetisation Readiness', value: dna.monetisation_readiness },
          { label: 'Growth Constraints', value: dna.growth_constraints as string[] | null },
        ],
      },
      {
        title: 'Brand',
        items: [
          { label: 'Fantasy Archetype', value: dna.fantasy_archetype },
          {
            label: 'Archetype Confidence',
            value: dna.archetype_confidence != null ? `${dna.archetype_confidence}%` : null,
          },
          { label: 'Authenticity Flags', value: dna.authenticity_flags as string[] | null },
        ],
      },
      {
        title: 'Commercial',
        items: [
          {
            label: 'Agency Opportunity Score',
            value: dna.agency_opportunity_score != null ? `${dna.agency_opportunity_score}/100` : null,
          },
          {
            label: 'Agency Opportunity Band',
            value: dna.agency_opportunity_band,
            specialClass: opportunityBandColor(dna.agency_opportunity_band),
          },
        ],
      },
    ];
  }, [dna]);

  // ── empty states ──

  if (!selectedAssessment) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">No assessment selected.</p>
      </div>
    );
  }

  if (!dna) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          No Creator DNA profile available. A report must be generated before the
          DNA profile is persisted. The computed intelligence DNA from the
          current assessment snapshot will appear here once available.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      {dna.summary && (
        <div className="bg-surface-2 rounded-lg p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Summary
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">{dna.summary}</p>
        </div>
      )}

      {/* DNA groups */}
      {groups.map(group => (
        <DnaGroup
          key={group.title}
          title={group.title}
          items={group.items}
          expanded={expandedGroup === group.title}
          onToggle={() =>
            setExpandedGroup(expandedGroup === group.title ? null : group.title)
          }
        />
      ))}

      {/* Authenticity Flags warning */}
      {dna.authenticity_flags && dna.authenticity_flags.length > 0 && (
        <div className="border border-warn/30 bg-warn/10 rounded-lg p-4">
          <div className="text-xs font-semibold text-warn mb-2">Inconsistency Flags</div>
          <ul className="space-y-1">
            {dna.authenticity_flags.map(flag => (
              <li key={flag} className="text-xs text-gray-700">&bull; {flag}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
