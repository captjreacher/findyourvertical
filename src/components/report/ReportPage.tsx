import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getReportBySlug, requestStrategyDiscussion, trackAgencyCalendarClick, trackCreatorEvent } from '@/lib/creators-api';
import type { CreatorReport, ReportData } from '@/types/creator';

const CALENDLY_URL = 'https://calendly.com/mikegrobinson/20-min';
const AGENCY_PROMPT_COPY = 'Would you like to discuss what this result could mean for your creator growth?';

type ReportAction = 'download' | 'email' | 'share' | 'discuss';
type AgencyAnswer = 'yes' | 'no';

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-success' : score >= 45 ? 'bg-warn' : 'bg-pink';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{score}/100</span>
      </div>
      <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-colors`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ScoreCard({ title, scores }: { title: string; scores: Record<string, number> }) {
  return (
    <div className="bg-surface border border-gray-200 rounded-xl p-5">
      <h3 className="font-display font-semibold text-lg mb-4">{title}</h3>
      <div className="space-y-3">
        {Object.entries(scores).map(([k, v]) => (
          <ScoreBar key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} score={v} />
        ))}
      </div>
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
          void trackCreatorEvent({
            profileId: r.creator_profile_id,
            eventType: 'report_viewed',
            details: { report_slug: r.report_slug, viewed_at: new Date().toISOString() },
          });
        }
      })
      .catch(() => setLoadError('Unable to load this report. Check the link or contact the person who sent it to you.'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-500">Loading Report…</div>
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <h1 className="font-display text-2xl font-bold mb-4">Report Not Found</h1>
        <p className="max-w-md text-center text-sm leading-6 text-gray-600">
          {loadError || 'This report link may have expired or been moved. Check the link or contact the person who sent it to you.'}
        </p>
      </div>
    );
  }

  const d = report.report_json as unknown as ReportData;
  const publicScores = Object.fromEntries(
    Object.entries(d.scores).filter(([key]) => key !== 'agency_opportunity')
  ) as Record<string, number>;

  const downloadPdf = async () => {
    const blob = createReportPdfBlob(d, publicScores);
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
      eventType: 'report_downloaded',
      details: { report_slug: report.report_slug, downloaded_at: new Date().toISOString(), format: 'pdf' },
    });
  };

  const performReportAction = async (action: ReportAction) => {
    setActionError('');
    setActionMessage('');

    if (action === 'download') {
      await downloadPdf();
      return;
    }

    if (action === 'email') {
      await trackCreatorEvent({
        profileId: report.creator_profile_id,
        eventType: 'report_emailed',
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
          eventType: 'report_shared',
          details: { report_slug: report.report_slug, shared_at: new Date().toISOString(), method: 'native_share' },
        });
        return;
      }

      await navigator.clipboard.writeText(window.location.href);
      await trackCreatorEvent({
        profileId: report.creator_profile_id,
        eventType: 'report_shared',
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="border-b border-gray-200 bg-surface/50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">Find Your Vertical Report</p>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2">{d.archetype}</h1>
              <p className="text-gray-600 max-w-lg">{d.archetype_description}</p>
            </div>
            <ConfidenceBadge confidence={d.result_confidence ?? 'Moderate'} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-gray-900">Your Find Your Vertical Report</h2>
          <div className="space-y-3 text-sm leading-6 text-gray-600">
            <p>This report is designed to help you understand where your greatest creator opportunities exist today.</p>
            <p>The recommendations are based on your responses, creator profile, content preferences, commercial goals, and growth readiness.</p>
            <p>Use this report as a starting point—not a final destination. The most successful creators continuously refine their positioning, content strategy, and audience focus over time.</p>
            <p>Review your results below and pay particular attention to the recommended actions and opportunities with the highest potential impact.</p>
          </div>
        </section>

        {/* Scores */}
        <ScoreCard title="Creator Signals" scores={publicScores} />

        {d.why_this_result && (
          <section>
            <h2 className="font-display text-xl font-semibold mb-4">Why This Result?</h2>
            <div className="bg-surface border border-gray-200 rounded-xl p-5 space-y-5">
              <p className="text-sm text-gray-700 leading-relaxed">{d.why_this_result.summary}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Behavioural Signals</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_behavioural_signals ?? d.why_this_result.top_signals ?? []).map(signal => (
                      <li key={signal} className="text-sm text-gray-600">{signal}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Creator Strengths</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_creator_strengths ?? d.why_this_result.strongest_answers ?? []).map(answer => (
                      <li key={answer} className="text-sm text-gray-600">{answer}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-accent mb-2">Content Signals</h3>
                  <ul className="space-y-1.5">
                    {(d.why_this_result.strongest_content_opportunity_signals ?? d.why_this_result.key_differentiators ?? []).map(item => (
                      <li key={item} className="text-sm text-gray-600">{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Archetype Deep Dive */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface border border-success/30 rounded-xl p-5">
            <h3 className="font-semibold text-success mb-3 text-sm uppercase tracking-wide">Strengths</h3>
            <ul className="space-y-2">{d.archetype_strengths.map(s => <li key={s} className="text-sm text-gray-700 flex gap-2"><span className="text-success">+</span>{s}</li>)}</ul>
          </div>
          <div className="bg-surface border border-pink/20 rounded-xl p-5">
            <h3 className="font-semibold text-pink mb-3 text-sm uppercase tracking-wide">Risks</h3>
            <ul className="space-y-2">{d.archetype_risks.map(s => <li key={s} className="text-sm text-gray-700 flex gap-2"><span className="text-pink">!</span>{s}</li>)}</ul>
          </div>
          <div className="bg-surface border border-accent/20 rounded-xl p-5">
            <h3 className="font-semibold text-accent mb-3 text-sm uppercase tracking-wide">Growth</h3>
            <ul className="space-y-2">{d.archetype_growth.map(s => <li key={s} className="text-sm text-gray-700 flex gap-2"><span className="text-accent">→</span>{s}</li>)}</ul>
          </div>
        </section>

        {/* Top 3 Verticals */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Top 3 Content Verticals</h2>
          <p className="text-sm text-gray-500 mb-4">These are recommended directions to explore, not a fixed content plan.</p>
          <div className="space-y-3">
            {d.top_verticals.map((v, i) => (
              <div key={v.name} className="bg-surface border border-gray-200 rounded-xl p-5 flex gap-4">
                <span className="font-display text-3xl text-accent shrink-0">0{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{v.name}</h3>
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
            <p className="text-sm text-gray-700 leading-relaxed">{d.pricing_strategy}</p>
          </div>
        </section>

        {/* Winning 10 */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Content Testing Opportunity</h2>
          <div className="bg-surface border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 leading-relaxed">{d.winning_10_framework}</p>
          </div>
        </section>

        {/* Growth Strategy */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Growth Opportunity</h2>
          <div className="bg-surface border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700 leading-relaxed">{d.growth_strategy}</p>
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <h2 className="font-display text-xl font-semibold mb-4">Support Systems to Consider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {d.tech_stack.map(t => (
              <div key={t.tool} className="bg-surface border border-gray-200 rounded-xl p-4">
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
              <div key={phase.phase} className="bg-surface border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-accent mb-1">{phase.phase}</h3>
                <p className="text-xs text-gray-500 mb-3">{phase.focus}</p>
                <ul className="space-y-1.5">
                  {phase.actions.map(a => (
                    <li key={a} className="text-sm text-gray-700 flex gap-2">
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
            <p className="text-sm text-gray-700 leading-relaxed">
              Your assessment highlights several opportunities that could significantly improve positioning, audience growth, and monetisation.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A strategy discussion can help determine which opportunities are most relevant to your goals and whether creator management support could accelerate your progress.
            </p>
            <button
              onClick={() => startReportAction('discuss')}
              className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-2"
            >
              Discuss My Results
            </button>
          </div>
        </section>

        {/* Report Actions */}
        <div className="border-t border-gray-200 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <button onClick={() => startReportAction('download')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400">
              Download My Report
            </button>
            <button onClick={() => startReportAction('email')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400">
              Email me this report
            </button>
            <button onClick={() => startReportAction('share')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400">
              Share report
            </button>
            <button onClick={() => startReportAction('discuss')} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-2">
              Discuss My Results
            </button>
          </div>
          {actionMessage && <p className="mt-3 text-center text-xs text-success">{actionMessage}</p>}
          {actionError && <p className="mt-3 text-center text-xs text-pink">{actionError}</p>}
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-surface p-5 shadow-2xl">
            <h2 className="font-display text-xl font-semibold">{AGENCY_PROMPT_COPY}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              A short MGRNZ strategy discussion can help translate your report into the most relevant next steps for your goals.
            </p>
            {actionError && <p className="mt-4 rounded-lg border border-pink/30 bg-pink/10 px-3 py-2 text-sm text-pink">{actionError}</p>}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={requestDiscussionAndRedirect}
                disabled={promptWorking}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
              >
                {promptWorking ? 'Opening Calendar�' : "Yes, I'd Like to Discuss My Results"}
              </button>
              <button
                onClick={continueWithoutAgency}
                disabled={promptWorking}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50"
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
  const colors: Record<ReportData['result_confidence'], string> = {
    High: 'bg-success/20 text-success border-success/30',
    Moderate: 'bg-warn/20 text-warn border-warn/30',
    Low: 'bg-pink/20 text-pink border-pink/30',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors[confidence]}`}>
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

