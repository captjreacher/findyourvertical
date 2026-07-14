import test from 'node:test';
import assert from 'node:assert/strict';
import { multiChoiceAnswerIsValid, readMultiChoiceAnswer } from '../src/lib/multi-choice-answer.ts';

const options = [
  { value: 'fitness', label: 'Fitness' },
  { value: 'other', label: 'Something else', requiresText: true, textPrompt: 'Please specify' },
];

test('reads legacy multi-choice arrays without losing selections', () => {
  assert.deepEqual(readMultiChoiceAnswer(['fitness', 'other']), {
    selectedOptionIds: ['fitness', 'other'],
    optionText: {},
  });
});

test('requires supplementary text only for explicitly configured selected options', () => {
  assert.equal(multiChoiceAnswerIsValid({ selectedOptionIds: ['other'], optionText: {} }, options, true), false);
  assert.equal(multiChoiceAnswerIsValid({ selectedOptionIds: ['other'], optionText: { other: 'Cosplay' } }, options, true), true);
  assert.equal(multiChoiceAnswerIsValid({ selectedOptionIds: ['fitness'], optionText: {} }, options, true), true);
});

test('does not infer clarification requirements from the option label', () => {
  assert.equal(multiChoiceAnswerIsValid(['Other'], ['Other'], true), true);
});
