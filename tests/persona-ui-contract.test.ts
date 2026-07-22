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

test('CharacterPossibilities shows the Generate My Character Portfolio CTA', () => {
  const cp = read('src/components/creator/CharacterPossibilities.tsx');
  assert.match(cp, /Generate My Character Portfolio/);
  assert.match(cp, /handleGenerate/);
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
