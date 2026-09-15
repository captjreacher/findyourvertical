import type {
  ArchetypeFit,
  AssessmentEvidence,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorAssessmentRuntimeTemplate,
  CreatorDnaProfile,
  CreatorIntelligenceResult,
  CreatorProfile,
  ReportData,
  TraitWeight,
} from '../types/creator.ts';
import type { ScoringResult } from './scoring.ts';

export const SCORING_VERSION = 'fyv/scoring/legacy-rules-v1' as const;
export const CREATOR_INTELLIGENCE_VERSION = 'fyv/creator-intelligence/deterministic-v1' as const;
export const CREATOR_DNA_VERSION = 'fyv/creator-dna/deterministic-v1' as const;
export const REPORT_GENERATION_SCHEMA_VERSION = 'fyv/report-generation/context-v1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ReportSourceType = 'question' | 'score' | 'signal' | 'report_field';
export type ReportSourcePurpose = 'input' | 'evidence' | 'condition' | 'display';
export type ReportRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'any_of'
  | 'all_of';

export interface CreatorReportGenerationContext {
  contextVersion: typeof REPORT_GENERATION_SCHEMA_VERSION;
  creator: {
    id: string;
    displayName: string | null;
    country: string | null;
  };
  assessment: {
    id: string;
    templateId: string | null;
    templateSlug: string | null;
    createdAt: string | null;
  };
  assessmentTemplate: {
    id: string;
    slug: string;
    name: string;
  } | null;
  answers: Record<string, JsonValue>;
  questions: Record<string, {
    id: string;
    questionKey: string;
    responseKey: string;
    questionText: string;
    questionType: string;
    scoringDimension: string | null;
  }>;
  scores: Record<string, number | null>;
  signals: {
    legacyArchetype: string | null;
    topArchetypeFit: string | null;
    topArchetypeFitScore: number | null;
    creatorDnaArchetype: string | null;
    creatorDnaPrimary: string | null;
    creatorDnaSecondary: string | null;
    intelligenceConfidenceScore: number | null;
    intelligenceConfidenceLabel: string | null;
    managementReadiness: string | null;
    monetisationReadiness: string | null;
    agencyOpportunityBand: string | null;
    identityComplete: boolean;
    contactConsent: boolean;
    traits: Record<string, number>;
  };
  evidence: AssessmentEvidence[];
  traits: TraitWeight[];
  archetypeFits: ArchetypeFit[];
  creatorDna: Omit<CreatorDnaProfile, 'id' | 'created_at'> | null;
  verticals: Array<{ name: string; rationale: string }>;
  recommendations: {
    report: Array<{ title: string; rationale: string }>;
    knowledge: JsonValue[];
  };
  reportFields: Record<string, JsonValue>;
}

export interface BuildCreatorReportGenerationContextInput {
  profile: Pick<CreatorProfile, 'id' | 'full_name' | 'country'>;
  assessment: {
    id: string;
    template_id?: string | null;
    template_slug?: string | null;
    created_at?: string | null;
  };
  assessmentTemplate?: CreatorAssessmentRuntimeTemplate | null;
  questions?: CreatorAssessmentQuestion[];
  responses: AssessmentResponses;
  baselineResult: ScoringResult;
  intelligence: CreatorIntelligenceResult;
  reportData?: ReportData;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return String(value);
}

