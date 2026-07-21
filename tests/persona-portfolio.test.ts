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
  projectWorksetToPortfolioSources,
  choosePortfolioSourcesFromSnapshot,
  type PortfolioSource,
  type SelectedVariation,
  type WorksetVerticalSlot,
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

// ── PRO/1C — Editable workset projection (3-2-1 from position) ─────────────

function makeSystemSlot(position: number, archetype: string, picks: { id: string; order: number; name: string }[]): WorksetVerticalSlot {
  return {
    position,
    verticalLabel: archetype,
    verticalKind: 'system_reference',
    systemArchetype: archetype,
    ownedVerticalId: null,
    selectedVariations: picks.map(p => ({
      variationKind: 'system_reference',
      catalogVariationId: p.id,
      ownedVariationId: null,
      name: p.name,
      description: 'desc',
      displayOrder: p.order,
    })),
  };
}

test('projectWorksetToPortfolioSources yields the 3-2-1 set from a 3-vertical workset', () => {
  const slots = [
    makeSystemSlot(1, 'Girl Next Door', [
      { id: 'p1', order: 1, name: 'A' },
      { id: 'p2', order: 2, name: 'B' },
      { id: 'p3', order: 3, name: 'C' },
    ]),
    makeSystemSlot(2, 'Hot Teacher', [
      { id: 's1', order: 1, name: 'D' },
      { id: 's2', order: 2, name: 'E' },
    ]),
    makeSystemSlot(3, 'Nurse', [
      { id: 't1', order: 1, name: 'F' },
    ]),
  ];
  const r = projectWorksetToPortfolioSources(slots);
  assert.equal(r.primary.length, 3);
  assert.equal(r.secondary.length, 2);
  assert.equal(r.third.length, 1);
  assert.deepEqual(r.primary.map(p => p.archetype), ['Girl Next Door', 'Girl Next Door', 'Girl Next Door']);
  assert.deepEqual(r.secondary.map(p => p.archetype), ['Hot Teacher', 'Hot Teacher']);
  assert.deepEqual(r.third.map(p => p.archetype), ['Nurse']);
  assert.deepEqual(r.extras, []);
});

test('projectWorksetToPortfolioSources respects per-position minimums but still feeds exactly 3-2-1', () => {
  // 5 primary picks in slot 1 — only the first 3 (sorted) feed the
  // generator; the persona output stays 3-2-1.
  const slots = [
    makeSystemSlot(1, 'Girl Next Door', [
      { id: 'p1', order: 5, name: 'A' },
      { id: 'p2', order: 1, name: 'B' },
      { id: 'p3', order: 2, name: 'C' },
      { id: 'p4', order: 3, name: 'D' },
      { id: 'p5', order: 4, name: 'E' },
    ]),
    makeSystemSlot(2, 'Hot Teacher', [
      { id: 's1', order: 2, name: 'F' },
      { id: 's2', order: 1, name: 'G' },
      { id: 's3', order: 3, name: 'H' },
    ]),
    makeSystemSlot(3, 'Nurse', [
      { id: 't1', order: 9, name: 'I' },
    ]),
  ];
  const r = projectWorksetToPortfolioSources(slots);
  // deterministic order by displayOrder then name.
  assert.deepEqual(r.primary.map(p => p.variation_id), ['p2', 'p3', 'p4']);
  assert.deepEqual(r.secondary.map(p => p.variation_id), ['s2', 's1']);
  assert.deepEqual(r.third.map(p => p.variation_id), ['t1']);
});

