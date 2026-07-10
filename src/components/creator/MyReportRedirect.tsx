import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreatorShell } from './CreatorShell';
import { useCreatorSession } from './CreatorGate';
import { getReportsForProfile } from '@/lib/creators-api';

/** Sidebar "My Report" target: jump to the creator's latest report, or explain
 *  there isn't one yet. Report access is unchanged (public /report/:slug). */
export function MyReportRedirect() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'none' | 'error'>('loading');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const reports = await getReportsForProfile(profile.id);
        const latest = reports[0] ?? null;
        if (!mounted) return;
        if (latest?.report_slug) {
          navigate(`/report/${latest.report_slug}`, { replace: true });
          return;
        }
        setState('none');
      } catch {
        if (mounted) setState('error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile.id, navigate]);

  return (
    <CreatorShell>
      <div className="mx-auto max-w-2xl">
        {state === 'loading' && (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Opening your latest report…
          </div>
        )}
        {state === 'none' && (
          <div className="rounded-2xl border border-white/10 bg-surface p-6">
            <h1 className="text-lg font-bold text-charcoal">No report yet</h1>
            <p className="mt-2 text-sm text-charcoal-2">Complete an assessment to generate your personalised report.</p>
            <Link to="/my" className="btn-primary mt-4 inline-flex text-sm">Back to Home</Link>
          </div>
        )}
        {state === 'error' && (
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            We could not load your report. Please refresh.
          </div>
        )}
      </div>
    </CreatorShell>
  );
}