function asJsonRecord(value: unknown): Record<string, JsonValue> {
  const normalized = toJsonValue(value);
  return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized
    : {};
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

const PRIVATE_RESPONSE_KEYS = new Set([
  'first_name',
  'last_name',
  'full_name',
  'email',
  'onlyfans_handle',
  'model_name',
  'city',
  'country',
  'consent',
  'mailing_list_opt_out',
]);

export function buildCreatorReportGenerationContext(
  input: BuildCreatorReportGenerationContextInput,
): CreatorReportGenerationContext {
  const questions = input.questions ?? input.assessmentTemplate?.questions ?? [];
  const answers: Record<string, JsonValue> = {};
  const questionDefinitions: CreatorReportGenerationContext['questions'] = {};

  for (const question of questions) {
    const responseKey = question.response_key || question.question_key;
    const value = hasOwn(input.responses, responseKey)
      ? input.responses[responseKey]
      : input.responses[question.question_key];
    answers[question.question_key] = PRIVATE_RESPONSE_KEYS.has(responseKey) ? null : toJsonValue(value);
    questionDefinitions[question.question_key] = {
      id: question.id,
      questionKey: question.question_key,
      responseKey,
      questionText: question.question_text,
      questionType: question.question_type,
      scoringDimension: question.scoring_dimension,
    };
  }

  for (const [key, value] of Object.entries(input.responses)) {
    if (!PRIVATE_RESPONSE_KEYS.has(key) && !hasOwn(answers, key)) answers[key] = toJsonValue(value);
  }

  const report = input.reportData ?? input.intelligence.report;
  const topArchetypeFit = [...input.intelligence.archetype_fits]
    .sort((left, right) => right.fit_score - left.fit_score)[0] ?? null;
  const traitSignals = Object.fromEntries(
    input.intelligence.traits.map(trait => [trait.trait, trait.weight]),
  );

  return {
    contextVersion: REPORT_GENERATION_SCHEMA_VERSION,
    creator: {
      id: input.profile.id,
      displayName: input.profile.full_name || null,
      country: input.profile.country ?? null,
    },
    assessment: {
      id: input.assessment.id,
      templateId: input.assessment.template_id ?? input.assessmentTemplate?.id ?? null,
      templateSlug: input.assessment.template_slug ?? input.assessmentTemplate?.slug ?? null,
      createdAt: input.assessment.created_at ?? null,
    },
    assessmentTemplate: input.assessmentTemplate
      ? {
          id: input.assessmentTemplate.id,
          slug: input.assessmentTemplate.slug,
          name: input.assessmentTemplate.name,
        }
      : null,
    answers,
    questions: questionDefinitions,
    scores: {
      baseline_creator_dna: input.baselineResult.scores.creator_dna,
      baseline_brand_clarity: input.baselineResult.scores.brand_clarity,
      baseline_monetisation: input.baselineResult.scores.monetisation,
      baseline_consistency: input.baselineResult.scores.consistency,
      baseline_agency_opportunity: input.baselineResult.scores.agency_opportunity,
      report_creator_dna: report.scores.creator_dna,
      report_brand_clarity: report.scores.brand_clarity,
      report_monetisation: report.scores.monetisation,
      report_consistency: report.scores.consistency,
      report_agency_opportunity: report.scores.agency_opportunity,
      intelligence_confidence: input.intelligence.confidence.score,
    },
    signals: {
      legacyArchetype: input.baselineResult.archetype ?? null,
      topArchetypeFit: topArchetypeFit?.archetype ?? null,
      topArchetypeFitScore: topArchetypeFit?.fit_score ?? null,
      creatorDnaArchetype: input.intelligence.creator_dna.fantasy_archetype ?? null,
      creatorDnaPrimary: input.intelligence.creator_dna.creator_dna_primary ?? null,
      creatorDnaSecondary: input.intelligence.creator_dna.creator_dna_secondary ?? null,
      intelligenceConfidenceScore: input.intelligence.confidence.score ?? null,
      intelligenceConfidenceLabel: input.intelligence.confidence.label ?? null,
      managementReadiness: report.management_readiness ?? null,
      monetisationReadiness: input.intelligence.creator_dna.monetisation_readiness ?? null,
      agencyOpportunityBand: input.intelligence.creator_dna.agency_opportunity_band ?? null,
      identityComplete: Boolean(input.responses.full_name && input.responses.email && input.responses.country),
      contactConsent: Boolean(input.responses.consent && !input.responses.mailing_list_opt_out),
      traits: traitSignals,
    },
    evidence: input.intelligence.evidence
      .filter(item => !PRIVATE_RESPONSE_KEYS.has(item.response_key))
      .map(item => ({ ...item })),
    traits: input.intelligence.traits.map(item => ({ ...item, evidence_ids: [...item.evidence_ids] })),
    archetypeFits: input.intelligence.archetype_fits.map(item => ({
      ...item,
      supporting_evidence_ids: [...item.supporting_evidence_ids],
      contradicting_evidence_ids: [...item.contradicting_evidence_ids],
    })),
    creatorDna: { ...input.intelligence.creator_dna },
    verticals: report.top_verticals.map(item => ({ ...item })),
    recommendations: {
      report: (report.recommended_actions ?? []).map(item => ({ ...item })),
      knowledge: (input.intelligence.knowledge?.recommendations ?? []).map(toJsonValue),
    },
    reportFields: asJsonRecord(report),
  };
}

export interface ReportRuleCondition {
  sourceType: ReportSourceType;
  sourceKey: string;
  operator: ReportRuleOperator;
  value: JsonValue;
}

export interface ReportRuleConfig {
  combinator: 'and' | 'or';
  conditions: ReportRuleCondition[];
}

export interface ReportRuleConditionResult {
  sourceType: ReportSourceType;
  sourceKey: string;
  actualValue: JsonValue | null;
  operator: ReportRuleOperator;
  expectedValue: JsonValue;
  matched: boolean;
  missing: boolean;
}

export interface ReportRuleEvaluationResult {
  valid: boolean;
  errors: string[];
  matched: boolean;
  combinator: 'and' | 'or';
  conditions: ReportRuleConditionResult[];
  missingEvidence: string[];
}

const REPORT_SOURCE_TYPES: ReportSourceType[] = ['question', 'score', 'signal', 'report_field'];
const REPORT_RULE_OPERATORS: ReportRuleOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'contains',
  'any_of',
  'all_of',
];