test('projectWorksetToPortfolioSources leaves creator-owned slots out of the 3-2-1 set', () => {
  // Slot 1 is creator_owned without a system_archetype, and its only
  // selected variation is creator-owned too. The projector must not pull
  // any source from it (the persona generator in this sprint only consumes
  // system_reference variations). Slot 2 (Hot Teacher, secondary) and slot 3
  // (Nurse, third) feed the generator as normal.
  const slots = [
    {
      position: 1,
      verticalLabel: 'Indie Filmmaker',
      verticalKind: 'creator_owned' as const,
      systemArchetype: null,
      ownedVerticalId: 'ov-1',
      selectedVariations: [
        {
          variationKind: 'creator_owned' as const,
          catalogVariationId: null,
          ownedVariationId: 'ov-var-1',
          name: 'Story-driven',
          description: '',
          displayOrder: 1,
        },
      ],
    },
    makeSystemSlot(2, 'Hot Teacher', [
      { id: 's1', order: 1, name: 'After-Class' },
      { id: 's2', order: 2, name: 'Sub' },
    ]),
    makeSystemSlot(3, 'Nurse', [
      { id: 't1', order: 1, name: 'Night-Shift' },
    ]),
  ];
  const r = projectWorksetToPortfolioSources(slots);
  assert.equal(r.primary.length, 0); // creator-owned slot yields no system picks
  assert.equal(r.secondary.length, 2);
  assert.equal(r.third.length, 1);
  // creator-owned slot shows up in extras so UI / audit can list it.
  assert.deepEqual(r.extras[0].position, 1);
});

test('projectWorksetToPortfolioSources records verticals 4..6 as extras only', () => {
  const slots = [
    makeSystemSlot(1, 'Hot Teacher', [
      { id: 'p1', order: 1, name: 'A' },
      { id: 'p2', order: 2, name: 'B' },
      { id: 'p3', order: 3, name: 'C' },
    ]),
    makeSystemSlot(2, 'Nurse', [
      { id: 's1', order: 1, name: 'D' },
      { id: 's2', order: 2, name: 'E' },
    ]),
    makeSystemSlot(3, 'MILF', [
      { id: 't1', order: 1, name: 'F' },
    ]),
    makeSystemSlot(4, 'Boss Babe', [
      { id: 'f1', order: 1, name: 'Founder' },
    ]),
    makeSystemSlot(5, 'Seductress', [
      { id: 'fi1', order: 1, name: 'Siren' },
    ]),
    makeSystemSlot(6, 'Bimbo', [
      { id: 'six1', order: 1, name: 'Doll' },
    ]),
  ];
  const r = projectWorksetToPortfolioSources(slots);
  assert.equal(r.primary.length, 3);
  assert.equal(r.secondary.length, 2);
  assert.equal(r.third.length, 1);
  assert.equal(r.extras.length, 3);
  assert.deepEqual(r.extras.map(e => e.position), [4, 5, 6]);
});

test('choosePortfolioSourcesFromSnapshot yields a 3-2-1 set from the snapshot hard columns', () => {
  const library: SelectedVariation[] = [
    { variation_id: 'p1', archetype: 'Girl Next Door', rank: 'primary', name: 'A', description: '', display_order: 1 },
    { variation_id: 'p2', archetype: 'Girl Next Door', rank: 'primary', name: 'B', description: '', display_order: 2 },
    { variation_id: 'p3', archetype: 'Girl Next Door', rank: 'primary', name: 'C', description: '', display_order: 3 },
    { variation_id: 's1', archetype: 'Hot Teacher', rank: 'secondary', name: 'D', description: '', display_order: 1 },
    { variation_id: 's2', archetype: 'Hot Teacher', rank: 'secondary', name: 'E', description: '', display_order: 2 },
    { variation_id: 't1', archetype: 'Nurse', rank: 'third', name: 'F', description: '', display_order: 1 },
  ];
  const sources = choosePortfolioSourcesFromSnapshot({
    snapshotId: 'snap-1',
    primaryArchetype: 'Girl Next Door',
    secondaryArchetype: 'Hot Teacher',
    thirdArchetype: 'Nurse',
    libraryVariations: library,
    selectedLibraryIds: ['p1', 'p2', 'p3', 's1', 's2', 't1'],
  });
  assert.equal(sources.length, 6);
  assert.deepEqual(sources.map(s => s.archetype + ':' + s.rank),
    ['Girl Next Door:primary', 'Girl Next Door:primary', 'Girl Next Door:primary',
     'Hot Teacher:secondary', 'Hot Teacher:secondary', 'Nurse:third']);
  assert.deepEqual(sources.map(s => s.portfolio_position), [1, 2, 3, 4, 5, 6]);
});
