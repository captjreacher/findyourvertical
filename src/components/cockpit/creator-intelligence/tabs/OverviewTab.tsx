// ── Overview Tab ──
// Sprint FYV-3.2A: the only tab with real data — creator metadata,
// assessment summary, overall scores, archetype, top vertical, status.

import { useCreatorIntelligence } from '../context';

export function OverviewTab() {
  const {
    profile,
    selectedAssessment,
    intelligence,
    storedReport,
    dnaProfiles,
  } = useCreatorIntelligence();

  const dna = dnaProfiles[0];
  const templateName =
    selectedAssessment?.assessment_snapshot?.template_name ??
    selectedAssessment?.template_slug ??
    'Default';

  const primaryArchetype =
    intelligence?.archetype_fits?.[0]?.archetype ??
    profile.archetype ??
    '-';

  const topVertical =
    intelligence?.report?.top_verticals?.[0]?.name ??
    profile.top_vertical_1 ??
    '-';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Creator info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2">Creator</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Name', profile.full_name],
            ['Email', profile.email ?? '-'],
            ['Status', profile.status],
            ['Archetype', primaryArchetype],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-charcoal-2">{label}</div>
              <div className="text-sm font-semibold text-charcoal mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Assessment info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2">Assessment</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Date', selectedAssessment ? new Date(selectedAssessment.created_at).toLocaleString() : '-'],
            ['Template', templateName],
            ['Version', storedReport?.version ?? '1.0'],
            ['Report Tier', storedReport?.report_tier ?? 'free'],
            ['DNA Confidence', dna ? `${dna.confidence}%` : '-'],
            ['Invite Code', selectedAssessment?.invite_code ?? '-'],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-charcoal-2">{label}</div>
              <div className="text-sm font-semibold text-charcoal mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

{/* Overall Scores */}
<div className="md:col-span-2">
  <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2 mb-3">
    Overall Scores
  </h3>

  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
    {[
      ['Creator DNA', profile.creator_dna_score],
      ['Brand Clarity', profile.brand_clarity_score],
      ['Monetisation', profile.monetisation_score],
      ['Consistency', profile.consistency_score],
      ['Agency Opp.', profile.agency_opportunity_score],
    ].map(([label, score]) => {
      const numericScore = Number(score ?? 0);

      return (
        <div key={label} className="bg-surface-2 rounded-lg p-3 text-center">
          <div
            className={`text-xl font-bold ${
              numericScore >= 60
                ? 'text-success'
                : numericScore >= 40
                  ? 'text-warn'
                  : 'text-pink'
            }`}
          >
            {score ?? '-'}
          </div>
          <div className="text-[10px] text-charcoal-2 mt-1 leading-tight">
            {label}
          </div>
        </div>
      );
    })}
  </div>
</div>

      <div className="text-[10px] text-charcoal-2 mt-1 leading-tight">
      </div>
      );
  
      {/* Primary Archetype + Top Vertical */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2 mb-3">Primary Archetype</h3>
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-lg font-bold text-charcoal">{primaryArchetype}</div>
          {intelligence?.archetype_fits?.[0] && (
            <div className="mt-2 flex items-center gap-3 text-xs text-charcoal-2">
              <span>Fit: {intelligence.archetype_fits[0].fit_score}%</span>
              <span>Confidence: {intelligence.archetype_fits[0].confidence}%</span>
              <span className="capitalize">
                {intelligence.archetype_fits[0].validation_status.replace(/_/g, ' ')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2 mb-3">Top Vertical</h3>
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="text-lg font-bold text-charcoal">{topVertical}</div>
          {intelligence?.report?.top_verticals?.[0]?.rationale && (
            <p className="mt-1 text-xs text-charcoal-2">
              {intelligence.report.top_verticals[0].rationale}
            </p>
          )}
        </div>
      </div>

      {/* Status summary */}
      <div className="md:col-span-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-2 mb-2">Status Summary</h3>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal">
            Stored: {storedReport ? storedReport.report_tier ?? 'free' : 'none'}
          </span>
          {storedReport?.premium_report_available && (
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
              Premium available
            </span>
          )}
          {storedReport?.premium_report_generated && (
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              Premium generated
            </span>
          )}
          {dna && (
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
              DNA: {dna.confidence}%
            </span>
          )}
          <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal">
            Evidence: {intelligence?.evidence?.length ?? 0} signals
          </span>
          <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal">
            Traits: {intelligence?.traits?.length ?? 0} inferred
          </span>
        </div>
      </div>
    </div>
  );
}
