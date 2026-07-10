import assert from 'node:assert/strict';
import {
  choosePortfolioSources,
  validatePersonaPortfolio,
  buildDeterministicPortfolio,
  computeRequestDigest,
  groupPersonasByRank,
  isSelectionComplete,
  type SelectedVariation,
} from '../src/lib/persona-portfolio.ts';

function sel(id: string, rank: 'primary' | 'secondary' | 'third', order: number): SelectedVariation {
  return { variation_id: id, archetype: `${rank}-arch`, rank, name: `Var ${id}`, description: `desc ${id}`, display_order: order };
}

// Exactly-minimum 3-2-1.
const min: SelectedVariation[] = [
  sel('p1', 'primary', 1), sel('p2', 'primary', 2), sel('p3', 'primary', 3),
  sel('s1', 'secondary', 1), sel('s2', 'secondary', 2),
  sel('t1', 'third', 1),
];
assert.equal(isSelectionComplete(min), true);
const sources = choosePortfolioSources(min);
assert.equal(sources.length, 6);
assert.deepEqual(sources.map(s => s.portfolio_position), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(sources.map(s => s.rank), ['primary', 'primary', 'primary', 'secondary', 'secondary', 'third']);

// Over-selected pool → still exactly 3-2-1, deterministic (lowest display_order wins).
const over: SelectedVariation[] = [
  sel('p1', 'primary', 5), sel('p2', 'primary', 1), sel('p3', 'primary', 3), sel('p4', 'primary', 2),
  sel('s1', 'secondary', 2), sel('s2', 'secondary', 1), sel('s3', 'secondary', 9),
  sel('t1', 'third', 4), sel('t2', 'third', 1),
];
const overSources = choosePortfolioSources(over);
assert.equal(overSources.length, 6);
assert.deepEqual(overSources.filter(s => s.rank === 'primary').map(s => s.variation_id), ['p2', 'p4', 'p3']);
assert.deepEqual(overSources.filter(s => s.rank === 'secondary').map(s => s.variation_id), ['s2', 's1']);
assert.deepEqual(overSources.filter(s => s.rank === 'third').map(s => s.variation_id), ['t2']);

// Incomplete selection throws.
assert.throws(() => choosePortfolioSources(min.slice(0, 5)), /incomplete/i);

// Deterministic fixture output validates against its own sources.
const raw = buildDeterministicPortfolio(sources, { display_name: 'Emma Rose' });
const result = validatePersonaPortfolio(raw, sources);
assert.equal(result.ok, true);
if (result.ok) {
  assert.equal(result.personas.length, 6);
  assert.equal(result.personas.filter(p => p.archetype_rank === 'primary').length, 3);
  assert.ok(result.personas[0].display_name.includes('Emma'));
}

// Wrong count rejected.
const short = { personas: raw.personas.slice(0, 5) };
const shortRes = validatePersonaPortfolio(short, sources);
assert.equal(shortRes.ok, false);
if (!shortRes.ok) assert.equal(shortRes.code, 'wrong_persona_count');

// Duplicate source rejected.
const dup = { personas: [raw.personas[0], ...raw.personas.slice(0, 5)] };
const dupRes = validatePersonaPortfolio(dup, sources);
assert.equal(dupRes.ok, false);
if (!dupRes.ok) assert.ok(['duplicate_source', 'source_mismatch'].includes(dupRes.code));

// Digest stable regardless of source id order.
const d1 = computeRequestDigest({ snapshotId: 'snap', sourceVariationIds: ['a', 'b', 'c'], promptVersion: 'v1', schemaVersion: '1' });
const d2 = computeRequestDigest({ snapshotId: 'snap', sourceVariationIds: ['c', 'a', 'b'], promptVersion: 'v1', schemaVersion: '1' });
assert.equal(d1, d2);

// Grouping preserves 3-2-1 order.
const groups = groupPersonasByRank(result.ok ? result.personas : []);
assert.deepEqual(groups.map(g => g.items.length), [3, 2, 1]);

console.log('foundation.smoke OK');