function createReportPdfBlob(report: ReportData, publicScores: Record<string, number>): Blob {
  const why = report.why_this_result;
  const sections: Array<{ title: string; body: string[] }> = [
    {
      title: 'Result Confidence',
      body: [report.result_confidence ?? 'Moderate'],
    },
    {
      title: 'Creator Scores',
      body: Object.entries(publicScores).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}/100`),
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
      title: "What's Next?",
      body: [
        'Your assessment highlights several opportunities that could significantly improve positioning, audience growth, and monetisation.',
        'A strategy discussion can help determine which opportunities are most relevant to your goals and whether creator management support could accelerate your progress.',
      ],
    },
  ];

  const pages: string[][] = [[]];
  let y = 770;
  const addLine = (line: string, fontSize = 10) => {
    if (y < 50) {
      pages.push([]);
      y = 770;
    }
    pages[pages.length - 1].push(`BT /F1 ${fontSize} Tf 50 ${y} Td (${pdfEscape(line)}) Tj ET`);
    y -= fontSize + 5;
  };

  addLine('MGRNZ Creator Assessment', 10);
  addLine('Find Your Vertical Report', 18);
  addLine(report.archetype, 14);
  wrapPdfText(report.archetype_description).forEach(line => addLine(line));
  y -= 8;

  for (const section of sections) {
    addLine(section.title, 13);
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




