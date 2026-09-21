// Isolated local smoke: intercept all external traffic; never touch production data.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const out = path.join(process.env.TEMP || '/tmp', 'fyv-browser-smoke');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const data = {
  report_tier: 'free', archetype: 'Creative', archetype_description: 'A creative direction',
  free_report_summary: 'Book a strategy call to explore creator representation.',
  scores: { creator_dna: 60, brand_clarity: 50, monetisation: 55, consistency: 65, agency_opportunity: 90 },
  archetype_strengths: ['Creative'], archetype_risks: ['Limited time'], archetype_growth: ['Try a format'],
  top_verticals: [{ name: 'Fitness', rationale: 'Your selected interest' }],
  pricing_strategy: 'Test demand', winning_10_framework: 'Run experiments', growth_strategy: 'Review management support',
  tech_stack: [], day_90_plan: [], why_this_result: { summary: 'Based on your answers' },
  evidence_guidance: [{ heading: 'Camera confidence', content: 'Start with formats that fit your comfort level.' }],
};
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    let tier = 'free';
    let entitled = false, interest = null;
    let stages = [], suggestions = [];
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
    const reply = (route, json) => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/plans/guide') {
        const suggestion = { id: 'fixture-suggestion', stage_key: 'direction', stage_revision: stages[0]?.revision ?? 0, suggestion: { vertical: 'Suggested fitness direction' }, provider: 'fixture', model: 'fixture', created_at: '' };
        suggestions.push(suggestion); return reply(route, suggestion);
      }
      if (url.hostname === '127.0.0.1' && url.port === '5173') return route.continue();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' } });
      if (url.pathname === '/auth/v1/token') return reply(route, { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIiwiZXhwIjo5OTk5OTk5OTk5fQ.fixture', token_type: 'bearer', refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user });
      if (url.pathname === '/auth/v1/user') return reply(route, user);
      if (url.pathname.endsWith('/is_agency')) return reply(route, false);
      if (url.pathname === '/rest/v1/creator_profiles') return reply(route, { id: user.id, auth_user_id: user.id, full_name: 'Fixture Creator', email: user.email });
      if (url.pathname.endsWith('/fyv_get_plan_access')) return reply(route, { entitled, interest });
      if (url.pathname.endsWith('/fyv_request_personal_plan')) { interest = { id: 'fixture-request', status: 'requested', catalogue_status: 'pending_configuration', created_at: '' }; return reply(route, interest); }
      if (url.pathname.endsWith('/fyv_open_personal_plan')) return reply(route, { plan: { id: 'fixture-plan', status: 'draft', assessment_id: 'fixture-assessment', report_id: 'fixture-report' }, stages, suggestions, assessment: { id: 'fixture-assessment', answers: {} }, report: { report_json: data } });
      if (url.pathname.endsWith('/fyv_save_plan_stage')) {
        const input = route.request().postDataJSON();
        const saved = { stage_key: input.p_stage, data: input.p_data, completed: input.p_complete, revision: input.p_revision+1, approved_suggestion_id: input.p_suggestion_id ?? null };
        stages = [...stages.filter(s => s.stage_key !== saved.stage_key), saved]; return reply(route, saved);
      }
      if (url.pathname.includes('/rest/v1/creator_reports')) return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: {
        id: 'fixture', report_slug: 'fixture', creator_profile_id: 'fixture-owner', report_json: { ...data, report_tier: tier },
      }});
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    for (tier of ['free', 'premium']) {
      await page.goto(`http://127.0.0.1:5173/#/report/fixture`);
      await page.reload();
      const cta = page.getByRole('link', { name: 'Build My Personal Vertical Plan' });
      try { await cta.waitFor(); } catch (e) { console.log({ errors, body: await page.locator('body').innerText() }); throw e; }
      assert.equal(await cta.getAttribute('href'), '/#/my/plan?report=fixture');
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /book.*call|creator representation|management support|Coaching Suitability/i);
      assert.match(text, /Coming Soon/);
      assert.match(text, /What your answers suggest/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await cta.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `${tier}-${width}.png`) });
      await cta.click();
      await page.getByRole('button', { name: /sign in/i, exact: true }).waitFor();
      assert.match(page.url(), /my\/plan\?report=fixture/);
    }
    for (const route of ['/creator-services', '/creator-services/onboarding', '/my/onboarding']) {
      await page.goto(`http://127.0.0.1:5173/#${route}`);
      await page.getByRole('button', { name: /sign in/i, exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('body').innerText(), /book.*call|consultation/i);
    }
    await page.goto('http://127.0.0.1:5173/#/my/plan?report=fixture');
    await page.getByPlaceholder('Email address').fill(user.email);
    await page.getByPlaceholder('Password', { exact: true }).fill('fixture-password-only');
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
    await page.getByRole('button', { name: 'Build My Personal Vertical Plan' }).click();
    await page.getByText('Status: Request received').waitFor();
    entitled = true; // Test response only; no real entitlement mutation.
    await page.getByRole('button', { name: 'Check access' }).click();
    await page.getByLabel('Your chosen vertical').fill('Fitness');
    await page.getByLabel('Why this fits you').fill('My interest');
    await page.getByLabel('Boundaries you want to keep').fill('Keep it non-explicit');
    await page.getByRole('button', { name: 'Save progress', exact: true }).click();
    await page.getByText('Progress saved.', { exact: true }).waitFor();
    await page.reload();
    await page.getByLabel('Your chosen vertical').waitFor();
    assert.equal(await page.getByLabel('Your chosen vertical').inputValue(), 'Fitness');
    await page.getByRole('button', { name: 'Help me refine this' }).click();
    await page.getByText('Suggested fitness direction', { exact: true }).waitFor();
    assert.equal(stages[0].data.vertical, 'Fitness');
    await page.getByRole('button', { name: 'Use as editable draft' }).click();
    await page.getByLabel('Your chosen vertical').fill('My edited direction');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByLabel('Who you want to reach').waitFor();
    assert.equal(stages[0].data.vertical, 'My edited direction');
    assert.equal(stages[0].approved_suggestion_id, 'fixture-suggestion');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `wizard-${width}.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: desktop/mobile reports, legacy routes, sign-in, POA request, mocked grant, wizard save/reload, AI adoption/edit/progression; no overflow or runtime errors. Screenshots: ${out}`);
} finally { await browser.close(); }
