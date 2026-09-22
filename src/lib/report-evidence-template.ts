import {
  evaluateReportTemplate, type CreatorReportGenerationContext,
  type ReportBlockDefinition, type ReportRuleCondition, type ReportTemplateDefinition,
} from './report-generation.ts';

function rule(key: string, heading: string, content: string, conditions: ReportRuleCondition[]): ReportBlockDefinition {
  return { id: key, blockKey: key, heading, blockType: 'rule', contentTemplate: content,
    sortOrder: 10, isActive: true, ruleConfig: { combinator: 'and', conditions },
    sources: conditions.map((c, i) => ({ sourceType: c.sourceType, sourceKey: c.sourceKey, purpose: 'evidence', sortOrder: i })) };
}
const question = (sourceKey: string, operator: ReportRuleCondition['operator'], value: ReportRuleCondition['value']): ReportRuleCondition => ({ sourceType: 'question', sourceKey, operator, value });

export const EVIDENCE_REPORT_TEMPLATE: ReportTemplateDefinition = {
  templateId: 'fyv-evidence-guidance', versionId: 'fyv-evidence-guidance-v1', versionNumber: 1,
  status: 'published', schemaVersion: 'fyv/report-evidence/v1', sections: [{
    id: 'evidence-guidance', sectionKey: 'evidence-guidance', title: 'What your answers suggest', sortOrder: 10, isActive: true,
    blocks: [
      rule('camera-start', 'A manageable starting format', 'You rated your camera comfort at {{question.comfort_level}} out of 10. That suggests starting with short, prepared formats and reviewing how they feel before committing to a demanding schedule.', [question('comfort_level', 'less_than_or_equal', 4)]),
      rule('fitness-direction', 'An interest worth testing', 'You selected fitness as a niche interest and rated your camera comfort at {{question.comfort_level}} out of 10. Together, these answers suggest testing a fitness-led format. Audience response will tell you whether it deserves a larger role in your plan.', [question('niche_interests', 'contains', 'Fitness/Muscle'), question('comfort_level', 'greater_than_or_equal', 7)]),
      rule('audience-hypothesis', 'Validate your audience assumption', 'You chose a smaller, higher-spending audience. Treat this as a positioning hypothesis: test interest in a clear offer before assuming people will pay a premium.', [question('audience_target', 'equals', 'whales')]),
      rule('discovery-hypothesis', 'Make discovery measurable', 'You chose a broad audience. That makes an accessible discovery format worth testing, with a clear next step. Reach alone does not establish demand for a paid offer.', [question('audience_target', 'equals', 'masses')]),
    ],
  }],
};

export function deriveReportEvidence(context: CreatorReportGenerationContext) {
  return evaluateReportTemplate(EVIDENCE_REPORT_TEMPLATE, context);
}
