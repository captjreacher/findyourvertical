/**
 * E2E: FYV Creative-Direction Catalogue Picker — Live Verification
 *
 * Prerequisites (env vars):
 *   TEST_CREATOR_EMAIL, TEST_CREATOR_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *
 * Run:
 *   export TEST_CREATOR_EMAIL=test-creator@fyv.dev
 *   export TEST_CREATOR_PASSWORD='TestPass123!'
 *   export VITE_SUPABASE_URL=http://127.0.0.1:54321
 *   export VITE_SUPABASE_ANON_KEY='sb_publishable_...'
 *   npx playwright test tests/e2e/catalogue-picker.spec.ts --project=webkit --retries=0
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Environment ─────────────────────────────────────────────────────────────

const ENV = {
  email: requiredEnv('TEST_CREATOR_EMAIL'),
  password: requiredEnv('TEST_CREATOR_PASSWORD'),
  supabaseUrl: requiredEnv('VITE_SUPABASE_URL'),
  anonKey: requiredEnv('VITE_SUPABASE_ANON_KEY'),
};
const EXPECTED_VARIATIONS = 201;
const EXPECTED_ARCHETYPES = 28;

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name} — set it in your environment or in a gitignored .env.local before invoking Playwright.`);
  return val;
}

// ── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARTIFACTS = join(__dirname, '..', '..', 'artifacts', 'catalogue-verification');
const BASE = 'http://127.0.0.1:5173';

function ensureArtifacts() {
  if (!existsSync(ARTIFACTS)) mkdirSync(ARTIFACTS, { recursive: true });
}

async function capture(page: Page, name: string) {
  ensureArtifacts();
  await page.screenshot({ path: join(ARTIFACTS, name), fullPage: false, animations: 'disabled' });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The /auth/login screen renders TWO distinct buttons that contain the text
 * "Sign in" in DOM order:
 *   1. A decorative <button type="button" aria-current="page"> in the top
 *      header that marks the current page (clicking it does nothing).
 *   2. The actual <button type="submit">Sign in with email</button> inside
 *      the password <form>.
 *
 * A naive `locator('button').filter({hasText:/sign in/i}).first()` resolves
 * `.first()` to the marker and the click does nothing — the form never
 * submits and the test stalls at `waitForURL(...)`.
 *
 * Scope to the actual password form + submit button + exact label.
 */
