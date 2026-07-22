// Static text-level contract checks over CharacterPossibilities.tsx so refactors
// don't silently drop the editable-workset wizard surface (FYV-PERSONA-1D).
// Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cp = readFileSync(
  new URL('../src/components/creator/CharacterPossibilities.tsx', import.meta.url),
  'utf8',
);
const api = readFileSync(
  new URL('../src/lib/creators-workset-api.ts', import.meta.url),
  'utf8',
);

function has(content: string, re: RegExp, msg: string) {
  assert.ok(re.test(content), msg);
}

test('CharacterPossibilities is a 4-step wizard with reveal/explain/choose/generate', () => {
  has(cp, /WizardStep/, 'WizardStep type defined');
  has(cp, /'reveal'/, 'reveal step');
  has(cp, /'explain'/, 'explain step');
  has(cp, /'choose'/, 'choose step');
  has(cp, /'generate'/, 'generate step');
  has(cp, /StepReveal/, 'StepReveal component');
  has(cp, /StepExplain/, 'StepExplain component');
  has(cp, /StepChoose/, 'StepChoose component');
  has(cp, /StepGenerate/, 'StepGenerate component');
});

test('Step 1 — Assessment Results reveals the top three without editing controls', () => {
  has(cp, /Assessment Results/, 'reveal heading copy');
  has(cp, /Three creative directions/, 'reveal body copy');
  has(cp, /Recommended from your assessment/, 'recommended label on reveal');
  // The StepReveal component body must contain no editor verbs. We slice
  // between `function StepReveal` and `function StepExplain` so the regex
  // doesn't accidentally read past the function boundary into other editors.
  const revealStart = cp.indexOf('function StepReveal');
  const revealEnd = cp.indexOf('function StepExplain');
  assert.ok(revealStart > -1 && revealEnd > revealStart, 'StepReveal section precedes StepExplain');
  const revealBody = cp.slice(revealStart, revealEnd);
  assert.doesNotMatch(revealBody, /Replace from catalogue/, 'no editor verb in Step 1');
  assert.doesNotMatch(revealBody, /Move up/, 'no editor verb in Step 1');
  assert.doesNotMatch(revealBody, /Move down/, 'no editor verb in Step 1');
  assert.doesNotMatch(revealBody, /Source from assessment|Source from catalogue/, 'no editor label in Step 1');
});

test('Step 2 — Build Your Character Portfolio explains the direction → character concept', () => {
  has(cp, /Build your character portfolio/i, 'explain heading');
  has(cp, /From direction to character/, 'direction-to-character diagram');
  has(cp, /Choose at least six variations/, 'six-total rule copy');
});

test('Step 3 — Choose Your Variations runs the existing editor with simplified validation', () => {
  has(cp, /Choose Your Variations/, 'step heading copy');
  has(cp, /Choose at least six variations/);
  has(cp, /Your progress/);
  has(cp, /of \{TOTAL_MINIMUM\} variations selected/);
  // Step 3 must still expose all editor actions.
  has(cp, /Replace from catalogue/, 'replace from catalogue');
  has(cp, /Move up/, 'move up');
  has(cp, /Move down/, 'move down');
});

test('Step 4 — Generate Portfolio explains what gets generated and triggers the existing call', () => {
  has(cp, /Generate Portfolio/, 'step heading copy');
  has(cp, /Generate My Character Portfolio/, 'CTA copy');
  has(cp, /materialiseAndGeneratePortfolio/, 'still calls the existing RPC');
  has(cp, /navigate\('\/my\/personas'\)/, 'still navigates to /my/personas after generation');
});

test('Wizard chrome: step indicator + back/continue footers across steps', () => {
  has(cp, /StepIndicator/, 'StepIndicator component');
  has(cp, /STEP_ORDER/, 'step order constant');
  has(cp, /WizardFooter/, 'wizard footer component');
  has(cp, /\u2192/, 'continue right-arrow in source');
  has(cp, /Start Building/, 'step-2 continue label');
  has(cp, /\u2190 Back/, 'back arrow label');
});