export function validateReportRuleConfig(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['rule_must_be_an_object'] };
  }
  const rule = input as Partial<ReportRuleConfig>;
  if (rule.combinator !== 'and' && rule.combinator !== 'or') errors.push('invalid_combinator');
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push('conditions_required');
  } else {
    rule.conditions.forEach((condition, index) => {
      if (!condition || typeof condition !== 'object') {
        errors.push(`condition_${index}_must_be_an_object`);
        return;
      }
      if (!REPORT_SOURCE_TYPES.includes(condition.sourceType)) errors.push(`condition_${index}_invalid_source_type`);
      if (typeof condition.sourceKey !== 'string' || condition.sourceKey.trim() === '') errors.push(`condition_${index}_source_key_required`);
      if (!REPORT_RULE_OPERATORS.includes(condition.operator)) errors.push(`condition_${index}_invalid_operator`);
      if (!hasOwn(condition, 'value')) errors.push(`condition_${index}_value_required`);
    });
  }
  return { valid: errors.length === 0, errors };
}

function valueAtPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, root);
}

export function resolveReportSource(
  context: CreatorReportGenerationContext,
  sourceType: ReportSourceType,
  sourceKey: string,
): JsonValue | undefined {
  const roots: Record<ReportSourceType, unknown> = {
    question: context.answers,
    score: context.scores,
    signal: context.signals,
    report_field: context.reportFields,
  };
  const value = valueAtPath(roots[sourceType], sourceKey);
  return value === undefined ? undefined : toJsonValue(value);
}

function isMissing(value: JsonValue | undefined): boolean {
  return value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function valuesEqual(actual: JsonValue, expected: JsonValue): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') return actual === expected;
  if (Array.isArray(actual) || Array.isArray(expected) || typeof actual === 'object' || typeof expected === 'object') {
    return stableStringify(actual) === stableStringify(expected);
  }
  return String(actual).toLowerCase() === String(expected).toLowerCase();
}

function numericComparison(actual: JsonValue, expected: JsonValue, compare: (a: number, b: number) => boolean): boolean {
  const actualNumber = typeof actual === 'number' ? actual : Number(actual);
  const expectedNumber = typeof expected === 'number' ? expected : Number(expected);
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && compare(actualNumber, expectedNumber);
}

