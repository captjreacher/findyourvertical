import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateReportTemplate, type CreatorReportGenerationContext, type ReportTemplateDefinition } from '../src/lib/report-generation.ts';
import {
  ensureRuleConfig,
  parseExpectedValue,
  reorderById,
  sourceLabel,
  sourceValueKind,
  uniqueKey,
  validOperatorsForKind,
  validateReportTemplateDraft,
  type QuestionSourceOption,
} from '../src/lib/report-template-authoring.ts';

const QUESTIONS: QuestionSourceOption[] = [
  {
    id: 'question-camera',
    questionKey: 'camera_comfort',
    responseKey: 'comfort_level',
    questionText: 'Camera comfort',
    questionType: 'scale',
  },
  {
    id: 'question-strengths',
    questionKey: 'strengths',
    responseKey: 'strengths',
    questionText: 'Creator strengths',
    questionType: 'multi_choice',
    options: [
      { value: 'storytelling', label: 'Storytelling' },
      { value: 'consistency', label: 'Consistency' },
    ],
  },
  {
    id: 'question-consent',
    questionKey: 'consent_public',
    responseKey: 'consent_public',
    questionText: 'Consent to public visibility',
    questionType: 'boolean',
  },
];

function validTemplate(overrides: Partial<ReportTemplateDefinition> = {}): ReportTemplateDefinition {
  return {
    templateId: 'template-1',
    versionId: 'version-1',
    versionNumber: 1,
    status: 'draft',
    schemaVersion: 'fyv-report-template.v1',
    sections: [
      {
        id: 'section-1',
        sectionKey: 'summary',
        title: 'Summary',
        sortOrder: 0,
        isActive: true,
        blocks: [
          {
            id: 'block-1',
            blockKey: 'camera_summary',
            blockType: 'rule',
            heading: 'Camera Summary',
            staticContent: 'Camera comfort is {{question.camera_comfort}}.',
            contentTemplate: null,
            ruleConfig: {
              combinator: 'and',
              conditions: [
                { sourceType: 'question', sourceKey: 'camera_comfort', operator: 'greater_than_or_equal', value: 7 },
              ],
            },
            fallbackText: 'Camera comfort evidence is unavailable.',
            aiRequired: false,
            sortOrder: 0,
            isActive: true,
            sources: [
              { id: 'source-1', sourceType: 'question', questionId: 'question-camera', sourceKey: 'camera_comfort', purpose: 'condition', sortOrder: 0 },
              { id: 'source-2', sourceType: 'question', questionId: 'question-camera', sourceKey: 'camera_comfort', purpose: 'display', sortOrder: 1 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function context(): CreatorReportGenerationContext {
  return {
    contextVersion: 'fyv/report-generation/context-v1',
    creator: { id: 'creator-1', displayName: 'Creator', country: 'GB' },
    assessment: { id: 'assessment-1', templateId: 'assessment-template-1', templateSlug: 'assessment', createdAt: '2026-01-01T00:00:00.000Z' },
    assessmentTemplate: { id: 'assessment-template-1', slug: 'assessment', name: 'Assessment' },
    answers: { camera_comfort: 8, strengths: ['storytelling'], consent_public: true },
    questions: {},
    scores: { report_creator_dna: 82, baseline_creator_dna: 75 },
    signals: {
      legacyArchetype: 'Legacy Sage',
      topArchetypeFit: 'Strategist',
      topArchetypeFitScore: 91,
      creatorDnaArchetype: 'Muse',
      creatorDnaPrimary: 'Magnetic Educator',
      creatorDnaSecondary: 'Community Builder',
      intelligenceConfidenceScore: 88,
      intelligenceConfidenceLabel: 'High',
      managementReadiness: 'Ready Now',
      monetisationReadiness: 'Advanced',
      agencyOpportunityBand: 'High Priority',
      identityComplete: true,
      contactConsent: true,
      traits: {},
    },
    evidence: [],
    traits: [],
    archetypeFits: [],
    creatorDna: null,
    verticals: [],
    recommendations: { report: [], knowledge: [] },
    reportFields: { archetype: 'Legacy Sage', scores: { creator_dna: 82 } },
  };
}

test('source helpers retain distinct archetype concepts and human labels', () => {
  assert.equal(sourceLabel('question', 'camera_comfort', QUESTIONS), 'Camera comfort');
  assert.equal(sourceLabel('signal', 'legacyArchetype'), 'Legacy scoring archetype');
  assert.equal(sourceLabel('signal', 'topArchetypeFit'), 'Top archetype fit');
  assert.equal(sourceLabel('signal', 'creatorDnaArchetype'), 'Creator DNA fantasy archetype');
});

test('source type controls choose expected value kinds and operators', () => {
  assert.equal(sourceValueKind('question', 'camera_comfort', QUESTIONS), 'number');
  assert.equal(sourceValueKind('question', 'strengths', QUESTIONS), 'array');
  assert.equal(sourceValueKind('question', 'consent_public', QUESTIONS), 'boolean');
  assert.deepEqual(validOperatorsForKind('boolean'), ['equals', 'not_equals']);
  assert.ok(validOperatorsForKind('number').includes('greater_than_or_equal'));
  assert.ok(validOperatorsForKind('array').includes('all_of'));
});

test('rule builder round-trips persisted rule JSON with AND and OR', () => {
  const andRule = ensureRuleConfig({ combinator: 'and', conditions: [{ sourceType: 'score', sourceKey: 'report_creator_dna', operator: 'greater_than', value: 80 }] });
  const orRule = ensureRuleConfig({ combinator: 'or', conditions: [{ sourceType: 'signal', sourceKey: 'contactConsent', operator: 'equals', value: true }] });
  assert.equal(andRule.combinator, 'and');
  assert.equal(orRule.combinator, 'or');
  assert.equal(andRule.conditions[0].sourceKey, 'report_creator_dna');
});

test('expected value parsing supports number, boolean, array, and text inputs', () => {
  assert.equal(parseExpectedValue('7', 'number'), 7);
  assert.equal(parseExpectedValue('true', 'boolean'), true);
  assert.deepEqual(parseExpectedValue('storytelling, consistency', 'array'), ['storytelling', 'consistency']);
  assert.equal(parseExpectedValue('Ready Now', 'text'), 'Ready Now');
});

test('ordering helpers persist canonical sort order after movement', () => {
  const reordered = reorderById([
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ], 'c', 'up');
  assert.deepEqual(reordered.map(item => `${item.id}:${item.sort_order}`), ['a:0', 'c:1', 'b:2']);
});

test('unique keys are stable for duplicate sections and blocks', () => {
  assert.equal(uniqueKey('Summary Copy', ['summary_copy']), 'summary_copy_2');
  assert.equal(uniqueKey('Camera Summary', ['camera_summary', 'camera_summary_2']), 'camera_summary_3');
});

test('validation rejects duplicate keys, unresolved sources, missing question source, and missing rule', () => {
  const template = validTemplate({
    sections: [
      ...validTemplate().sections,
      {
        id: 'section-2',
        sectionKey: 'summary',
        title: 'Duplicate',
        sortOrder: 1,
        isActive: true,
        blocks: [
          {
            id: 'block-2',
            blockKey: 'camera_summary',
            blockType: 'question',
            heading: 'Question block',
            staticContent: null,
            contentTemplate: null,
            ruleConfig: null,
            fallbackText: null,
            aiRequired: false,
            sortOrder: 0,
            isActive: true,
            sources: [],
          },
          {
            id: 'block-3',
            blockKey: 'broken_rule',
            blockType: 'rule',
            heading: 'Broken rule',
            staticContent: 'Broken',
            contentTemplate: null,
            ruleConfig: { combinator: 'and', conditions: [] },
            fallbackText: null,
            aiRequired: false,
            sortOrder: 1,
            isActive: true,
            sources: [{ sourceType: 'score', sourceKey: 'not_real', purpose: 'condition', sortOrder: 0 }],
          },
        ],
      },
    ],
  });
  const errors = validateReportTemplateDraft(template, QUESTIONS).map(error => error.message).join('\n');
  assert.match(errors, /Section key must be unique/);
  assert.match(errors, /Block key must be unique/);
  assert.match(errors, /Question blocks require a question source/);
  assert.match(errors, /Rule is invalid/);
  assert.match(errors, /Source is not in the canonical vocabulary/);
});

test('validation rejects invalid operators, duplicate sources, AI-required without fallback, and malformed hybrid blocks', () => {
  const template = validTemplate({
    sections: [{
      ...validTemplate().sections[0],
      blocks: [
        {
          ...validTemplate().sections[0].blocks[0],
          ruleConfig: { combinator: 'and', conditions: [{ sourceType: 'question', sourceKey: 'consent_public', operator: 'greater_than', value: 1 }] },
          sources: [
            { id: 's1', sourceType: 'question', questionId: 'question-consent', sourceKey: 'consent_public', purpose: 'condition', sortOrder: 0 },
            { id: 's2', sourceType: 'question', questionId: 'question-consent', sourceKey: 'consent_public', purpose: 'condition', sortOrder: 1 },
          ],
        },
        {
          id: 'ai-block',
          blockKey: 'ai_block',
          blockType: 'ai',
          heading: 'AI',
          staticContent: null,
          contentTemplate: null,
          ruleConfig: null,
          fallbackText: null,
          aiRequired: true,
          sortOrder: 2,
          isActive: true,
          sources: [],
        },
        {
          id: 'hybrid-block',
          blockKey: 'hybrid_block',
          blockType: 'hybrid',
          heading: 'Hybrid',
          staticContent: null,
          contentTemplate: null,
          ruleConfig: { combinator: 'and', conditions: [{ sourceType: 'score', sourceKey: 'report_creator_dna', operator: 'greater_than', value: 80 }] },
          fallbackText: null,
          aiRequired: false,
          sortOrder: 3,
          isActive: true,
          sources: [{ sourceType: 'score', sourceKey: 'report_creator_dna', purpose: 'condition', sortOrder: 0 }],
        },
      ],
    }],
  });
  const errors = validateReportTemplateDraft(template, QUESTIONS).map(error => error.message).join('\n');
  assert.match(errors, /Operator greater_than is invalid/);
  assert.match(errors, /Duplicate source is not meaningful/);
  assert.match(errors, /AI-required blocks need fallback content/);
  assert.match(errors, /Hybrid blocks need deterministic content or fallback/);
});

test('valid draft publishes structurally while publish remains separate from activation', () => {
  assert.deepEqual(validateReportTemplateDraft(validTemplate(), QUESTIONS), []);
  assert.equal(validTemplate().status, 'draft');
});

test('preview trace exposes actual expected operator result and missing evidence', () => {
  const result = evaluateReportTemplate(validTemplate(), context());
  const trace = result.executionTrace[0];
  assert.equal(trace.status, 'rule_matched');
  assert.equal(trace.blockType, 'rule');
  assert.equal(trace.included, true);
  assert.equal(trace.fallbackUsed, false);
  assert.equal(trace.ruleEvaluation?.conditions[0].actualValue, 8);
  assert.equal(trace.ruleEvaluation?.conditions[0].operator, 'greater_than_or_equal');
  assert.equal(trace.ruleEvaluation?.conditions[0].expectedValue, 7);
  assert.equal(trace.ruleEvaluation?.conditions[0].matched, true);

  const missingResult = evaluateReportTemplate(validTemplate(), { ...context(), answers: {} });
  assert.ok(missingResult.missingEvidence.includes('question:camera_comfort'));
});

test('version lifecycle helpers reject non-draft publish input before persistence', async () => {
  const { publishReportTemplateVersionWithValidation } = await import('../src/lib/report-template-authoring.ts');
  await assert.rejects(
    publishReportTemplateVersionWithValidation({ ...validTemplate(), status: 'published' }, QUESTIONS),
    /Only draft report template versions can be published/,
  );
});

test('activation helper rejects draft versions before persistence', async () => {
  const { activatePublishedReportTemplateVersion } = await import('../src/lib/report-template-authoring.ts');
  await assert.rejects(
    activatePublishedReportTemplateVersion({ assessmentTemplateId: 'assessment-template-1', reportTemplateId: 'template-1', versionId: 'version-1', versions: [{ id: 'version-1', status: 'draft' }] }),
    /Only published report template versions can be activated/,
  );
});
