import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getAssessmentsForProfile,
  getCreatorProfile,
  getInvitesForProfile,
  getReportsForProfile,
} from '@/lib/creators-api';
import {
  determineCreatorCompletionNextAction,
  getCreatorCompletionCta,
} from '@/lib/fyv-completion';
import type {
  CreatorAssessment,
  CreatorAssessmentInviteLink,
  CreatorCompletionNextAction,
  CreatorProfile,
  CreatorReport,
  ReportData,
} from '@/types/creator';
import { readMultiChoiceAnswer } from '@/lib/multi-choice-answer';

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') {
    const answer = readMultiChoiceAnswer(value);
    if (answer.selectedOptionIds.length > 0) {
      return answer.selectedOptionIds.map(id => answer.optionText[id]?.trim() ? `${id} — ${answer.optionText[id].trim()}` : id).join(', ');
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-charcoal-2">{label}</div>
      <div className="mt-1 text-sm font-semibold text-charcoal">{value}</div>
    </div>
  );
}

function AnswerList({ assessment }: { assessment?: CreatorAssessment | null }) {
  const responses = assessment?.answers ?? assessment?.responses;
  if (!responses) {
    return <p className="text-sm text-charcoal-2">No submitted answers were captured for this assessment.</p>;
  }

  const standardRows = [
    ['Full name', responses.full_name],
    ['Email', responses.email],
    ['OnlyFans handle', responses.onlyfans_handle],
    ['Country', responses.country],
    ['Audience target', responses.audience_target],
    ['Consent', responses.consent],
    ['Strengths', responses.strengths],
    ['Niche interests', responses.niche_interests],
    ['Future improvements', responses.future_improvements],
    ['Future improvements other', responses.future_improvements_other],
  ] as const;
  const snapshotRows = (assessment?.assessment_snapshot?.question_snapshot ?? [])
    .map(question => [question.question_text, responses[question.response_key]] as const)
    .filter(([, value]) => value !== undefined);
  const answerRows = snapshotRows.length > 0 ? snapshotRows : standardRows;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {answerRows.map(([label, value]) => (
        <InfoCard key={label} label={label} value={formatValue(value)} />
      ))}
    </div>
  );
}