function conditionMatches(actual: JsonValue, operator: ReportRuleOperator, expected: JsonValue): boolean {
  switch (operator) {
    case 'equals':
      return valuesEqual(actual, expected);
    case 'not_equals':
      return !valuesEqual(actual, expected);
    case 'greater_than':
      return numericComparison(actual, expected, (left, right) => left > right);
    case 'greater_than_or_equal':
      return numericComparison(actual, expected, (left, right) => left >= right);
    case 'less_than':
      return numericComparison(actual, expected, (left, right) => left < right);
    case 'less_than_or_equal':
      return numericComparison(actual, expected, (left, right) => left <= right);
    case 'contains':
      if (Array.isArray(actual)) return actual.some(item => valuesEqual(item, expected));
      return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
    case 'any_of': {
      const expectedValues = Array.isArray(expected) ? expected : [expected];
      const actualValues = Array.isArray(actual) ? actual : [actual];
      return actualValues.some(actualValue => expectedValues.some(expectedValue => valuesEqual(actualValue, expectedValue)));
    }
    case 'all_of': {
      const expectedValues = Array.isArray(expected) ? expected : [expected];
      const actualValues = Array.isArray(actual) ? actual : [actual];
      return expectedValues.every(expectedValue => actualValues.some(actualValue => valuesEqual(actualValue, expectedValue)));
    }
  }
}

export function evaluateReportRule(
  rule: ReportRuleConfig,
  context: CreatorReportGenerationContext,
): ReportRuleEvaluationResult {
  const validation = validateReportRuleConfig(rule);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      matched: false,
      combinator: rule?.combinator === 'or' ? 'or' : 'and',
      conditions: [],
      missingEvidence: [],
    };
  }
  const conditions = rule.conditions.map<ReportRuleConditionResult>(condition => {
    const actualValue = resolveReportSource(context, condition.sourceType, condition.sourceKey);
    const missing = isMissing(actualValue);
    return {
      sourceType: condition.sourceType,
      sourceKey: condition.sourceKey,
      actualValue: actualValue ?? null,
      operator: condition.operator,
      expectedValue: condition.value,
      matched: missing ? false : conditionMatches(actualValue as JsonValue, condition.operator, condition.value),
      missing,
    };
  });
  const matched = conditions.length > 0 && (
    rule.combinator === 'and'
      ? conditions.every(condition => condition.matched)
      : conditions.some(condition => condition.matched)
  );
  return {
    valid: true,
    errors: [],
    matched,
    combinator: rule.combinator,
    conditions,
    missingEvidence: conditions
      .filter(condition => condition.missing)
      .map(condition => `${condition.sourceType}:${condition.sourceKey}`),
  };
}

export type ReportBlockType = 'static' | 'question' | 'rule' | 'ai' | 'hybrid';

export interface ReportBlockSourceDefinition {
  id?: string;
  sourceType: ReportSourceType;
  questionId?: string | null;
  sourceKey: string;
  purpose: ReportSourcePurpose;
  sortOrder: number;
}

export interface ReportBlockDefinition {
  id: string;
  blockKey: string;
  blockType: ReportBlockType;
  heading?: string | null;
  staticContent?: string | null;
  contentTemplate?: string | null;
  ruleConfig?: ReportRuleConfig | null;
  aiConfig?: Record<string, JsonValue>;
  fallbackText?: string | null;
  aiRequired?: boolean;
  sortOrder: number;
  isActive: boolean;
  sources: ReportBlockSourceDefinition[];
}

export interface ReportSectionDefinition {
  id: string;
  sectionKey: string;
  title: string;
  internalPurpose?: string | null;
  sortOrder: number;
  isActive: boolean;
  blocks: ReportBlockDefinition[];
}

export interface ReportTemplateDefinition {
  templateId: string;
  versionId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'superseded';
  schemaVersion: string;
  sections: ReportSectionDefinition[];
}

export type ReportBlockExecutionStatus =
  | 'included'
  | 'skipped'
  | 'rule_matched'
  | 'rule_not_matched'
  | 'missing_evidence'
  | 'fallback'
  | 'ai_not_enabled'
  | 'failed';

export interface ReportEvidenceSnapshot {
  sourceId: string | null;
  questionId: string | null;
  sourceType: ReportSourceType;
  sourceKey: string;
  purpose: ReportSourcePurpose | 'condition';
  value: JsonValue | null;
  missing: boolean;
}

export interface ReportBlockExecutionTrace {
  sectionId: string;
  sectionKey: string;
  blockId: string;
  blockKey: string;
  blockType: ReportBlockType;
  status: ReportBlockExecutionStatus;
  included: boolean;
  reason: string;
  ruleEvaluation: ReportRuleEvaluationResult | null;
  evidenceSnapshot: ReportEvidenceSnapshot[];
  missingEvidence: string[];
  renderedOutput: string | null;
  fallbackUsed: boolean;
  aiExecuted: false;
}

