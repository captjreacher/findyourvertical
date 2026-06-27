// ── CreatorIntelligence (orchestrator) ──
// Sprint FYV-3.2A: loads creator data, computes intelligence once,
// provides it via context, and renders the tab system.

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCreatorProfile,
  getAssessmentsForProfile,
  getCreatorDnaProfilesForProfile,
  getReportsForProfile,
  getStatusEventsForProfile,
  getNotesForProfile,
} from '@/lib/creators-api';
import { createCreatorIntelligenceResult, buildReportFromCreatorDna } from '@/lib/creator-intelligence';
import { scoreAssessment } from '@/lib/scoring';
import type { CreatorAssessment, CreatorIntelligenceResult, ReportTier, ReportData } from '@/types/creator';
import { CreatorIntelligenceContext } from './context';
import { COCKPIT_TABS, type TabId } from './types';
import { OverviewTab } from './tabs/OverviewTab';
import { ResponsesTab } from './tabs/ResponsesTab';
import { EvidenceTab } from './tabs/EvidenceTab';
import { TraitsTab } from './tabs/TraitsTab';
import { ArchetypesTab } from './tabs/ArchetypesTab';
import { DnaTab } from './tabs/DnaTab';
import { ReportTab } from './tabs/ReportTab';
import { AgencyTab } from './tabs/AgencyTab';
import { TimelineTab } from './tabs/TimelineTab';

const TAB_COMPONENTS: Record<TabId, React.FC> = {
  overview: OverviewTab,
  responses: ResponsesTab,
  evidence: EvidenceTab,
  traits: TraitsTab,
  archetypes: ArchetypesTab,
  dna: DnaTab,
  report: ReportTab,
  agency: AgencyTab,
  timeline: TimelineTab,
};

export function CreatorIntelligence() {
  const { profileId } = useParams<{ profileId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>('overview');

  // ── data loading ──
  const [profile, setProfile] = useState<CreatorIntelligenceResult | null>(null);
  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [dnaProfiles, setDnaProfiles] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedAssessmentId, setSelectedAssessmentId] = useState(searchParams.get('assessmentId') ?? '');
  const [previewTier, setPreviewTier] = useState<ReportTier | null>(null);

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      getCreatorProfile(profileId),
      getAssessmentsForProfile(profileId),
      getCreatorDnaProfilesForProfile(profileId),
      getReportsForProfile(profileId),
      getStatusEventsForProfile(profileId),
      getNotesForProfile(profileId),
    ])
      .then(([p, a, d, r, e, n]) => {
        setProfile(p as any);
        setAssessments(a);
        setDnaProfiles(d);
        setReports(r);
        setEvents(e);
        setNotes(n);
        if (!selectedAssessmentId && a.length > 0) {
          setSelectedAssessmentId(a[0].id);
        }
      })
      .catch(() => setError('Unable to load creator intelligence data.'))
      .finally(() => setLoading(false));
  }, [profileId]);

  // ── derived state ──

  const selectedAssessment = useMemo(
    () => assessments.find(a => a.id === selectedAssessmentId) ?? null,
    [assessments, selectedAssessmentId],
  );

  const intelligence = useMemo<CreatorIntelligenceResult | null>(() => {
    if (!selectedAssessment?.responses) return null;
    const questions = selectedAssessment.assessment_snapshot?.question_snapshot ?? [];
    try {
      return createCreatorIntelligenceResult({
        creatorProfileId: profileId!,
        assessmentId: selectedAssessment.id,
        responses: selectedAssessment.responses,
        questions,
        reportTier: 'free',
      });
    } catch {
      return null;
    }
  }, [selectedAssessment, profileId]);

  const storedReport = useMemo(
    () => reports.find(r => r.id === selectedAssessment?.id || r.creator_profile_id === profileId) ?? reports[0] ?? null,
    [reports, selectedAssessment, profileId],
  );

  const tierReport = useMemo<ReportData | null>(() => {
    if (!intelligence || !previewTier) return null;
    try {
      const legacy = scoreAssessment(selectedAssessment!.responses);
      return buildReportFromCreatorDna({
        legacy,
        dnaProfile: intelligence.creator_dna,
        evidence: intelligence.evidence,
        traits: intelligence.traits,
        confidence: intelligence.confidence,
        reportTier: previewTier,
      });
    } catch {
      return null;
    }
  }, [intelligence, previewTier, selectedAssessment]);

  // ── render states ──

  if (loading) return <div className="animate-pulse p-8 text-gray-500">Loading Creator Intelligence...</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!profile) return <div className="p-4 text-sm text-gray-600">Creator not found.</div>;

  const templateName = selectedAssessment?.assessment_snapshot?.template_name
    ?? selectedAssessment?.template_slug
    ?? 'Default';

  const ctxValue = useMemo(
    () => ({
      profile: profile as any,
      assessments,
      dnaProfiles,
      reports,
      notes,
      events,
      selectedAssessment,
      setSelectedAssessmentId,
      intelligence,
      storedReport,
      previewTier,
      setPreviewTier,
      tierReport,
    }),
    [profile, assessments, dnaProfiles, reports, notes, events,
      selectedAssessment, intelligence, storedReport, previewTier, tierReport],
  );

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <CreatorIntelligenceContext.Provider value={ctxValue}>
      <div className="cockpit-page">
        <header className="cockpit-page-header">
          <div>
            <button
              onClick={() => navigate(`/cockpit/creators/${profileId}`)}
              className="mb-2 inline-block text-xs font-medium text-gray-500 transition-colors hover:text-accent"
            >
              &larr; Back to Creator
            </button>
            <p className="cockpit-eyebrow">Creator Intelligence</p>
            <h1 className="cockpit-title">{(profile as any).full_name}</h1>
            <p className="cockpit-subtitle">
              {templateName}
              {' · '}
              {selectedAssessment ? new Date(selectedAssessment.created_at).toLocaleDateString() : 'No assessment'}
              {' · '}
              {intelligence ? `${intelligence.evidence.length} evidence signals` : 'No data'}
            </p>
          </div>
          {assessments.length > 1 && (
            <select
              value={selectedAssessmentId}
              onChange={e => setSelectedAssessmentId(e.target.value)}
              className="field-control text-sm"
            >
              {assessments.map(a => (
                <option key={a.id} value={a.id}>
                  {new Date(a.created_at).toLocaleDateString()} — {a.assessment_snapshot?.template_name ?? a.template_slug ?? 'Assessment'}
                </option>
              ))}
            </select>
          )}
        </header>

        {/* Tab bar */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {COCKPIT_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="cockpit-card-pad">
          <ActiveTab />
        </div>

        {/* Debug warning */}
        {!intelligence && selectedAssessment && (
          <div className="mt-4 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
            Client-side intelligence recomputation failed or returned no data.
            The assessment snapshot may be incomplete.
          </div>
        )}
      </div>
    </CreatorIntelligenceContext.Provider>
  );
}