export function CreatorAssessmentReview() {
  const { profileId } = useParams<{ profileId: string }>();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [invites, setInvites] = useState<CreatorAssessmentInviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profileId) return;

    Promise.all([
      getCreatorProfile(profileId),
      getAssessmentsForProfile(profileId),
      getReportsForProfile(profileId),
      getInvitesForProfile(profileId),
    ])
      .then(([creatorProfile, creatorAssessments, creatorReports, creatorInvites]) => {
        setProfile(creatorProfile);
        setAssessments(creatorAssessments);
        setReports(creatorReports);
        setInvites(creatorInvites);
      })
      .catch(() => setError('Unable to load this review. Return to the pipeline and try again.'))
      .finally(() => setLoading(false));
  }, [profileId]);

  const latestAssessment = assessments[0] ?? null;
  const latestReport = reports[0] ?? null;
  const latestInvite = invites[0] ?? null;
  const reportData = latestReport?.report_json as ReportData | undefined;
  const recommendedNextAction: CreatorCompletionNextAction = reportData?.completion_routing?.recommended_next_action
    ?? determineCreatorCompletionNextAction({
      profile,
      assessment: latestAssessment,
      report: latestReport,
      invite: latestInvite,
    });
  const nextActionCta = useMemo(
    () => getCreatorCompletionCta(recommendedNextAction, profile?.id),
    [profile?.id, recommendedNextAction]
  );
  const reportSummary = reportData?.free_report_summary
    ?? reportData?.creator_agency_opportunity?.recommended_support
    ?? reportData?.executive_summary?.recommended_next_step
    ?? 'No report summary is available yet.';

  if (loading) {
    return <div className="animate-pulse p-4 text-charcoal-2">Loading Review...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-pink/30 bg-pink/10 p-4 text-sm text-pink">{error}</div>;
  }

  if (!profile) {
    return <div className="rounded-lg border border-white/10 bg-surface p-4 text-sm text-charcoal-2">Creator not found.</div>;
  }

  return (
    <div className="cockpit-page">
      <header className="cockpit-page-header">
        <div>
          <Link to="/cockpit/creators" className="mb-2 inline-block text-xs font-medium text-charcoal-2 transition-colors hover:text-accent">
            &lt;- Back to pipeline
          </Link>
          <p className="cockpit-eyebrow">Assessment Review</p>
          <h1 className="cockpit-title">{profile.full_name}</h1>
          <p className="cockpit-subtitle">{[profile.email, profile.onlyfans_handle ? `@${profile.onlyfans_handle}` : null, profile.country].filter(Boolean).join(' / ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-charcoal">
            Invite: {latestInvite?.status ?? '-'}
          </span>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            Next: {recommendedNextAction.replace(/_/g, ' ')}
          </span>
          {latestReport && (
            <Link to={`/report/${latestReport.report_slug}`} target="_blank" rel="noreferrer" className="btn-primary text-xs">
              Open report
            </Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="cockpit-card-pad space-y-5">
          <div>
            <h2 className="cockpit-section-title">Creator Identity</h2>
            <p className="mt-1 text-sm text-charcoal-2">Read-only summary of the latest completed assessment and report.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoCard label="Full name" value={profile.full_name} />
            <InfoCard label="Email" value={profile.email ?? '-'} />
            <InfoCard label="OnlyFans handle" value={profile.onlyfans_handle ? `@${profile.onlyfans_handle}` : '-'} />
            <InfoCard label="Invite status" value={latestInvite?.status ?? '-'} />
            <InfoCard label="Latest assessment" value={latestAssessment?.created_at ? new Date(latestAssessment.created_at).toLocaleString() : '-'} />
            <InfoCard label="Latest report" value={latestReport?.created_at ? new Date(latestReport.created_at).toLocaleString() : '-'} />
            <InfoCard label="Agency score" value={String(reportData?.scores.agency_opportunity ?? latestAssessment?.agency_opportunity_score ?? profile.agency_opportunity_score ?? '-')} />
            <InfoCard label="Recommended next action" value={recommendedNextAction.replace(/_/g, ' ')} />
          </div>

          <div className="rounded-xl border border-white/10 bg-surface-2/60 p-4">
            <h3 className="text-sm font-semibold text-charcoal">Report Summary</h3>
            <p className="mt-2 text-sm leading-6 text-charcoal-2">{reportSummary}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface-2/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-charcoal">Submitted Answers</h3>
              <span className="text-xs text-charcoal-2">{latestAssessment ? 'Latest assessment' : 'No assessment found'}</span>
            </div>
            <AnswerList assessment={latestAssessment} />
          </div>
        </section>

        <aside className="space-y-5">
          <div className="cockpit-card-pad border-accent/30">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Deterministic Route</div>
            <h2 className="mt-2 text-xl font-display font-semibold text-charcoal">
              {nextActionCta.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-charcoal-2">
              This next step comes from the completion router and is designed to keep FYV loosely coupled from downstream systems.
            </p>
            <a href={nextActionCta.href} className="btn-primary mt-4 inline-flex">
              {nextActionCta.label}
            </a>
          </div>

          {latestReport && (
            <div className="cockpit-card-pad">
              <h3 className="cockpit-section-title mb-3">Completion Metadata</h3>
              <div className="space-y-3">
                <InfoCard label="Report slug" value={latestReport.report_slug} />
                <InfoCard label="Report tier" value={latestReport.report_tier ?? reportData?.report_tier ?? '-'} />
                <InfoCard label="Assessment ID" value={latestAssessment?.id ?? '-'} />
                <InfoCard label="Report ID" value={latestReport.id} />
                <InfoCard label="Consent" value={String(Boolean(profile.consent_to_contact))} />
              </div>
            </div>
          )}

          {latestReport?.report_json?.completion_routing && (
            <div className="cockpit-card-pad">
              <h3 className="cockpit-section-title mb-3">Router Snapshot</h3>
              <div className="space-y-2 text-sm text-charcoal-2">
                <p>Completed at: {new Date(latestReport.report_json.completion_routing.completed_at).toLocaleString()}</p>
                <p>Agency interest: {latestReport.report_json.completion_routing.agency_interest ? 'Yes' : 'No'}</p>
                <p>Identity complete: {latestReport.report_json.completion_routing.identity_complete ? 'Yes' : 'No'}</p>
                <p>Conflict: {latestReport.report_json.completion_routing.conflict ? 'Yes' : 'No'}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