export interface RenderedReportBlock {
  blockId: string;
  blockKey: string;
  blockType: ReportBlockType;
  heading: string | null;
  content: string;
}

export interface RenderedReportSection {
  sectionId: string;
  sectionKey: string;
  title: string;
  blocks: RenderedReportBlock[];
}

export interface ReportTemplateEvaluationResult {
  templateId: string;
  templateVersionId: string;
  renderedSections: RenderedReportSection[];
  executionTrace: ReportBlockExecutionTrace[];
  missingEvidence: string[];
  rulesFired: string[];
  rulesSkipped: string[];
}

function compareOrdered(left: { sortOrder: number; id?: string }, right: { sortOrder: number; id?: string }): number {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  const leftId = left.id ?? '';
  const rightId = right.id ?? '';
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function formatAnswer(value: JsonValue): string {
  if (Array.isArray(value)) return value.map(formatAnswer).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}

function interpolateContent(
  template: string,
  context: CreatorReportGenerationContext,
  sources: ReportBlockSourceDefinition[],
): { content: string; missing: string[] } {
  const missing = new Set<string>();
  const directSources = new Map(sources.map(source => [source.sourceKey, source]));
  const content = template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, token: string) => {
    const separator = token.indexOf('.');
    const namespace = separator > 0 ? token.slice(0, separator) : null;
    const sourceKey = separator > 0 ? token.slice(separator + 1) : token;
    const sourceType = namespace === 'question'
      ? 'question'
      : namespace === 'score'
        ? 'score'
        : namespace === 'signal'
          ? 'signal'
          : namespace === 'report_field'
            ? 'report_field'
            : directSources.get(token)?.sourceType;

    if (!sourceType) return _match;
    const declaredSource = sources.find(source => (
      source.sourceType === sourceType && source.sourceKey === sourceKey
    ));
    if (!declaredSource) {
      missing.add(`undeclared_source:${sourceType}:${sourceKey}`);
      return '';
    }
    const value = resolveReportSource(context, sourceType, sourceKey);
    if (isMissing(value)) {
      missing.add(`${sourceType}:${sourceKey}`);
      return '';
    }
    return formatAnswer(value as JsonValue);
  });
  return { content, missing: [...missing] };
}

function sourceEvidence(
  sources: ReportBlockSourceDefinition[],
  context: CreatorReportGenerationContext,
): ReportEvidenceSnapshot[] {
  return [...sources].sort(compareOrdered).map(source => {
    const value = resolveReportSource(context, source.sourceType, source.sourceKey);
    return {
      sourceId: source.id ?? null,
      questionId: source.questionId ?? null,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      purpose: source.purpose,
      value: value ?? null,
      missing: isMissing(value),
    };
  });
}

function conditionEvidence(
  rule: ReportRuleEvaluationResult | null,
  sources: ReportBlockSourceDefinition[],
): ReportEvidenceSnapshot[] {
  return rule?.conditions.map(condition => ({
    sourceId: sources.find(source => (
      source.sourceType === condition.sourceType && source.sourceKey === condition.sourceKey
    ))?.id ?? null,
    questionId: sources.find(source => (
      source.sourceType === condition.sourceType && source.sourceKey === condition.sourceKey
    ))?.questionId ?? null,
    sourceType: condition.sourceType,
    sourceKey: condition.sourceKey,
    purpose: 'condition',
    value: condition.actualValue,
    missing: condition.missing,
  })) ?? [];
}

