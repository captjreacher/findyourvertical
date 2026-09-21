import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReportPage } from './ReportPage';
import * as api from '@/lib/creators-api';
vi.mock('@/lib/creators-api', () => ({ getReportBySlug: vi.fn(), trackCreatorEvent: vi.fn().mockResolvedValue(undefined) }));
const fixture = {
  id: 'report', creator_profile_id: 'owner', report_slug: 'original',
  report_json: {
    report_tier: 'free', archetype: 'Creative', archetype_description: 'A creative direction',
    free_report_summary: 'Book a strategy call to explore creator representation.',
    scores: { creator_dna: 60, brand_clarity: 50, monetisation: 55, consistency: 65, agency_opportunity: 90 },
    archetype_strengths: ['Creative'], archetype_risks: ['Limited time'], archetype_growth: ['Try a format'],
    top_verticals: [{ name: 'Fitness', rationale: 'Your selected interest' }],
    pricing_strategy: 'Test demand', winning_10_framework: 'Run experiments', growth_strategy: 'Review management support',
    tech_stack: [], day_90_plan: [], why_this_result: { summary: 'Based on your answers' },
    evidence_guidance: [{ heading: 'Camera confidence', content: 'Start with formats that fit your comfort level.' }],
    creator_agency_opportunity: { growth_potential: 'Growth', coaching_suitability: 'Personal coaching', recommended_support: 'Book a call' },
  },
};
beforeEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });
for (const tier of ['free', 'premium']) test(`${tier} historical report offers self-service plan and unblocked sharing`, async () => {
  vi.mocked(api.getReportBySlug).mockResolvedValue({ ...fixture, report_json: { ...fixture.report_json, report_tier: tier } } as any);
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  render(<MemoryRouter initialEntries={['/report/original']}><Routes><Route path="/report/:slug" element={<ReportPage />} /></Routes></MemoryRouter>);
  const cta = await screen.findByRole('link', { name: 'Build My Personal Vertical Plan' });
  expect(cta).toHaveAttribute('href', '/#/my/plan?report=original');
  expect(screen.getByText('What your answers suggest')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/book.*call|representation|personal coaching|management support|Coaching Suitability/i);
  expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Funk My Fans/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Share report' }));
  await waitFor(() => expect(copy).toHaveBeenCalled());
  expect(screen.queryByRole('dialog')).toBeNull();
});
