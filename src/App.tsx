import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  consumeAuthRedirectPath,
  normalizeCockpitPath,
  supabase,
} from './lib/supabase';

const AssessmentWizard = lazy(() => import('./components/wizard/AssessmentWizard').then(module => ({ default: module.AssessmentWizard })));
const ReportPage = lazy(() => import('./components/report/ReportPage').then(module => ({ default: module.ReportPage })));
const CockpitLayout = lazy(() => import('./components/cockpit/CockpitLayout').then(module => ({ default: module.CockpitLayout })));
const CreatorPipeline = lazy(() => import('./components/cockpit/CreatorPipeline').then(module => ({ default: module.CreatorPipeline })));
const CreatorAssessmentReview = lazy(() => import('./components/cockpit/CreatorAssessmentReview').then(module => ({ default: module.CreatorAssessmentReview })));
const CreatorProfileView = lazy(() => import('./components/cockpit/CreatorProfileView').then(module => ({ default: module.CreatorProfileView })));
const CreatorIntelligence = lazy(() => import('./components/cockpit/creator-intelligence/CreatorIntelligence').then(module => ({ default: module.CreatorIntelligence })));
const AgencyDashboard = lazy(() => import('./components/cockpit/AgencyDashboard').then(module => ({ default: module.AgencyDashboard })));
const AuthGate = lazy(() => import('./components/cockpit/AuthGate').then(module => ({ default: module.AuthGate })));
const AssessmentTemplates = lazy(() => import('./components/cockpit/AssessmentTemplates').then(module => ({ default: module.AssessmentTemplates })));

function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 p-4">
      <div className="animate-pulse text-sm text-charcoal-2" role="status">{label}</div>
    </div>
  );
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function AuthCallback() {
  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const nextParam = params.get('next');
    const next = normalizeCockpitPath(nextParam ?? consumeAuthRedirectPath() ?? '/cockpit');

    const finishAuthRedirect = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[auth callback] exchangeCodeForSession error', error);
        }
      }

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[auth callback] getSession error', error);
      }

      const finalRedirectPath = `/#${next}`;

      if (mounted) {
        window.location.replace(`${window.location.origin}${finalRedirectPath}`);
      }
    };

    void finishAuthRedirect();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <LoadingScreen label="Signing you in…" />
  );
}

export default function App() {
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  const assessmentMatch = window.location.pathname.match(/^\/a\/([^/?#]+)\/?$/);
  if (assessmentMatch) {
    return (
      <HashRouter>
        <ScrollToTop />
        <Suspense fallback={<LoadingScreen label="Loading assessment…" />}>
          <AssessmentWizard templateSlug={decodeURIComponent(assessmentMatch[1])} />
        </Suspense>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <ScrollToTop />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/cockpit" replace />} />
          <Route path="/a/:templateSlug" element={<AssessmentWizard />} />
          <Route path="/report/:slug" element={<ReportPage />} />

          <Route path="/cockpit/*" element={<AuthGate><CockpitLayout /></AuthGate>}>
            <Route index element={<AgencyDashboard />} />
            <Route path="creators" element={<CreatorPipeline />} />
            <Route path="creators/:profileId/review" element={<CreatorAssessmentReview />} />
            <Route path="creators/:profileId" element={<CreatorProfileView />} />
            <Route path="creators/:profileId/intelligence" element={<CreatorIntelligence />} />
            <Route path="settings/assessment-templates" element={<AssessmentTemplates />} />
            <Route path="settings/assessment-templates/:templateId" element={<AssessmentTemplates />} />
            <Route path="settings/question-bank" element={<AssessmentTemplates />} />
          </Route>
          <Route path="*" element={<Navigate to="/cockpit" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
