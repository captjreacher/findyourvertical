import { validateReportRuleConfig } from './report-generation.ts';
import type {
  JsonValue,
  ReportBlockDefinition,
  ReportBlockSourceDefinition,
  ReportBlockType,
  ReportRuleConfig,
  ReportRuleOperator,
  ReportSectionDefinition,
  ReportSourcePurpose,
  ReportSourceType,
  ReportTemplateDefinition,
} from './report-generation.ts';

export type SourceValueKind = 'text' | 'number' | 'boolean' | 'array' | 'object';

export type SourceVocabularyItem = {
  sourceType: Exclude<ReportSourceType, 'question'>;
  sourceKey: string;
  label: string;
  valueKind: SourceValueKind;
};

export type QuestionSourceOption = {
  id: string;
  questionKey: string;
  responseKey: string;
  questionText: string;
  questionType: string;
  options?: Array<string | { value: string; label: string }>;
};

export type ValidationField = 'template' | 'section' | 'block' | 'source' | 'rule' | 'ai';

export type ReportTemplateValidationError = {
  sectionKey?: string;
  blockKey?: string;
  field: ValidationField;
  message: string;
};

export const REPORT_BLOCK_TYPES: ReportBlockType[] = ['static', 'question', 'rule', 'ai', 'hybrid'];
export const REPORT_SOURCE_TYPES: ReportSourceType[] = ['question', 'score', 'signal', 'report_field'];
export const REPORT_SOURCE_PURPOSES: ReportSourcePurpose[] = ['input', 'evidence', 'condition', 'display'];
export const REPORT_RULE_OPERATORS: ReportRuleOperator[] = [
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

export const SOURCE_VOCABULARY: SourceVocabularyItem[] = [
  { sourceType: 'score', sourceKey: 'baseline_creator_dna', label: 'Baseline creator DNA score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'baseline_brand_clarity', label: 'Baseline brand clarity score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'baseline_monetisation', label: 'Baseline monetisation score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'baseline_consistency', label: 'Baseline consistency score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'baseline_agency_opportunity', label: 'Baseline agency opportunity score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'report_creator_dna', label: 'Report creator DNA score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'report_brand_clarity', label: 'Report brand clarity score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'report_monetisation', label: 'Report monetisation score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'report_consistency', label: 'Report consistency score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'report_agency_opportunity', label: 'Report agency opportunity score', valueKind: 'number' },
  { sourceType: 'score', sourceKey: 'intelligence_confidence', label: 'Intelligence confidence score', valueKind: 'number' },
  { sourceType: 'signal', sourceKey: 'legacyArchetype', label: 'Legacy scoring archetype', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'topArchetypeFit', label: 'Top archetype fit', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'topArchetypeFitScore', label: 'Top archetype fit score', valueKind: 'number' },
  { sourceType: 'signal', sourceKey: 'creatorDnaArchetype', label: 'Creator DNA fantasy archetype', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'creatorDnaPrimary', label: 'Creator DNA primary', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'creatorDnaSecondary', label: 'Creator DNA secondary', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'intelligenceConfidenceScore', label: 'Intelligence confidence signal score', valueKind: 'number' },
  { sourceType: 'signal', sourceKey: 'intelligenceConfidenceLabel', label: 'Intelligence confidence label', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'managementReadiness', label: 'Management readiness', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'monetisationReadiness', label: 'Monetisation readiness', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'agencyOpportunityBand', label: 'Agency opportunity band', valueKind: 'text' },
  { sourceType: 'signal', sourceKey: 'identityComplete', label: 'Identity complete', valueKind: 'boolean' },
  { sourceType: 'signal', sourceKey: 'contactConsent', label: 'Contact consent', valueKind: 'boolean' },
  { sourceType: 'report_field', sourceKey: 'archetype', label: 'Report archetype', valueKind: 'text' },
  { sourceType: 'report_field', sourceKey: 'management_readiness', label: 'Report management readiness', valueKind: 'text' },
  { sourceType: 'report_field', sourceKey: 'scores.creator_dna', label: 'Report field: creator DNA score', valueKind: 'number' },
  { sourceType: 'report_field', sourceKey: 'scores.brand_clarity', label: 'Report field: brand clarity score', valueKind: 'number' },
  { sourceType: 'report_field', sourceKey: 'scores.monetisation', label: 'Report field: monetisation score', valueKind: 'number' },
  { sourceType: 'report_field', sourceKey: 'scores.consistency', label: 'Report field: consistency score', valueKind: 'number' },
  { sourceType: 'report_field', sourceKey: 'scores.agency_opportunity', label: 'Report field: agency opportunity score', valueKind: 'number' },
  { sourceType: 'report_field', sourceKey: 'completion_routing.creator_next_action', label: 'Creator next action', valueKind: 'text' },
  { sourceType: 'report_field', sourceKey: 'completion_routing.recommended_next_action', label: 'Internal recommended next action', valueKind: 'text' },
];

export function normalizeReportKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function uniqueKey(base: string, existingKeys: Iterable<string>): string {
  const normalized = normalizeReportKey(base) || 'item';
  const existing = new Set(existingKeys);
  if (!existing.has(normalized)) return normalized;
  let index = 2;
  while (existing.has(`${normalized}_${index}`)) index += 1;
  return `${normalized}_${index}`;
}

export function parseExpectedValue(rawValue: string, kind: SourceValueKind): JsonValue {
  if (kind === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  if (kind === 'boolean') return rawValue === 'true';
  if (kind === 'array') {
    return rawValue.split(',').map(item => item.trim()).filter(Boolean);
  }
  return rawValue;
}

export function sourceLabel(
  sourceType: ReportSourceType,
  sourceKey: string,
  questions: QuestionSourceOption[] = [],
): string {
  if (sourceType === 'question') {
    const question = questions.find(item => item.questionKey === sourceKey || item.responseKey === sourceKey);
    return question?.questionText ?? sourceKey;
  }
  return SOURCE_VOCABULARY.find(item => item.sourceType === sourceType && item.sourceKey === sourceKey)?.label ?? sourceKey;
}

export function sourceValueKind(sourceType: ReportSourceType, sourceKey: string, questions: QuestionSourceOption[] = []): SourceValueKind {
  if (sourceType === 'question') {
    const question = questions.find(item => item.questionKey === sourceKey || item.responseKey === sourceKey);
    if (question?.questionType === 'boolean') return 'boolean';
    if (question?.questionType === 'scale') return 'number';
    if (question?.questionType === 'multi_choice' || question?.questionType === 'scenario_ranking') return 'array';
    return 'text';
  }
  return SOURCE_VOCABULARY.find(item => item.sourceType === sourceType && item.sourceKey === sourceKey)?.valueKind ?? 'text';
}

export function validOperatorsForKind(kind: SourceValueKind): ReportRuleOperator[] {
  if (kind === 'number') return ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'any_of'];
  if (kind === 'boolean') return ['equals', 'not_equals'];
  if (kind === 'array') return ['contains', 'any_of', 'all_of'];
  return ['equals', 'not_equals', 'contains', 'any_of'];
}

export function ensureRuleConfig(input: unknown): ReportRuleConfig {
  const validation = validateReportRuleConfig(input);
  if (validation.valid) return input as ReportRuleConfig;
  return { combinator: 'and', conditions: [] };
}

export function validateReportTemplateDraft(
  template: ReportTemplateDefinition,
  questions: QuestionSourceOption[] = [],
): ReportTemplateValidationError[] {
  const errors: ReportTemplateValidationError[] = [];
  const activeSections = template.sections.filter(section => section.isActive);
  if (activeSections.length === 0) {
    errors.push({ field: 'template', message: 'At least one active section is required.' });
  }

  const sectionKeys = new Set<string>();
  const duplicateSectionKeys = new Set<string>();
  for (const section of template.sections) {
    if (sectionKeys.has(section.sectionKey)) duplicateSectionKeys.add(section.sectionKey);
    sectionKeys.add(section.sectionKey);
  }
  duplicateSectionKeys.forEach(sectionKey => errors.push({ sectionKey, field: 'section', message: 'Section key must be unique.' }));

  const blockKeys = new Set<string>();
  const duplicateBlockKeys = new Set<string>();
  for (const section of template.sections) {
    for (const block of section.blocks) {
      if (blockKeys.has(block.blockKey)) duplicateBlockKeys.add(block.blockKey);
      blockKeys.add(block.blockKey);
    }
  }

  for (const section of template.sections) {
    for (const block of section.blocks) {
      const location = { sectionKey: section.sectionKey, blockKey: block.blockKey };
      if (duplicateBlockKeys.has(block.blockKey)) {
        errors.push({ ...location, field: 'block', message: 'Block key must be unique within the template.' });
      }
      if (!block.isActive) continue;

      if (!REPORT_BLOCK_TYPES.includes(block.blockType)) {
        errors.push({ ...location, field: 'block', message: 'Block type is invalid.' });
      }
      if (block.blockType === 'static' && !block.staticContent?.trim() && !block.contentTemplate?.trim()) {
        errors.push({ ...location, field: 'block', message: 'Static blocks require static content or a content template.' });
      }
      if (block.blockType === 'question' && !block.sources.some(source => source.sourceType === 'question')) {
        errors.push({ ...location, field: 'source', message: 'Question blocks require a question source.' });
      }
      if (block.aiRequired && !block.fallbackText?.trim()) {
        errors.push({ ...location, field: 'ai', message: 'AI-required blocks need fallback content while AI is disabled.' });
      }
      if ((block.blockType === 'rule' || block.blockType === 'hybrid')) {
        const rule = block.ruleConfig;
        const validation = validateReportRuleConfig(rule);
        if (!validation.valid) {
          errors.push({ ...location, field: 'rule', message: `Rule is invalid: ${validation.errors.join(', ')}` });
        } else {
          for (const condition of (rule as ReportRuleConfig).conditions) {
            const source = block.sources.find(item => item.sourceType === condition.sourceType && item.sourceKey === condition.sourceKey);
            if (!source) {
              errors.push({ ...location, field: 'rule', message: `Rule condition source is unresolved: ${condition.sourceType}:${condition.sourceKey}.` });
              continue;
            }
            const kind = sourceValueKind(condition.sourceType, condition.sourceKey, questions);
            if (!validOperatorsForKind(kind).includes(condition.operator)) {
              errors.push({ ...location, field: 'rule', message: `Operator ${condition.operator} is invalid for ${sourceLabel(condition.sourceType, condition.sourceKey, questions)}.` });
            }
          }
        }
      }
      if (block.blockType === 'hybrid' && !block.fallbackText?.trim() && !block.staticContent?.trim() && !block.contentTemplate?.trim()) {
        errors.push({ ...location, field: 'block', message: 'Hybrid blocks need deterministic content or fallback while AI is disabled.' });
      }

      const sourceKeys = new Set<string>();
      for (const source of block.sources) {
        const sourceLocation = { ...location, field: 'source' as const };
        if (!REPORT_SOURCE_TYPES.includes(source.sourceType) || !REPORT_SOURCE_PURPOSES.includes(source.purpose)) {
          errors.push({ ...sourceLocation, message: 'Source type or purpose is invalid.' });
        }
        if (source.sourceType === 'question') {
          if (!source.questionId || !questions.some(question => question.id === source.questionId && question.questionKey === source.sourceKey)) {
            errors.push({ ...sourceLocation, message: `Question source is unresolved: ${source.sourceKey}.` });
          }
        } else if (!SOURCE_VOCABULARY.some(item => item.sourceType === source.sourceType && item.sourceKey === source.sourceKey)) {
          errors.push({ ...sourceLocation, message: `Source is not in the canonical vocabulary: ${source.sourceType}:${source.sourceKey}.` });
        }

        const duplicateKey = `${source.sourceType}:${source.sourceKey}:${source.purpose}`;
        if (sourceKeys.has(duplicateKey)) {
          errors.push({ ...sourceLocation, message: `Duplicate source is not meaningful: ${duplicateKey}.` });
        }
        sourceKeys.add(duplicateKey);
      }
    }
  }

  return errors;
}

export async function publishReportTemplateVersionWithValidation(
  template: ReportTemplateDefinition,
  questions: QuestionSourceOption[] = [],
): Promise<void> {
  if (template.status !== 'draft') throw new Error('Only draft report template versions can be published.');
  const errors = validateReportTemplateDraft(template, questions);
  if (errors.length > 0) {
    throw new Error(`Report template is invalid: ${errors.map(error => error.message).join(' ')}`);
  }

  const { supabase } = await import('./supabase.ts');
  const { error } = await supabase
    .from('creator_report_template_versions')
    .update({ status: 'published' })
    .eq('id', template.versionId)
    .eq('status', 'draft');

  if (error) throw new Error(`Failed to publish report template version: ${error.message}`);
}

export async function activatePublishedReportTemplateVersion(input: {
  assessmentTemplateId: string;
  reportTemplateId: string;
  versionId: string;
  versions: Array<{ id: string; status: string }>;
}): Promise<void> {
  const version = input.versions.find(item => item.id === input.versionId);
  if (version?.status !== 'published') throw new Error('Only published report template versions can be activated.');

  const { supabase } = await import('./supabase.ts');
  const { error } = await supabase
    .from('creator_assessment_templates')
    .update({ active_report_template_version_id: input.versionId })
    .eq('id', input.assessmentTemplateId);

  if (error) throw new Error(`Failed to activate report template version: ${error.message}`);
}

export function reorderById<T extends { id: string; sort_order: number }>(items: T[], id: string, direction: 'up' | 'down'): T[] {
  const sorted = [...items].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
  const index = sorted.findIndex(item => item.id === id);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return sorted;
  const next = [...sorted];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next.map((item, sort_order) => ({ ...item, sort_order }));
}
