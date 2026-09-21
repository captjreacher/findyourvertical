import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectSelfServiceReport } from '../src/lib/self-service-report.ts';

test('historical service recommendations are replaced only in the display projection', () => {
  const original = { actions: ['Book a strategy call', 'Explore creator representation', 'Review management support', 'Build a posting schedule'], description: 'Use state management and AI agents', nested: { text: 'Try personal coaching' } };
  const before = structuredClone(original);
  const projected = projectSelfServiceReport(original);
  assert.doesNotMatch(JSON.stringify(projected), /strategy call|creator representation|management support|personal coaching/i);
  assert.match(projected.actions[0], /Personal Vertical Plan/);
  assert.equal(projected.actions[3], original.actions[3]);
  assert.equal(projected.description, original.description);
  assert.deepEqual(original, before);
});

test('public report actions have no service interception and both tiers offer the plan', () => {
  const report = readFileSync(new URL('../src/components/report/ReportPage.tsx', import.meta.url), 'utf8');
  assert.equal((report.match(/<PlanJourneyCta reportSlug=/g) ?? []).length, 2);
  assert.equal((report.match(/What your answers suggest/g) ?? []).length, 2);
  assert.doesNotMatch(report, /pendingAction|agencyAnswer|requestStrategyDiscussion|trackAgencyCalendarClick|mailto:|Book Strategy Call|Coaching Suitability/);
  assert.match(report, /projectSelfServiceReport\(report.report_json/);
  assert.match(report, /createReportPdfBlob\(d,/);
});

test('all retired service pages redirect to the same digital plan journey', () => {
  for (const path of ['components/report/CreatorServicesPage', 'components/report/CreatorOnboardingPage', 'pages/CreatorServicesPage', 'pages/CreatorOnboardingPage', 'components/creator/OnboardingFlow']) {
    const source = readFileSync(new URL(`../src/${path}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /<Navigate to=\{`\/my\/plan\$\{search\}`\} replace/);
    assert.doesNotMatch(source, /calendly|Book.*Call|mailto:/i);
  }
});
