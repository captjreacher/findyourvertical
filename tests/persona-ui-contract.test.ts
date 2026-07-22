// Static contract checks over the wiring (routes, endpoint, CTA + progression
// copy) so refactors don't silently drop the PERSONA-1B surface. Text-level only
// (JSX isn't executed here). Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('App.tsx registers the persona workspace + detail routes under /my', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="\/my\/personas"/);
  assert.match(app, /path="\/my\/personas\/:personaId"/);
  assert.match(app, /PersonaWorkspace/);
  assert.match(app, /PersonaDetail/);
});

test('worker exposes only the generate endpoint path', () => {
  const worker = read('worker/index.ts');
  assert.match(worker, /\/api\/personas\/generate/);
});

test('creators-api calls the Worker endpoint with a bearer token', () => {
  const api = read('src/lib/creators-api.ts');
  assert.match(api, /export async function generateMyPersonaPortfolio/);
  assert.match(api, /fetch\('\/api\/personas\/generate'/);
  assert.match(api, /authorization: `Bearer \$\{token\}`/);
  assert.match(api, /export async function getActivePersonaGeneration/);
  assert.match(api, /export async function getPersonasForGeneration/);
  assert.match(api, /export async function recordPersonaPortfolioViewed/);
});

// ----- FYV-ONBOARDING-2 — Guided Discovery Experience (5-screen flow) ----

test('CharacterPossibilities has the 5-step guided discovery flow', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  assert.match(cp, /STEP_ORDER:\s*readonly WizardStep\[\]\s*=\s*\['reveal',\s*'explain',\s*'choose',\s*'generate',\s*'ready'\]/);
  assert.match(cp, /type WizardStep\s*=\s*'reveal'\s*\|\s*'explain'\s*\|\s*'choose'\s*\|\s*'generate'\s*\|\s*'ready'/);
});

test('CharacterPossibilities steps are labelled to match the spec', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  // 5 step labels in the order the indicator renders them.
  assert.match(cp, /reveal:\s*'Assessment results'/);
  assert.match(cp, /explain:\s*'What these results mean'/);
  assert.match(cp, /choose:\s*'Choose your variations'/);
  assert.match(cp, /generate:\s*'Generate portfolio'/);
  assert.match(cp, /ready:\s*'Meet your characters'/);
});

test('Step 2 explains Creative Directions vs Characters in plain language', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  assert.match(cp, /Creative directions are not characters\./);
  // The substring crosses a wrapped line in the JSX source, so allow a
  // newline/whitespace gap between "distinct" and "characters".
  assert.match(cp, /Most successful creators build several distinct[\s\S]{0,30}characters/);
  assert.match(cp, /Let'?s Build Your Portfolio/);
  // Eyebrow line above the heading.
  assert.match(cp, /What These Results Mean<\/p>/);
});

test('Step 3 progress card uses total-only messaging (4 of 6 / Choose ...) and NO Primary/Secondary/Third', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  // Spec wording
  assert.match(cp, /of \{TOTAL_MINIMUM\} variations selected/);
  assert.match(cp, /Choose \$\{needed\} more variations/);
  assert.match(cp, /Choose 1 more variation/);
  // No Primary/Secondary/Third labels rendered in UI inside the choose step
  // surface. Code comments may still mention them; this regex matches the labels
  // as React node text only (preceded by `>` and followed by `<`).
  assert.doesNotMatch(cp, />Primary</);
  assert.doesNotMatch(cp, />Secondary</);
  assert.doesNotMatch(cp, />Third</);
});

test('Step 4 generate screen explicitly lists the seven attributes every character will have', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  assert.match(cp, /(Positioning|Personality|Audience|Tone of voice|Content themes|Visual direction|Monetisation opportunities)/);
  // The spec asked for these seven — assert their literal appearance as
  // PortfolioItem text props.
  const required = ['Positioning', 'Personality', 'Audience', 'Tone of voice', 'Content themes', 'Visual direction', 'Monetisation opportunities'];
  for (const attr of required) {
    assert.match(cp, new RegExp(`text="${attr}"`), `${attr} must appear as a PortfolioItem`);
  }
  // CTA label is the spec wording.
  assert.match(cp, /Generate My Portfolio/);
});

test('handleGenerate transitions to the celebration step; the celebration then routes to /my/personas', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  // handleGenerate is a useCallback (not a top-level async function); match
  // its exact source shape so the assertion is precise.
  const handleGenerate = cp.match(/const handleGenerate\s*=\s*useCallback\(async\s*\(\)\s*=>\s*\{[\s\S]*?\n  \},\s*\[[\s\S]*?\]\);/);
  assert.ok(handleGenerate, 'handleGenerate definition must exist');
  assert.match(handleGenerate![0], /setWizardStep\('ready'\)/);
  assert.doesNotMatch(handleGenerate![0], /navigate\('\/my\/personas'\)/);
  // The /my/personas navigation is delegated to StepReady's `onView`
  // callback wired in the parent render branch.
  assert.match(cp, /onView=\{\(\)\s*=>\s*navigate\('\/my\/personas'\)\}/);
});

test('Step 5 (Meet Your Characters) celebrates the result with the 🎉 emoji and renders up to 6 character cards', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  // 🎉 emoji and celebration copy. The em dash in the JSX is written as
  // the `&mdash;` entity; readFileSync gives us the literal characters.
  assert.match(cp, /\ud83c\udf89/);
  assert.match(cp, /Congratulations &mdash; your first creator portfolio is ready\./);
  // 6 character cards anchored on the workset, derived at render time.
  assert.match(cp, /charactersToShow\s*=\s*characters\.slice\(0,\s*6\)/);
  assert.match(cp, /Character \{idx \+ 1\}/);
  // CTAs
  assert.match(cp, /View My Personas/);
  assert.match(cp, /Edit Your Portfolio/);
  assert.match(cp, /data-testid="view-my-personas"/);
});

test('CharacterPossibilities shows the Generate My Portfolio CTA', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  assert.match(cp, /Generate My Portfolio/);
  assert.match(cp, /handleGenerate/);
  // /my/personas is now reached via StepReady onView, not direct navigate.
  assert.match(cp, /navigate\('\/my\/personas'\)/);
});

test('CreatorHome incorporates character onboarding into its next-step hero', () => {
  const home = read('src/components/creator/CreatorHome.tsx');
  assert.match(home, /deriveOnboardingHero/);
  assert.match(home, /characterComplete: characterState\.complete/);
  assert.doesNotMatch(home, /Build your character possibilities/);
});

test('PersonaWorkspace communicates draft-only, no-platform framing', () => {
  const ws = read('src/components/creator/PersonaWorkspace.tsx');
  assert.match(ws, /Your Character Portfolio/);
  assert.match(ws, /drafts, not active public profiles/);
  assert.match(ws, /Photo coming soon/);
});

test('PersonaDetail is a read-only view', () => {
  const detail = read('src/components/creator/PersonaDetail.tsx');
  assert.match(detail, /read-only draft/i);
  assert.match(detail, /getMyPersona/);
});
