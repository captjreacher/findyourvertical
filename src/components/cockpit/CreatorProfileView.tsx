import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCreatorProfile,
  getAssessmentsForProfile,
  getCreatorDnaProfilesForProfile,
  getReportsForProfile,
  getNotesForProfile,
  getStatusEventsForProfile,
  addCreatorNote,
  updateCreatorStatus,
} from '@/lib/creators-api';
import type { CreatorProfile, CreatorAssessment, CreatorDnaProfile, CreatorReport, CreatorNote, CreatorStatusEvent, CreatorStatus, ReportData } from '@/types/creator';

const STATUS_LABELS: Record<CreatorStatus, string> = {
  prospect: 'Prospect',
  assessed: 'Assessed',
  qualified: 'Qualified',
  interviewed: 'Interviewed',
  accepted: 'Accepted',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  offboarded: 'Offboarded',
};

const NEXT_STATUS: Record<CreatorStatus, { next: CreatorStatus; event: string; label: string }[]> = {
  prospect: [
    { next: 'assessed', event: 'assessment_reviewed', label: 'Mark Assessed' },
  ],
  assessed: [
    { next: 'qualified', event: 'qualified', label: 'Qualify' },
  ],
  qualified: [
    { next: 'interviewed', event: 'interviewed', label: 'Interviewed' },
  ],
  interviewed: [
    { next: 'accepted', event: 'accepted', label: 'Accept' },
  ],
  accepted: [
    { next: 'onboarding', event: 'onboarding_started', label: 'Start Onboarding' },
  ],
  onboarding: [
    { next: 'active', event: 'activated', label: 'Activate' },
  ],
  active: [
    { next: 'paused', event: 'paused', label: 'Pause' },
  ],
  paused: [
    { next: 'active', event: 'reactivated', label: 'Reactivate' },
  ],
  offboarded: [],
};

