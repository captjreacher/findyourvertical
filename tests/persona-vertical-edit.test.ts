// Pure-function tests for the editable-workset validation module
// (src/lib/persona-verticals.ts). Run with: node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATIVE_DIRECTION_BADGE,
  CREATIVE_DIRECTION_LIMIT,
  MAX_WORKSET_SIZE,
  MIN_WORKSET_SIZE,
  POSITION_MINIMUMS,
  TOTAL_MINIMUM,
  creativeDirectionBadge,
  creativeDirectionLabel,
  hasEnoughVariationsForPortfolio,
  isWorksetSizeValid,
  minimumForPosition,
  moveInOrder,
  rankLabelFor,
  sourceLabelCopy,
  validateWorkset,
  type VerticalSlot,
} from '../src/lib/persona-verticals.ts';

function slot(position: number, selectedIds: string[], label = `vert-${position}`): VerticalSlot {
  return {
    position,
    sourceLabel: position === 1 ? 'recommended' : position === 2 ? 'catalogue' : 'created',
    verticalLabel: label,
    verticalKind: 'system_reference',
    selectedVariationIds: selectedIds,
  };
}

test('POSITION_MINIMUMS and TOTAL_MINIMUM are the published contract', () => {
  assert.deepEqual([...POSITION_MINIMUMS], [3, 2, 1, 1, 1, 1]);
  assert.equal(TOTAL_MINIMUM, 6);
  assert.equal(MIN_WORKSET_SIZE, 1);
  assert.equal(MAX_WORKSET_SIZE, 6);
});

test('rankLabelFor maps position 1..6 → Primary..Sixth', () => {
  assert.equal(rankLabelFor(1), 'Primary');
  assert.equal(rankLabelFor(2), 'Secondary');
  assert.equal(rankLabelFor(3), 'Third');
  assert.equal(rankLabelFor(4), 'Fourth');
  assert.equal(rankLabelFor(5), 'Fifth');
  assert.equal(rankLabelFor(6), 'Sixth');
});

test('rankLabelFor and minimumForPosition throw on out-of-range', () => {
  assert.throws(() => rankLabelFor(0), /out of range/i);
  assert.throws(() => rankLabelFor(7), /out of range/i);
  assert.throws(() => minimumForPosition(0), /out of range/i);
  assert.throws(() => minimumForPosition(7), /out of range/i);
});

test('minimumForPosition matches POSITION_MINIMUMS 1..6', () => {
  assert.equal(minimumForPosition(1), 3);
  assert.equal(minimumForPosition(2), 2);
  assert.equal(minimumForPosition(3), 1);
  assert.equal(minimumForPosition(4), 1);
  assert.equal(minimumForPosition(5), 1);
  assert.equal(minimumForPosition(6), 1);
});

test('isWorksetSizeValid rejects 0, negative, and > 6', () => {
  assert.equal(isWorksetSizeValid(0), false);
  assert.equal(isWorksetSizeValid(-1), false);
  assert.equal(isWorksetSizeValid(7), false);
  assert.equal(isWorksetSizeValid(1.5), false);
  assert.equal(isWorksetSizeValid(1), true);
  assert.equal(isWorksetSizeValid(3), true);
  assert.equal(isWorksetSizeValid(6), true);
});

test('sourceLabelCopy covers all three PRO/1A source labels', () => {
  assert.equal(sourceLabelCopy('recommended'), 'Recommended from assessment');
  assert.equal(sourceLabelCopy('catalogue'), 'Selected from catalogue');
  assert.equal(sourceLabelCopy('created'), 'Created by you');
});

test('validateWorkset flags missing Primary minimum but still accepts Secondary/Third', () => {
  const r = validateWorkset([
    slot(1, []), // missing primary 3
    slot(2, ['s1', 's2']),
    slot(3, ['t1']),
  ]);
  assert.equal(r.complete, false);
  assert.equal(r.perSlot[0].met, false);
  assert.equal(r.perSlot[1].met, true);
  assert.equal(r.perSlot[2].met, true);
  assert.equal(r.totalSelected, 3);
  assert.equal(r.firstIssue?.kind, 'slot_minimum');
  assert.equal(r.firstIssue?.position, 1);
});

test('validateWorkset is complete when the 3-2-1 minimums are met', () => {
  const r = validateWorkset([
    slot(1, ['a', 'b', 'c']),
    slot(2, ['d', 'e']),
    slot(3, ['f']),
  ]);
  assert.equal(r.complete, true);
  assert.equal(r.totalSelected, 6);
  assert.equal(r.firstIssue, null);
});

