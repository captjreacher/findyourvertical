import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAssessmentEvidence, ADMINISTRATIVE_ANSWER_KEYS, reportForAssessment } from '../src/lib/assessment-evidence.ts';
import { deriveReportEvidence } from '../src/lib/report-evidence-template.ts';
import type { CreatorReportGenerationContext } from '../src/lib/report-generation.ts';

test('current selectable answers map to historical scoring vocabulary without altering evidence', () => {
  const raw = { niche_interests: {selectedOptionIds: ['fitness_muscle', 'roleplay']}, nudity_level: 'suggestive_only', what_is_it_that_you_re_most_passionate_about: 'Cooking' };
  const snapshot = structuredClone(raw);
  const normalized = normalizeAssessmentEvidence(raw);
  assert.deepEqual(normalized.niche_interests, ['Fitness/Muscle', 'Roleplay']);
  assert.equal(normalized.nudity_level, 'suggestive_only');
  assert.deepEqual(raw, snapshot);
  assert.equal((normalized as Record<string, unknown>).passion_topic, 'Cooking');
});
test('historical values and unknown future question IDs survive', () => {
  const raw = { niche_interests: ['Fitness/Muscle'], future_question: 'answer' };
  assert.deepEqual(normalizeAssessmentEvidence(raw), raw);
  assert.ok(ADMINISTRATIVE_ANSWER_KEYS.has('consent'));
});
test('combined evidence produces guidance with internal provenance; missing evidence does not claim a fit', () => {
  const context = { answers: {niche_interests: ['Fitness/Muscle'], comfort_level: 8}, questions: {} } as CreatorReportGenerationContext;
  const result = deriveReportEvidence(context);
  assert.match(result.renderedSections[0].blocks[0].content, /testing a fitness-led format/);
  assert.deepEqual([...new Set(result.executionTrace.find(t => t.blockKey === 'fitness-direction')?.evidenceSnapshot.map(e => e.sourceKey))], ['niche_interests', 'comfort_level']);
  const missing = deriveReportEvidence({...context, answers: {niche_interests: ['Fitness/Muscle']}});
  assert.equal(missing.renderedSections.flatMap(section => section.blocks).length, 0);
});
test('report history never guesses an assessment association', () => {
  assert.equal(reportForAssessment('a', [{assessment_id: 'b'}]), null);
  assert.equal(reportForAssessment('a', [{}]), null);
  assert.deepEqual(reportForAssessment('a', [{assessment_id: 'a'}]), {assessment_id: 'a'});
});
