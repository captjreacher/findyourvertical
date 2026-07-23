import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  consumeAuthRedirectPath,
  normalizeRedirectPath,
  supabase,
} from './lib/supabase';

const AssessmentWizard = lazy(() => import('./components/wizard/AssessmentWizard').then(module => ({ default: module.AssessmentWizard })));
const ReportPage = lazy(() => import('./components/report/ReportPage').then(module => ({ default: module.ReportPage })));
const CreatorServicesPage = lazy(() => import('./components/report/CreatorServicesPage').then(module => ({ default: module.CreatorServicesPage })));
const CockpitLayout = lazy(() => import('./components/cockpit/CockpitLayout').then(module => ({ default: module.CockpitLayout })));
const CreatorPipeline = lazy(() => import('./components/cockpit/CreatorPipeline').then(module => ({ default: module.CreatorPipeline })));
const CreatorAssessmentReview = lazy(() => import('./components/cockpit/CreatorAssessmentReview').then(module => ({ default: module.CreatorAssessmentReview })));
const CreatorProfileView = lazy(() => import('./components/cockpit/CreatorProfileView').then(module => ({ default: module.CreatorProfileView })));
const CreatorRelationships = lazy(() => import('./components/cockpit/CreatorRelationships').then(module => ({ default: module.CreatorRelationships })));
const CreatorIntelligence = lazy(() => import('./components/cockpit/creator-intelligence/CreatorIntelligence').then(module => ({ default: module.CreatorIntelligence })));
const AgencyDashboard = lazy(() => import('./components/cockpit/AgencyDashboard').then(module => ({ default: module.AgencyDashboard })));
const AuthGate = lazy(() => import('./components/cockpit/AuthGate').then(module => ({ default: module.AuthGate })));
const AssessmentTemplates = lazy(() => import('./components/cockpit/AssessmentTemplates').then(module => ({ default: module.AssessmentTemplates })));
const CreatorGate = lazy(() => import('./components/creator/CreatorGate').then(module => ({ default: module.CreatorGate })));
const CreatorHome = lazy(() => import('./components/creator/CreatorHome').then(module => ({ default: module.CreatorHome })));
const CharacterPossibilities = lazy(() => import('./components/creator/CharacterPossibilities').then(module => ({ default: module.CharacterPossibilities })));
const PersonaWorkspace = lazy(() => import('./components/creator/PersonaWorkspace').then(module => ({ default: module.PersonaWorkspace })));
const PersonaDetail = lazy(() => import('./components/creator/PersonaDetail').then(module => ({ default: module.PersonaDetail })));
const OnboardingFlow = lazy(() => import('./components/creator/OnboardingFlow').then(module => ({ default: module.OnboardingFlow })));
const OnboardingAccept = lazy(() => import('./components/creator/OnboardingAccept').then(module => ({ default: module.OnboardingAccept })));
const AcceptInvite = lazy(() => import('./components/creator/AcceptInvite').then(module => ({ default: module.AcceptInvite })));
const MyReportRedirect = lazy(() => import('./components/creator/MyReportRedirect').then(module => ({ default: module.MyReportRedirect })));
const CreatorAssessments = lazy(() => import('./components/creator/CreatorAssessments').then(module => ({ default: module.CreatorAssessments })));
const CreatorAccount = lazy(() => import('./components/creator/CreatorAccount').then(module => ({ default: module.CreatorAccount })));
const PublicHomePage = lazy(() => import('./pages/PublicHomePage').then(module => ({ default: module.PublicHomePage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then(module => ({ default: module.AboutPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(module => ({ default: module.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/TermsPage').then(module => ({ default: module.TermsPage })));

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const nextParam = params.get('next');

    const finishAuthRedirect = async () => {
      try {
        // 1. Exchange the PKCE code for a session
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (import.meta.env.DEV) {
              console.error('[auth callback] exchangeCodeForSession error', exchangeError);
            }
            if (mounted) {
              setError('Unable to complete sign-in. Please try again.');
            }
            return;
          }
        }

        // 2. Confirm a valid session exists before navigating
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          if (import.meta.env.DEV) {
            if (sessionError) console.error('[auth callback] getSession error', sessionError);
            if (!session) console.error('[auth callback] no session after code exchange');
          }
          if (mounted) {
            setError('Sign-in did not complete. Please try again.');
          }
          return;
        }

        // 3. Consume the stored redirect path only after successful auth.
        //    The URL 'next' param takes precedence; fall back to stored path or /my.
        const next = normalizeRedirectPath(nextParam ?? consumeAuthRedirectPath(), '/my');

        if (mounted) {
          window.location.replace(`${window.location.origin}/#${next}`);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[auth callback] unexpected error', err);
        }
        if (mounted) {
          setError('An unexpected error occurred. Please try again.');
        }
      }
    };

    void finishAuthRedirect();

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2 p-4">
        <div className="w-full max-w-md rounded-2xl border border-pink/30 bg-surface/92 p-6 text-center shadow-2xl shadow-black/25">
          <p className="text-sm text-pink" role="alert">{error}</p>
          <a href="/#/auth/login" className="btn-primary mt-4 inline-flex">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

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
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/a/:templateSlug" element={<AssessmentWizard />} />
          <Route path="/report/:slug" element={<ReportPage />} />
          <Route path="/creator-services" element={<CreatorServicesPage />} />
          {/* Public FYV access-invite acceptance (unauthenticated → provisions + signs in). */}
          <Route path="/accept-invite" element={<AcceptInvite />} />
          {/* Legacy public placeholder now routes into the authenticated onboarding
              flow (kills the old ?profileId= identity path). */}
          <Route path="/creator-services/onboarding" element={<Navigate to="/my/onboarding" replace />} />

          {/* Public information and legal pages. Keep these explicit so the
              catch-all route cannot redirect footer traffic to the cockpit. */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          <Route path="/auth/login" element={<CreatorGate><Navigate to="/my" replace /></CreatorGate>} />

          {/* Creator Home ("My Vertical") — authenticated creator self-service. */}
          <Route path="/my" element={<CreatorGate><CreatorHome /></CreatorGate>} />
          {/* Build Your Character Possibilities — archetype variation selection (FYV-PERSONA-1A). */}
          <Route path="/my/characters" element={<CreatorGate><CharacterPossibilities /></CreatorGate>} />
          {/* Your Character Portfolio — six generated draft personas (FYV-PERSONA-1B). */}
          <Route path="/my/personas" element={<CreatorGate><PersonaWorkspace /></CreatorGate>} />
          <Route path="/my/personas/:personaId" element={<CreatorGate><PersonaDetail /></CreatorGate>} />
          {/* Onboarding-first creator dashboard (FYV-ONBOARDING-FIRST). */}
          <Route path="/my/onboarding" element={<CreatorGate><OnboardingFlow /></CreatorGate>} />
          <Route path="/my/onboarding/accept" element={<CreatorGate><OnboardingAccept /></CreatorGate>} />
          <Route path="/my/report" element={<CreatorGate><MyReportRedirect /></CreatorGate>} />
          <Route path="/my/assessments" element={<CreatorGate><CreatorAssessments /></CreatorGate>} />
          <Route path="/my/account" element={<CreatorGate><CreatorAccount /></CreatorGate>} />

          <Route path="/cockpit/*" element={<AuthGate><CockpitLayout /></AuthGate>}>
            <Route index element={<AgencyDashboard />} />
            <Route path="creators" element={<CreatorPipeline />} />
            {/* FYV↔FMF creator relationship + access lifecycle console (agency-only). */}
            <Route path="relationships" element={<CreatorRelationships />} />
            <Route path="creators/:profileId/review" element={<CreatorAssessmentReview />} />
            <Route path="creators/:profileId" element={<CreatorProfileView />} />
            <Route path="creators/:profileId/intelligence" element={<CreatorIntelligence />} />
            <Route path="settings/assessment-templates" element={<AssessmentTemplates />} />
            <Route path="settings/assessment-templates/:templateId" element={<AssessmentTemplates />} />
            <Route path="settings/question-bank" element={<AssessmentTemplates />} />
            <Route path="settings/question-bank/new" element={<AssessmentTemplates />} />
            <Route path="settings/question-bank/:questionId/edit" element={<AssessmentTemplates />} />
          </Route>
          <Route path="*" element={<Navigate to="/cockpit" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
