import { useEffect, useState } from 'react';
import { CreatorShell } from './CreatorShell';
import { useCreatorSession } from './CreatorGate';
import { getAssessmentsForProfile, getReportsForProfile } from '@/lib/creators-api';
import type { CreatorAssessment, CreatorReport } from '@/types/creator';

function fmt(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function CreatorAssessments() {
  const { profile } = useCreatorSession();
  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getAssessmentsForProfile(profile.id), getReportsForProfile(profile.id)])
      .then(([a, r]) => {
        if (!mounted) return;
        setAssessments(a);
        setReports(r);
      })
      .catch(() => mounted && setError('We could not load your assessments. Please refresh.'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  const reportFor = (a: CreatorAssessment): CreatorReport | null => {
    if (!reports.length) return null;
    const t = new Date(a.created_at).getTime();
    let best: CreatorReport | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const r of reports) {
      const diff = Math.abs(new Date(r.created_at).getTime() - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }
    return best;
  };

  return (
    <CreatorShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-charcoal">Assessments</h1>
        <p className="mt-1 text-sm text-charcoal-2">Your assessment history and the report generated from each.</p>
        <section className="mt-5 rounded-2xl border border-white/10 bg-surface p-5">
          {loading ? (
            <p className="text-sm text-charcoal-2">Loading your history…</p>
          ) : error ? (
            <p className="text-sm text-pink" role="alert">{error}</p>
          ) : assessments.length === 0 ? (
            <p className="text-sm text-charcoal-2">No assessments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-charcoal-2">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map(a => {
                    const r = reportFor(a);
                    return (
                      <tr key={a.id} className="border-t border-white/5">
                        <td className="py-2 pr-4 text-charcoal-2">{fmt(a.created_at)}</td>
                        <td className="py-2 pr-4">
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Completed</span>
                        </td>
                        <td className="py-2 pr-4">
                          {r ? (
                            <a href={`#/report/${r.report_slug}`} className="text-xs font-medium text-accent hover:underline">View report</a>
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
        </section>
      </div>
    </CreatorShell>
  );
}
