// Workspace rendering logic (pure): the grouping + persona fields the six-card
// workspace and detail views depend on. Run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePortfolioSources,
  validatePersonaPortfolio,
  buildDeterministicPortfolio,
  groupPersonasByRank,
  type SelectedVariation,
} from '../src/lib/persona-portfolio.ts';

function sel(id: string, rank: 'primary' | 'secondary' | 'third', order: number): SelectedVariation {
  return { variation_id: id, archetype: `${rank}-arch`, rank, name: `Var ${id}`, description: `desc ${id}`, display_order: order };
}

const MIN: SelectedVariation[] = [
  sel('p1', 'primary', 1), sel('p2', 'primary', 2), sel('p3', 'primary', 3),
  sel('s1', 'secondary', 1), sel('s2', 'secondary', 2),
  sel('t1', 'third', 1),
];

function buildPersonas() {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, { display_name: 'Emma Rose' });
  const result = validatePersonaPortfolio(raw, sources);
  assert.ok(result.ok);
  return result.ok ? result.personas : [];
}

test('workspace renders six personas grouped 3-2-1 with rank labels', () => {
  const personas = buildPersonas();
  const groups = groupPersonasByRank(personas);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.label), ['Primary', 'Secondary', 'Third']);
  assert.deepEqual(groups.map(g => g.items.length), [3, 2, 1]);
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), 6);
});

test('every card has the fields the workspace displays', () => {
  const personas = buildPersonas();
  for (const p of personas) {
    assert.ok(p.display_name.length > 0, 'display_name');
    assert.ok(p.persona_title.length > 0, 'persona_title');
    assert.ok(p.one_line_premise.length > 0, 'one_line_premise');
    assert.ok(p.source_archetype.length > 0, 'source_archetype');
    assert.ok(p.source_variation_id.length > 0, 'source_variation_id');
    assert.ok(p.portfolio_position >= 1 && p.portfolio_position <= 6, 'position');
  }
  // Positions are unique and cover 1..6 (workspace + unique DB constraint).
  assert.deepEqual([...personas.map(p => p.portfolio_position)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('detail view fields are all present and non-empty', () => {
  const personas = buildPersonas();
  for (const p of personas) {
    const d = p.profile;
    assert.ok(d.apparent_age_or_life_stage.length > 0);
    assert.ok(d.backstory.length > 0);
    assert.ok(d.current_situation.length > 0);
    assert.ok(d.personality_traits.length >= 2);
    assert.ok(d.what_she_wants.length > 0);
    assert.ok(d.audience_relationship.length > 0);
    assert.ok(d.visual_world.length > 0);
    assert.ok(d.typical_locations.length >= 2);
    assert.ok(d.wardrobe_direction.length > 0);
    assert.ok(d.recurring_story_hooks.length >= 2);
    assert.ok(d.content_boundaries.length >= 2);
    assert.ok(d.story_progression.length > 0);
  }
});