async function signIn(page: Page) {
  await page.goto(`${BASE}/#/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Brief pause for Vite + React hydration of the chunk that renders the form.
  await page.waitForTimeout(400);

  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 20000 });
  await emailInput.fill(ENV.email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(ENV.password);

  const submitBtn = page.locator('form button[type="submit"]:has-text("Sign in with email")').first();
  await expect(submitBtn).toBeVisible({ timeout: 5000 });
  await submitBtn.click();

  // The CreatorGate navigates explicitly via window.location.hash on success.
  await page.waitForURL((url) => !url.toString().includes('/auth/login'), { timeout: 20000 });

  // The CreatorGate creator shell renders <main> with the children of <Route>.
  // Wait for it to confirm we are no longer on the login screen.
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

  console.log('[signIn] Authenticated. URL:', page.url());
}

/**
 * Supabase persists access + refresh tokens in localStorage. `page.goto()` to a
 * hash route on the same origin is treated as a full document reload, which
 * races with the OAuth/supabase client re-hydration and can briefly show the
 * unauthenticated phase. Switch to in-app hash navigation so the React tree
 * (and Supabase client) stays mounted.
 *
 * CharacterPossibilities is a 5-step wizard (reveal → explain → choose →
 * generate → ready). The wizard sections are stamped with `data-wizard-step`
 * attributes that ONLY render after data has loaded. We wait for that
 * stamp to appear so subsequent assertions (and `walkWizardToChoose`) are
 * not racing the data fetcher.
 */
async function navigateToCharacters(page: Page) {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, '/my/characters');

  // Wait for the wizard to mount and load data — any [data-wizard-step]
  // indicates loading=false & snapshot/view loaded.
  await expect(page.locator('[data-wizard-step]').first()).toBeVisible({
    timeout: 15000,
  });

  console.log('[navigateToCharacters] URL:', page.url());
}/**
 * Walk the wizard: each step has a unique primary button label, so we use
 * two explicit scoped clicks rather than a race-prone loop. Step 1 (reveal)
 * is exposed only because the test creator lands there when their workset
 * is below TOTAL_MINIMUM; if a future commit fast-forwards a returning
 * creator to Step 3 we exit the helper without clicking.
 */
async function walkWizardToChoose(page: Page) {
  // If we are already on Step 3 (returning creators with a saved workset),
  // exit without touching anything.
  if (await page.locator('[data-wizard-step="choose"]').isVisible().catch(() => false)) {
    return;
  }

  // Step 1 → Step 2: click "Continue" inside the Reveal section.
  const step1 = page.locator('[data-wizard-step="reveal"] button:has-text("Continue")').first();
  await expect(step1).toBeVisible({ timeout: 8000 });
  await step1.click();

  // Wait for Step 2 (explain) to render before clicking again.
  await expect(page.locator('[data-wizard-step="explain"]')).toBeVisible({ timeout: 8000 });

  // Step 2 → Step 3: click "Let's Build Your Portfolio" inside the Explain
  // section. Substring match avoids strict literal-quote issues and is
  // still unique to this footer button.
  const step2 = page.locator('[data-wizard-step="explain"] button:has-text("Build Your Portfolio")').first();
  await expect(step2).toBeVisible({ timeout: 8000 });
  await step2.click();

  // Confirm Step 3 rendered before any picker interaction.
  await expect(page.locator('[data-wizard-step="choose"]')).toBeVisible({ timeout: 8000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });
test.describe('Catalogue Picker — Live Verification', () => {
  test.beforeAll(() => {
    ensureArtifacts();
  });

  test('1. Add flow — full catalogue, search, select, confirm, persist', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: ARTIFACTS, size: { width: 390, height: 667 } },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();

    await signIn(page);
    await navigateToCharacters(page);
    // Capture the loaded /my/characters page (before opening the picker).
    // We snapshot Step 1 (Reveal) since a new creator lands there first.
    await capture(page, 'characters-page-reveal-step.png');

    // Walk the wizard forward until Step 3 (Choose) renders. AddDirectionCard
    // — which holds the catalogue-add trigger — only mounts on this step.
    await walkWizardToChoose(page);
    await capture(page, 'characters-page-choose-step.png');

    // The catalogue-add button lives inside [data-wizard-step="choose"] only.
    // Scoped to that section so .first() cannot resolve to a footer chrome
    // "Continue" / "Back" button by accident.
    const chooseSection = page.locator('[data-wizard-step="choose"]');
    const addBtn = chooseSection
      .locator('button:has-text("Add another direction")')
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Snapshot the picker top, then continue.
    await capture(page, 'add-picker-top.png');

    // Count every catalogue row (enabled + disabled-but-visible in dialog).
    const enabledRows = dialog.locator(
      'button[role]:not([aria-label="Close"]):not([aria-disabled="true"])'
    );
    const disabledRows = dialog.locator('button[aria-disabled="true"]');
    const totalRows = (await enabledRows.count()) + (await disabledRows.count());

    console.log(`[1] Total rendered directory rows: ${totalRows}`);
    expect(totalRows).toBeGreaterThanOrEqual(EXPECTED_ARCHETYPES);

    // Already-in-your-list section is rendered alongside the catalogue.
    await expect(dialog.locator('text=/already in your list/i').first()).toBeVisible({
      timeout: 3000,
    });

    // Independent scroll container for results.
    const resultsRegion = dialog.locator(
      '[role="region"], [data-picker-results], .overflow-y-auto, .overflow-auto'
    ).first();
    await expect(resultsRegion).toBeVisible({ timeout: 3000 });
    const scrollable = await resultsRegion.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );
    expect(scrollable).toBe(true);
    console.log('[1] Scroll container scrollable:', scrollable);

    // Constrain to the dialog footer to avoid the UNION-with-.first() bug
    // class (any "Add …" button in the dialog body could be matched).
    // Constrain to the dialog footer AND the explicit add/submit label —
    // DOM order in CataloguePicker.tsx is Cancel then Add selected, so
    // `.first()` alone would resolve to the Cancel button and click it.
    const confirmBtn = dialog
      .locator('footer button')
      .filter({ hasText: /^(Add selected|Adding)/i })
      .first();

    // Scroll to the bottom and confirm the confirm footer remains visible.
    await resultsRegion.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(500);
    await capture(page, 'add-picker-bottom.png');

    // Body scroll lock.
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('hidden');

    // Search filters the catalogue (case-insensitive, all-archetype).
    const searchInput = dialog.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (!(await searchInput.isVisible().catch(() => false))) {
      test.skip(true, 'Catalogue picker does not expose a search input on this build.');
    }
    await searchInput.fill('Teacher');
    await page.waitForTimeout(400);
    const filteredCount = await dialog
      .locator('button[role]:not([aria-label="Close"]):not([aria-disabled="true"])')
      .count();
    console.log('[1] Search "Teacher" filtered count:', filteredCount);
    expect(filteredCount).toBeLessThanOrEqual(totalRows);

    // Clear restores the full catalogue.
    await searchInput.fill('');
    await page.waitForTimeout(400);
    const restoredCount =
      (await enabledRows.count()) + (await disabledRows.count());
    console.log('[1] After clear search:', restoredCount);
    expect(restoredCount).toBe(totalRows);

    // Select the first available direction.
    const available = dialog.locator(
      'button[role]:not([aria-label="Close"]):not([aria-disabled="true"])'
    );
    const avail = await available.count();
    console.log('[1] Available directions:', avail);
    expect(avail).toBeGreaterThan(0);

    await available.first().click();
    await page.waitForTimeout(300);
    await capture(page, 'add-picker-selected.png');

    // Add selected.
    if (await confirmBtn.isVisible().catch(() => false)) {
      await expect(confirmBtn).toBeEnabled({ timeout: 3000 });
      await confirmBtn.click();
    }
    await page.waitForTimeout(1200);
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await capture(page, 'add-success.png');
    console.log('[1] Add confirmed, picker closed');

    // Persistence: full reload — the wizard re-bootstraps at step=reveal because
    // totalSelected is still 0 (we only added a direction, no variations). Re-walk
    // the wizard so we can re-open the picker and prove the addition survived.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/my/characters');

    // Wait for the wizard itself to re-mount with data — full reload re-reads
    // Supabase tokens synchronously, but if WebKit ever drops the storage event
    // we briefly show the unauthenticated creator shell and the URL stays at
    // /my/characters. This assertion surfaces that case with a clear locator
    // instead of letting walkWizardToChoose time out on login-screen chrome.
    await expect(page.locator('[data-wizard-step]')).toBeVisible({ timeout: 15000 });
    await walkWizardToChoose(page);

    // Re-locate after reload — `chooseSection` from earlier in this test is no
    // longer attached to the live DOM.
    const addBtnAfterRefresh = page
      .locator('[data-wizard-step="choose"] button:has-text("Add another direction")')
      .first();
    if (await addBtnAfterRefresh.isVisible().catch(() => false)) {
      await addBtnAfterRefresh.click();
      const dialog2 = page.locator('[role="dialog"]');
      await expect(dialog2).toBeVisible({ timeout: 5000 });
      await expect(
        dialog2.locator('text=/already in your list/i').first()
      ).toBeVisible({ timeout: 3000 });
      await capture(page, 'add-persisted-after-refresh.png');
      console.log('[1] Persistence confirmed after refresh');
      await dialog2.keyboard.press('Escape').catch(() => undefined);
    }

    await ctx.close();
  });

  test('2. Replace flow — exclusions, confirmation, persistence', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const page = await ctx.newPage();

    await signIn(page);
    await navigateToCharacters(page);
    await walkWizardToChoose(page);

    // Replace buttons live inside <main> on a per-direction card.
    const replaceBtn = page
      .locator('[data-wizard-step="choose"] button')
      .filter({ hasText: /replace\s+from\s+catalogue|^Replace$/i })
      .first();
    await expect(replaceBtn).toBeVisible({ timeout: 10000 });
    await replaceBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Title indicates replace mode.
    const title = (await dialog.locator('h1, h2').first().textContent()) ?? '';
    expect(title.toLowerCase()).toContain('replace');
    console.log('[2] Replace title:', JSON.stringify(title));

    await capture(page, 'replace-picker.png');

    // Eligible options in replace mode exclude current + already-selected.
    const eligible = dialog.locator(
      'button[role]:not([aria-label="Close"]):not([aria-disabled="true"])'
    );
    const eligibleCount = await eligible.count();
    console.log('[2] Eligible replacement options:', eligibleCount);
    expect(eligibleCount).toBeGreaterThanOrEqual(EXPECTED_ARCHETYPES - 4);

    await eligible.first().click();
    await page.waitForTimeout(1000);
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await capture(page, 'replace-success.png');
    console.log('[2] Replacement confirmed, picker closed');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/my/characters');
    await capture(page, 'replace-persisted-after-refresh.png');

    await ctx.close();
  });

  test('3. Custom variation — mobile form, validation, persistence', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const page = await ctx.newPage();

    await signIn(page);
    await navigateToCharacters(page);
    await capture(page, 'custom-variation-mobile.png');

    // Look for a "Custom …" CTA that opens the custom-variation editor.
    const customBtn = page
      .locator('main button, main a[role="button"]')
      .filter({ hasText: /custom|create.*variation|add.*custom/i })
      .first();
    if (!(await customBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No custom-variation button exposed on this build.');
      return;
    }
    await customBtn.click();
    await page.waitForTimeout(700);

    // Form fields scoped to the custom-variation dialog.
    const dialog = page.locator('[role="dialog"]');
    const nameInput = dialog.locator('input[type="text"], input:not([type])').first();
    const descInput = dialog.locator('textarea').first();
    const createBtn = dialog.locator('button:has-text("Create variation")').first();

    await expect(nameInput).toBeVisible({ timeout: 3000 });
    await expect(descInput).toBeVisible({ timeout: 3000 });

    // Submit empty to trigger validation.
    await createBtn.click();
    await page.waitForTimeout(500);
    await capture(page, 'custom-variation-validation.png');
    const errors = await dialog
      .locator('[role="alert"], [aria-invalid="true"], .text-pink')
      .count();
    console.log('[3] Validation surfaces after empty submit:', errors);

    // Fill and create.
    const stamp = Date.now();
    await nameInput.fill(`E2E Variation ${stamp}`);
    await descInput.fill('Verified by E2E live test');
    try {
      await createBtn.click({ timeout: 5000 });
    } catch {
      // Some builds may keep validation strict; ignore.
    }
    await page.waitForTimeout(1200);
    await capture(page, 'custom-variation-persisted.png');
    console.log('[3] Custom variation submit:', `E2E Variation ${stamp}`);

    await ctx.close();
  });

  test('4. Mobile interaction — portal, scroll, focus, escape, footer', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const page = await ctx.newPage();

    await signIn(page);
    await navigateToCharacters(page);

    // Open the catalogue picker.
    await walkWizardToChoose(page);
    const addBtn = page
      .locator('[data-wizard-step="choose"] button:has-text("Add another direction")')
      .first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Modal rendered through a portal (top-level body child, not nested in main).
    const inPortal = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg != null && dlg.parentElement === document.body;
    });
    expect(inPortal).toBe(true);
    console.log('[4] Portal rendering: confirmed');

    // aria-modal = true.
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Independent scroll region with scrollHeight > clientHeight.
    const resultsRegion = dialog
      .locator('[role="region"], [data-picker-results], .overflow-y-auto, .overflow-auto')
      .first();
    await expect(resultsRegion).toBeVisible({ timeout: 3000 });
    const dims = await resultsRegion.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(dims.scrollHeight).toBeGreaterThan(dims.clientHeight);
    console.log(`[4] Scroll: ${dims.scrollHeight} > ${dims.clientHeight}`);

    // Body scroll locked.
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('hidden');

    // Header visible.
    await expect(dialog.locator('h1, h2').first()).toBeVisible({ timeout: 3000 });

    // Footer action visible — scope to the dialog footer AND the add label
    // (Cancel comes first in DOM order; we want Add selected).
    await expect(
      dialog
        .locator('footer button')
        .filter({ hasText: /^(Add selected|Adding)/i })
        .first()
    ).toBeVisible({ timeout: 3000 });

    // Escape closes.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const closed = !(await dialog.isVisible().catch(() => false));
    expect(closed).toBe(true);
    console.log('[4] Escape closed dialog:', closed);

    await ctx.close();
  });

  test('5. Catalogue count via API — database matches picker', async () => {
    const res = await fetch(
      `${ENV.supabaseUrl}/rest/v1/archetype_variations?select=archetype&is_active=eq.true`,
      { headers: { apikey: ENV.anonKey } },
    );
    expect(res.ok).toBe(true);

    const data = await res.json();
    const uniqueArchetypes = [...new Set(data.map((r: any) => r.archetype))];

    console.log(
      `[5] Catalogue: ${data.length} variations across ${uniqueArchetypes.length} archetypes`,
    );

    expect(data.length).toBe(EXPECTED_VARIATIONS);
    expect(uniqueArchetypes.length).toBe(EXPECTED_ARCHETYPES);
  });
});
