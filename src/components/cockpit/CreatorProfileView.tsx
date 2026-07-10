import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getCreatorProfile,
  getAssessmentsForProfile,
  getCreatorDnaProfilesForProfile,
  getReportsForProfile,
  getInvitesForProfile,
  getNotesForProfile,
  getStatusEventsForProfile,
  addCreatorNote,
  updateCreatorQualification,
  updateCreatorServiceQualification,
  updateCreatorStatus,
} from '@/lib/creators-api';
import type {
  CreatorProfile,
  CreatorAssessment,
  CreatorDnaProfile,
  CreatorReport,
  CreatorNote,
  CreatorStatusEvent,
  CreatorAssessmentInviteLink,
  CreatorStatus,
  ManagementWraparoundPotential,
  ReportData,
  ServiceQualification,
  ServiceQualificationKey,
  ServiceQualificationStatus,
} from '@/types/creator';

const WORKFLOW_STATUSES: CreatorStatus[] = [
  'New',
  'Invited',
  'Started',
  'Completed',
  'Interested',
  'Qualified',
  'Meeting Booked',
  'Client',
  'Declined',
];

const WRAPAROUND_OPTIONS: ManagementWraparoundPotential[] = ['Yes', 'No', 'Not Yet'];

const SERVICE_STATUS_OPTIONS: ServiceQualificationStatus[] = [
  'Not Interested',
  'Not Suitable',
  'Future Opportunity',
  'Qualified',
  'Active Client',
];

const SERVICES: Array<{ key: ServiceQualificationKey; label: string }> = [
  { key: 'financial_advice', label: 'Financial Advice' },
  { key: 'business_mentoring', label: 'Business Mentoring' },
  { key: 'content_vertical_sprint', label: 'Content Vertical Sprint' },
  { key: 'chat_automation', label: 'Chat Automation' },
  { key: 'social_extension', label: 'Social Extension' },
  { key: 'platform_extension', label: 'Platform Extension' },
  { key: 'management_package', label: 'Management Package' },
];

const DEFAULT_SERVICE_QUALIFICATION: ServiceQualification = {
  financial_advice: 'Not Interested',
  business_mentoring: 'Not Interested',
  content_vertical_sprint: 'Not Interested',
  chat_automation: 'Not Interested',
  social_extension: 'Not Interested',
  platform_extension: 'Not Interested',
  management_package: 'Not Interested',
};

function scoreInputValue(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(10, parsed));
}

function InternalScoreCard({ label, score, inverse = false }: { label: string; score: number | null | undefined; inverse?: boolean }) {
  const value = score ?? 0;
  const good = inverse ? value <= 40 : value >= 70;
  const mid = inverse ? value <= 65 : value >= 45;
  const color = good ? 'text-success' : mid ? 'text-warn' : 'text-pink';

  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-charcoal-2 mt-1">{label}</div>
    </div>
  );
}

