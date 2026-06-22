import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReportBySlug, requestStrategyDiscussion, trackAgencyCalendarClick } from '@/lib/creators-api';
import type { CreatorReport, ReportData } from '@/types/creator';

const CALENDLY_URL = 'https://calendly.com/mikegrobinson/20-min';
const AGENCY_PROMPT_COPY = 'Would you like to discuss what this result could mean for your creator growth?';

type ReportAction = 'print' | 'email' | 'share' | 'discuss';
type AgencyAnswer = 'yes' | 'no';

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-success' : score >= 45 ? 'bg-warn' : 'bg-pink';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-gray-200">{score}/100</span>
      </div>
      <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ScoreCard({ title, scores }: { title: string; scores: Record<string, number> }) {
  return (
    <div className="bg-surface border border-gray-800 rounded-xl p-5">
      <h3 className="font-display font-semibold text-lg mb-4">{title}</h3>
      <div className="space-y-3">
        {Object.entries(scores).map(([k, v]) => (
          <ScoreBar key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} score={v} />
        ))}
      </div>
    </div>
  );
}

function ReadinessBadge({ readiness }: { readiness: string }) {
  const colors: Record<string, string> = {
    'Scale Candidate': 'bg-success/20 text-success border-success/30',
    'Ready Now': 'bg-accent/20 text-accent border-accent/30',
    'Needs Foundation': 'bg-warn/20 text-warn border-warn/30',
    'Hobby Creator': 'bg-gray-700/50 text-gray-400 border-gray-600',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors[readiness] ?? 'border-gray-700 text-gray-400'}`}>
      {readiness}
    </span>
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

  useEffect(() => {
    if (!slug) return;
    getReportBySlug(slug).then(r => {
      setReport(r);
      const storedAnswer = window.sessionStorage.getItem(`agencyPrompt:${slug}`);
      if (storedAnswer === 'yes' || storedAnswer === 'no') setAgencyAnswer(storedAnswer);
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-pulse text-gray-500">Loading report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 p-4">
        <h1 className="font-display text-2xl font-bold mb-4">Report Not Found</h1>
        <p className="text-gray-500 mb-6">This report link may have expired or been moved.</p>
        <Link to="/" className="text-accent hover:underline text-sm">← Take the assessment</Link>
      </div>
    );
  }

  const d = report.report_json as unknown as ReportData;
  const publicScores = Object.fromEntries(
    Object.entries(d.scores).filter(([key]) => key !== 'agency_opportunity')
  ) as Record<string, number>;

  const performReportAction = async (action: ReportAction) => {
    setActionError('');
    setActionMessage('');

    if (action === 'print') {
      window.print();
      return;
    }

    if (action === 'email') {
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
        return;
      }

      await navigator.clipboard.writeText(window.location.href);
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

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <div className="border-b border-gray-800 bg-surface/50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link to="/" className="text-xs text-gray-500 hover:text-gray-300 mb-4 inline-block">← Back to assessment</Link>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2">{d.archetype}</h1>
              <p className="text-gray-400 max-w-lg">{d.archetype_description}</p>
            </div>
            <ReadinessBadge readiness={d.management_readiness} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Scores */}
        <ScoreCard title="Creator Signals" scores={publicScores} />

        {d.why_this_result && (
          <section>
            <h2 className="font-display text-xl font-semibold mb-4">Why This Result?</h2>
            <div className="bg-surface border border-gray-800 rounded-xl p-5 space-y-5">
              <p className="text-sm text-gray-300 leading-relaxed">{d.why_this_result.summary}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Top Signals</h3>
                  <ul className="space-y-1.5">
                    {d.why_this_result.top_signals.map(signal => (
                      <li key={signal} className="text-sm text-gray-400">{signal}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Strongest Answers</h3>
                  <ul className="space-y-1.5">
                    {d.why_this_result.strongest_answers.map(answer => (
                      <li key={answer} className="text-sm text-gray-400">{answer}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Key Differentiators</h3>
                  <ul className="space-y-1.5">
                    {d.why_this_result.key_differentiators.map(item => (
                      <li key={item} className="text-sm text-gray-400">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Archetype Deep Dive */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface border border-green-900/30 rounded-xl p-5">
            <h3 className="font-semibold text-success mb-3 text-sm uppercase tracking-wide">Strengths</h3>
            <ul className="space-y-2">{d.archetype_strengths.map(s => <li key={s} className="text-sm text-gray-300 flex gap-2"><span className="text-success">+</span>{s}</li>)}</ul>
          </div>
          <div className="bg-surface border border-pink/20 rounded-xl p-5">
            <h3 className="font-semibold text-pink mb-3 text-sm uppercase tracking-wide">Risks</h3>
            <ul className="space-y-2">{d.archetype_risks.map(s => <li key={s} className="text-sm text-gray-300 flex gap-2"><span className="text-pink">!</span>{s}</li>)}</ul>
          </div>
          <div className="bg-surface border border-accent/20 rounded-xl p-5">
            <h3 className="font-semibold text-accent mb-3 text-sm uppercase tracking-wide">Growth</h3>
            <ul className="space-y-2">{d.archetype_growth.map(s => <li key={s} className="text-sm text-gray-300 flex gap-2"><span className="text-accent">→</span>{s}</li>)}</ul>
          </div>
        </section>

        {/* Top 3 Verticals */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Top 3 Content Verticals</h2>
          <p className="text-sm text-gray-500 mb-4">These are recommended directions to explore, not a fixed content plan.</p>
          <div className="space-y-3">
            {d.top_verticals.map((v, i) => (
              <div key={v.name} className="bg-surface border border-gray-800 rounded-xl p-5 flex gap-4">
                <span className="font-display text-3xl text-accent shrink-0">0{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-gray-100">{v.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{v.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Monetisation Opportunity</h2>
          <div className="bg-surface border border-accent/20 rounded-xl p-5">
            <p className="text-sm text-gray-300 leading-relaxed">{d.pricing_strategy}</p>
          </div>
        </section>

        {/* Winning 10 */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Content Testing Opportunity</h2>
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-300 leading-relaxed">{d.winning_10_framework}</p>
          </div>
        </section>

        {/* Growth Strategy */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Growth Opportunity</h2>
          <div className="bg-surface border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-300 leading-relaxed">{d.growth_strategy}</p>
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Support Systems to Consider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {d.tech_stack.map(t => (
              <div key={t.tool} className="bg-surface border border-gray-800 rounded-xl p-4">
                <h3 className="font-semibold text-accent">{t.tool}</h3>
                <p className="text-xs text-gray-500 mt-1">{t.purpose}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Opportunity Roadmap */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Opportunity Roadmap</h2>
          <div className="space-y-4">
            {d.day_90_plan.map((phase, i) => (
              <div key={phase.phase} className="bg-surface border border-gray-800 rounded-xl p-5">
                <h3 className="font-semibold text-accent mb-1">{phase.phase}</h3>
                <p className="text-xs text-gray-500 mb-3">{phase.focus}</p>
                <ul className="space-y-1.5">
                  {phase.actions.map(a => (
                    <li key={a} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-gray-600 shrink-0">{i + 1}.{phase.actions.indexOf(a) + 1}</span>
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
          <h2 className="font-display text-xl font-semibold mb-4">What's Next?</h2>
          <div className="bg-surface border border-accent/20 rounded-xl p-5 space-y-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              Your assessment highlights several opportunities that could significantly improve growth, monetisation, and positioning.
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">
              A personalised strategy discussion can help identify which opportunities are most relevant to your goals and whether creator management support would accelerate your progress.
            </p>
            <button
              onClick={() => startReportAction('discuss')}
              className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-gray-950 hover:bg-accent-2"
            >
              Book a Strategy Discussion with MGRNZ
            </button>
          </div>
        </section>

        {/* Report Actions */}
        <div className="border-t border-gray-800 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <button onClick={() => startReportAction('print')} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500">
              Print / Save
            </button>
            <button onClick={() => startReportAction('email')} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500">
              Email me this report
            </button>
            <button onClick={() => startReportAction('share')} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-500">
              Share report
            </button>
            <button onClick={() => startReportAction('discuss')} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-accent-2">
              Discuss my results
            </button>
          </div>
          {actionMessage && <p className="mt-3 text-center text-xs text-success">{actionMessage}</p>}
          {actionError && <p className="mt-3 text-center text-xs text-pink">{actionError}</p>}
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 px-4">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-surface p-5 shadow-2xl">
            <h2 className="font-display text-xl font-semibold">{AGENCY_PROMPT_COPY}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              A short MGRNZ strategy discussion can help translate your report into the most relevant next steps for your goals.
            </p>
            {actionError && <p className="mt-4 rounded-lg border border-pink/30 bg-pink/10 px-3 py-2 text-sm text-pink">{actionError}</p>}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={requestDiscussionAndRedirect}
                disabled={promptWorking}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-gray-950 hover:bg-accent-2 disabled:opacity-50"
              >
                {promptWorking ? 'Opening calendar...' : "Yes, I'd like to discuss my results"}
              </button>
              <button
                onClick={continueWithoutAgency}
                disabled={promptWorking}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 hover:border-gray-500 disabled:opacity-50"
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
