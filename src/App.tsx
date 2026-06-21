import { HashRouter, Routes, Route } from 'react-router-dom';
import { AssessmentWizard } from './components/wizard/AssessmentWizard';
import { ReportPage } from './components/report/ReportPage';
import { CockpitLayout } from './components/cockpit/CockpitLayout';
import { CreatorPipeline } from './components/cockpit/CreatorPipeline';
import { CreatorProfileView } from './components/cockpit/CreatorProfileView';
import { AgencyDashboard } from './components/cockpit/AgencyDashboard';
import { AuthGate } from './components/cockpit/AuthGate';
import { AssessmentTemplates } from './components/cockpit/AssessmentTemplates';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<AssessmentWizard />} />
        <Route path="/report/:slug" element={<ReportPage />} />

        {/* Cockpit (authenticated) */}
        <Route path="/cockpit" element={<AuthGate><CockpitLayout /></AuthGate>}>
          <Route index element={<AgencyDashboard />} />
          <Route path="creators" element={<CreatorPipeline />} />
          <Route path="creators/:profileId" element={<CreatorProfileView />} />
          <Route path="settings/assessment-templates" element={<AssessmentTemplates />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
