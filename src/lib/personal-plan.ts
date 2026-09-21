export const PLAN_PRODUCT_CODE = 'FYV-PERSONAL-VERTICAL-PLAN';
export const PLAN_PATH = '/my/plan';
export const PLAN_CTA = 'Build My Personal Vertical Plan';
export const PLAN_SCHEMA = 'fyv/personal-plan/v1';

export const PLAN_STAGES = [
  { key: 'direction', title: 'Your Direction', fields: ['vertical', 'reason', 'boundaries'] },
  { key: 'audience', title: 'Your Audience', fields: ['audience', 'needs', 'evidenceToGather'] },
  { key: 'positioning', title: 'Your Positioning', fields: ['promise', 'difference', 'bio'] },
  { key: 'content', title: 'Your Content Strategy', fields: ['pillars', 'channels', 'formats'] },
  { key: 'offers', title: 'Your Offers', fields: ['offer', 'sellingApproach', 'demandTest'] },
  { key: 'schedule', title: 'Your Schedule', fields: ['weeklyHours', 'publishingSchedule', 'batching'] },
  { key: 'scripts', title: 'Your Scripts', fields: ['hook', 'outline', 'callToAction'] },
  { key: 'experiments', title: 'Your Experiments', fields: ['hypothesis', 'measure', 'reviewDate'] },
  { key: 'final', title: 'Your Final Plan', fields: ['milestones', 'nextActions', 'reviewDate'] },
] as const;
export type PlanStage = typeof PLAN_STAGES[number]['key'];
export type StageData = Record<string, string>;
export type StageRecord = { stage_key: PlanStage; data: StageData; completed: boolean; revision: number; approved_suggestion_id: string | null };
export type PersonalPlan = { id: string; creator_profile_id: string; assessment_id: string; report_id: string; status: 'draft' | 'complete'; schema_version: string };
export type PlanSuggestion = { id: string; stage_key: PlanStage; suggestion: StageData; stage_revision: number; provider: string; model: string; created_at: string };
export type PlanWorkspace = {
  plan: PersonalPlan; stages: StageRecord[]; suggestions: PlanSuggestion[];
  assessment: { id: string; answers?: Record<string, unknown>; responses?: Record<string, unknown> };
  report: { report_json: Record<string, unknown> };
};
export type PlanAccess = { entitled: boolean; interest: { id: string; status: string; catalogue_status: string; created_at: string; price_kind?: 'poa' | 'fixed'; amount_minor?: number | null; currency?: string | null } | null };

export function stageDefinition(key: string) {
  const stage = PLAN_STAGES.find(s => s.key === key);
  if (!stage) throw new Error('Unknown plan stage');
  return stage;
}
export function validateStageData(key: string, value: unknown, complete = false): StageData {
  const definition = stageDefinition(key);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stage must contain named fields');
  const entries = Object.entries(value);
  if (entries.some(([field, text]) => !(definition.fields as readonly string[]).includes(field) || typeof text !== 'string' || text.length > 6000)) throw new Error('Invalid stage field');
  const data = Object.fromEntries(entries.map(([field, text]) => [field, (text as string).trim()]));
  if (complete && definition.fields.some(field => !data[field])) throw new Error('Complete each field before continuing');
  return data;
}
export function canEnterStage(key: PlanStage, stages: StageRecord[]) {
  return PLAN_STAGES.slice(0, PLAN_STAGES.findIndex(s => s.key === key)).every(s => stages.some(saved => saved.stage_key === s.key && saved.completed));
}

const STAGE_EVIDENCE: Record<PlanStage, string[]> = {
  direction: ['niche_interests', 'persona_occupation', 'comfort_level', 'passion_topic', 'what_is_it_that_you_re_most_passionate_about'],
  audience: ['audience_target', 'what_social_media_do_you_use_to_find_clients'],
  positioning: ['strengths', 'desired_fantasy_image', 'creator_motivation'],
  content: ['niche_interests', 'comfort_level', 'what_social_media_do_you_use_to_find_clients'],
  offers: ['audience_target', 'creator_weaknesses'],
  schedule: ['creator_weaknesses', 'strengths'], scripts: ['comfort_level', 'strengths'],
  experiments: ['creator_weaknesses', 'alternative_content_ideas'], final: [],
};
export const GUIDE_ACTIONS = ['refine', 'alternatives', 'first_draft', 'explain'] as const;
export type GuideAction = typeof GUIDE_ACTIONS[number];
export function buildPlanGuideContext(workspace: PlanWorkspace, stage: PlanStage, action: GuideAction) {
  stageDefinition(stage);
  if (!GUIDE_ACTIONS.includes(action)) throw new Error('Unknown guide action');
  const raw = workspace.assessment.answers ?? workspace.assessment.responses ?? {};
  const evidence = Object.fromEntries(STAGE_EVIDENCE[stage].filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
  const report = workspace.report.report_json;
  // No identity/contact fields, agency notes, internal scores, or other creators.
  return { schemaVersion: PLAN_SCHEMA, promptVersion: 'fyv/plan-guide/v1', stage, action,
    fields: stageDefinition(stage).fields, evidence,
    recommendations: { verticals: report.top_verticals, guidance: report.evidence_guidance,
      creatorDna: pickDna(report.creator_dna_profile) },
    approvedStages: workspace.stages.filter(s => PLAN_STAGES.findIndex(d => d.key === s.stage_key) <= PLAN_STAGES.findIndex(d => d.key === stage))
      .map(s => ({ stage: s.stage_key, revision: s.revision, data: s.data })),
  };
}
function pickDna(value: unknown) {
  const dna = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { primary: dna.creator_dna_primary, secondary: dna.creator_dna_secondary, archetype: dna.fantasy_archetype };
}
export function exportPersonalPlan(workspace: PlanWorkspace) {
  return { schemaVersion: PLAN_SCHEMA, planId: workspace.plan.id, assessmentId: workspace.plan.assessment_id,
    reportId: workspace.plan.report_id, status: workspace.plan.status,
    stages: workspace.stages.map(s => ({ stage: s.stage_key, revision: s.revision, completed: s.completed, decisions: s.data })),
    agencyHandoff: { destination: 'Funk My Fans', status: 'coming_soon' },
  };
}
