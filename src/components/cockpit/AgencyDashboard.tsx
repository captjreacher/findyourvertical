import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardMetrics } from '@/lib/creators-api';
import type { DashboardMetrics } from '@/lib/creators-api';

function MetricCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-surface border border-gray-800 rounded-xl p-5">
      <div className="text-3xl font-bold font-display text-accent">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
      {subtitle && <div className="text-xs text-gray-600 mt-1">{subtitle}</div>}
    </div>
  );
}

export function AgencyDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardMetrics().then(m => { setMetrics(m); setLoading(false); });
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500 p-4">Loading dashboard...</div>;
  if (!metrics) return <div className="text-gray-500 p-4">Unable to load metrics.</div>;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-6">Agency Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Creator Profiles" value={metrics.totalProfiles} />
        <MetricCard label="Assessments Completed" value={metrics.assessmentsCompleted} />
        <MetricCard label="Qualified Creators" value={metrics.qualifiedCreators} subtitle="Interviewed + Accepted + Active" />
        <MetricCard label="Active Creators" value={metrics.activeCreators} />
        <MetricCard label="Average Agency Score" value={metrics.avgAgencyScore} subtitle="Out of 100" />
        <MetricCard label="Scale Candidates" value={metrics.scaleCandidates} />
        <MetricCard label="Conversion Rate" value={`${metrics.conversionRate}%`} subtitle="Qualified + Active / Total" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/cockpit/creators"
          className="bg-surface border border-gray-800 rounded-xl p-5 hover:border-accent/30 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-200 group-hover:text-accent transition-colors">Creator Pipeline</h3>
              <p className="text-sm text-gray-500 mt-1">View and manage all creator profiles</p>
            </div>
            <span className="text-2xl">→</span>
          </div>
        </Link>
        <a
          href="/#/"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-surface border border-gray-800 rounded-xl p-5 hover:border-accent/30 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-200 group-hover:text-accent transition-colors">Public Assessment Wizard</h3>
              <p className="text-sm text-gray-500 mt-1">Open the creator-facing assessment tool</p>
            </div>
            <span className="text-2xl">↗</span>
          </div>
        </a>
      </div>
    </div>
  );
}
