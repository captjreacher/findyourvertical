import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardMetrics } from '@/lib/creators-api';
import type { DashboardMetrics } from '@/lib/creators-api';

function MetricCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="cockpit-card-pad">
      <div className="metric-value">{value}</div>
      <div className="mt-2 text-sm font-semibold text-charcoal">{label}</div>
      {subtitle && <div className="mt-1 text-xs leading-5 text-charcoal-2">{subtitle}</div>}
    </div>
  );
}

export function AgencyDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboardMetrics()
      .then(m => setMetrics(m))
      .catch(() => setError('Unable to load dashboard metrics. Refresh the page or try again shortly.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse p-4 text-charcoal-2">Loading Dashboard...</div>;
  if (error || !metrics) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || 'Unable to load dashboard metrics.'}</div>;

  return (
    <div className="cockpit-page">
      <header className="cockpit-page-header">
        <div>
          <p className="cockpit-eyebrow">Creators Cockpit</p>
          <h1 className="cockpit-title">Agency Dashboard</h1>
          <p className="cockpit-subtitle">Monitor creator pipeline quality, qualification, and conversion momentum.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Creator Profiles" value={metrics.totalProfiles} />
        <MetricCard label="Invites Created" value={metrics.invitesCreated} />
        <MetricCard label="Assessments Started" value={metrics.assessmentsStarted} />
        <MetricCard label="Assessments Completed" value={metrics.assessmentsCompleted} />
        <MetricCard label="Completion Rate" value={`${metrics.completionRate}%`} subtitle="Completed / started invites" />
        <MetricCard label="Agency Interest" value={metrics.agencyInterestCount} subtitle="Creators who requested a strategy discussion" />
        <MetricCard label="Strategy Call Clicks" value={metrics.strategyCallClicks} />
        <MetricCard label="Qualified Creators" value={metrics.qualifiedCreators} subtitle="Qualified through client" />
        <MetricCard label="Active Creators" value={metrics.activeCreators} subtitle="Client status" />
        <MetricCard label="Average Agency Score" value={metrics.avgAgencyScore} subtitle="Out of 100" />
        <MetricCard label="Scale Candidates" value={metrics.scaleCandidates} />
        <MetricCard label="Conversion Rate" value={`${metrics.conversionRate}%`} subtitle="Qualified + Active / Total" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/cockpit/creators"
          className="cockpit-card-pad group transition-colors hover:border-accent/40 hover:shadow-md hover:shadow-black/10"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="cockpit-section-title transition-colors group-hover:text-accent">Creator Pipeline</h3>
              <p className="mt-1 text-sm text-charcoal-2">View and manage all creator profiles</p>
            </div>
            <span className="text-xl font-semibold text-accent">-&gt;</span>
          </div>
        </Link>
        <Link
          to="/cockpit/settings/assessment-templates"
          className="cockpit-card-pad group transition-colors hover:border-accent/40 hover:shadow-md hover:shadow-black/10"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="cockpit-section-title transition-colors group-hover:text-accent">Assessment Templates</h3>
              <p className="mt-1 text-sm text-charcoal-2">Manage templates and invite-only assessment links</p>
            </div>
            <span className="text-xl font-semibold text-accent">-&gt;</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
