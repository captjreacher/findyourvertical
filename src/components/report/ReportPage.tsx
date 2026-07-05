import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getReportBySlug, requestStrategyDiscussion, trackAgencyCalendarClick, trackCreatorEvent } from '@/lib/creators-api';
import type { CreatorReport, ReportData } from '@/types/creator';

const CALENDLY_URL = 'https://calendly.com/mikegrobinson/20-min';
const AGENCY_PROMPT_COPY = 'Would you like to discuss what this result could mean for your creator growth?';

type ReportAction = 'print_save' | 'email' | 'share' | 'discuss';
type AgencyAnswer = 'yes' | 'no';

const REPORT_CARD_CLASS = 'fyv-report-card rounded-xl p-5';
const REPORT_TEXT_CLASS = 'text-sm leading-6 text-charcoal-2';
const REPORT_HEADING_CLASS = 'font-display font-semibold text-charcoal';
const REPORT_OUTLINE_BUTTON_CLASS = 'rounded-lg border border-white/10 bg-surface-3/70 px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:border-accent hover:bg-accent/10 hover:text-charcoal';

type PublicScoreKey = 'creator_dna' | 'brand_clarity' | 'monetisation' | 'consistency';

type ScoreInsight = {
  meaning: string;
  why: string;
  improve: string;
};

type ReportGuidance = {
  executiveSummary: NonNullable<ReportData['executive_summary']>;
  scoreInterpretations: Record<string, ScoreInsight>;
  archetypeSummary: NonNullable<ReportData['creator_archetype_summary']>;
  recommendedActions: NonNullable<ReportData['recommended_actions']>;
  agencyOpportunity: NonNullable<ReportData['creator_agency_opportunity']>;
};

const SCORE_LABELS: Record<PublicScoreKey, string> = {
  creator_dna: 'Creator DNA',
  brand_clarity: 'Brand Clarity',
  monetisation: 'Monetisation',
  consistency: 'Consistency',
};

function scoreBand(score: number): string {
  if (score >= 75) return 'strong';
  if (score >= 55) return 'developing';
  return 'early-stage';
}