function InternalScoreCard({ label, score, inverse = false }: { label: string; score: number | null | undefined; inverse?: boolean }) {
  const value = score ?? 0;
  const good = inverse ? value <= 40 : value >= 70;
  const mid = inverse ? value <= 65 : value >= 45;
  const color = good ? 'text-success' : mid ? 'text-warn' : 'text-pink';

  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function AgencyQualificationPanel({ report }: { report: CreatorReport | undefined }) {
  const data = report?.report_json as Partial<ReportData> | undefined;
  const scores = data?.internal_agency_scores;
  const recommendation = data?.agency_recommendation;

  if (!scores && !recommendation) {
    return (
      <div className="bg-surface border border-gray-800 rounded-xl p-5">
        <h2 className="font-display font-semibold text-lg mb-2">Agency Qualification</h2>
        <p className="text-sm text-gray-600">No internal agency qualification data stored for this report yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-accent/20 rounded-xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg">Agency Qualification</h2>
          {recommendation?.agency_priority && (
            <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
              {recommendation.agency_priority} priority
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-accent">{scores?.agency_opportunity ?? 0}</div>
          <div className="text-xs text-gray-500">Agency Opportunity</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InternalScoreCard label="Management Readiness" score={scores?.management_readiness} />
        <InternalScoreCard label="Commercial Potential" score={scores?.commercial_potential} />
        <InternalScoreCard label="Coachability" score={scores?.coachability} />
        <InternalScoreCard label="Brand Risk" score={scores?.brand_risk} inverse />
      </div>

      {recommendation && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Recommended Next Action</div>
            <p className="mt-1 text-sm text-gray-300">{recommendation.recommended_next_action}</p>
          </div>
          <p className="text-sm text-gray-400">{recommendation.management_fit_summary}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-pink/20 bg-pink/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-pink">Risk Notes</div>
              <ul className="mt-2 space-y-1.5">
                {recommendation.risk_notes.map(note => (
                  <li key={note} className="text-xs text-gray-300">{note}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-success">Opportunity Notes</div>
              <ul className="mt-2 space-y-1.5">
                {recommendation.opportunity_notes.map(note => (
                  <li key={note} className="text-xs text-gray-300">{note}</li>
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
  const [notes, setNotes] = useState<CreatorNote[]>([]);
  const [events, setEvents] = useState<CreatorStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [statusLoading, setStatusLoading] = useState('');

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      getCreatorProfile(profileId),
      getAssessmentsForProfile(profileId),
      getCreatorDnaProfilesForProfile(profileId),
      getReportsForProfile(profileId),
      getNotesForProfile(profileId),
      getStatusEventsForProfile(profileId),
    ]).then(([p, a, d, r, n, e]) => {
      setProfile(p);
      setAssessments(a);
      setDnaProfiles(d);
      setReports(r);
      setNotes(n);
      setEvents(e);
      setLoading(false);
    });
  }, [profileId]);

  const handleAddNote = async () => {
    if (!profileId || !noteText.trim()) return;
    const note = await addCreatorNote(profileId, noteText.trim());
    if (note) {
      setNotes(prev => [note, ...prev]);
      setNoteText('');
    }
  };

  const handleStatusChange = async (next: CreatorStatus, event: string) => {
    if (!profileId) return;
    setStatusLoading(event);
    await updateCreatorStatus(profileId, next, event);
    setProfile(prev => prev ? { ...prev, status: next } : prev);
    setEvents(prev => [
      {
        id: crypto.randomUUID(),
        creator_profile_id: profileId,
        created_at: new Date().toISOString(),
        event_type: event,
        details: {},
      },
      ...prev,
    ]);
    setStatusLoading('');
  };

  if (loading) return <div className="animate-pulse text-gray-500 p-4">Loading profile...</div>;
  if (!profile) return <div className="text-gray-500 p-4">Creator not found.</div>;

  const scoreCards: Array<[string, number]> = [
    ['Creator DNA', profile.creator_dna_score ?? 0],
    ['Brand Clarity', profile.brand_clarity_score ?? 0],
    ['Monetisation', profile.monetisation_score ?? 0],
    ['Consistency', profile.consistency_score ?? 0],
    ['Agency Opportunity', profile.agency_opportunity_score ?? 0],
  ];
  const latestDna = dnaProfiles[0];
  const latestReport = reports[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/cockpit/creators')} className="text-xs text-gray-500 hover:text-gray-300 mb-2 inline-block">← Back to pipeline</button>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">{profile.full_name}</h1>
            <p className="text-gray-500 text-sm">{profile.email} · {profile.country}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface-3 text-gray-300 capitalize">
              {profile.status}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent/20 text-accent">
              {profile.management_readiness ?? '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scores */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-4">Scores</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {scoreCards.map(([label, score]) => (
                <div key={label} className="bg-surface-2 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold ${score >= 60 ? 'text-success' : score >= 40 ? 'text-warn' : 'text-pink'}`}>{score}</div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <AgencyQualificationPanel report={latestReport} />

          {/* Creator DNA */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-semibold text-lg">Creator DNA</h2>
              {latestDna && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent/20 text-accent">
                  {latestDna.agency_opportunity_band}
                </span>
              )}
            </div>
            {!latestDna ? (
              <p className="text-sm text-gray-600">No DNA profile generated yet.</p>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-gray-300">{latestDna.summary}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">DNA</div>
                    <div className="text-sm font-semibold text-gray-100">{latestDna.creator_dna_primary}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Secondary: {latestDna.creator_dna_secondary} · {latestDna.confidence}% confidence
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Archetype</div>
                    <div className="text-sm font-semibold text-gray-100">{latestDna.fantasy_archetype}</div>
                    <div className="text-xs text-gray-500 mt-1">{latestDna.archetype_confidence}% confidence</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Authenticity</div>
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
                    <div className="text-xs text-gray-500 mb-1">Monetisation Readiness</div>
                    <div className="text-sm font-semibold text-gray-100">{latestDna.monetisation_readiness}</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Agency Opportunity</div>
                    <div className="text-sm font-semibold text-gray-100">{latestDna.agency_opportunity_score}/100</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-2">Growth Constraints</div>
                    <div className="flex flex-wrap gap-1.5">
                      {latestDna.growth_constraints.map(constraint => (
                        <span key={constraint} className="px-2 py-1 rounded-full bg-surface-3 text-xs text-gray-300">
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
                        <li key={flag} className="text-xs text-gray-300">{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top Verticals */}
          {profile.top_vertical_1 && (
            <div className="bg-surface border border-gray-800 rounded-xl p-5">
              <h2 className="font-display font-semibold text-lg mb-3">Top Content Verticals</h2>
              <div className="flex flex-wrap gap-2">
                {[profile.top_vertical_1, profile.top_vertical_2, profile.top_vertical_3].filter(Boolean).map((v, i) => (
                  <span key={v} className="px-3 py-1.5 rounded-full text-sm bg-surface-3 text-gray-300">
                    {i + 1}. {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reports */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-3">Reports ({reports.length})</h2>
            {reports.length === 0 ? (
              <p className="text-sm text-gray-600">No reports yet.</p>
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
                      <span className="text-sm text-gray-200">Report v{r.version}</span>
                      <span className="text-xs text-gray-500">{new Date(r.created_at!).toLocaleDateString()}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Assessments */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-3">Assessment History ({assessments.length})</h2>
            {assessments.length === 0 ? (
              <p className="text-sm text-gray-600">No assessments yet.</p>
            ) : (
              <div className="space-y-2">
                {assessments.map(a => (
                  <div key={a.id} className="bg-surface-2 rounded-lg px-4 py-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-300">Score: {a.agency_opportunity_score ?? '-'}</span>
                      <span className="text-xs text-gray-500">{new Date(a.created_at!).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="space-y-6">
          {/* Status Transitions */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-3">Actions</h2>
            <div className="space-y-2">
              {(NEXT_STATUS[profile.status] ?? []).map(({ next, event, label }) => (
                <button
                  key={event}
                  onClick={() => handleStatusChange(next, event)}
                  disabled={statusLoading === event}
                  className="w-full px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {statusLoading === event ? '...' : label}
                </button>
              ))}
              {profile.status !== 'offboarded' && (
                <button
                  onClick={() => handleStatusChange('offboarded', 'offboarded')}
                  disabled={statusLoading === 'offboarded'}
                  className="w-full px-4 py-2 rounded-lg bg-pink/10 border border-pink/30 text-pink hover:bg-pink/20 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Offboard
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-3">Agency Notes</h2>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {notes.length === 0 && <p className="text-sm text-gray-600">No notes yet.</p>}
              {notes.map(n => (
                <div key={n.id} className="bg-surface-2 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-300">{n.note}</p>
                  <p className="text-xs text-gray-600 mt-1">{new Date(n.created_at!).toLocaleString()}</p>
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
                className="flex-1 bg-surface-2 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="px-3 py-2 rounded-lg bg-accent text-gray-950 text-sm font-semibold disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-3">Timeline</h2>
            <div className="space-y-3">
              {events.length === 0 && <p className="text-sm text-gray-600">No events yet.</p>}
              {events.map(e => (
                <div key={e.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 capitalize">{e.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-600">{new Date(e.created_at!).toLocaleString()}</p>
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
