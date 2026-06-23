import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllCreatorProfiles } from '@/lib/creators-api';
import type { CreatorProfile } from '@/types/creator';

const STATUS_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  assessed: 'bg-gray-100 text-gray-700',
  qualified: 'bg-accent/20 text-accent',
  interviewed: 'bg-accent/10 text-accent',
  accepted: 'bg-success/10 text-success',
  onboarding: 'bg-warn/20 text-warn',
  active: 'bg-success/20 text-success',
  paused: 'bg-gray-100 text-gray-700',
  offboarded: 'bg-pink/20 text-pink',
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

  if (loading) return <div className="animate-pulse text-gray-500 p-4">Loading Pipeline…</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Creator Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">{profiles.length} creator{profiles.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="bg-surface border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Archetype</th>
                <th className="px-4 py-3 font-medium">Agency Score</th>
                <th className="px-4 py-3 font-medium">Readiness</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-gray-200/50 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/cockpit/creators/${p.id}`} className="text-gray-900 hover:text-accent font-medium">
                      {p.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{p.archetype ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${(p.agency_opportunity_score ?? 0) >= 60 ? 'text-success' : (p.agency_opportunity_score ?? 0) >= 40 ? 'text-warn' : 'text-pink'}`}>
                      {p.agency_opportunity_score ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.management_readiness ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{p.audience_strategy ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(p.created_at!).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 && (
          <div className="p-12 text-center text-gray-600 text-sm">
            No creators yet. Completed invite assessments will appear here.
          </div>
        )}
      </div>
    </div>
  );
}