function scoreLabelFor(key: string): string {
  return SCORE_LABELS[key as PublicScoreKey] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fallbackScoreInsight(key: string, score: number, report: ReportData): ScoreInsight {
  const label = scoreLabelFor(key);
  const band = scoreBand(score);
  const commonWhy = report.why_this_result?.summary ?? `This reflects how your answers mapped to ${report.archetype} positioning.`;

  const improvements: Record<string, string> = {
    creator_dna: 'Build repeatable formats around your strongest natural traits and review which content creates saves, replies, subscriptions, or custom requests.',
    brand_clarity: 'Sharpen your niche promise across your bio, pinned content, visual themes, and first three recurring content lanes.',
    monetisation: 'Create a simple paid pathway with an entry offer, recurring engagement, and one premium upsell.',
    consistency: 'Choose a minimum sustainable posting rhythm and batch two repeatable formats before adding more complexity.',
  };

  return {
    meaning: `${label} is ${band}, showing how this part of your creator foundation is performing right now.`,
    why: commonWhy,
    improve: improvements[key] ?? 'Focus on one clear improvement sprint, measure response, and refine from the strongest signal.',
  };
}

function buildGuidance(report: ReportData, publicScores: Record<string, number>): ReportGuidance {
  const scoreEntries = Object.entries(publicScores);
  const weakestScore = [...scoreEntries].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'brand_clarity';
  const firstVertical = report.top_verticals[0]?.name ?? 'your strongest content lane';
  const summary = report.executive_summary ?? {
    strengths: report.archetype_strengths.slice(0, 3),
    growth_opportunities: [
      weakestScore === 'monetisation' ? 'Clarify how attention turns into paid offers.' : 'Make your creator promise easier to understand quickly.',
      `Turn ${firstVertical} into a repeatable test lane.`,
      'Use audience response to prioritise the content formats that convert.',
    ],
    likely_creator_style: `${report.archetype}: ${report.archetype_description}`,
    likely_monetisation_style: report.pricing_strategy,
    recommended_next_step: weakestScore === 'consistency'
      ? 'Build a simple two-week posting cadence before adding new content ideas.'
      : weakestScore === 'monetisation'
        ? 'Define your first paid pathway from discovery content to premium offer.'
        : 'Clarify your niche promise across bio, pinned content, and recurring formats.',
  };

  const scoreInterpretations = Object.fromEntries(
    scoreEntries.map(([key, value]) => [
      key,
      report.score_interpretations?.[key] ?? fallbackScoreInsight(key, value, report),
    ])
  ) as Record<string, ScoreInsight>;

  return {
    executiveSummary: summary,
    scoreInterpretations,
    archetypeSummary: report.creator_archetype_summary ?? {
      primary_archetype: report.archetype,
      secondary_archetype: report.top_verticals[0]?.name ?? 'Audience Relationship Builder',
      fit_explanation: report.why_this_result?.summary ?? report.archetype_description,
    },
    recommendedActions: report.recommended_actions ?? [
      { title: 'Improve posting consistency', rationale: 'Create a cadence you can maintain long enough to learn from audience response.' },
      { title: 'Define niche', rationale: 'Make the same creator promise visible across profile, content, and offers.' },
      { title: 'Expand content mix', rationale: `Test ${firstVertical} as a repeatable lane before spreading effort across too many formats.` },
      { title: 'Improve monetisation approach', rationale: 'Give fans a clearer path from discovery to paid access or premium requests.' },
    ],
    agencyOpportunity: report.creator_agency_opportunity ?? {
      growth_potential: 'Your profile shows growth potential if positioning, content cadence, and monetisation are developed together.',
      coaching_suitability: 'A strategy review can help identify which few changes are most likely to improve traction.',
      recommended_support: 'Recommended support: a focused strategy call to prioritise niche, consistency, and monetisation foundations.',
    },
  };
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const width = Math.max(0, Math.min(100, score));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-charcoal-2">{label}</span>
        <span className="font-semibold text-charcoal">{score}/100</span>
      </div>
      <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-colors" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ScoreCard({ title, scores, interpretations }: { title: string; scores: Record<string, number>; interpretations: Record<string, ScoreInsight> }) {
  return (
    <div className={REPORT_CARD_CLASS}>
      <h3 className={`${REPORT_HEADING_CLASS} mb-4 text-lg`}>{title}</h3>
      <div className="space-y-5">
        {Object.entries(scores).map(([k, v]) => (
          <div key={k} className="fyv-report-card-inset space-y-3 rounded-lg p-4">
            <ScoreBar label={scoreLabelFor(k)} score={v} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <ScoreExplanation title="What it means" text={interpretations[k]?.meaning} />
              <ScoreExplanation title="Why you got this" text={interpretations[k]?.why} />
              <ScoreExplanation title="How to improve" text={interpretations[k]?.improve} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreExplanation({ title, text }: { title: string; text?: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{title}</div>
      <p className="text-xs leading-5 text-charcoal-2">{text}</p>
    </div>
  );
}

function SummaryBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">{title}</h3>
      <p className="text-sm leading-6 text-charcoal-2">{text}</p>
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">{title}</h3>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-charcoal-2">
            <span className="text-accent">+</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [report, setReport] = useState<CreatorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<ReportAction | null>(null);
  const [agencyAnswer, setAgencyAnswer] = useState<AgencyAnswer | null>(null);
  const [promptWorking, setPromptWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!slug) return;
    getReportBySlug(slug)
      .then(r => {
        setReport(r);
        const storedAnswer = window.sessionStorage.getItem(`agencyPrompt:${slug}`);
        if (storedAnswer === 'yes' || storedAnswer === 'no') setAgencyAnswer(storedAnswer);
        if (r && !window.sessionStorage.getItem(`reportViewed:${slug}`)) {
          window.sessionStorage.setItem(`reportViewed:${slug}`, 'true');
          const seenKey = `reportSeen:${slug}`;
          const isReturnVisit = window.localStorage.getItem(seenKey) === 'true';
          window.localStorage.setItem(seenKey, 'true');
          void trackCreatorEvent({
            profileId: r.creator_profile_id,
            eventType: isReturnVisit ? 'report.return_visit' : 'report_viewed',
            details: {
              report_slug: r.report_slug,
              viewed_at: new Date().toISOString(),
              is_return_visit: isReturnVisit,
            },
          });
        }
      })
      .catch(() => setLoadError('Unable to load this report. Check the link or contact the person who sent it to you.'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="fyv-report-shell min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-charcoal-2">Loading Report...</div>
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="fyv-report-shell min-h-screen flex flex-col items-center justify-center p-4 text-charcoal">
        <h1 className="font-display text-2xl font-bold mb-4 text-charcoal">Report Not Found</h1>
        <p className="max-w-md text-center text-sm leading-6 text-charcoal-2">
          {loadError || 'This report link may have expired or been moved. Check the link or contact the person who sent it to you.'}
        </p>
      </div>
    );
  }

  const d = report.report_json as unknown as ReportData;
  const isFreeReport = (d.report_tier ?? 'free') === 'free';
  const isAgencyReport = d.report_tier === 'agency';
  const publicScores = Object.fromEntries(
    Object.entries(d.scores).filter(([key]) => key !== 'agency_opportunity')
  ) as Record<string, number>;
  const guidance = buildGuidance(d, publicScores);

  const printSaveReport = async () => {
    const blob = createReportPdfBlob(d, publicScores, guidance);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `find-your-vertical-${report.report_slug}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    await trackCreatorEvent({
      profileId: report.creator_profile_id,
      eventType: 'report.pdf_downloaded',
      details: { report_slug: report.report_slug, downloaded_at: new Date().toISOString(), format: 'pdf' },
    });
  };

  const performReportAction = async (action: ReportAction) => {
    setActionError('');
    setActionMessage('');

    if (action === 'print_save') {
      await printSaveReport();
      return;
    }

    if (action === 'email') {
      await trackCreatorEvent({
        profileId: report.creator_profile_id,
        eventType: 'report.email_clicked',
        details: { report_slug: report.report_slug, emailed_at: new Date().toISOString() },
      });
      const subject = encodeURIComponent('My Find Your Vertical Report');
      const body = encodeURIComponent(`Here is my Find Your Vertical report: ${window.location.href}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      return;
    }

    if (action === 'share') {
      const shareData = {
        title: 'Find Your Vertical Report',
        text: 'My Find Your Vertical creator assessment report',
        url: window.location.href,
      };

      if (navigator.share) {
        await navigator.share(shareData);
        await trackCreatorEvent({
          profileId: report.creator_profile_id,
          eventType: 'report.shared',
          details: { report_slug: report.report_slug, shared_at: new Date().toISOString(), method: 'native_share' },
        });
        return;
      }

      await navigator.clipboard.writeText(window.location.href);
      await trackCreatorEvent({
        profileId: report.creator_profile_id,
        eventType: 'report.shared',
        details: { report_slug: report.report_slug, shared_at: new Date().toISOString(), method: 'clipboard' },
      });
      setActionMessage('Report link copied.');
      return;
    }
  };

  const startReportAction = async (action: ReportAction) => {
    if (!agencyAnswer) {
      setPendingAction(action);
      return;
    }

    if (action === 'discuss') {
      setPendingAction(action);
      return;
    }

    await performReportAction(action);
  };

  const continueWithoutAgency = async () => {
    if (!slug || !pendingAction) return;
    const action = pendingAction;
    window.sessionStorage.setItem(`agencyPrompt:${slug}`, 'no');
    setAgencyAnswer('no');
    setPendingAction(null);

    if (action !== 'discuss') {
      await performReportAction(action);
    }
  };

  const requestDiscussionAndRedirect = async () => {
    if (!slug) return;
    setPromptWorking(true);
    setActionError('');

    try {
      await requestStrategyDiscussion({
        profileId: report.creator_profile_id,
        reportSlug: report.report_slug,
      });
      await trackAgencyCalendarClick({
        profileId: report.creator_profile_id,
        reportSlug: report.report_slug,
      });
      window.sessionStorage.setItem(`agencyPrompt:${slug}`, 'yes');
      setAgencyAnswer('yes');
      window.location.href = CALENDLY_URL;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong');
      setPromptWorking(false);
    }
  };

  if (isAgencyReport) {
    return (
      <div className="fyv-report-shell min-h-screen flex flex-col items-center justify-center p-4 text-charcoal">
        <h1 className="font-display text-2xl font-bold mb-4 text-charcoal">Internal Report</h1>
        <p className="max-w-md text-center text-sm leading-6 text-charcoal-2">
          This agency report is available only inside the Find Your Vertical cockpit.
        </p>
      </div>
    );
  }

  if (isFreeReport) {
    const headlineScores = Object.entries(publicScores).slice(0, 4);
    const topVertical = d.top_verticals[0];
    const recommendation = guidance.executiveSummary.recommended_next_step;

    return (
      <div className="fyv-report-shell min-h-screen text-charcoal">
        <div className="border-b border-white/10 bg-surface/80">
          <div className="max-w-3xl mx-auto px-6 py-12">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Find Your Vertical Free Report</p>
            <h1 className="font-display text-4xl font-bold mb-3 text-charcoal">{d.archetype}</h1>
            <p className="max-w-xl text-base leading-7 text-charcoal-2">{d.free_report_summary || d.archetype_description}</p>
            <div className="mt-4"><ConfidenceBadge confidence={d.result_confidence ?? 'Moderate'} /></div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
          <section className={REPORT_CARD_CLASS}>
            <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Creator DNA Snapshot</h2>
            <div className="space-y-4">
              {headlineScores.map(([key, value]) => (
                <ScoreBar key={key} label={scoreLabelFor(key)} score={value} />
              ))}
            </div>
          </section>

          <section className={`${REPORT_CARD_CLASS} space-y-4`}>
            <SummaryBlock title="Primary Archetype" text={guidance.archetypeSummary.primary_archetype} />
            {topVertical && <SummaryBlock title="Top Vertical to Explore" text={`${topVertical.name}: ${topVertical.rationale}`} />}
            <SummaryBlock title="First Recommendation" text={recommendation} />
          </section>

          <section className={`${REPORT_CARD_CLASS} space-y-4 border-accent/25 bg-accent/10`}>
            <h2 className={`${REPORT_HEADING_CLASS} text-xl`}>Unlock the Full Creator DNA Report</h2>
            <p className={REPORT_TEXT_CLASS}>
              Your full report expands this snapshot into score reasoning, confidence explanation, content opportunities, monetisation pathway, and a 90-day action plan.
            </p>
            <button
              onClick={() => startReportAction('discuss')}
              className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-2"
            >
              Discuss My Full Report
            </button>
          </section>

          <div className="border-t border-white/10 py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <button onClick={() => startReportAction('share')} className={REPORT_OUTLINE_BUTTON_CLASS}>
                Share report
              </button>
              <button onClick={() => startReportAction('discuss')} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2">
                Book Strategy Call
              </button>
            </div>
            {actionMessage && <p className="mt-3 text-center text-xs text-success">{actionMessage}</p>}
            {actionError && <p className="mt-3 text-center text-xs text-pink">{actionError}</p>}
          </div>
        </div>

        {pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface p-5 shadow-2xl">
              <h2 className={`${REPORT_HEADING_CLASS} text-xl`}>{AGENCY_PROMPT_COPY}</h2>
              <p className="mt-3 text-sm leading-6 text-charcoal-2">
                A short Find Your Vertical strategy discussion can help translate your report into the most relevant next steps for your goals.
              </p>
              {actionError && <p className="mt-4 rounded-lg border border-pink/30 bg-pink/10 px-3 py-2 text-sm text-pink">{actionError}</p>}
              <div className="mt-5 flex flex-col gap-3">
                <button
                  onClick={requestDiscussionAndRedirect}
                  disabled={promptWorking}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
                >
                  {promptWorking ? 'Opening Calendar...' : "Yes, I'd Like to Discuss My Results"}
                </button>
                <button
                  onClick={continueWithoutAgency}
                  disabled={promptWorking}
                  className={`${REPORT_OUTLINE_BUTTON_CLASS} disabled:opacity-50`}
                >
                  Not right now, continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fyv-report-shell min-h-screen text-charcoal">
      {/* Hero */}
      <div className="border-b border-white/10 bg-surface/80">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Find Your Vertical Report</p>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold mb-3 text-charcoal">{d.archetype}</h1>
              <p className="max-w-lg text-lg leading-8 text-charcoal-2">{d.archetype_description}</p>
            </div>
            <ConfidenceBadge confidence={d.result_confidence ?? 'Moderate'} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="font-display mb-4 text-2xl font-bold text-charcoal">About Your Results</h2>
          <div className={`${REPORT_CARD_CLASS} space-y-6`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SummaryList title="Strengths" items={guidance.executiveSummary.strengths} />
              <SummaryList title="Growth Opportunities" items={guidance.executiveSummary.growth_opportunities} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SummaryBlock title="Likely Creator Style" text={guidance.executiveSummary.likely_creator_style} />
              <SummaryBlock title="Likely Monetisation Style" text={guidance.executiveSummary.likely_monetisation_style} />
              <SummaryBlock title="Recommended Next Step" text={guidance.executiveSummary.recommended_next_step} />
            </div>
          </div>
        </section>

        {/* Scores */}
        <ScoreCard title="Score Interpretation" scores={publicScores} interpretations={guidance.scoreInterpretations} />

        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Creator Archetype Summary</h2>
          <div className={`${REPORT_CARD_CLASS} grid grid-cols-1 gap-4 md:grid-cols-3`}>
            <SummaryBlock title="Primary Archetype" text={guidance.archetypeSummary.primary_archetype} />
            <SummaryBlock title="Secondary Archetype" text={guidance.archetypeSummary.secondary_archetype} />
            <SummaryBlock title="Explanation of Fit" text={guidance.archetypeSummary.fit_explanation} />
          </div>
        </section>

        {d.why_this_result && (
          <section>
            <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Why This Result?</h2>
            <div className={`${REPORT_CARD_CLASS} space-y-5`}>
              <p className={REPORT_TEXT_CLASS}>{d.why_this_result.summary}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Behavioural Signals</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_behavioural_signals ?? d.why_this_result.top_signals ?? []).map(signal => (
                      <li key={signal} className={REPORT_TEXT_CLASS}>{signal}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Creator Strengths</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_creator_strengths ?? d.why_this_result.strongest_answers ?? []).map(answer => (
                      <li key={answer} className={REPORT_TEXT_CLASS}>{answer}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Content Signals</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_content_opportunity_signals ?? d.why_this_result.key_differentiators ?? []).map(item => (
                      <li key={item} className={REPORT_TEXT_CLASS}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Archetype Deep Dive */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={REPORT_CARD_CLASS}>
            <h3 className="font-semibold text-accent mb-3 text-sm uppercase tracking-wide">Strengths</h3>
            <ul className="space-y-2">{d.archetype_strengths.map(s => <li key={s} className={`${REPORT_TEXT_CLASS} flex gap-2`}><span className="text-accent">+</span>{s}</li>)}</ul>
          </div>
          <div className={REPORT_CARD_CLASS}>
            <h3 className="font-semibold text-charcoal mb-3 text-sm uppercase tracking-wide">Risks</h3>
            <ul className="space-y-2">{d.archetype_risks.map(s => <li key={s} className={`${REPORT_TEXT_CLASS} flex gap-2`}><span className="text-accent">!</span>{s}</li>)}</ul>
          </div>
          <div className={REPORT_CARD_CLASS}>
            <h3 className="font-semibold text-accent mb-3 text-sm uppercase tracking-wide">Growth</h3>
            <ul className="space-y-2">{d.archetype_growth.map(s => <li key={s} className={`${REPORT_TEXT_CLASS} flex gap-2`}><span className="text-accent">-&gt;</span>{s}</li>)}</ul>
          </div>
        </section>

        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Recommended Next Steps</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {guidance.recommendedActions.map(action => (
              <div key={action.title} className={REPORT_CARD_CLASS}>
                <h3 className="font-semibold text-accent">{action.title}</h3>
                <p className="mt-2 text-sm leading-6 text-charcoal-2">{action.rationale}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Top 3 Verticals */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Top 3 Content Verticals</h2>
          <p className="text-sm text-charcoal-2 mb-4">These are recommended directions to explore, not a fixed content plan.</p>
          <div className="space-y-3">
            {d.top_verticals.map((v, i) => (
              <div key={v.name} className={`${REPORT_CARD_CLASS} flex gap-4`}>
                <span className="font-display text-3xl text-accent shrink-0">0{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-charcoal">{v.name}</h3>
                  <p className="text-sm text-charcoal-2 mt-1">{v.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Monetisation Opportunity</h2>
          <div className={REPORT_CARD_CLASS}>
            <p className={REPORT_TEXT_CLASS}>{d.pricing_strategy}</p>
          </div>
        </section>

        {/* Winning 10 */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Content Testing Opportunity</h2>
          <div className={REPORT_CARD_CLASS}>
            <p className={REPORT_TEXT_CLASS}>{d.winning_10_framework}</p>
          </div>
        </section>

        {/* Growth Strategy */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Growth Opportunity</h2>
          <div className={REPORT_CARD_CLASS}>
            <p className={REPORT_TEXT_CLASS}>{d.growth_strategy}</p>
          </div>
        </section>

        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Growth & Support Opportunity</h2>
          <div className={`${REPORT_CARD_CLASS} grid grid-cols-1 gap-4 md:grid-cols-3`}>
            <SummaryBlock title="Growth Potential" text={guidance.agencyOpportunity.growth_potential} />
            <SummaryBlock title="Coaching Suitability" text={guidance.agencyOpportunity.coaching_suitability} />
            <SummaryBlock title="Recommended Support" text={guidance.agencyOpportunity.recommended_support} />
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Support Systems to Consider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {d.tech_stack.map(t => (
              <div key={t.tool} className={REPORT_CARD_CLASS}>
                <h3 className="font-semibold text-accent">{t.tool}</h3>
                <p className="mt-1 text-sm leading-6 text-charcoal-2">{t.purpose}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Opportunity Roadmap */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>Opportunity Roadmap</h2>
          <div className="space-y-4">
            {d.day_90_plan.map((phase, i) => (
              <div key={phase.phase} className={REPORT_CARD_CLASS}>
                <h3 className="font-semibold text-accent mb-1">{phase.phase}</h3>
                <p className="mb-3 text-sm text-charcoal-2">{phase.focus}</p>
                <ul className="space-y-1.5">
                  {phase.actions.map(a => (
                    <li key={a} className={`${REPORT_TEXT_CLASS} flex gap-2`}>
                      <span className="text-accent shrink-0">{i + 1}.{phase.actions.indexOf(a) + 1}</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Next CTA */}
        <section>
          <h2 className={`${REPORT_HEADING_CLASS} mb-4 text-xl`}>What's Next?</h2>
          <div className={`${REPORT_CARD_CLASS} space-y-4 border-accent/40 bg-accent/10`}>
            <p className={REPORT_TEXT_CLASS}>
              Your assessment highlights several opportunities that could significantly improve positioning, audience growth, and monetisation.
            </p>
            <p className={REPORT_TEXT_CLASS}>
              A strategy discussion can help determine which opportunities are most relevant to your goals and whether creator management support could accelerate your progress.
            </p>
            <button
              onClick={() => startReportAction('discuss')}
              className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-2"
            >
              Book Strategy Call
            </button>
          </div>
        </section>

        {/* Report Actions */}
        <div className="border-t border-white/10 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <button onClick={() => startReportAction('print_save')} className={REPORT_OUTLINE_BUTTON_CLASS}>
              Download PDF
            </button>
            <button onClick={() => startReportAction('email')} className={REPORT_OUTLINE_BUTTON_CLASS}>
              Email me this report
            </button>
            <button onClick={() => startReportAction('share')} className={REPORT_OUTLINE_BUTTON_CLASS}>
              Share report
            </button>
              <button onClick={() => startReportAction('discuss')} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2">
                Book Strategy Call
              </button>
          </div>
          {actionMessage && <p className="mt-3 text-center text-xs text-success">{actionMessage}</p>}
          {actionError && <p className="mt-3 text-center text-xs text-pink">{actionError}</p>}
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface p-5 shadow-2xl">
            <h2 className={`${REPORT_HEADING_CLASS} text-xl`}>{AGENCY_PROMPT_COPY}</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal-2">
              A short Find Your Vertical strategy discussion can help translate your report into the most relevant next steps for your goals.
            </p>
            {actionError && <p className="mt-4 rounded-lg border border-pink/30 bg-pink/10 px-3 py-2 text-sm text-pink">{actionError}</p>}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={requestDiscussionAndRedirect}
                disabled={promptWorking}
                  className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
              >
                {promptWorking ? 'Opening Calendar...' : "Yes, I'd Like to Discuss My Results"}
              </button>
              <button
                onClick={continueWithoutAgency}
                disabled={promptWorking}
                className={`${REPORT_OUTLINE_BUTTON_CLASS} disabled:opacity-50`}
              >
                Not right now, continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: ReportData['result_confidence'] }) {
  return (
    <span className="rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-xs font-semibold text-charcoal">
      Result Confidence: {confidence}
    </span>
  );
}

function wrapPdfText(text: string, maxChars = 92): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function pdfEscape(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function createReportPdfBlob(report: ReportData, publicScores: Record<string, number>, guidance: ReportGuidance): Blob {
  const why = report.why_this_result;
  const sections: Array<{ title: string; body: string[] }> = [
    {
      title: 'About Your Results',
      body: [
        `Strengths: ${guidance.executiveSummary.strengths.join('; ')}`,
        `Growth opportunities: ${guidance.executiveSummary.growth_opportunities.join('; ')}`,
        `Likely creator style: ${guidance.executiveSummary.likely_creator_style}`,
        `Likely monetisation style: ${guidance.executiveSummary.likely_monetisation_style}`,
        `Recommended next step: ${guidance.executiveSummary.recommended_next_step}`,
      ],
    },
    {
      title: 'Score Interpretation',
      body: Object.entries(publicScores).flatMap(([key, value]) => {
        const insight = guidance.scoreInterpretations[key];
        return [
          `${scoreLabelFor(key)}: ${value}/100`,
          `Meaning: ${insight.meaning}`,
          `Why: ${insight.why}`,
          `Improve: ${insight.improve}`,
        ];
      }),
    },
    {
      title: 'Creator Archetype Summary',
      body: [
        `Primary archetype: ${guidance.archetypeSummary.primary_archetype}`,
        `Secondary archetype: ${guidance.archetypeSummary.secondary_archetype}`,
        `Fit: ${guidance.archetypeSummary.fit_explanation}`,
        `Result confidence: ${report.result_confidence ?? 'Moderate'}`,
      ],
    },
    {
      title: 'Why This Result?',
      body: [
        why.summary,
        ...((why.strongest_behavioural_signals ?? why.top_signals ?? []).map(item => `Behavioural signal: ${item}`)),
        ...((why.strongest_creator_strengths ?? why.strongest_answers ?? []).map(item => `Creator strength: ${item}`)),
        ...((why.strongest_archetype_matches ?? []).map(item => `Archetype match: ${item}`)),
        ...((why.strongest_content_opportunity_signals ?? why.key_differentiators ?? []).map(item => `Content opportunity: ${item}`)),
      ],
    },
    {
      title: 'Top Verticals',
      body: report.top_verticals.map(vertical => `${vertical.name}: ${vertical.rationale}`),
    },
    {
      title: 'Opportunities',
      body: [report.pricing_strategy, report.winning_10_framework, report.growth_strategy],
    },
    {
      title: 'Recommended Next Steps',
      body: guidance.recommendedActions.map(action => `${action.title}: ${action.rationale}`),
    },
    {
      title: 'Growth & Support Opportunity',
      body: [
        `Growth potential: ${guidance.agencyOpportunity.growth_potential}`,
        `Coaching suitability: ${guidance.agencyOpportunity.coaching_suitability}`,
        `Recommended support: ${guidance.agencyOpportunity.recommended_support}`,
      ],
    },
    {
      title: "What's Next?",
      body: [
        'Your assessment highlights several opportunities that could significantly improve positioning, audience growth, and monetisation.',
        'A strategy discussion can help determine which opportunities are most relevant to your goals and whether creator management support could accelerate your progress.',
      ],
    },
  ];

  const pageBackground = '0.027 0.063 0.122 rg 0 0 612 792 re f';
  const colorFor = (color: 'orange' | 'white' | 'muted') => {
    if (color === 'orange') return '0.976 0.451 0.086 rg';
    if (color === 'white') return '1 1 1 rg';
    return '0.796 0.835 0.882 rg';
  };
  const pages: string[][] = [[pageBackground]];
  let y = 770;
  const addLine = (line: string, fontSize = 10, color: 'orange' | 'white' | 'muted' = 'muted') => {
    if (y < 50) {
      pages.push([pageBackground]);
      y = 770;
    }
    pages[pages.length - 1].push(`${colorFor(color)} BT /F1 ${fontSize} Tf 50 ${y} Td (${pdfEscape(line)}) Tj ET`);
    y -= fontSize + 5;
  };

  addLine('Find Your Vertical Creator Assessment', 10, 'orange');
  addLine('Find Your Vertical Report', 18, 'white');
  addLine(report.archetype, 14, 'orange');
  wrapPdfText(report.archetype_description).forEach(line => addLine(line));
  y -= 8;

  for (const section of sections) {
    addLine(section.title, 13, 'orange');
    for (const item of section.body) {
      wrapPdfText(item).forEach(line => addLine(line));
      y -= 3;
    }
    y -= 8;
  }

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const content = pageLines.join('\n');
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = '<< /Type /Catalog /Pages 2 0 R >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}




