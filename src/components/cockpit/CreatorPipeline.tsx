import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCreatorPipelineSummaries } from '@/lib/creators-api';
import type { CreatorPipelineSummary } from '@/types/creator';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-surface-3 text-charcoal',
  Invited: 'bg-accent/10 text-accent',
  Started: 'bg-warn/15 text-warn',
  Completed: 'bg-surface-3 text-charcoal',
  Interested: 'bg-accent/15 text-accent',
  Qualified: 'bg-accent/15 text-accent',
  'Meeting Booked': 'bg-success/10 text-success',
  Client: 'bg-success/10 text-success',
  Declined: 'bg-pink/15 text-pink',
};

export function CreatorPipeline() {
  const [profiles, setProfiles] = useState<CreatorPipelineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getCreatorPipelineSummaries()
      .then(p => setProfiles(p))
      .catch(() => setError('Unable to load the creator pipeline. Refresh the page or try again shortly.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse p-4 text-charcoal-2">Loading Pipeline...</div>;
  if (error) return <div className="rounded-lg border border-pink/30 bg-pink/10 p-4 text-sm text-pink">{error}</div>;

  return (
    <div className="cockpit-page">
      <header className="cockpit-page-header">
        <div>
          <p className="cockpit-eyebrow">Pipeline</p>
          <h1 className="cockpit-title">Creator Pipeline</h1>
          <p className="cockpit-subtitle">{profiles.length} creator{profiles.length !== 1 ? 's' : ''} tracked from invite through client relationship.</p>
        </div>
        <Link to="/cockpit/settings/assessment-templates?invite=1" className="btn-primary">New Assessment Invite</Link>
      </header>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Status</th>
                <th>Latest Invite</th>
                <th>Latest Assessment</th>
                <th>Agency Score</th>
                <th>Last Activity</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/cockpit/creators/${p.id}`} className="font-medium text-charcoal transition-colors hover:text-accent">
                      {p.full_name}
                    </Link>
                    <div className="mt-1 text-xs text-charcoal-2">{p.email ?? p.onlyfans_handle ?? '-'}</div>
                  </td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-surface-3 text-charcoal'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="text-charcoal-2">{p.latest_invite_status ?? '-'}</td>
                  <td className="text-charcoal-2">{p.latest_assessment_status}</td>
                  <td>
                    <span className={`font-semibold ${(p.agency_opportunity_score ?? 0) >= 60 ? 'text-success' : (p.agency_opportunity_score ?? 0) >= 40 ? 'text-warn' : 'text-pink'}`}>
                      {p.agency_opportunity_score ?? '-'}
                    </span>
                  </td>
                  <td className="text-xs text-charcoal-2">
                    {p.last_activity_at ? new Date(p.last_activity_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="text-charcoal">{p.next_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 && (
          <div className="p-12 text-center text-sm text-charcoal-2">
            No creators yet. Completed invite assessments will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
