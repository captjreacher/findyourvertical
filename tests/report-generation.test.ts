import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORT_GENERATION_SCHEMA_VERSION,
  buildCreatorReportGenerationContext,
  computeGenerationDigest,
  evaluateReportRule,
  evaluateReportTemplate,
  type CreatorReportGenerationContext,
  type ReportRuleOperator,
  type ReportTemplateDefinition,
} from '../src/lib/report-generation.ts';

function generationContext(): CreatorReportGenerationContext {
  return buildCreatorReportGenerationContext({
    profile: { id: 'creator-1', full_name: 'Test Creator', country: 'GB' },
    assessment: {
      id: 'assessment-1',
      template_id: 'assessment-template-1',
      template_slug: 'creator-assessment',
      created_at: '2026-08-27T10:00:00.000Z',
    },
    assessmentTemplate: {
      id: 'assessment-template-1',
      slug: 'creator-assessment',
      name: 'Creator Assessment',
      description: null,
      is_public: true,
      is_default: true,
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      questions: [],
    },
    questions: [
      {
        id: 'question-camera',
        template_id: 'assessment-template-1',
        question_key: 'camera_comfort',
        response_key: 'comfort_level',
        question_text: 'How comfortable are you on camera?',
        help_text: null,
        section: 'Content Engine',
        question_type: 'scale',
        scoring_dimension: 'confidence',
        parent_question_key: null,
        show_when_value: null,
        show_when_operator: 'equals',
        options: [],
        config: {},
        is_active: true,
        is_included: true,
        sort_order: 10,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'question-strengths',
        template_id: 'assessment-template-1',
        question_key: 'creator_strengths',
        response_key: 'strengths',
        question_text: 'What are your strengths?',
        help_text: null,
        section: 'Identity',
        question_type: 'multi_choice',
        scoring_dimension: 'identity',
        parent_question_key: null,
        show_when_value: null,
        show_when_operator: 'equals',
        options: [],
        config: {},
        is_active: true,
        is_included: true,
        sort_order: 20,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'question-optional',
        template_id: 'assessment-template-1',
        question_key: 'optional_evidence',
        response_key: 'optional_evidence',
        question_text: 'Optional evidence',
        help_text: null,
        section: 'Identity',
        question_type: 'short_text',
        scoring_dimension: null,
        parent_question_key: null,
        show_when_value: null,
        show_when_operator: 'equals',
        options: [],
        config: {},
        is_active: true,
        is_included: true,
        sort_order: 30,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    responses: {
      comfort_level: 8,
      strengths: ['Communication', 'Consistency'],
      passion_topic: 'Fitness',
      persona_occupation: ['Performer'],
      parasocial_comfort: true,
      fantasy_keywords: 'athletic',
      nudity_level: 'implied',
      niche_interests: ['Fitness'],
      audience_target: 'masses',
      first_name: 'Test',
      last_name: 'Creator',
      onlyfans_handle: '',
      model_name: '',
      city: '',
      full_name: 'Test Creator',
      email: 'not-persisted-in-context@example.test',
      country: 'GB',
      consent: true,
      mailing_list_opt_out: false,
    },
    baselineResult: {
      scores: {
        creator_dna: 70,
        brand_clarity: 71,
        monetisation: 72,
        consistency: 73,
        agency_opportunity: 74,
      },
      archetype: 'Performer',
    } as any,
    intelligence: {
      evidence: [
        {
          id: 'evidence-camera',
          source_question_key: 'camera_comfort',
          response_key: 'comfort_level',
          section: 'Content Engine',
          dimension: 'confidence',
          value: 8,
          strength: 80,
          polarity: 'positive',
          confidence: 90,
          tags: ['camera'],
        },
        {
          id: 'evidence-email',
          source_question_key: 'email',
          response_key: 'email',
          section: 'Identity',
          dimension: 'identity',
          value: 'not-persisted-in-context@example.test',
          strength: 50,
          polarity: 'neutral',
          confidence: 50,
          tags: [],
        },
      ],
      traits: [{
        trait: 'visibility_comfort',
        weight: 82,
        evidence_ids: ['evidence-camera'],
        rationale: 'High camera comfort',
      }],
      archetype_fits: [
        {
          archetype: 'Communicator',
          fit_score: 91,
          confidence: 88,
          selected_by_creator: false,
          validation_status: 'inferred',
          supporting_evidence_ids: ['evidence-camera'],
          contradicting_evidence_ids: [],
        },
        {
          archetype: 'Performer',
          fit_score: 84,
          confidence: 80,
          selected_by_creator: true,
          validation_status: 'validated',
          supporting_evidence_ids: ['evidence-camera'],
          contradicting_evidence_ids: [],
        },
      ],
      confidence: { score: 86, label: 'High', drivers: ['Strong evidence'] },
      creator_dna: {
        creator_profile_id: 'creator-1',
        assessment_id: 'assessment-1',
        creator_dna_primary: 'Connection',
        creator_dna_secondary: 'Performance',
        confidence: 85,
        fantasy_archetype: 'Fitness Goddess',
        archetype_confidence: 83,
        authenticity_band: 'High Authenticity',
        authenticity_flags: [],
        growth_constraints: [],
        monetisation_readiness: 'Ready',
        agency_opportunity_score: 78,
        agency_opportunity_band: 'Qualified',
        summary: 'Evidence-backed summary',
      },
      report: {
        scores: {
          creator_dna: 80,
          brand_clarity: 81,
          monetisation: 82,
          consistency: 83,
          agency_opportunity: 84,
        },
        top_verticals: [{ name: 'Fitness Journey', rationale: 'Strong fitness evidence.' }],
        recommended_actions: [{ title: 'Publish consistently', rationale: 'Consistency supports learning.' }],
        management_readiness: 'Ready Now',
      } as any,
      knowledge: {
        profile: {},
        recommendations: [{ id: 'recommendation-1', title: 'Test short video' } as any],
        opportunities: [],
        risks: [],
        catalogueCoverage: { recommendationsEvaluated: 1, opportunitiesEvaluated: 0, risksEvaluated: 0 },
      },
    },
  });
}

test('generation context keys answers by question key and excludes unnecessary contact data', () => {
  const context = generationContext();
  assert.equal(context.contextVersion, REPORT_GENERATION_SCHEMA_VERSION);
  assert.equal(context.answers.camera_comfort, 8);
  assert.deepEqual(context.answers.creator_strengths, ['Communication', 'Consistency']);
  assert.equal(context.answers.optional_evidence, null);
  assert.equal('email' in context.creator, false);
  assert.equal(JSON.stringify(context).includes('not-persisted-in-context@example.test'), false);
  assert.equal(context.evidence.some(item => item.response_key === 'email'), false);
});

test('generation context keeps score stages and archetype concepts explicit', () => {
  const context = generationContext();
  assert.equal(context.scores.baseline_creator_dna, 70);
  assert.equal(context.scores.report_creator_dna, 80);
  assert.equal(context.signals.legacyArchetype, 'Performer');
  assert.equal(context.signals.topArchetypeFit, 'Communicator');
  assert.equal(context.signals.creatorDnaArchetype, 'Fitness Goddess');
  assert.equal('archetype' in context.signals, false);
  assert.equal(context.signals.traits.visibility_comfort, 82);
});

test('generation context digest is deterministic and SHA-256 labelled', async () => {
  const left = await computeGenerationDigest(generationContext());
  const right = await computeGenerationDigest(generationContext());
  assert.equal(left, right);
  assert.match(left, /^sha256:[a-f0-9]{64}$/);
});

const operatorCases: Array<[ReportRuleOperator, unknown, unknown, boolean]> = [
  ['equals', 'YES', 'yes', true],
  ['not_equals', 'yes', 'no', true],
  ['greater_than', 8, 7, true],
  ['greater_than_or_equal', 8, 8, true],
  ['less_than', 6, 7, true],
  ['less_than_or_equal', '7', 7, true],
  ['contains', 'Video-first creator', 'video', true],
  ['contains', ['video', 'fitness'], 'fitness', true],
  ['any_of', ['video', 'fitness'], ['beauty', 'fitness'], true],
  ['all_of', ['video', 'fitness'], ['fitness', 'video'], true],
  ['all_of', ['video'], ['video', 'fitness'], false],
];

for (const [operator, actual, expected, matched] of operatorCases) {
  test(`rule evaluator supports ${operator} for ${Array.isArray(actual) ? 'arrays' : typeof actual}`, () => {
    const context = generationContext();
    context.answers.operator_value = actual as any;
    const result = evaluateReportRule({
      combinator: 'and',
      conditions: [{ sourceType: 'question', sourceKey: 'operator_value', operator, value: expected as any }],
    }, context);
    assert.equal(result.matched, matched);
    assert.deepEqual(result.conditions[0].actualValue, actual);
    assert.equal(result.conditions[0].operator, operator);
  });
}

test('rule evaluator returns AND, OR, and missing-evidence provenance', () => {
  const context = generationContext();
  const andResult = evaluateReportRule({
    combinator: 'and',
    conditions: [
      { sourceType: 'question', sourceKey: 'camera_comfort', operator: 'greater_than_or_equal', value: 7 },
      { sourceType: 'signal', sourceKey: 'creatorDnaArchetype', operator: 'equals', value: 'Fitness Goddess' },
    ],
  }, context);
  assert.equal(andResult.matched, true);
  assert.equal(andResult.conditions.every(condition => condition.matched), true);

  const orResult = evaluateReportRule({
    combinator: 'or',
    conditions: [
      { sourceType: 'question', sourceKey: 'missing_question', operator: 'equals', value: true },
      { sourceType: 'score', sourceKey: 'report_consistency', operator: 'greater_than', value: 80 },
    ],
  }, context);
  assert.equal(orResult.matched, true);
  assert.deepEqual(orResult.missingEvidence, ['question:missing_question']);
  assert.equal(orResult.conditions[0].missing, true);
});

function reportTemplate(): ReportTemplateDefinition {
  const matchedRule = {
    combinator: 'and' as const,
    conditions: [{
      sourceType: 'question' as const,
      sourceKey: 'camera_comfort',
      operator: 'greater_than_or_equal' as const,
      value: 7,
    }],
  };
  const unmatchedRule = {
    combinator: 'and' as const,
    conditions: [{
      sourceType: 'score' as const,
      sourceKey: 'report_consistency',
      operator: 'less_than' as const,
      value: 20,
    }],
  };
  return {
    templateId: 'report-template-1',
    versionId: 'report-version-1',
    versionNumber: 1,
    status: 'draft',
    schemaVersion: REPORT_GENERATION_SCHEMA_VERSION,
    sections: [
      {
        id: 'section-second',
        sectionKey: 'second',
        title: 'Second',
        sortOrder: 20,
        isActive: true,
        blocks: [{
          id: 'block-second-static',
          blockKey: 'second_static',
          blockType: 'static',
          staticContent: 'Second section',
          sortOrder: 10,
          isActive: true,
          sources: [],
        }],
      },
      {
        id: 'section-first',
        sectionKey: 'first',
        title: 'First',
        sortOrder: 10,
        isActive: true,
        blocks: [
          {
            id: 'block-rule-false',
            blockKey: 'rule_false',
            blockType: 'rule',
            contentTemplate: 'Should not render',
            ruleConfig: unmatchedRule,
            sortOrder: 40,
            isActive: true,
            sources: [{ sourceType: 'score', sourceKey: 'report_consistency', purpose: 'condition', sortOrder: 10 }],
          },
          {
            id: 'block-question',
            blockKey: 'camera_answer',
            blockType: 'question',
            heading: 'Camera comfort',
            contentTemplate: 'Your answer was {{question.camera_comfort}}.',
            sortOrder: 20,
            isActive: true,
            sources: [{ sourceType: 'question', questionId: 'question-camera', sourceKey: 'camera_comfort', purpose: 'display', sortOrder: 10 }],
          },
          {
            id: 'block-static',
            blockKey: 'intro',
            blockType: 'static',
            staticContent: 'Authored introduction.',
            sortOrder: 10,
            isActive: true,
            sources: [],
          },
          {
            id: 'block-rule-true',
            blockKey: 'rule_true',
            blockType: 'rule',
            contentTemplate: 'Strong camera score: {{question.camera_comfort}}.',
            ruleConfig: matchedRule,
            sortOrder: 30,
            isActive: true,
            sources: [{ sourceType: 'question', questionId: 'question-camera', sourceKey: 'camera_comfort', purpose: 'condition', sortOrder: 10 }],
          },
          {
            id: 'block-question-missing',
            blockKey: 'question_missing',
            blockType: 'question',
            sortOrder: 50,
            isActive: true,
            sources: [{ sourceType: 'question', questionId: 'question-optional', sourceKey: 'optional_evidence', purpose: 'display', sortOrder: 10 }],
          },
          {
            id: 'block-ai',
            blockKey: 'ai_disabled',
            blockType: 'ai',
            sortOrder: 60,
            isActive: true,
            sources: [],
          },
          {
            id: 'block-ai-fallback',
            blockKey: 'ai_fallback',
            blockType: 'ai',
            fallbackText: 'Deterministic AI fallback.',
            sortOrder: 70,
            isActive: true,
            sources: [],
          },
          {
            id: 'block-hybrid-true',
            blockKey: 'hybrid_true',
            blockType: 'hybrid',
            ruleConfig: matchedRule,
            fallbackText: 'Deterministic hybrid fallback.',
            sortOrder: 80,
            isActive: true,
            sources: [{ sourceType: 'question', questionId: 'question-camera', sourceKey: 'camera_comfort', purpose: 'condition', sortOrder: 10 }],
          },
          {
            id: 'block-hybrid-false',
            blockKey: 'hybrid_false',
            blockType: 'hybrid',
            ruleConfig: unmatchedRule,
            fallbackText: 'Must not render.',
            sortOrder: 90,
            isActive: true,
            sources: [{ sourceType: 'score', sourceKey: 'report_consistency', purpose: 'condition', sortOrder: 10 }],
          },
          {
            id: 'block-inactive',
            blockKey: 'inactive',
            blockType: 'static',
            staticContent: 'Inactive',
            sortOrder: 100,
            isActive: false,
            sources: [],
          },
        ],
      },
      {
        id: 'section-inactive',
        sectionKey: 'inactive',
        title: 'Inactive section',
        sortOrder: 30,
        isActive: false,
        blocks: [{
          id: 'block-inactive-section',
          blockKey: 'inactive_section_block',
          blockType: 'static',
          staticContent: 'Inactive section content',
          sortOrder: 10,
          isActive: true,
          sources: [],
        }],
      },
    ],
  };
}

test('block evaluator renders deterministic blocks in section and block order', () => {
  const result = evaluateReportTemplate(reportTemplate(), generationContext());
  assert.deepEqual(result.renderedSections.map(section => section.sectionKey), ['first', 'second']);
  assert.deepEqual(
    result.renderedSections[0].blocks.map(block => block.blockKey),
    ['intro', 'camera_answer', 'rule_true', 'ai_fallback', 'hybrid_true'],
  );
  assert.equal(result.renderedSections[0].blocks[1].content, 'Your answer was 8.');
  assert.deepEqual(result.rulesFired, ['rule_true', 'hybrid_true']);
  assert.deepEqual(result.rulesSkipped, ['rule_false', 'hybrid_false']);
});

test('block evaluator reports missing evidence, AI-disabled, fallback, and inactive states', () => {
  const result = evaluateReportTemplate(reportTemplate(), generationContext());
  const byKey = Object.fromEntries(result.executionTrace.map(trace => [trace.blockKey, trace]));
  assert.equal(byKey.question_missing.status, 'missing_evidence');
  assert.deepEqual(byKey.question_missing.missingEvidence, ['question:optional_evidence']);
  assert.equal(byKey.ai_disabled.status, 'ai_not_enabled');
  assert.equal(byKey.ai_disabled.aiExecuted, false);
  assert.equal(byKey.ai_fallback.status, 'fallback');
  assert.equal(byKey.ai_fallback.fallbackUsed, true);
  assert.equal(byKey.hybrid_true.status, 'fallback');
  assert.equal(byKey.hybrid_true.ruleEvaluation.matched, true);
  assert.equal(byKey.hybrid_false.status, 'rule_not_matched');
  assert.equal(byKey.inactive.reason, 'block_inactive');
  assert.equal(byKey.inactive_section_block.reason, 'section_inactive');
});

test('execution provenance explains why a rule block appeared and which evidence it used', () => {
  const result = evaluateReportTemplate(reportTemplate(), generationContext());
  const trace = result.executionTrace.find(item => item.blockKey === 'rule_true');
  assert.ok(trace);
  assert.equal(trace.status, 'rule_matched');
  assert.equal(trace.reason, 'rule_matched');
  assert.equal(trace.ruleEvaluation?.conditions[0].actualValue, 8);
  assert.equal(trace.ruleEvaluation?.conditions[0].expectedValue, 7);
  assert.equal(trace.evidenceSnapshot.some(item => (
    item.sourceType === 'question'
    && item.sourceKey === 'camera_comfort'
    && item.value === 8
  )), true);
  assert.equal(trace.renderedOutput, 'Strong camera score: 8.');
});

test('block evaluator refuses undeclared interpolation sources instead of rendering a partial claim', () => {
  const template = reportTemplate();
  const block = template.sections[1].blocks.find(item => item.blockKey === 'rule_true');
  assert.ok(block);
  block.sources = [];
  const result = evaluateReportTemplate(template, generationContext());
  const trace = result.executionTrace.find(item => item.blockKey === 'rule_true');
  assert.equal(trace?.status, 'missing_evidence');
  assert.equal(trace?.included, false);
  assert.ok(trace?.missingEvidence.includes('undeclared_source:question:camera_comfort'));
});

test('block evaluator includes a matched OR rule while retaining non-critical missing provenance', () => {
  const template = reportTemplate();
  template.sections[1].blocks.push({
    id: 'block-or',
    blockKey: 'or_rule',
    blockType: 'rule',
    staticContent: 'At least one evidence path matched.',
    ruleConfig: {
      combinator: 'or',
      conditions: [
        { sourceType: 'question', sourceKey: 'optional_evidence', operator: 'equals', value: 'yes' },
        { sourceType: 'score', sourceKey: 'report_consistency', operator: 'greater_than', value: 80 },
      ],
    },
    sortOrder: 35,
    isActive: true,
    sources: [
      { sourceType: 'question', questionId: 'question-optional', sourceKey: 'optional_evidence', purpose: 'condition', sortOrder: 10 },
      { sourceType: 'score', sourceKey: 'report_consistency', purpose: 'condition', sortOrder: 20 },
    ],
  });
  const result = evaluateReportTemplate(template, generationContext());
  const trace = result.executionTrace.find(item => item.blockKey === 'or_rule');
  assert.equal(trace?.status, 'rule_matched');
  assert.equal(trace?.included, true);
  assert.ok(trace?.missingEvidence.includes('question:optional_evidence'));
});

test('block evaluator returns a failed trace for malformed persisted rule JSON', () => {
  const template = reportTemplate();
  const block = template.sections[1].blocks.find(item => item.blockKey === 'rule_true');
  assert.ok(block);
  block.ruleConfig = {} as any;
  const result = evaluateReportTemplate(template, generationContext());
  const trace = result.executionTrace.find(item => item.blockKey === 'rule_true');
  assert.equal(trace?.status, 'failed');
  assert.match(trace?.reason ?? '', /^invalid_rule_config:/);
});