test('validateWorkset flags total_minimum when every slot minimums is met AND total < 6', () => {
  // Both slots meet their position minimums (3 + 2 = 5), but the total is
  // still under TOTAL_MINIMUM (6). The blocker is the total_minimum rule.
  const r = validateWorkset([
    slot(1, ['a', 'b', 'c']),
    slot(2, ['d', 'e']),
  ]);
  assert.equal(r.complete, false);
  assert.equal(r.firstIssue?.kind, 'total_minimum');
  assert.equal(r.totalSelected, 5);
});

test('validateWorkset returns complete = true for the 6-vertical edge case', () => {
  // Position minimums are [3, 2, 1, 1, 1, 1] → total = 9.
  const slots = [
    slot(1, ['p1', 'p2', 'p3']),
    slot(2, ['s1', 's2']),
    slot(3, ['t1']),
    slot(4, ['f1']),
    slot(5, ['fi1']),
    slot(6, ['si1']),
  ];
  const r = validateWorkset(slots);
  assert.equal(r.complete, true);
  assert.equal(r.perSlot.length, 6);
  assert.equal(r.totalSelected, 9);
});

test('validateWorkset blocks the 7th vertical via size-check issue', () => {
  const slots = Array.from({ length: 7 }, (_, i) => slot(i + 1, ['x']));
  const r = validateWorkset(slots);
  assert.equal(r.complete, false);
  assert.equal(r.firstIssue?.kind, 'slot_minimum');
  assert.match(r.firstIssue?.message ?? '', /at most 6 verticals/i);
});

test('validateWorkset blocks empty worksets (less than MIN_WORKSET_SIZE)', () => {
  const r = validateWorkset([]);
  assert.equal(r.complete, false);
  assert.equal(r.firstIssue?.kind, 'slot_minimum');
  assert.match(r.firstIssue?.message ?? '', /at least 1 vertical/i);
});

test('moveInOrder is stable and clamps out-of-range targets', () => {
  const xs = ['a', 'b', 'c'];
  assert.deepEqual(moveInOrder(xs, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveInOrder(xs, 1, 0), ['b', 'a', 'c']);
  assert.deepEqual(moveInOrder(xs, 0, 0), xs);
  // Out-of-range targets fall back to a copy.
  assert.deepEqual(moveInOrder(xs, 0, 99), xs);
  assert.deepEqual(moveInOrder(xs, 0, -1), xs);
});

// ─── FYV-PERSONA-1D — creator-facing "Creative Direction" labelling helpers ───

test('creativeDirectionLabel maps position 1..6 → Creative Direction N', () => {
  assert.equal(creativeDirectionLabel(1), 'Creative Direction 1');
  assert.equal(creativeDirectionLabel(2), 'Creative Direction 2');
  assert.equal(creativeDirectionLabel(3), 'Creative Direction 3');
  assert.equal(creativeDirectionLabel(4), 'Creative Direction 4');
  assert.equal(creativeDirectionLabel(5), 'Creative Direction 5');
  assert.equal(creativeDirectionLabel(6), 'Creative Direction 6');
});

test('creativeDirectionLabel is safe for out-of-range positions (no throw)', () => {
  // Out-of-range inputs do not throw — they return a sensible fallback so
  // UI bugs do not crash the wizard render path.
  assert.equal(typeof creativeDirectionLabel(0), 'string');
  assert.equal(typeof creativeDirectionLabel(7), 'string');
  assert.equal(typeof creativeDirectionLabel(-1), 'string');
});

test('creativeDirectionBadge returns non-empty styling for every valid position', () => {
  for (let pos = 1; pos <= CREATIVE_DIRECTION_LIMIT; pos++) {
    const className = creativeDirectionBadge(pos);
    assert.equal(typeof className, 'string');
    assert.ok(className.length > 0, `position ${pos} should produce a non-empty class set`);
  }
  // CREATIVE_DIRECTION_BADGE table aligns with the limit so positions don't run out.
  assert.equal(CREATIVE_DIRECTION_BADGE.length, CREATIVE_DIRECTION_LIMIT);
});

test('hasEnoughVariationsForPortfolio enforces the TOTAL_MINIMUM (>=6) gate', () => {
  assert.equal(hasEnoughVariationsForPortfolio(0), false);
  assert.equal(hasEnoughVariationsForPortfolio(5), false);
  assert.equal(hasEnoughVariationsForPortfolio(6), true);
  assert.equal(hasEnoughVariationsForPortfolio(7), true);
});

test('CREATIVE_DIRECTION_LIMIT matches MAX_WORKSET_SIZE', () => {
  // The two constants must stay in lockstep so the wizard's "Creative
  // Direction N" copy remains in sync with the persona generator's slot cap.
  assert.equal(CREATIVE_DIRECTION_LIMIT, MAX_WORKSET_SIZE);
});
