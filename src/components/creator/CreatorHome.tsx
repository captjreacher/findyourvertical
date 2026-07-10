import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { signOut } from '@/lib/supabase';
import {
  getAssessmentsForProfile,
  getReportsForProfile,
  createCreatorRetakeInvite,
  requestStrategyDiscussion,
  trackAgencyCalendarClick,
  trackCreatorServicesClick,
  getMyArchetypeSnapshot,
  getMyVariationSelections,
} from '@/lib/creators-api';
import { getCreatorJourneyCtas } from '@/lib/fyv-completion';
import { snapshotToRankedArchetypes, summariseSelectionCompleteness } from '@/lib/persona-archetypes';
import type { CreatorAssessment, CreatorReport } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function templateNameFor(assessment: CreatorAssessment): string {
  return (
    assessment.assessment_snapshot?.template_name
    ?? assessment.template_slug
    ?? 'Creator Assessment'
  );
}

export function CreatorHome() {
  const { profile, reload } = useCreatorSession();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retaking, setRetaking] = useState(false);
  const [engageBusy, setEngageBusy] = useState('');
  const [engageMessage, setEngageMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [characterState, setCharacterState] = useState<{ started: boolean; complete: boolean } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      getAssessmentsForProfile(profile.id),
      getReportsForProfile(profile.id),
    ])
      .then(([a, r]) => {
        if (!mounted) return;
        setAssessments(a);
        setReports(r);
      })
      .catch(() => mounted && setLoadError('We could not load your assessment history. Please refresh.'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  // Character-possibilities progress (derived from the locked snapshot +
  // persisted selection counts — no stored completion flag).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snapshot = await getMyArchetypeSnapshot(profile.id);
        if (!mounted) return;
        if (!snapshot) {
          setCharacterState({ started: false, complete: false });
          return;
        }
        const selections = await getMyVariationSelections(snapshot.id);
        if (!mounted) return;
        const { complete } = summariseSelectionCompleteness(
          snapshotToRankedArchetypes(snapshot),
          selections,
        );
        setCharacterState({ started: true, complete });
      } catch {
        if (mounted) setCharacterState(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  const latestReport = reports[0] ?? null;
  const latestAssessment = assessments[0] ?? null;

  // Reports/assessments are created together per submission (no FK between
  // them), so pair each assessment to the report closest in time.
  const reportForAssessment = (assessment: CreatorAssessment): CreatorReport | null => {
    if (!reports.length) return null;
    const target = new Date(assessment.created_at).getTime();
    let best: CreatorReport | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const report of reports) {
      const diff = Math.abs(new Date(report.created_at).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = report;
      }
    }
    return best;
  };

  const displayName = profile.model_name || profile.first_name || profile.full_name || 'there';
  const reportSlug = latestReport?.report_slug ?? '';

  const handleRetake = async () => {
    setRetaking(true);
    setActionError(null);
    try {
      const { invite_code, template_slug } = await createCreatorRetakeInvite();
      const email = encodeURIComponent(profile.email ?? '');
      navigate(`/a/${encodeURIComponent(template_slug)}?ref=${encodeURIComponent(invite_code)}&email=${email}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not start a new assessment. Please try again.');
      setRetaking(false);
    }
  };

  const handleExploreServices = () => {
    void trackCreatorServicesClick({ profileId: profile.id, reportSlug }).catch(() => {});
    navigate(`/creator-services?profileId=${profile.id}${reportSlug ? `&reportSlug=${reportSlug}` : ''}`);
  };

  const handleBookStrategyCall = async () => {
    setEngageBusy('book');
    setEngageMessage(null);
    setActionError(null);
    try {
      await requestStrategyDiscussion({ profileId: profile.id, reportSlug });
      await trackAgencyCalendarClick({ profileId: profile.id, reportSlug });
      window.location.href = getCreatorJourneyCtas('book_strategy_call').primary.href;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not open booking. Please try again.');
    } finally {
      setEngageBusy('');
    }
  };

  const handleExpressInterest = async () => {
    setEngageBusy('interest');
    setEngageMessage(null);
    setActionError(null);
    try {
      await requestStrategyDiscussion({ profileId: profile.id, reportSlug });
      setEngageMessage("Thanks — we've noted your interest and will be in touch.");
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not record your interest. Please try again.');
    } finally {
      setEngageBusy('');
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-14 w-auto object-contain" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">My Vertical</p>
              <h1 className="text-2xl font-bold leading-tight text-charcoal">Welcome back, {displayName}</h1>
            </div>
          </div>
          <button onClick={() => void signOut()} className="btn-secondary text-xs">Sign out</button>
        </header>

        {/* Status summary */}
        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-charcoal-2">Latest assessment</div>
            <div className="mt-1 text-sm font-semibold text-charcoal">
              {latestAssessment ? `Completed · ${formatDate(latestAssessment.created_at)}` : 'Not started yet'}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-charcoal-2">Latest report</div>
            <div className="mt-1 text-sm font-semibold text-charcoal">
              {latestReport ? `Available · ${formatDate(latestReport.created_at)}` : 'Not available yet'}
            </div>
          </div>
        </section>

        {/* Build Your Character Possibilities — primary incomplete setup action (FYV-PERSONA-1A). */}
        {latestAssessment && characterState && (
          characterState.complete ? (
            <section className="mb-5 rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-charcoal">Character possibilities</h2>
                  <p className="mt-1 text-sm text-charcoal-2">
                    You've mapped the versions of each direction that feel like you.
                  </p>
                </div>
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">Complete</span>
              </div>
              <a href="#/my/characters" className="btn-secondary mt-4 text-sm">Review or edit</a>
            </section>
          ) : (
            <section className="mb-5 rounded-2xl border border-accent/40 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</p>
                <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Action needed</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-charcoal">Build your character possibilities</h2>
              <p className="mt-1 text-sm text-charcoal-2">
                Your assessment identified three strong creative directions. Choose the versions of each that you could
                genuinely see yourself enjoying and portraying.
              </p>
              <a href="#/my/characters" className="btn-primary mt-4 text-sm">
                {characterState.started ? 'Continue setup' : 'Start now'}
              </a>
            </section>
          )
        )}

        {actionError && (
          <p className="mb-4 rounded-lg border border-pink/30 bg-pink/10 p-3 text-sm text-pink" role="alert">{actionError}</p>
        )}

        {/* Latest report */}
        <section className="mb-5 rounded-2xl border border-accent/30 bg-surface p-5">
          <h2 className="text-lg font-bold text-charcoal">Your latest report</h2>
          {latestReport ? (
            <>
              <p className="mt-1 text-sm text-charcoal-2">
                Your personalised Find Your Vertical report is ready to revisit any time.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`#/report/${latestReport.report_slug}`} className="btn-primary text-sm">
                  View My Latest Report
                </a>
                <button onClick={handleExploreServices} className="btn-secondary text-sm">
                  Explore Creator Services
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-charcoal-2">
              You don't have a report yet. Complete an assessment to generate your personalised report.
            </p>
          )}
        </section>

        {/* Assessment history */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-charcoal">Assessment history</h2>
            <button onClick={handleRetake} disabled={retaking} className="btn-primary text-sm">
              {retaking ? 'Starting…' : 'Retake Assessment'}
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-charcoal-2">Loading your history…</p>
          ) : loadError ? (
            <p className="text-sm text-pink">{loadError}</p>
          ) : assessments.length === 0 ? (
            <p className="text-sm text-charcoal-2">No assessments yet. Take your first assessment to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-charcoal-2">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Assessment</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(assessment => {
                    const linkedReport = reportForAssessment(assessment);
                    return (
                      <tr key={assessment.id} className="border-t border-white/5">
                        <td className="py-2 pr-4 text-charcoal-2">{formatDate(assessment.created_at)}</td>
                        <td className="py-2 pr-4 text-charcoal">{templateNameFor(assessment)}</td>
                        <td className="py-2 pr-4">
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Completed</span>
                        </td>
                        <td className="py-2 pr-4">
                          {linkedReport ? (
                            <a href={`#/report/${linkedReport.report_slug}`} className="text-xs font-medium text-accent hover:underline">
                              View report
                            </a>
                          ) : (
                            <span className="text-xs text-charcoal-2">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-charcoal-2">
            Retaking creates a brand-new assessment and report. Your previous results are always kept.
          </p>
        </section>

        {/* Engage */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-surface p-5">
          <h2 className="text-lg font-bold text-charcoal">Work with us</h2>
          <p className="mt-1 text-sm text-charcoal-2">
            Ready to go further? Talk through your results or explore how we can help you grow.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={handleBookStrategyCall} disabled={engageBusy === 'book'} className="btn-primary text-sm">
              {engageBusy === 'book' ? 'Opening…' : 'Book a Strategy Call'}
            </button>
            <button onClick={handleExpressInterest} disabled={engageBusy === 'interest'} className="btn-secondary text-sm">
              {engageBusy === 'interest' ? 'Saving…' : 'Express Interest'}
            </button>
            <button onClick={handleExploreServices} className="btn-secondary text-sm">Explore Creator Services</button>
          </div>
          {engageMessage && <p className="mt-3 text-sm text-success" role="status">{engageMessage}</p>}
        </section>

        {/* Future FMF workspace (non-operational placeholder) */}
        <section className="rounded-2xl border border-white/10 bg-surface-3/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-charcoal">FunkMyFans Workspace</h2>
            <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal-2">Not active</span>
          </div>
          <p className="mt-2 text-sm text-charcoal-2">
            Your FunkMyFans creator workspace becomes available when operational onboarding begins — after you decide to
            proceed with full service. That's where day-to-day operations live once we're working together.
          </p>
          <div className="mt-3 grid gap-2 text-xs text-charcoal-2 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-2 px-3 py-2">Workspace status: <span className="font-semibold text-charcoal">Not active</span></div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">OnlyFans integration: <span className="font-semibold text-charcoal">Not connected</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