function uniqueEvidence(evidence: ReportEvidenceSnapshot[]): ReportEvidenceSnapshot[] {
  const seen = new Set<string>();
  return evidence.filter(item => {
    const key = `${item.sourceType}:${item.sourceKey}:${item.purpose}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function traceForInactive(
  section: ReportSectionDefinition,
  block: ReportBlockDefinition,
  reason: string,
): ReportBlockExecutionTrace {
  return {
    sectionId: section.id,
    sectionKey: section.sectionKey,
    blockId: block.id,
    blockKey: block.blockKey,
    blockType: block.blockType,
    status: 'skipped',
    included: false,
    reason,
    ruleEvaluation: null,
    evidenceSnapshot: [],
    missingEvidence: [],
    renderedOutput: null,
    fallbackUsed: false,
    aiExecuted: false,
  };
}

function evaluateBlock(
  section: ReportSectionDefinition,
  block: ReportBlockDefinition,
  context: CreatorReportGenerationContext,
): ReportBlockExecutionTrace {
  const ruleEvaluation = block.ruleConfig ? evaluateReportRule(block.ruleConfig, context) : null;
  const undeclaredRuleSources = (block.ruleConfig?.conditions ?? [])
    .filter(condition => !block.sources.some(source => (
      source.sourceType === condition.sourceType && source.sourceKey === condition.sourceKey
    )))
    .map(condition => `undeclared_source:${condition.sourceType}:${condition.sourceKey}`);
  const evidenceSnapshot = uniqueEvidence([
    ...sourceEvidence(block.sources, context),
    ...conditionEvidence(ruleEvaluation, block.sources),
  ]);
  const sourceMissing = evidenceSnapshot
    .filter(item => item.missing)
    .map(item => `${item.sourceType}:${item.sourceKey}`);
  const missingEvidence = [...new Set([
    ...(ruleEvaluation?.missingEvidence ?? []),
    ...sourceMissing,
    ...undeclaredRuleSources,
  ])];
  const blockingMissingEvidence = [...new Set([
    ...undeclaredRuleSources,
    ...evidenceSnapshot
      .filter(item => item.missing && item.purpose !== 'condition')
      .map(item => `${item.sourceType}:${item.sourceKey}`),
  ])];
  const base = {
    sectionId: section.id,
    sectionKey: section.sectionKey,
    blockId: block.id,
    blockKey: block.blockKey,
    blockType: block.blockType,
    ruleEvaluation,
    evidenceSnapshot,
    missingEvidence,
    aiExecuted: false as const,
  };
  const included = (status: ReportBlockExecutionStatus, reason: string, output: string, fallbackUsed = false): ReportBlockExecutionTrace => ({
    ...base,
    status,
    included: true,
    reason,
    renderedOutput: output,
    fallbackUsed,
  });
  const excluded = (status: ReportBlockExecutionStatus, reason: string): ReportBlockExecutionTrace => ({
    ...base,
    status,
    included: false,
    reason,
    renderedOutput: null,
    fallbackUsed: false,
  });
  const renderedContent = (block.contentTemplate || block.staticContent)
    ? interpolateContent(block.contentTemplate ?? block.staticContent ?? '', context, block.sources)
    : null;
  if (renderedContent) {
    missingEvidence.push(...renderedContent.missing.filter(item => !missingEvidence.includes(item)));
    blockingMissingEvidence.push(...renderedContent.missing.filter(item => !blockingMissingEvidence.includes(item)));
  }

  switch (block.blockType) {
    case 'static':
      if ((renderedContent?.missing.length ?? 0) > 0) {
        return block.fallbackText
          ? included('fallback', 'static_template_evidence_missing_fallback_used', block.fallbackText, true)
          : excluded('missing_evidence', 'static_template_evidence_missing');
      }
      return included('included', 'static_content', renderedContent?.content ?? block.staticContent ?? '');
    case 'question': {
      const questionSources = block.sources.filter(source => source.sourceType === 'question');
      const missingQuestions = questionSources.filter(source => isMissing(
        resolveReportSource(context, 'question', source.sourceKey),
      ));
      if (missingQuestions.length > 0 || questionSources.length === 0 || (renderedContent?.missing.length ?? 0) > 0) {
        return block.fallbackText
          ? included('fallback', 'question_evidence_missing_fallback_used', block.fallbackText, true)
          : excluded('missing_evidence', 'question_evidence_missing');
      }
      const output = renderedContent?.content
        ?? questionSources.map(source => formatAnswer(
          resolveReportSource(context, 'question', source.sourceKey) as JsonValue,
        )).join('\n');
      return included('included', 'question_evidence_resolved', output);
    }
    case 'rule':
      if (!ruleEvaluation) return excluded('failed', 'rule_config_missing');
      if (!ruleEvaluation.valid) return excluded('failed', `invalid_rule_config:${ruleEvaluation.errors.join(',')}`);
      if (!ruleEvaluation.matched) {
        return excluded(
          ruleEvaluation.missingEvidence.length > 0 ? 'missing_evidence' : 'rule_not_matched',
          ruleEvaluation.missingEvidence.length > 0 ? 'rule_evidence_missing' : 'rule_not_matched',
        );
      }
      if (blockingMissingEvidence.length > 0) {
        return block.fallbackText
          ? included('fallback', 'rule_display_evidence_missing_fallback_used', block.fallbackText, true)
          : excluded('missing_evidence', 'rule_display_evidence_missing');
      }
      return included(
        'rule_matched',
        'rule_matched',
        renderedContent?.content ?? block.staticContent ?? block.fallbackText ?? '',
        !renderedContent && !block.staticContent && Boolean(block.fallbackText),
      );
    case 'ai':
      return block.fallbackText
        ? included('fallback', 'ai_not_enabled_fallback_used', block.fallbackText, true)
        : excluded('ai_not_enabled', 'ai_not_enabled');
    case 'hybrid':
      if (!ruleEvaluation) return excluded('failed', 'rule_config_missing');
      if (!ruleEvaluation.valid) return excluded('failed', `invalid_rule_config:${ruleEvaluation.errors.join(',')}`);
      if (!ruleEvaluation.matched) {
        return excluded(
          ruleEvaluation.missingEvidence.length > 0 ? 'missing_evidence' : 'rule_not_matched',
          ruleEvaluation.missingEvidence.length > 0 ? 'rule_evidence_missing' : 'rule_not_matched',
        );
      }
      if (blockingMissingEvidence.length > 0) {
        return block.fallbackText
          ? included('fallback', 'hybrid_evidence_missing_fallback_used', block.fallbackText, true)
          : excluded('missing_evidence', 'hybrid_evidence_missing');
      }
      if (renderedContent?.content || block.staticContent) {
        return included('rule_matched', 'hybrid_rule_matched_deterministic_content_used', renderedContent?.content ?? block.staticContent ?? '');
      }
      return block.fallbackText
        ? included('fallback', 'hybrid_rule_matched_ai_not_enabled_fallback_used', block.fallbackText, true)
        : excluded('ai_not_enabled', 'hybrid_rule_matched_ai_not_enabled');
  }
}

export function evaluateReportTemplate(
  template: ReportTemplateDefinition,
  context: CreatorReportGenerationContext,
): ReportTemplateEvaluationResult {
  const executionTrace: ReportBlockExecutionTrace[] = [];
  const renderedSections: RenderedReportSection[] = [];

  for (const section of [...template.sections].sort(compareOrdered)) {
    const sortedBlocks = [...section.blocks].sort(compareOrdered);
    if (!section.isActive) {
      executionTrace.push(...sortedBlocks.map(block => traceForInactive(section, block, 'section_inactive')));
      continue;
    }

    const renderedBlocks: RenderedReportBlock[] = [];
    for (const block of sortedBlocks) {
      const trace = block.isActive
        ? evaluateBlock(section, block, context)
        : traceForInactive(section, block, 'block_inactive');
      executionTrace.push(trace);
      if (trace.included && trace.renderedOutput !== null) {
        renderedBlocks.push({
          blockId: block.id,
          blockKey: block.blockKey,
          blockType: block.blockType,
          heading: block.heading ?? null,
          content: trace.renderedOutput,
        });
      }
    }
    renderedSections.push({
      sectionId: section.id,
      sectionKey: section.sectionKey,
      title: section.title,
      blocks: renderedBlocks,
    });
  }

  return {
    templateId: template.templateId,
    templateVersionId: template.versionId,
    renderedSections,
    executionTrace,
    missingEvidence: [...new Set(executionTrace.flatMap(trace => trace.missingEvidence))],
    rulesFired: executionTrace
      .filter(trace => trace.ruleEvaluation?.matched)
      .map(trace => trace.blockKey),
    rulesSkipped: executionTrace
      .filter(trace => trace.ruleEvaluation && !trace.ruleEvaluation.matched)
      .map(trace => trace.blockKey),
  };
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export async function computeGenerationDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