test('Primary/Secondary/Third rank labels are NOT rendered as creator-facing copy', () => {
  // The data layer (rankLabelFor) still derives the labels — only the UI
  // surfaces them as "Creative Direction N" via creativeDirectionLabel().
  has(cp, /creativeDirectionLabel\(/, 'creativeDirectionLabel used at runtime');
  has(cp, /creativeDirectionBadge\(/, 'creativeDirectionBadge used at runtime');
  // No raw rank labels should appear inside the rendered JSX text. Each label
  // is checked individually so the regexes don't accidentally look JSX-like
  // to TS strip-types.
  assert.doesNotMatch(cp, /\sPrimary\s/, 'no bare "Primary" word in rendered copy');
  assert.doesNotMatch(cp, /\sSecondary\s/, 'no bare "Secondary" word in rendered copy');
  assert.doesNotMatch(cp, /\sThird\s/, 'no bare "Third" word in rendered copy');
  assert.doesNotMatch(cp, /\sFourth\s/, 'no bare "Fourth" word in rendered copy');
  assert.doesNotMatch(cp, /\sFifth\s/, 'no bare "Fifth" word in rendered copy');
  assert.doesNotMatch(cp, /\sSixth\s/, 'no bare "Sixth" word in rendered copy');
});

test('Source-label chain is preserved: sourceLabelCopy drives all three kinds', () => {
  // The UI delegates to sourceLabelCopy (the single source of truth in
  // src/lib/persona-verticals.ts). Verify the delegation chain + the three
  // VerticalSourceLabel kinds drive the rendering — actual label strings are
  // asserted against the helper in tests/persona-vertical-edit.test.ts.
  assert.match(cp, /sourceLabelCopy/);
  assert.match(cp, /sourceLabelCopy\(/);
  for (const kind of ['recommended', 'catalogue', 'created']) {
    assert.ok(
      cp.includes(`'${kind}'`) || cp.includes(`"${kind}"`) || cp.includes(`\`${kind}\``),
      `uses source kind ${kind}`,
    );
  }
});

test('Replace-from-catalogue is exposed as an action with refreshed copy', () => {
  has(cp, /Replace from catalogue/, 'replace button label');
  has(cp, /Search catalogue directions/, 'search catalogue placeholder');
});

test('Customise fork of a system variation exists (system catalogue never mutated)', () => {
  assert.match(cp, /Customise/);
  assert.match(cp, /customiseLibraryVariation|customise_my_owned_variation/);
  // The fork path MUST write to creator_owned_variations only — never INSERT /
  // UPDATE / DELETE on archetype_variations (system catalogue is read-only for
  // creators).
  assert.doesNotMatch(api, /\.from\(['"]archetype_variations['"]\)\.(insert|update|delete)/);
});

test('Add, remove, and reorder actions are wired', () => {
  assert.match(cp, /Move up/);
  assert.match(cp, /Move down/);
  assert.match(cp, /Remove direction/);
  assert.match(cp, /Add another direction|Add a direction from the catalogue|Create a new direction/);
});

test('Autosave shows saving/saved/error feedback', () => {
  // UI uses a Unicode ellipsis ('…'), the regex accepts either form for readability.
  assert.match(cp, /Saving(\u2026|\.\.\.)/);
  assert.match(cp, /Saved/);
  assert.match(cp, /SaveStatusPill/);
  assert.match(cp, /saveStatus/);
});

test('Validation simplified: only TOTAL_MINIMUM (>=6) drives readiness', () => {
  has(cp, /TOTAL_MINIMUM/, 'TOTAL_MINIMUM imported into UI');
  has(cp, /hasEnoughVariationsForPortfolio/, 'readiness gate helper');
  has(cp, /isPortfolioReady/, 'isPortfolioReady state used at runtime');
  // Per-direction minimums (POSITION_MINIMUMS) must NOT leak into creator-facing copy.
  assert.doesNotMatch(cp, /POSITION_MINIMUMS/);
  assert.doesNotMatch(cp, /Pick at least \{slotMinimum\}/);
  // Footer copy: at-least-six rule.
  has(cp, /Select at least six variations/, 'six-total rule in footer copy');
});

test('Validation blocks the Generate CTA when fewer than 6 variations are selected', () => {
  has(cp, /isPortfolioReady/, 'ready flag wired');
  has(cp, /primaryDisabled=\{!isPortfolioReady/, 'Continue / Generate disabled when not ready');
  has(cp, /Generate My Character Portfolio/, 'CTA inside Step 4');
});

test('createMyOwnedVertical + updateMyOwnedVertical + archiveMyOwnedVertical are referenced', () => {
  assert.match(api, /export async function createMyOwnedVertical/);
  assert.match(api, /export async function updateMyOwnedVertical/);
  assert.match(api, /export async function archiveMyOwnedVertical/);
  assert.match(api, /fyv_archive_owned_vertical/);
});

test('createMyOwnedVariation + updateMyOwnedVariation + archiveMyOwnedVariation are referenced', () => {
  assert.match(api, /export async function createMyOwnedVariation/);
  assert.match(api, /export async function updateMyOwnedVariation/);
  assert.match(api, /export async function archiveMyOwnedVariation/);
  assert.match(api, /fyv_archive_owned_variation/);
});

test('materialiseAndGeneratePortfolio anchors the existing persona generator on the editable workset', () => {
  assert.match(api, /export async function materialiseAndGeneratePortfolio/);
  assert.match(api, /materialise_vertical_workset_for_generation/);
  assert.match(api, /generateMyPersonaPortfolio/);
});

test('submit-for-review surfaces only private pending queue (no auto-exposure to question bank)', () => {
  assert.match(api, /submitMyOwnedVerticalForReview/);
  assert.match(api, /submitMyOwnedVariationForReview/);
  // Neither helper may touch creator_question_bank.
  assert.doesNotMatch(api, /creator_question_bank/);
  // Neither helper may INSERT / UPDATE / DELETE on archetype_variations
  // (system catalogue is read-only for creators). SELECT is allowed for
  // library-name hydration in getMyVerticalWorkset.
  assert.doesNotMatch(api, /\.from\(['"]archetype_variations['"]\)\.(insert|update|delete)/);
});

test('saveMyVerticalWorkset uses the single SECURITY DEFINER RPC (one round-trip)', () => {
  assert.match(api, /export async function saveMyVerticalWorkset/);
  assert.match(api, /fyv_save_vertical_workset/);
});

// ─── FYV-PERSONA-1D — wizard a11y / mid-flow restoration contract ───────────

test('Step change focus management: focus-on-step-change effect + tabIndex on headings', () => {
  // Every step's h2 carries tabIndex={-1} so it can accept programmatic focus
  // without entering the tab order. The parent has a focus-on-step-change
  // effect that runs after every wizardStep change.
  has(cp, /\bheading\.focus\(\s*\{\s*preventScroll:\s*true\s*\}\s*\)/, 'focus effect calls focus()');
  has(cp, /\[wizardStep\]/, 'focus effect runs on wizardStep change');
  // Order matters — in JSX tabIndex prop precedes the heading text, so the
  // regex anchors on the literal `tabIndex={-1}>` immediately before the
  // heading string we expect.
  for (const heading of [
    /tabIndex=\{-1\}>Three creative directions/,
    /tabIndex=\{-1\}>Build your character portfolio/,
    /tabIndex=\{-1\}>Edit the directions, pick the variations/,
    /tabIndex=\{-1\}>Ready to build your character portfolio/,
  ]) {
    assert.ok(heading.test(cp), `step h2 carries tabIndex={-1} immediately before its heading text (${heading})`);
  }
});

test('Stable aria-live region announces step changes without unmounting', () => {
  // role="status" implicitly sets aria-live="polite" — we deliberately omit
  // the explicit attribute so the live region policy lives in one place.
  // The attribute spread (role="status" / className="sr-only") may sit on
  // separate lines in JSX, so the regex tolerates whitespace between attrs
  // and the closing `>`.
  has(cp, /<p\s+role="status"\s+className="sr-only"\s*>/, 'sr-only status paragraph');
  assert.doesNotMatch(cp, /aria-live="polite"\s+role="status"/, 'no redundant aria-live + role combo');
  has(cp, /Step \$\{stepIndex\(wizardStep\)\s*\+\s*1\}\s*of\s*\$\{STEP_ORDER\.length\}/, 'live region step-number template');
  has(cp, /STEP_LABELS\[wizardStep\]/, 'live region step-label template');
  // Live-region textContent stays empty until data loads so SR users do not
  // hear a step label for an empty skeleton. We assert the ternary shape
  // uses backticks (template literal) so the assertion does not break on the
  // `:` characters inside the label string.
  has(cp, /!\s*loading\s*\?\s*`/, 'live region announces only when !loading');
});

test('Welcome-back banner only renders when bootstrap fast-forwards to Step 3', () => {
  // The banner copy is conditional on `fastForwardedToEditor`; creators with
  // <6 saved variations never see it, so first-time users aren't confused
  // by a "Welcome back" line they didn't earn.
  has(cp, /Welcome back\./, 'banner heading copy');
  has(cp, /Your saved variations are below/, 'banner body copy');
  has(cp, /wizardStep === 'choose'\s+&&\s+fastForwardedToEditor/, 'gate on fastForwardedToEditor');
});
