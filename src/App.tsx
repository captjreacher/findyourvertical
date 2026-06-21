import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AssessmentWizard } from './components/wizard/AssessmentWizard';
import { ReportPage } from './components/report/ReportPage';
import { CockpitLayout } from './components/cockpit/CockpitLayout';
import { CreatorPipeline } from './components/cockpit/CreatorPipeline';
import { CreatorProfileView } from './components/cockpit/CreatorProfileView';
import { AgencyDashboard } from './components/cockpit/AgencyDashboard';
import { AuthGate } from './components/cockpit/AuthGate';
import { AssessmentTemplates } from './components/cockpit/AssessmentTemplates';
import {
  consumeAuthRedirectPath,
  normalizeCockpitPath,
  supabase,
} from './lib/supabase';

function AuthCallback() {
  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const nextParam = params.get('next');
    const next = normalizeCockpitPath(nextParam ?? consumeAuthRedirectPath() ?? '/cockpit');

    console.log('[auth callback] URL received', window.location.href);
    console.log('[auth callback] next param', nextParam);

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
      console.log('[auth callback] session exists after callback', Boolean(session));
      console.log('[auth callback] final redirect path', finalRedirectPath);

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
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="animate-pulse text-gray-500">Signing you in...</div>
    </div>
  );
}

export default function App() {
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<AssessmentWizard />} />
        <Route path="/report/:slug" element={<ReportPage />} />

        {/* Cockpit (authenticated) */}
        <Route path="/cockpit/*" element={<AuthGate><CockpitLayout /></AuthGate>}>
          <Route index element={<AgencyDashboard />} />
          <Route path="creators" element={<CreatorPipeline />} />
          <Route path="creators/:profileId" element={<CreatorProfileView />} />
          <Route path="settings/assessment-templates" element={<AssessmentTemplates />} />
        </Route>
        <Route path="*" element={<AssessmentWizard />} />
      </Routes>
    </HashRouter>
  );
}
