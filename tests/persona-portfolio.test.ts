// Deterministic tests for the pure persona-portfolio contract.
// Run with: node --experimental-strip-types --test (no external deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePortfolioSources,
  validatePersonaPortfolio,
  buildDeterministicPortfolio,
  computeRequestDigest,
  groupPersonasByRank,
  isSelectionComplete,
  countByRank,
  PORTFOLIO_SIZE,
  type PortfolioSource,
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

test('incomplete selection is blocked', () => {
  assert.equal(isSelectionComplete(MIN.slice(0, 5)), false);
  assert.throws(() => choosePortfolioSources(MIN.slice(0, 5)), /incomplete/i);
});

test('exact-minimum selection yields a 3-2-1 set with positions 1..6', () => {
  const sources = choosePortfolioSources(MIN);
  assert.equal(sources.length, PORTFOLIO_SIZE);
  assert.deepEqual(sources.map(s => s.portfolio_position), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(sources.map(s => s.rank), ['primary', 'primary', 'primary', 'secondary', 'secondary', 'third']);
});

test('over-selected pools reduce deterministically to exactly 3-2-1', () => {
  const over: SelectedVariation[] = [
    sel('p1', 'primary', 5), sel('p2', 'primary', 1), sel('p3', 'primary', 3), sel('p4', 'primary', 2),
    sel('s1', 'secondary', 2), sel('s2', 'secondary', 1), sel('s3', 'secondary', 9),
    sel('t1', 'third', 4), sel('t2', 'third', 1),
  ];
  assert.deepEqual(countByRank(over), { primary: 4, secondary: 3, third: 2 });
  const sources = choosePortfolioSources(over);
  assert.equal(sources.length, 6);
  // Lowest display_order wins within each rank; run twice for determinism.
  const again = choosePortfolioSources(over);
  assert.deepEqual(sources, again);
  assert.deepEqual(sources.filter(s => s.rank === 'primary').map(s => s.variation_id), ['p2', 'p4', 'p3']);
  assert.deepEqual(sources.filter(s => s.rank === 'secondary').map(s => s.variation_id), ['s2', 's1']);
  assert.deepEqual(sources.filter(s => s.rank === 'third').map(s => s.variation_id), ['t2']);
});

test('valid fixture output passes validation with source lineage', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, { display_name: 'Emma Rose' });
  const result = validatePersonaPortfolio(raw, sources);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.personas.length, 6);
    assert.equal(result.personas.filter(p => p.archetype_rank === 'primary').length, 3);
    assert.equal(result.personas.filter(p => p.archetype_rank === 'secondary').length, 2);
    assert.equal(result.personas.filter(p => p.archetype_rank === 'third').length, 1);
    // Every source variation is represented exactly once.
    assert.deepEqual(
      new Set(result.personas.map(p => p.source_variation_id)),
      new Set(sources.map(s => s.variation_id)),
    );
  }
});

test('wrong persona count is rejected', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, {});
  const res = validatePersonaPortfolio({ personas: raw.personas.slice(0, 5) }, sources);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'wrong_persona_count');
});

test('duplicate source variation is rejected', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, {});
  const dup = { personas: [raw.personas[0], ...raw.personas.slice(0, 5)] };
  const res = validatePersonaPortfolio(dup, sources);
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(['duplicate_source', 'source_mismatch'].includes(res.code));
});

test('unknown source_variation_id is rejected (source mismatch)', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, {});
  raw.personas[0].source_variation_id = 'not-a-real-source';
  const res = validatePersonaPortfolio(raw, sources);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'source_mismatch');
});

test('missing required field is rejected', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, {});
  (raw.personas[2] as Record<string, unknown>).backstory = '';
  const res = validatePersonaPortfolio(raw, sources);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, 'missing_field');
});

test('malformed output (no personas array) is rejected', () => {
  const sources = choosePortfolioSources(MIN);
  assert.equal(validatePersonaPortfolio({}, sources).ok, false);
  assert.equal(validatePersonaPortfolio(null, sources).ok, false);
  assert.equal(validatePersonaPortfolio({ personas: 'nope' }, sources).ok, false);
});

test('request digest is stable regardless of source id order', () => {
  const a = computeRequestDigest({ snapshotId: 's', sourceVariationIds: ['a', 'b', 'c'], promptVersion: 'v1', schemaVersion: '1' });
  const b = computeRequestDigest({ snapshotId: 's', sourceVariationIds: ['c', 'b', 'a'], promptVersion: 'v1', schemaVersion: '1' });
  assert.equal(a, b);
  const different = computeRequestDigest({ snapshotId: 's', sourceVariationIds: ['a', 'b'], promptVersion: 'v1', schemaVersion: '1' });
  assert.notEqual(a, different);
});

test('groupPersonasByRank preserves 3-2-1 order and positions', () => {
  const sources = choosePortfolioSources(MIN);
  const raw = buildDeterministicPortfolio(sources, {});
  const result = validatePersonaPortfolio(raw, sources);
  assert.ok(result.ok);
  if (result.ok) {
    const groups = groupPersonasByRank(result.personas);
    assert.deepEqual(groups.map(g => g.rank), ['primary', 'secondary', 'third']);
    assert.deepEqual(groups.map(g => g.items.length), [3, 2, 1]);
    assert.deepEqual(groups.map(g => g.expected), [3, 2, 1]);
    for (const g of groups) {
      const positions = g.items.map((p: PortfolioSource | typeof g.items[number]) => (p as { portfolio_position: number }).portfolio_position);
      assert.deepEqual(positions, [...positions].sort((x, y) => x - y));
    }
  }
});
