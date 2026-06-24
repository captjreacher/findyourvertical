import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllCreatorProfiles } from '@/lib/creators-api';
import type { CreatorProfile } from '@/types/creator';

const STATUS_COLORS: Record<string, string> = {
  'Assessment Complete': 'bg-gray-100 text-gray-700',
  Qualified: 'bg-accent/15 text-accent',
  'Discovery Booked': 'bg-accent/10 text-accent',
  'Proposal Sent': 'bg-warn/15 text-warn',
  Client: 'bg-success/10 text-success',
  'Managed Creator': 'bg-success/15 text-success',
  Archived: 'bg-pink/15 text-pink',
};

export function CreatorPipeline() {
  const [profiles, setProfiles] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAllCreatorProfiles()
      .then(p => setProfiles(p))
      .catch(() => setError('Unable to load the creator pipeline. Refresh the page or try again shortly.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse p-4 text-gray-500">Loading Pipeline...</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="cockpit-page">
      <header className="cockpit-page-header">
        <div>
          <p className="cockpit-eyebrow">Pipeline</p>
          <h1 className="cockpit-title">Creator Pipeline</h1>
          <p className="cockpit-subtitle">{profiles.length} creator{profiles.length !== 1 ? 's' : ''} tracked from assessment complete through managed creator.</p>
        </div>
        <Link to="/cockpit/settings/assessment-templates?invite=1" className="btn-primary">New Assessment Invite</Link>
      </header>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Email</th>
                <th>Archetype</th>
                <th>Agency Score</th>
                <th>Readiness</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/cockpit/creators/${p.id}`} className="font-medium text-charcoal transition-colors hover:text-accent">
                      {p.full_name}
                    </Link>
                  </td>
                  <td className="text-gray-600">{p.email ?? '-'}</td>
                  <td className="text-gray-700">{p.archetype ?? '-'}</td>
                  <td>
                    <span className={`font-semibold ${(p.agency_opportunity_score ?? 0) >= 60 ? 'text-success' : (p.agency_opportunity_score ?? 0) >= 40 ? 'text-warn' : 'text-pink'}`}>
                      {p.agency_opportunity_score ?? '-'}
                    </span>
                  </td>
                  <td className="text-gray-600">{p.management_readiness ?? '-'}</td>
                  <td className="capitalize text-gray-600">{p.audience_strategy ?? '-'}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">
                    {new Date(p.created_at!).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 && (
          <div className="p-12 text-center text-sm text-gray-600">
            No creators yet. Completed invite assessments will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