function AgencyQualificationPanel({ report }: { report: CreatorReport | undefined }) {
  const data = report?.report_json as Partial<ReportData> | undefined;
  const scores = data?.internal_agency_scores;
  const recommendation = data?.agency_recommendation;

  if (!scores && !recommendation) {
    return (
      <div className="cockpit-card-pad">
        <h2 className="cockpit-section-title mb-2">Agency Qualification</h2>
        <p className="text-sm text-charcoal-2">No internal agency qualification data stored for this report yet.</p>
      </div>
    );
  }

  return (
    <div className="cockpit-card-pad border-accent/30">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="cockpit-section-title">Agency Qualification</h2>
          {recommendation?.agency_priority && (
            <p className="mt-1 text-xs uppercase tracking-wide text-charcoal-2">
              {recommendation.agency_priority} priority
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-accent">{scores?.agency_opportunity ?? 0}</div>
          <div className="text-xs text-charcoal-2">Agency Opportunity</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <InternalScoreCard label="Agency Opportunity" score={scores?.agency_opportunity} />
        <InternalScoreCard label="Commercial Potential" score={scores?.commercial_potential} />
        <InternalScoreCard label="Management Readiness" score={scores?.management_readiness} />
        <InternalScoreCard label="Coachability" score={scores?.coachability} />
        <InternalScoreCard label="Ambition" score={scores?.ambition} />
        <InternalScoreCard label="Innovation" score={scores?.innovation} />
        <InternalScoreCard label="Parasocial Strength" score={scores?.parasocial_strength} />
        <InternalScoreCard label="Brand Risk" score={scores?.brand_risk} inverse />
        <InternalScoreCard label="Scalability" score={scores?.scalability} />
      </div>

      {recommendation && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Recommended Next Action</div>
            <p className="mt-1 text-sm text-charcoal-2">{recommendation.recommended_next_action}</p>
          </div>
          <p className="text-sm text-charcoal-2">{recommendation.management_fit_summary}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-pink/20 bg-pink/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-pink">Risk Notes</div>
              <ul className="mt-2 space-y-1.5">
                {recommendation.risk_notes.map(note => (
                  <li key={note} className="text-xs text-charcoal-2">{note}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-success">Opportunity Notes</div>
              <ul className="mt-2 space-y-1.5">
                {recommendation.opportunity_notes.map(note => (
                  <li key={note} className="text-xs text-charcoal-2">{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CreatorProfileView() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [dnaProfiles, setDnaProfiles] = useState<CreatorDnaProfile[]>([]);
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [invites, setInvites] = useState<CreatorAssessmentInviteLink[]>([]);
  const [notes, setNotes] = useState<CreatorNote[]>([]);
  const [events, setEvents] = useState<CreatorStatusEvent[]>([]);
  const [assessmentTemplateFilter, setAssessmentTemplateFilter] = useState('');
  const [assessmentCreatorFilter, setAssessmentCreatorFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [statusLoading, setStatusLoading] = useState('');
  const [qualificationSaving, setQualificationSaving] = useState('');

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      getCreatorProfile(profileId),
      getAssessmentsForProfile(profileId),
      getCreatorDnaProfilesForProfile(profileId),
      getReportsForProfile(profileId),
      getInvitesForProfile(profileId),
      getNotesForProfile(profileId),
      getStatusEventsForProfile(profileId),
    ])
      .then(([p, a, d, r, i, n, e]) => {
        setProfile(p);
        setAssessments(a);
        setDnaProfiles(d);
        setReports(r);
        setInvites(i);
        setNotes(n);
        setEvents(e);
      })
      .catch(() => setLoadError('Unable to load this creator profile. Return to the pipeline and try again.'))
      .finally(() => setLoading(false));
  }, [profileId]);

  const handleAddNote = async () => {
    if (!profileId || !noteText.trim()) return;
    const note = await addCreatorNote(profileId, noteText.trim());
    if (note) {
      setNotes(prev => [note, ...prev]);
      setNoteText('');
    }
  };

  const refreshEvents = async () => {
    if (!profileId) return;
    const refreshedEvents = await getStatusEventsForProfile(profileId);
    setEvents(refreshedEvents);
  };

  const handleStatusChange = async (next: CreatorStatus) => {
    if (!profileId || profile?.status === next) return;
    setStatusLoading(next);
    try {
      await updateCreatorStatus(profileId, next);
      setProfile(prev => prev ? { ...prev, status: next } : prev);
      await refreshEvents();
    } finally {
      setStatusLoading('');
    }
  };

  const updateQualificationField = async (
    field: 'business_acumen' | 'coachability' | 'management_wraparound_potential',
    value: number | ManagementWraparoundPotential | null
  ) => {
    if (!profileId) return;
    setQualificationSaving(field);
    try {
      const updatedProfile = await updateCreatorQualification(profileId, { [field]: value });
      setProfile(updatedProfile);
      await refreshEvents();
    } finally {
      setQualificationSaving('');
    }
  };

  const updateServiceStatus = async (service: ServiceQualificationKey, status: ServiceQualificationStatus) => {
    if (!profile) return;
    setQualificationSaving(service);
    try {
      const updatedProfile = await updateCreatorServiceQualification({
        ...profile,
        service_qualification: profile.service_qualification ?? DEFAULT_SERVICE_QUALIFICATION,
      }, service, status);
      setProfile(updatedProfile);
      await refreshEvents();
    } finally {
      setQualificationSaving('');
    }
  };

  if (loading) return <div className="animate-pulse p-4 text-charcoal-2">Loading Profile...</div>;
  if (loadError) return <div className="rounded-lg border border-pink/30 bg-pink/10 p-4 text-sm text-pink">{loadError}</div>;
  if (!profile) return <div className="rounded-lg border border-white/10 bg-surface p-4 text-sm text-charcoal-2">Creator not found.</div>;

  const scoreCards: Array<[string, number]> = [
    ['Creator DNA', profile.creator_dna_score ?? 0],
    ['Brand Clarity', profile.brand_clarity_score ?? 0],
    ['Monetisation', profile.monetisation_score ?? 0],
    ['Consistency', profile.consistency_score ?? 0],
    ['Agency Opportunity', profile.agency_opportunity_score ?? 0],
    ['Business Acumen', profile.business_acumen ?? 0],
    ['Coachability', profile.coachability ?? 0],
  ];
  const scoreColorFor = (label: string, score: number): string => {
    if (label === 'Business Acumen' || label === 'Coachability') {
      return score >= 8 ? 'text-success' : score >= 5 ? 'text-warn' : 'text-pink';
    }
    return score >= 60 ? 'text-success' : score >= 40 ? 'text-warn' : 'text-pink';
  };
  const serviceQualification = profile.service_qualification ?? DEFAULT_SERVICE_QUALIFICATION;
  const latestDna = dnaProfiles[0];
  const latestReport = reports[0];
  const templateNameFor = (assessment: CreatorAssessment): string => (
    assessment.assessment_snapshot?.template_name
    ?? assessment.template_slug
    ?? 'Default Creator Assessment'
  );
  const templateFilterOptions = useMemo(
    () => Array.from(new Set(assessments.map(templateNameFor))).sort(),
    [assessments]
  );
  const creatorFilterOptions = useMemo(
    () => Array.from(new Set(assessments.map(a => a.creator_name).filter((value): value is string => Boolean(value)))).sort(),
    [assessments]
  );
  const visibleAssessments = useMemo(() => assessments.filter(assessment => {
    const templateMatches = !assessmentTemplateFilter || templateNameFor(assessment) === assessmentTemplateFilter;
    const creatorMatches = !assessmentCreatorFilter || assessment.creator_name === assessmentCreatorFilter;
    return templateMatches && creatorMatches;
  }), [assessments, assessmentCreatorFilter, assessmentTemplateFilter]);

  return (
    <div className="cockpit-page">
      <header className="cockpit-page-header">
        <div>
          <button onClick={() => navigate('/cockpit/creators')} className="mb-2 inline-block text-xs font-medium text-charcoal-2 transition-colors hover:text-accent">&lt;- Back to pipeline</button>
          <p className="cockpit-eyebrow">Creator Profile</p>
          <h1 className="cockpit-title">{profile.full_name}</h1>
          <p className="cockpit-subtitle">{[profile.email, profile.onlyfans_handle ? `@${profile.onlyfans_handle}` : null, profile.country].filter(Boolean).join(' / ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick actions — reuse existing routes/components (no duplicate viewers). */}
          <Link to={`/cockpit/creators/${profile.id}`} className="btn-secondary text-xs">
            Profile
          </Link>
          <Link to={`/cockpit/creators/${profile.id}/intelligence?tab=responses`} className="btn-secondary text-xs">
            Raw Responses
          </Link>
          <Link to={`/cockpit/creators/${profile.id}/intelligence?tab=overview`} className="btn-primary text-xs">
            Intelligence
          </Link>
          {latestReport ? (
            <a
              href={`#/report/${latestReport.report_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              Report
            </a>
          ) : (
            <span
              className="btn-secondary cursor-not-allowed text-xs opacity-50"
              aria-disabled="true"
              title="No report available"
            >
              Report
            </span>
          )}
          <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold capitalize text-charcoal">
            {profile.status}
          </span>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            {profile.management_readiness ?? '-'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scorecard */}
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-4">Profile Details</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">Model Name</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{profile.model_name ?? '-'}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">OnlyFans Handle</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{profile.onlyfans_handle ? `@${profile.onlyfans_handle}` : '-'}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">Location</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{[profile.city, profile.country].filter(Boolean).join(', ') || '-'}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">Agency Interest</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{profile.follow_up_reason === 'strategy_discussion_requested' || profile.status === 'Interested' ? 'Yes' : '-'}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">Lifecycle Status</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{profile.status}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="text-xs text-charcoal-2">Last Updated</div>
                <div className="mt-1 text-sm font-semibold text-charcoal">{new Date(profile.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-3">Invite History ({invites.length})</h2>
            {invites.length === 0 ? (
              <p className="text-sm text-charcoal-2">No invites created for this creator yet.</p>
            ) : (
              <div className="table-shell overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Invite Code</th>
                      <th>Email</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map(invite => (
                      <tr key={invite.id}>
                        <td className="text-xs text-charcoal-2">{new Date(invite.created_at).toLocaleDateString()}</td>
                        <td className="text-charcoal-2">{invite.status ?? '-'}</td>
                        <td className="text-charcoal-2">{invite.invite_code}</td>
                        <td className="text-charcoal-2">{invite.creator_email ?? '-'}</td>
                        <td className="text-charcoal-2">{invite.notes ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Scorecard */}
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-4">Scorecard</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {scoreCards.map(([label, score]) => (
                <div key={label} className="bg-surface-2 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${scoreColorFor(label, score)}`}>{score}</div>
                  <div className="text-xs text-charcoal-2 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-4">Qualification</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal-2">Business Acumen</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={profile.business_acumen ?? ''}
                  onChange={e => updateQualificationField('business_acumen', scoreInputValue(e.target.value))}
                  disabled={qualificationSaving === 'business_acumen'}
                  className="field-control w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal-2">Coachability</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={profile.coachability ?? ''}
                  onChange={e => updateQualificationField('coachability', scoreInputValue(e.target.value))}
                  disabled={qualificationSaving === 'coachability'}
                  className="field-control w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal-2">Management Wraparound Potential</span>
                <select
                  value={profile.management_wraparound_potential ?? ''}
                  onChange={e => updateQualificationField('management_wraparound_potential', e.target.value ? e.target.value as ManagementWraparoundPotential : null)}
                  disabled={qualificationSaving === 'management_wraparound_potential'}
                  className="field-control w-full"
                >
                  <option value="">Unqualified</option>
                  {WRAPAROUND_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
          </div>

          <AgencyQualificationPanel report={latestReport} />

          {/* Creator DNA */}
          <div className="cockpit-card-pad">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="cockpit-section-title">Creator DNA</h2>
              {latestDna && (
                <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                  {latestDna.agency_opportunity_band}
                </span>
              )}
            </div>
            {!latestDna ? (
              <p className="text-sm text-charcoal-2">No DNA profile generated yet.</p>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-charcoal-2">{latestDna.summary}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-1">DNA</div>
                    <div className="text-sm font-semibold text-charcoal">{latestDna.creator_dna_primary}</div>
                    <div className="text-xs text-charcoal-2 mt-1">
                      Secondary: {latestDna.creator_dna_secondary} / {latestDna.confidence}% confidence
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-1">Archetype</div>
                    <div className="text-sm font-semibold text-charcoal">{latestDna.fantasy_archetype}</div>
                    <div className="text-xs text-charcoal-2 mt-1">{latestDna.archetype_confidence}% confidence</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-1">Authenticity</div>
                    <div className={`text-sm font-semibold ${
                      latestDna.authenticity_band === 'High Authenticity'
                        ? 'text-success'
                        : latestDna.authenticity_band === 'Moderate Authenticity'
                          ? 'text-warn'
                          : 'text-pink'
                    }`}>
                      {latestDna.authenticity_band}
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-1">Monetisation Readiness</div>
                    <div className="text-sm font-semibold text-charcoal">{latestDna.monetisation_readiness}</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-1">Agency Opportunity</div>
                    <div className="text-sm font-semibold text-charcoal">{latestDna.agency_opportunity_score}/100</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-charcoal-2 mb-2">Growth Constraints</div>
                    <div className="flex flex-wrap gap-1.5">
                      {latestDna.growth_constraints.map(constraint => (
                        <span key={constraint} className="px-2 py-1 rounded-full bg-surface-3 text-xs text-charcoal">
                          {constraint}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {latestDna.authenticity_flags.length > 0 && (
                  <div className="border border-warn/30 bg-warn/10 rounded-lg p-3">
                    <div className="text-xs font-semibold text-warn mb-2">Inconsistency Flags</div>
                    <ul className="space-y-1">
                      {latestDna.authenticity_flags.map(flag => (
                        <li key={flag} className="text-xs text-charcoal-2">{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="cockpit-card-pad">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="cockpit-section-title">Service Qualification</h2>
                <p className="mt-1 text-xs text-charcoal-2">Service readiness is logged as signal events when changed.</p>
              </div>
            </div>
            <div className="table-shell overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SERVICES.map(service => (
                    <tr key={service.key}>
                      <td className="font-medium text-charcoal">{service.label}</td>
                      <td>
                        <select
                          value={serviceQualification[service.key]}
                          onChange={e => updateServiceStatus(service.key, e.target.value as ServiceQualificationStatus)}
                          disabled={qualificationSaving === service.key}
                          className="field-control min-w-52"
                        >
                          {SERVICE_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reports */}
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-3">Reports ({reports.length})</h2>
            {reports.length === 0 ? (
              <p className="text-sm text-charcoal-2">No reports yet.</p>
            ) : (
              <div className="space-y-2">
                {reports.map(r => (
                  <a
                    key={r.id}
                    href={`#/report/${r.report_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-surface-2 rounded-lg px-4 py-3 hover:bg-surface-3 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-charcoal">Report v{r.version}</span>
                      <span className="text-xs text-charcoal-2">{new Date(r.created_at!).toLocaleDateString()}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Assessments */}
          <div className="cockpit-card-pad">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="cockpit-section-title">Assessment History ({visibleAssessments.length})</h2>
              <div className="flex flex-wrap gap-2">
                <select value={assessmentTemplateFilter} onChange={e => setAssessmentTemplateFilter(e.target.value)} className="field-control text-xs">
                  <option value="">All templates</option>
                  {templateFilterOptions.map(templateName => <option key={templateName} value={templateName}>{templateName}</option>)}
                </select>
                <select value={assessmentCreatorFilter} onChange={e => setAssessmentCreatorFilter(e.target.value)} className="field-control text-xs">
                  <option value="">All invite creators</option>
                  {creatorFilterOptions.map(creatorName => <option key={creatorName} value={creatorName}>{creatorName}</option>)}
                </select>
              </div>
            </div>
            {assessments.length === 0 ? (
              <p className="text-sm text-charcoal-2">No assessments yet.</p>
            ) : visibleAssessments.length === 0 ? (
              <p className="text-sm text-charcoal-2">No assessments match the current filters.</p>
            ) : (
              <div className="table-shell overflow-x-auto">
                <table className="data-table">
                  <thead className="">
                    <tr>
                      <th>Date</th>
                      <th>Score</th>
                      <th>Template</th>
                      <th>Invite Code</th>
                      <th>Creator Name</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssessments.map(a => (
                      <tr key={a.id}>
                        <td className="text-xs text-charcoal-2">{new Date(a.created_at!).toLocaleDateString()}</td>
                        <td className="text-charcoal-2">{a.agency_opportunity_score ?? '-'}</td>
                        <td className="text-charcoal-2">{templateNameFor(a)}</td>
                        <td className="text-charcoal-2">{a.invite_code ?? '-'}</td>
                        <td className="text-charcoal-2">{a.creator_name ?? '-'}</td>
                        <td>
                          <Link
                            to={`/cockpit/creators/${profile.id}/intelligence?assessmentId=${a.id}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            View Intelligence
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Workflow */}
        <div className="space-y-6">
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-3">Status Workflow</h2>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal-2">Creator Status</span>
              <select
                value={profile.status}
                onChange={e => handleStatusChange(e.target.value as CreatorStatus)}
                disabled={Boolean(statusLoading)}
                className="field-control w-full"
              >
                {WORKFLOW_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            {statusLoading && <p className="mt-2 text-xs text-charcoal-2">Updating workflow...</p>}
          </div>

          {/* Notes */}
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-3">Agency Notes</h2>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {notes.length === 0 && <p className="text-sm text-charcoal-2">No notes yet.</p>}
              {notes.map(n => (
                <div key={n.id} className="bg-surface-2 rounded-lg px-3 py-2">
                  <p className="text-sm text-charcoal-2">{n.note}</p>
                  <p className="text-xs text-charcoal-2 mt-1">{new Date(n.created_at!).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                placeholder="Add a note..."
                className="field-control flex-1"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="btn-primary px-3"
              >
                Add
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="cockpit-card-pad">
            <h2 className="cockpit-section-title mb-3">Timeline</h2>
            <div className="space-y-3">
              {events.length === 0 && <p className="text-sm text-charcoal-2">No events yet.</p>}
              {events.map(e => (
                <div key={e.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                  <div>
                    <p className="text-xs text-charcoal-2 capitalize">{e.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-charcoal-2">{new Date(e.created_at!).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
