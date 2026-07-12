import { supabase, publicSupabase } from './supabase';
import { buildIntelligencePackageBody } from './intelligence-package';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreatorProfile,
  CreatorAssessment,
  CreatorDnaProfile,
  CreatorReport,
  CreatorNote,
  CreatorStatusEvent,
  CreatorStatus,
  CreatorPipelineSummary,
  ManagementWraparoundPotential,
  ServiceQualification,
  ServiceQualificationKey,
  ServiceQualificationStatus,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorAssessmentRuntimeTemplate,
  CreatorAssessmentTemplate,
  CreatorAssessmentTemplateQuestion,
  CreatorAssessmentTemplateItem,
  CreatorAssessmentInviteLink,
  CreatorAssessmentBranchRule,
  CreatorInviteRequest,
  CreatorInviteRequestStatus,
  CreatorQuestion,
  AssessmentQuestionType,
  ReportData,
  ReportTier,
  ArchetypeVariation,
  ArchetypeRank,
  CreatorArchetypeSnapshot,
  CreatorVariationSelection,
  CreatorPersona,
  CreatorPersonaGeneration,
} from '@/types/creator';
import { scoreAssessment, generateReportSlug } from './scoring';
import { createCreatorIntelligenceResult } from './creator-intelligence';
import type { CreatorOnboardingCase, RedemptionResult } from './onboarding';
import {
  buildCreatorAssessmentCompletedPayload,
  determineCreatorCompletionNextAction,
  determineCreatorPublicNextAction,
} from './fyv-completion';

// ── Assessment Submission (public) ──

type TemplateQuestionRow = CreatorAssessmentTemplateQuestion & {
  creator_question_bank: CreatorQuestion | null;
};

type TemplateQuestionJoinRow = Omit<CreatorAssessmentTemplateQuestion, 'question'>;
type TemplateItemRow = Omit<CreatorAssessmentTemplateItem, 'question'>;
type BranchRuleRow = CreatorAssessmentBranchRule;
type AssessmentInviteContext = Pick<
  CreatorAssessmentInviteLink,
  'id' | 'invite_code' | 'creator_name' | 'creator_email' | 'status' | 'report_tier'
>;

type AssessmentInviteCreatorInput = {
  creatorProfileId?: string | null;
  creatorName: string;
  creatorEmail?: string | null;
  onlyfansHandle?: string | null;
  modelName?: string | null;
};

type CreatorProfileUpsertPayload = Pick<
  CreatorProfile,
  | 'full_name'
  | 'email'
  | 'country'
  | 'status'
  | 'archetype'
  | 'creator_dna_score'
  | 'brand_clarity_score'
  | 'monetisation_score'
  | 'consistency_score'
  | 'agency_opportunity_score'
  | 'management_readiness'
  | 'audience_strategy'
  | 'recommended_pricing_model'
  | 'top_vertical_1'
  | 'top_vertical_2'
  | 'top_vertical_3'
  | 'consent_to_contact'
> & {
  first_name: string | null;
  last_name: string | null;
  onlyfans_handle: string | null;
  model_name: string | null;
  city: string | null;
  mailing_list_opt_out: boolean;
  consent_at: string | null;
};

const INVITE_LINK_SELECT_FIELDS = 'id,template_id,creator_profile_id,invite_code,creator_name,creator_email,notes,report_tier,status,status_updated_at,is_active,created_at,expires_at';
const INVITE_LINK_BASE_SELECT_FIELDS = 'id,template_id,invite_code,creator_name,creator_email,notes,is_active,created_at,expires_at';

function isInviteLinkSchemaMismatch(message: string): boolean {
  return message.includes('creator_assessment_links') && (
    message.includes('column')
    || message.includes('schema cache')
    || message.includes('does not exist')
  );
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeEmail(value: unknown): string | null {
  return normalizeNullableText(value)?.toLowerCase() ?? null;
}

function normalizeOnlyFansHandle(value: unknown): string | null {
  const text = normalizeNullableText(value);
  if (!text) return null;
  return text.replace(/^@+/, '').trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template';
}

function normalizeQuestionKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uuidOrNull(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function respondentSnapshot(responses: AssessmentResponses): Record<string, unknown> {
  return {
    first_name: normalizeNullableText(responses.first_name),
    last_name: normalizeNullableText(responses.last_name),
    full_name: normalizeNullableText(responses.full_name),
    email: normalizeEmail(responses.email),
    onlyfans_handle: normalizeOnlyFansHandle(responses.onlyfans_handle),
    model_name: normalizeNullableText(responses.model_name),
    city: normalizeNullableText(responses.city),
    country: normalizeNullableText(responses.country),
    consent: Boolean(responses.consent),
    mailing_list_opt_out: Boolean(responses.mailing_list_opt_out),
  };
}

function randomInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

async function findExistingCreatorProfile(
  email: string | null,
  onlyfansHandle: string | null
): Promise<CreatorProfile | null> {
  // Public assessment flow: read as `anon` (behaves the same whether or not a
  // creator is logged in). See publicSupabase docs in ./supabase.
  const supabase = publicSupabase;
  const filters = [
    email ? `email.eq.${email}` : null,
    onlyfansHandle ? `onlyfans_handle.eq.${onlyfansHandle}` : null,
  ].filter(Boolean);

  if (filters.length === 0) return null;

  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .or(filters.join(','))
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to find creator profile: ${error.message}`);
  return (data?.[0] ?? null) as CreatorProfile | null;
}

async function upsertCreatorProfile(payload: CreatorProfileUpsertPayload): Promise<CreatorProfile> {
  // Public assessment flow: write as `anon` (never sets auth_user_id).
  const supabase = publicSupabase;
  const existing = await findExistingCreatorProfile(payload.email, payload.onlyfans_handle);

  if (existing) {
    const updatePayload = {
      ...payload,
      status: existing.status,
    };
    const { data, error } = await supabase
      .from('creator_profiles')
      .update(updatePayload)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update profile: ${error.message}`);
    return data as CreatorProfile;
  }

  const { data, error } = await supabase
    .from('creator_profiles')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return data as CreatorProfile;
}

function splitCreatorName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

async function ensureCreatorProfileForInvite(input: AssessmentInviteCreatorInput): Promise<CreatorProfile> {
  if (input.creatorProfileId) {
    const profile = await getCreatorProfile(input.creatorProfileId);
    if (!profile) throw new Error('Selected creator profile was not found.');
    return profile;
  }

  const name = input.creatorName.trim();
  const email = normalizeEmail(input.creatorEmail);
  if (!name || !email) throw new Error('Creator name and email address are required.');

  const { firstName, lastName } = splitCreatorName(name);
  const onlyfansHandle = normalizeOnlyFansHandle(input.onlyfansHandle);
  const modelName = normalizeNullableText(input.modelName);
  const existing = await findExistingCreatorProfile(email, onlyfansHandle);

  if (existing) {
    const { data, error } = await supabase
      .from('creator_profiles')
      .update({
        full_name: existing.full_name || name,
        first_name: existing.first_name ?? firstName,
        last_name: existing.last_name ?? lastName,
        email: existing.email ?? email,
        onlyfans_handle: existing.onlyfans_handle ?? onlyfansHandle,
        model_name: existing.model_name ?? modelName,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update profile for invite: ${error.message}`);
    return data as CreatorProfile;
  }

  const { data, error } = await supabase
    .from('creator_profiles')
    .insert({
    full_name: name,
    first_name: firstName,
    last_name: lastName,
    email,
    onlyfans_handle: onlyfansHandle,
    model_name: modelName,
    city: null,
    country: null,
    status: 'Invited',
    archetype: null,
    creator_dna_score: null,
    brand_clarity_score: null,
    monetisation_score: null,
    consistency_score: null,
    agency_opportunity_score: null,
    management_readiness: null,
    audience_strategy: null,
    recommended_pricing_model: null,
    top_vertical_1: null,
    top_vertical_2: null,
    top_vertical_3: null,
    mailing_list_opt_out: false,
    consent_to_contact: false,
    consent_at: null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile for invite: ${error.message}`);
  return data as CreatorProfile;
}

function flattenTemplate(
  template: CreatorAssessmentTemplate,
  rows: TemplateQuestionRow[] | null | undefined,
  itemRows?: TemplateItemRow[] | null,
  branchRuleRows?: BranchRuleRow[] | null
): CreatorAssessmentRuntimeTemplate {
  const questionById = new Map(
    (rows ?? [])
      .filter(row => row.creator_question_bank)
      .map(row => [row.question_id, row.creator_question_bank!] as const)
  );
  const legacyQuestions = (rows ?? [])
    .filter(row => row.creator_question_bank)
    .map(row => ({
      ...row.creator_question_bank!,
      template_id: row.template_id,
      is_included: row.is_included,
      sort_order: row.sort_order,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  const items = (itemRows ?? [])
    .map(item => ({
      id: item.id,
      template_id: item.template_id,
      item_type: item.item_type,
      question_id: item.question_id,
      title: item.title,
      description: item.description,
      is_included: item.is_included,
      sort_order: item.sort_order,
      created_at: item.created_at,
      updated_at: item.updated_at,
      question: item.question_id ? questionById.get(item.question_id) ?? null : null,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  const itemQuestions = items
    .filter(item => item.item_type === 'question' && item.question)
    .map(item => ({
      ...item.question!,
      template_id: item.template_id,
      is_included: item.is_included,
      sort_order: item.sort_order,
    }));

  return {
    ...template,
    questions: itemQuestions.length > 0 ? itemQuestions : legacyQuestions,
    branch_rules: branchRuleRows ?? [],
    items: items.length > 0 ? items : legacyQuestions.map(question => ({
      id: `${question.template_id}:${question.id}`,
      template_id: question.template_id,
      item_type: 'question',
      question_id: question.id,
      title: null,
      description: null,
      is_included: question.is_included,
      sort_order: question.sort_order,
      created_at: question.created_at,
      updated_at: question.updated_at,
      question,
    })),
  };
}

async function loadBranchRuleRows(templateIds: string[], client: SupabaseClient = supabase): Promise<BranchRuleRow[]> {
  if (templateIds.length === 0) return [];

  const { data, error } = await (client as any)
    .from('creator_assessment_branch_rules')
    .select('*')
    .in('template_id', templateIds);

  if (error) {
    const message = String(error.message ?? '');
    if (
      message.includes('creator_assessment_branch_rules')
      || message.includes('schema cache')
      || message.includes('does not exist')
    ) {
      return [];
    }
    throw new Error(`Failed to load branch rules: ${message}`);
  }

  return (data ?? []) as BranchRuleRow[];
}

async function loadTemplateQuestionRows(templateIds: string[], client: SupabaseClient = supabase): Promise<TemplateQuestionRow[]> {
  if (templateIds.length === 0) return [];

  const { data: joinRows, error: joinError } = await client
    .from('creator_assessment_template_questions')
    .select('template_id,question_id,is_included,sort_order,created_at,updated_at')
    .in('template_id', templateIds);

  if (joinError) throw new Error(`Failed to load template questions: ${joinError.message}`);

  const questionIds = [...new Set(((joinRows ?? []) as TemplateQuestionJoinRow[]).map(row => row.question_id))];
  const { data: questionRows, error: questionError } = questionIds.length > 0
    ? await client.from('creator_question_bank').select('*').in('id', questionIds)
    : { data: [], error: null };

  if (questionError) throw new Error(`Failed to load template question bank rows: ${questionError.message}`);

  const questionById = new Map(((questionRows ?? []) as CreatorQuestion[]).map(question => [question.id, question]));
  return ((joinRows ?? []) as TemplateQuestionJoinRow[]).map(row => ({
    ...row,
    creator_question_bank: questionById.get(row.question_id) ?? null,
  }));
}

async function loadTemplateItemRows(templateIds: string[], client: SupabaseClient = supabase): Promise<TemplateItemRow[]> {
  if (templateIds.length === 0) return [];

  const { data, error } = await (client as any)
    .from('creator_assessment_template_items')
    .select('id,template_id,item_type,question_id,title,description,is_included,sort_order,created_at,updated_at')
    .in('template_id', templateIds);

  if (error) {
    const message = String(error.message ?? '');
    if (
      message.includes('creator_assessment_template_items')
      || message.includes('schema cache')
      || message.includes('does not exist')
    ) {
      return [];
    }
    throw new Error(`Failed to load template items: ${message}`);
  }

  return (data ?? []) as TemplateItemRow[];
}

export async function getDefaultAssessmentTemplate(): Promise<CreatorAssessmentRuntimeTemplate | null> {
  const { data, error } = await publicSupabase
    .from('creator_assessment_templates')
    .select('*')
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (error) throw new Error(`Failed to load assessment template: ${error.message}`);
  if (!data) return null;

  const template = data as CreatorAssessmentTemplate;
  const [questionRows, itemRows, branchRuleRows] = await Promise.all([
    loadTemplateQuestionRows([template.id], publicSupabase),
    loadTemplateItemRows([template.id], publicSupabase),
    loadBranchRuleRows([template.id], publicSupabase),
  ]);

  return flattenTemplate(template, questionRows, itemRows, branchRuleRows);
}

export async function getAssessmentTemplateBySlug(slug: string): Promise<CreatorAssessmentRuntimeTemplate | null> {
  const normalizedSlug = slugify(slug);
  const { data, error } = await (publicSupabase as any)
    .from('creator_assessment_templates')
    .select('*')
    .eq('slug', normalizedSlug)
    .eq('is_active', true)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load assessment template: ${error.message}`);
  if (!data) return null;

  const template = data as CreatorAssessmentTemplate;
  const [questionRows, itemRows, branchRuleRows] = await Promise.all([
    loadTemplateQuestionRows([template.id], publicSupabase),
    loadTemplateItemRows([template.id], publicSupabase),
    loadBranchRuleRows([template.id], publicSupabase),
  ]);

  return flattenTemplate(template, questionRows, itemRows, branchRuleRows);
}

export async function getAssessmentInviteLink(inviteCode: string): Promise<CreatorAssessmentInviteLink | null> {
  // Public assessment flow: resolve invite via the anon client.
  const supabase = publicSupabase;
  const code = inviteCode.trim();
  if (!code) return null;

  const { data: rpcData, error: rpcError } = await (supabase as any)
    .rpc('get_creator_assessment_invite_status', { p_invite_code: code });

  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return (row ?? null) as CreatorAssessmentInviteLink | null;
  }

  const { data, error } = await (supabase as any)
    .from('creator_assessment_links')
    .select(INVITE_LINK_SELECT_FIELDS)
    .eq('invite_code', code)
    .maybeSingle();

  if (error) {
    const message = String(error.message ?? '');
    if (isInviteLinkSchemaMismatch(message)) {
      const { data: fallbackData, error: fallbackError } = await (supabase as any)
        .from('creator_assessment_links')
        .select(INVITE_LINK_BASE_SELECT_FIELDS)
        .eq('invite_code', code)
        .maybeSingle();

      if (fallbackError) throw new Error(`Failed to load invite link: ${fallbackError.message}`);
      return (fallbackData ?? null) as CreatorAssessmentInviteLink | null;
    }
  }

  if (error) throw new Error(`Failed to load invite link: ${error.message}`);
  return (data ?? null) as CreatorAssessmentInviteLink | null;
}

export async function setAssessmentInviteStatus(
  inviteCode: string | null | undefined,
  status: 'Opened' | 'Email Verified' | 'Started' | 'Completed'
): Promise<void> {
  // Public assessment flow: update invite status via the anon client.
  const supabase = publicSupabase;
  const code = inviteCode?.trim();
  if (!code) return;

  const { error } = await (supabase as any)
    .rpc('set_creator_assessment_invite_status', {
      p_invite_code: code,
      p_status: status,
    });

  if (error) {
    const message = String(error.message ?? '');
    if (
      message.includes('set_creator_assessment_invite_status')
      || message.includes('schema cache')
      || message.includes('does not exist')
    ) {
      return;
    }
    throw new Error(`Failed to update invite status: ${message}`);
  }

  const eventTypeByStatus: Partial<Record<typeof status, string>> = {
    Opened: 'invite.opened',
    Started: 'assessment.started',
    Completed: 'assessment.completed',
  };
  const eventType = eventTypeByStatus[status];
  if (!eventType) return;

  const invite = await getAssessmentInviteLink(code).catch(() => null);
  if (!invite?.creator_profile_id) return;

  await trackCreatorEvent({
    profileId: invite.creator_profile_id,
    eventType,
    details: {
      invite_code: code,
      invite_link_id: invite.id,
      invite_status: status,
      detected_at: new Date().toISOString(),
    },
  }).catch(() => undefined);
}

export async function submitAssessment(
  responses: AssessmentResponses,
  template?: CreatorAssessmentRuntimeTemplate | null,
  invite?: AssessmentInviteContext | null,
  options: { reportTier?: ReportTier } = {}
): Promise<{
  profile: CreatorProfile;
  assessment: CreatorAssessment;
  report: CreatorReport;
  dnaProfile: CreatorDnaProfile;
}> {
  // Public assessment completion: the entire write path (assessment RPC, report,
  // DNA, profile pointers, status events, completion outbox) must run as `anon`
  // — the events outbox insert policy is anon-only. Force the anonymous client
  // so a logged-in creator's retake behaves exactly like a public submission.
  const supabase = publicSupabase;
  // 1. Score the assessment
  if (responses.audience_target === null) {
    throw new Error('Audience target is required');
  }

  const baselineResult = scoreAssessment(responses);
  const slug = generateReportSlug(responses.full_name);
  const runtimeTemplate = template ?? await getDefaultAssessmentTemplate();
  const includedQuestions = (runtimeTemplate?.questions ?? []).filter(q => q.is_included);
  const respondent = respondentSnapshot(responses);
  const assessmentSnapshot = runtimeTemplate
    ? {
        template_id: runtimeTemplate.id,
        template_slug: runtimeTemplate.slug,
        template_name: runtimeTemplate.name,
        template_description: runtimeTemplate.description,
        invite_link_id: invite?.id ?? null,
        invite_code: invite?.invite_code ?? null,
        creator_name: invite?.creator_name ?? null,
        captured_at: new Date().toISOString(),
        question_snapshot: includedQuestions,
      }
    : null;

  // 2. Create or update creator profile
  const consentToContact = !responses.mailing_list_opt_out && responses.consent;
  const profile = await upsertCreatorProfile({
    full_name: responses.full_name,
    first_name: normalizeNullableText(responses.first_name),
    last_name: normalizeNullableText(responses.last_name),
    email: normalizeEmail(responses.email),
    onlyfans_handle: normalizeOnlyFansHandle(responses.onlyfans_handle),
    model_name: normalizeNullableText(responses.model_name),
    city: normalizeNullableText(responses.city),
    country: normalizeNullableText(responses.country),
    status: 'Completed',
    archetype: baselineResult.archetype,
    creator_dna_score: baselineResult.scores.creator_dna,
    brand_clarity_score: baselineResult.scores.brand_clarity,
    monetisation_score: baselineResult.scores.monetisation,
    consistency_score: baselineResult.scores.consistency,
    agency_opportunity_score: baselineResult.scores.agency_opportunity,
    management_readiness: baselineResult.management_readiness,
    audience_strategy: responses.audience_target,
    recommended_pricing_model: baselineResult.pricing_strategy,
    top_vertical_1: baselineResult.top_verticals[0]?.name ?? null,
    top_vertical_2: baselineResult.top_verticals[1]?.name ?? null,
    top_vertical_3: baselineResult.top_verticals[2]?.name ?? null,
    mailing_list_opt_out: responses.mailing_list_opt_out,
    consent_to_contact: consentToContact,
    consent_at: consentToContact ? new Date().toISOString() : null,
  });
  const profileId = profile.id;

  // 3. Create assessment
  const { data: assessment, error: assessmentErr } = await (supabase as any)
    .rpc('submit_creator_assessment', {
      p_creator_profile_id: profileId,
      p_template_id: uuidOrNull(runtimeTemplate?.id),
      p_template_slug: runtimeTemplate?.slug ?? null,
      p_invite_link_id: uuidOrNull(invite?.id),
      p_invite_code: invite?.invite_code ?? null,
      p_creator_name: invite?.creator_name ?? null,
      p_responses: responses,
      p_answers: responses,
      p_respondent: respondent,
      p_assessment_snapshot: assessmentSnapshot,
      p_creator_dna_score: baselineResult.scores.creator_dna,
      p_brand_clarity_score: baselineResult.scores.brand_clarity,
      p_monetisation_score: baselineResult.scores.monetisation,
      p_consistency_score: baselineResult.scores.consistency,
      p_agency_opportunity_score: baselineResult.scores.agency_opportunity,
    });

  if (assessmentErr) throw new Error(`Failed to save assessment: ${assessmentErr.message}`);

  // 4. Generate Creator Intelligence and canonical Creator DNA profile
  const intelligence = createCreatorIntelligenceResult({
    creatorProfileId: profileId,
    assessmentId: assessment.id,
    responses,
    questions: includedQuestions,
    reportTier: options.reportTier ?? 'free',
  });
  const dnaProfileInput = intelligence.creator_dna;
  const { data: dnaProfile, error: dnaProfileErr } = await supabase
    .from('creator_dna_profiles')
    .insert({
      creator_profile_id: dnaProfileInput.creator_profile_id,
      assessment_id: dnaProfileInput.assessment_id,
      creator_dna_primary: dnaProfileInput.creator_dna_primary,
      creator_dna_secondary: dnaProfileInput.creator_dna_secondary,
      confidence: dnaProfileInput.confidence,
      fantasy_archetype: dnaProfileInput.fantasy_archetype,
      archetype_confidence: dnaProfileInput.archetype_confidence,
      authenticity_band: dnaProfileInput.authenticity_band,
      authenticity_flags: dnaProfileInput.authenticity_flags,
      growth_constraints: dnaProfileInput.growth_constraints,
      monetisation_readiness: dnaProfileInput.monetisation_readiness,
      agency_opportunity_score: dnaProfileInput.agency_opportunity_score,
      agency_opportunity_band: dnaProfileInput.agency_opportunity_band,
      summary: dnaProfileInput.summary,
    })
    .select()
    .single();

  if (dnaProfileErr) throw new Error(`Failed to save DNA profile: ${dnaProfileErr.message}`);

  // 5. Create report as a presentation view over Creator DNA
  const reportData: ReportData = intelligence.report;
  const completedAt = new Date().toISOString();
  const agencyInterest = Boolean(profile.status === 'Interested' || reportData.agency_recommendation.agency_priority === 'high');
  const recommendedNextAction = determineCreatorCompletionNextAction({
    profile,
    assessment,
    invite,
    reportData,
    completedAt,
  });
  const creatorNextAction = determineCreatorPublicNextAction({
    profile,
    assessment,
    reportData,
  });
  const reportDataWithRouting: ReportData = {
    ...reportData,
    completion_routing: {
      recommended_next_action: recommendedNextAction,
      creator_next_action: creatorNextAction,
      completed_at: completedAt,
      agency_interest: agencyInterest,
      consent: profile.consent_to_contact,
      identity_complete: Boolean(profile.full_name && profile.email && profile.country),
      conflict: Boolean(
        reportData.creator_dna_profile?.authenticity_band === 'Potential Conflict'
        || (reportData.internal_agency_scores.brand_risk ?? 0) >= 70
      ),
    },
  };

  const { data: report, error: reportErr } = await supabase
    .from('creator_reports')
    .insert({
      creator_profile_id: profileId,
      report_slug: slug,
      report_json: reportDataWithRouting,
      report_tier: reportDataWithRouting.report_tier,
      premium_report_available: reportDataWithRouting.premium_report_available,
      premium_report_generated: reportDataWithRouting.premium_report_generated,
      version: '1.0',
    })
    .select()
    .single();

  if (reportErr) throw new Error(`Failed to save report: ${reportErr.message}`);

  // 6. Link latest assessment & report to profile
  await supabase
    .from('creator_profiles')
    .update({
      latest_assessment_id: assessment.id,
      latest_report_id: report.id,
      archetype: reportDataWithRouting.archetype,
      creator_dna_score: reportDataWithRouting.scores.creator_dna,
      brand_clarity_score: reportDataWithRouting.scores.brand_clarity,
      monetisation_score: reportDataWithRouting.scores.monetisation,
      consistency_score: reportDataWithRouting.scores.consistency,
      agency_opportunity_score: reportDataWithRouting.scores.agency_opportunity,
      management_readiness: reportDataWithRouting.management_readiness,
      recommended_pricing_model: reportDataWithRouting.pricing_strategy,
      top_vertical_1: reportDataWithRouting.top_verticals[0]?.name ?? null,
      top_vertical_2: reportDataWithRouting.top_verticals[1]?.name ?? null,
      top_vertical_3: reportDataWithRouting.top_verticals[2]?.name ?? null,
    })
    .eq('id', profileId);

  // 6b. Publish the Creator Intelligence Package (FYV → downstream handoff).
  //
  // A single atomic RPC creates the published package, supersedes the creator's
  // previous active package, and emits `creator.intelligence_package.published`
  // into the existing events outbox. This runs BEFORE the completion event and a
  // hard failure THROWS: a creator assessment cannot report successful
  // completion without its intelligence package being published. Publication is
  // NOT gated on consent / conflict / onboarding / FMF — a valid assessment
  // completion is the only requirement. report_json is left untouched.
  const intelligencePackageBody = buildIntelligencePackageBody(reportDataWithRouting, {
    creatorReference: profileId,
  });
  const { error: publishError } = await (supabase as any).rpc(
    'publish_creator_intelligence_package',
    {
      p_creator_profile_id: profileId,
      p_assessment_id: assessment.id,
      p_report_reference: report.id,
      p_package_json: intelligencePackageBody,
      p_version: '1',
    },
  );

  if (publishError) {
    throw new Error(`Failed to publish creator intelligence package: ${publishError.message}`);
  }

  const completionPayload = buildCreatorAssessmentCompletedPayload({
    profile: {
      ...profile,
      latest_assessment_id: assessment.id,
      latest_report_id: report.id,
      archetype: reportDataWithRouting.archetype,
      creator_dna_score: reportDataWithRouting.scores.creator_dna,
      brand_clarity_score: reportDataWithRouting.scores.brand_clarity,
      monetisation_score: reportDataWithRouting.scores.monetisation,
      consistency_score: reportDataWithRouting.scores.consistency,
      agency_opportunity_score: reportDataWithRouting.scores.agency_opportunity,
      management_readiness: reportDataWithRouting.management_readiness,
      recommended_pricing_model: reportDataWithRouting.pricing_strategy,
      top_vertical_1: reportDataWithRouting.top_verticals[0]?.name ?? null,
      top_vertical_2: reportDataWithRouting.top_verticals[1]?.name ?? null,
      top_vertical_3: reportDataWithRouting.top_verticals[2]?.name ?? null,
    },
    invite,
    assessment,
    report: {
      ...report,
      report_json: reportDataWithRouting,
    },
    completedAt,
    recommendedNextAction,
    creatorNextAction,
  });

const { error: outboxError } = await (supabase as any).from('events').insert({
  source_system: 'findyourvertical',
  event_type: 'creator.assessment.completed',
  entity_type: 'creator_profile',
  entity_id: profileId,
  entity_ref: `creator_profile:${profileId}`,
  status: 'pending',
  payload: completionPayload,
});

  if (outboxError) throw new Error(`Failed to write FYV completion outbox event: ${outboxError.message}`);

  const eventDetails = {
    assessment_id: assessment.id,
    dna_profile_id: dnaProfile.id,
    report_id: report.id,
    report_slug: slug,
    template_id: runtimeTemplate?.id ?? null,
    template_slug: runtimeTemplate?.slug ?? null,
    invite_code: invite?.invite_code ?? null,
    creator_name: invite?.creator_name ?? null,
  };

  await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: profileId,
      event_type: 'assessment.completed',
      details: eventDetails,
    },
    {
      creator_profile_id: profileId,
      event_type: 'report.generated',
      details: eventDetails,
    },
  ]);

  return {
    profile: {
      ...profile,
      latest_assessment_id: assessment.id,
      latest_report_id: report.id,
      archetype: reportData.archetype,
      creator_dna_score: reportData.scores.creator_dna,
      brand_clarity_score: reportData.scores.brand_clarity,
      monetisation_score: reportData.scores.monetisation,
      consistency_score: reportData.scores.consistency,
      agency_opportunity_score: reportData.scores.agency_opportunity,
      management_readiness: reportData.management_readiness,
      recommended_pricing_model: reportData.pricing_strategy,
      top_vertical_1: reportData.top_verticals[0]?.name ?? null,
      top_vertical_2: reportData.top_verticals[1]?.name ?? null,
      top_vertical_3: reportData.top_verticals[2]?.name ?? null,
    },
    assessment,
    report,
    dnaProfile: dnaProfile as CreatorDnaProfile,
  };
}

export async function requestStrategyDiscussion(input: {
  profileId: string;
  reportSlug: string;
  notes?: string;
}): Promise<void> {
  // Creator-facing engagement: write as `anon` (report page + /my).
  const supabase = publicSupabase;
  const requestedAt = new Date().toISOString();
  const details = {
    report_slug: input.reportSlug,
    agency_opportunity_flag: true,
    funnel_step: 'booking_requested',
    requested_at: requestedAt,
    notes: normalizeNullableText(input.notes),
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_interest.yes',
      details,
    },
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_strategy_discussion_requested',
      details,
    },
  ]);

  if (eventError) throw new Error(`Failed to flag strategy request: ${eventError.message}`);

  const { error: profileError } = await supabase
    .from('creator_profiles')
    .update({
      consent_to_contact: true,
      consent_at: requestedAt,
      follow_up_required: true,
      follow_up_reason: 'strategy_discussion_requested',
      status: 'Interested',
    })
    .eq('id', input.profileId);

  if (profileError) throw new Error(`Failed to update contact consent: ${profileError.message}`);
}

export async function trackAgencyCalendarClick(input: {
  profileId: string;
  reportSlug: string;
}): Promise<void> {
  // Creator-facing engagement: write as `anon` (report page + /my).
  const supabase = publicSupabase;
  const clickedAt = new Date().toISOString();
  const details = {
    report_slug: input.reportSlug,
    funnel_step: 'calendar_clicked',
    follow_up_required: true,
    follow_up_reason: 'calendar_clicked_no_confirmed_booking',
    clicked_at: clickedAt,
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: input.profileId,
      event_type: 'strategy_call.clicked',
      details,
    },
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_calendar_clicked',
      details,
    },
  ]);

  if (eventError) throw new Error(`Failed to track calendar click: ${eventError.message}`);

  const { error: profileError } = await supabase
    .from('creator_profiles')
    .update({
      follow_up_required: true,
      follow_up_reason: 'calendar_clicked_no_confirmed_booking',
    })
    .eq('id', input.profileId);

  if (profileError) throw new Error(`Failed to set follow-up flag: ${profileError.message}`);
}

export async function trackCreatorServicesClick(input: {
  profileId: string;
  reportSlug: string;
}): Promise<void> {
  // Creator-facing engagement: write as `anon` (report page + /my).
  const supabase = publicSupabase;
  const clickedAt = new Date().toISOString();
  const details = {
    report_slug: input.reportSlug,
    funnel_step: 'creator_services_explore_clicked',
    clicked_at: clickedAt,
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert({
    creator_profile_id: input.profileId,
    event_type: 'creator_services.explore_clicked',
    details,
  });

  if (eventError) throw new Error(`Failed to track creator services click: ${eventError.message}`);
}

export async function trackCreatorEvent(input: {
  profileId: string;
  eventType: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  // Creator-facing engagement: write as `anon` (report page + /my).
  const supabase = publicSupabase;
  const { error } = await supabase.from('creator_status_events').insert({
    creator_profile_id: input.profileId,
    event_type: input.eventType,
    details: input.details ?? {},
  });

  if (error) throw new Error(`Failed to track creator event: ${error.message}`);
}

export async function confirmStrategyMeetingBooked(input: {
  profileId: string;
  reportSlug?: string;
  bookingTimestamp?: string;
  calendlyEventUri?: string;
}): Promise<void> {
  // Creator-facing engagement: write as `anon` (report page + /my).
  const supabase = publicSupabase;
  const bookedAt = input.bookingTimestamp ?? new Date().toISOString();
  const details = {
    report_slug: normalizeNullableText(input.reportSlug),
    funnel_step: 'booking_confirmed',
    booked_at: bookedAt,
    calendly_event_uri: normalizeNullableText(input.calendlyEventUri),
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_strategy_meeting_booked',
      details,
    },
    {
      creator_profile_id: input.profileId,
      event_type: 'strategy_meeting_booked',
      details,
    },
  ]);

  if (eventError) throw new Error(`Failed to track booked strategy meeting: ${eventError.message}`);

  const { error: profileError } = await supabase
    .from('creator_profiles')
    .update({
      follow_up_required: false,
      follow_up_reason: null,
      strategy_meeting_booked_at: bookedAt,
    })
    .eq('id', input.profileId);

  if (profileError) throw new Error(`Failed to clear booking follow-up flag: ${profileError.message}`);
}

// TODO: Connect the Calendly webhook to `confirmStrategyMeetingBooked` after
// verifying the webhook signature and mapping the invitee to a creator profile.

// ── Public Reads ──

export async function getCreatorProfile(profileId: string): Promise<CreatorProfile | null> {
  const { data } = await supabase.from('creator_profiles').select().eq('id', profileId).single();
  return data as CreatorProfile | null;
}

export async function getReportBySlug(slug: string): Promise<CreatorReport | null> {
  // Public report page: always read via the anonymous client (shareable by slug,
  // no auth required, no regression for public visitors or logged-in creators).
  const supabase = publicSupabase;
  const { data } = await supabase
    .from('creator_reports')
    .select()
    .eq('report_slug', slug)
    .single();
  return data as CreatorReport | null;
}

// ── Creator self-service (authenticated /my) ─────────────────────────────────
// These deliberately use the primary (authenticated) client so row-level
// security resolves via auth.uid(): a creator sees only their own records.

/** Resolve the authenticated creator's own profile (null if not linked yet). */
export async function getMyCreatorProfile(authUserId: string): Promise<CreatorProfile | null> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load your profile: ${error.message}`);
  return (data ?? null) as CreatorProfile | null;
}

/**
 * Link the authenticated user to their existing creator profile by verified
 * email. Server-controlled (no client-supplied id/email); idempotent. Throws a
 * descriptive error for: agency user, no match, ambiguous match, or a profile
 * already linked to another account.
 */
export async function claimCreatorProfile(): Promise<CreatorProfile> {
  const { data, error } = await supabase.rpc('claim_creator_profile');
  if (error) throw new Error(error.message);
  return data as CreatorProfile;
}

/**
 * Create a fresh self-serve retake invite for the authenticated creator.
 * Returns only the invite code + template slug needed to enter the wizard.
 */
export async function createCreatorRetakeInvite(): Promise<{ invite_code: string; template_slug: string }> {
  const { data, error } = await supabase.rpc('create_creator_retake_invite');
  if (error) throw new Error(error.message);
  return data as { invite_code: string; template_slug: string };
}

// ── Archetype variation library + creator selections (FYV-PERSONA-1A) ────────
// Authenticated creator-self-service + agency. The library is public-read of
// active rows; snapshots and selections are creator-own via RLS.

/** Active variations for the given archetypes, ordered for display. */
export async function getActiveVariationsForArchetypes(
  archetypes: string[],
): Promise<ArchetypeVariation[]> {
  const unique = Array.from(new Set(archetypes.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from('archetype_variations')
    .select('*')
    .in('archetype', unique)
    .eq('is_active', true)
    .order('archetype', { ascending: true })
    .order('display_order', { ascending: true });
  if (error) throw new Error(`Failed to load archetype variations: ${error.message}`);
  return (data ?? []) as ArchetypeVariation[];
}

/** The creator's active (current-cycle) archetype snapshot, or null if none yet. */
export async function getMyArchetypeSnapshot(
  creatorProfileId: string,
): Promise<CreatorArchetypeSnapshot | null> {
  const { data, error } = await supabase
    .from('creator_archetype_snapshots')
    .select('*')
    .eq('creator_profile_id', creatorProfileId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`Failed to load your character basis: ${error.message}`);
  return (data ?? null) as CreatorArchetypeSnapshot | null;
}

/**
 * Insert the creator's active archetype snapshot (the locked ranked basis),
 * called once when the creator first enters the selection step. If a concurrent
 * insert already created the active snapshot (unique index), reuse it.
 */
export async function createMyArchetypeSnapshot(input: {
  creatorProfileId: string;
  sourceAssessmentId: string | null;
  primaryArchetype: string;
  secondaryArchetype: string;
  thirdArchetype: string;
}): Promise<CreatorArchetypeSnapshot> {
  const { data, error } = await supabase
    .from('creator_archetype_snapshots')
    .insert({
      creator_profile_id: input.creatorProfileId,
      source_assessment_id: input.sourceAssessmentId,
      primary_archetype: input.primaryArchetype,
      secondary_archetype: input.secondaryArchetype,
      third_archetype: input.thirdArchetype,
      status: 'active',
    })
    .select()
    .single();
  if (error) {
    // Unique-violation → another tab/session already created it; reuse that one.
    const existing = await getMyArchetypeSnapshot(input.creatorProfileId);
    if (existing) return existing;
    throw new Error(`Failed to save your character basis: ${error.message}`);
  }
  return data as CreatorArchetypeSnapshot;
}

/** All selection rows for a snapshot cycle. */
export async function getMyVariationSelections(
  snapshotId: string,
): Promise<CreatorVariationSelection[]> {
  const { data, error } = await supabase
    .from('creator_variation_selections')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load your selections: ${error.message}`);
  return (data ?? []) as CreatorVariationSelection[];
}

export interface VariationSelectionInput {
  variationId: string;
  archetype: string;
  rank: ArchetypeRank;
}

/**
 * Reconcile the creator's selected variations for a snapshot to exactly the
 * provided set: insert newly-selected rows, delete de-selected ones. Selections
 * stay editable until the creator finishes; duplicates are prevented by the
 * (snapshot_id, variation_id) unique constraint.
 */
export async function saveMyVariationSelections(input: {
  creatorProfileId: string;
  snapshotId: string;
  selections: VariationSelectionInput[];
}): Promise<CreatorVariationSelection[]> {
  const existing = await getMyVariationSelections(input.snapshotId);
  const desiredIds = new Set(input.selections.map(selection => selection.variationId));
  const existingIds = new Set(existing.map(row => row.variation_id));

  const toInsert = input.selections.filter(selection => !existingIds.has(selection.variationId));
  const toDeleteIds = existing
    .filter(row => !desiredIds.has(row.variation_id))
    .map(row => row.id);

  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from('creator_variation_selections')
      .delete()
      .in('id', toDeleteIds);
    if (error) throw new Error(`Failed to update your selections: ${error.message}`);
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map(selection => ({
      creator_profile_id: input.creatorProfileId,
      snapshot_id: input.snapshotId,
      archetype: selection.archetype,
      archetype_rank: selection.rank,
      variation_id: selection.variationId,
      status: 'selected' as const,
    }));
    const { error } = await supabase.from('creator_variation_selections').insert(rows);
    if (error) throw new Error(`Failed to save your selections: ${error.message}`);
  }

  return getMyVariationSelections(input.snapshotId);
}

// ── Persona portfolio (FYV-PERSONA-1B) ───────────────────────────────────────
// Creator reads are own-row via RLS. Generation is initiated ONLY through the
// Worker (POST /api/personas/generate) using the service role — never a direct
// table insert from the browser.

/** The creator's active persona generation for the current snapshot cycle, or null. */
export async function getActivePersonaGeneration(
  creatorProfileId: string,
): Promise<CreatorPersonaGeneration | null> {
  const { data, error } = await supabase
    .from('creator_persona_generations')
    .select('*')
    .eq('creator_profile_id', creatorProfileId)
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load your character portfolio: ${error.message}`);
  return (data ?? null) as CreatorPersonaGeneration | null;
}

/** The generated personas for a generation, ordered by portfolio position. */
export async function getPersonasForGeneration(
  generationId: string,
): Promise<CreatorPersona[]> {
  const { data, error } = await supabase
    .from('creator_personas')
    .select('*')
    .eq('generation_id', generationId)
    .order('portfolio_position', { ascending: true });
  if (error) throw new Error(`Failed to load your characters: ${error.message}`);
  return (data ?? []) as CreatorPersona[];
}

/** A single generated persona by id (own-row via RLS). */
export async function getMyPersona(personaId: string): Promise<CreatorPersona | null> {
  const { data, error } = await supabase
    .from('creator_personas')
    .select('*')
    .eq('id', personaId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load this character: ${error.message}`);
  return (data ?? null) as CreatorPersona | null;
}

export interface GeneratePortfolioResult {
  generationId: string;
  status: string;
  personaCount?: number;
  reused?: boolean;
  inProgress?: boolean;
}

/**
 * Start (or resume) persona-portfolio generation for the creator's active
 * snapshot. Calls the secure Worker endpoint with the creator's bearer token;
 * the Worker validates ownership, enforces the exact 3-2-1 source set, invokes
 * the provider, validates output, and persists atomically. Provider keys never
 * reach the browser.
 */
export async function generateMyPersonaPortfolio(
  snapshotId: string,
): Promise<GeneratePortfolioResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Please sign in again to build your character portfolio.');

  const response = await fetch('/api/personas/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ snapshotId }),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const base = typeof payload.error === 'string' ? payload.error : 'generation_failed';
    if (base === 'selection_incomplete') {
      throw new Error('Please finish choosing your character variations before generating.');
    }
    const code = typeof payload.code === 'string' ? ` (${payload.code})` : '';
    throw new Error(`We could not build your character portfolio: ${base}${code}`);
  }

  return {
    generationId: String(payload.generationId ?? ''),
    status: String(payload.status ?? 'unknown'),
    personaCount: typeof payload.personaCount === 'number' ? payload.personaCount : undefined,
    reused: payload.reused === true,
    inProgress: payload.inProgress === true,
  };
}

/** Record that the creator viewed their portfolio (server-controlled audit event). */
export async function recordPersonaPortfolioViewed(generationId: string): Promise<void> {
  const { error } = await supabase.rpc('record_persona_portfolio_viewed', {
    p_generation_id: generationId,
  });
  // Non-critical audit; swallow errors so the workspace view is never blocked.
  if (error) return;
}

// ── Creator onboarding (FYV-ONBOARDING-FIRST) ────────────────────────────────
// Creator-scoped RPCs; ownership is enforced server-side via
// current_creator_profile_id(). No client-supplied profile id is ever trusted.

export async function getMyOnboardingCase(): Promise<CreatorOnboardingCase | null> {
  const { data, error } = await supabase.rpc('get_my_onboarding_case');
  if (error) throw new Error(error.message);
  return (data ?? null) as CreatorOnboardingCase | null;
}

/** Create-or-resume the caller's own onboarding case. */
export async function startMyOnboarding(): Promise<CreatorOnboardingCase> {
  const { data, error } = await supabase.rpc('start_my_onboarding');
  if (error) throw new Error(error.message);
  return data as CreatorOnboardingCase;
}

export async function saveMyOnboardingProgress(
  caseId: string,
  responses: Record<string, unknown>,
): Promise<CreatorOnboardingCase> {
  const { data, error } = await supabase.rpc('save_my_onboarding_progress', {
    p_case_id: caseId,
    p_responses: responses,
  });
  if (error) throw new Error(error.message);
  return data as CreatorOnboardingCase;
}

export async function submitMyOnboarding(caseId: string): Promise<CreatorOnboardingCase> {
  const { data, error } = await supabase.rpc('submit_my_onboarding', { p_case_id: caseId });
  if (error) throw new Error(error.message);
  return data as CreatorOnboardingCase;
}

/** Redeem a single-use onboarding invitation token for the authenticated creator. */
export async function redeemOnboardingInvitation(token: string): Promise<RedemptionResult> {
  const { data, error } = await supabase.rpc('redeem_onboarding_invitation', { p_token: token });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, code: 'invalid' }) as RedemptionResult;
}

/** Result of creating an onboarding invitation. `raw_token` is returned ONCE. */
export interface OnboardingInvitationResult {
  invitation_id: string;
  onboarding_case_id: string;
  expires_at: string;
  raw_token: string;
  accept_path: string;
}

/**
 * Agency/cockpit: create a single-use onboarding invitation and get the raw link
 * ONCE for copying. No transactional email provider exists — callers must copy
 * and send the link manually and must NOT claim an email was sent.
 */
export async function createOnboardingInvitation(
  creatorProfileId: string,
): Promise<OnboardingInvitationResult> {
  const { data, error } = await supabase.rpc('create_onboarding_invitation', {
    p_creator_profile_id: creatorProfileId,
  });
  if (error) throw new Error(error.message);
  return data as OnboardingInvitationResult;
}

// ── Authenticated Cockpit API ──

export async function getAllCreatorProfiles(): Promise<CreatorProfile[]> {
  const { data } = await supabase
    .from('creator_profiles')
    .select('*')
    .order('agency_opportunity_score', { ascending: false });
  return (data ?? []) as CreatorProfile[];
}

function nextActionForCreator(
  status: CreatorStatus,
  inviteStatus: CreatorAssessmentInviteLink['status'] | null,
  assessmentStatus: CreatorPipelineSummary['latest_assessment_status']
): string {
  if (status === 'Client' || status === 'Declined') return '-';
  if (status === 'Meeting Booked') return 'Prepare strategy call';
  if (status === 'Qualified') return 'Book strategy call';
  if (status === 'Interested') return 'Qualify opportunity';
  if (assessmentStatus === 'Completed') return 'Review report';
  if (inviteStatus === 'Opened' || inviteStatus === 'Started') return 'Follow up on assessment';
  if (inviteStatus === 'Created' || inviteStatus === 'Sent') return 'Nudge invite';
  return 'Send assessment invite';
}

export async function getCreatorPipelineSummaries(): Promise<CreatorPipelineSummary[]> {
  const [
    profiles,
    { data: inviteRows, error: inviteError },
    { data: assessmentRows, error: assessmentError },
    { data: eventRows, error: eventError },
  ] = await Promise.all([
    getAllCreatorProfiles(),
    (supabase as any)
      .from('creator_assessment_links')
      .select('id,creator_profile_id,status,status_updated_at,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('creator_assessments')
      .select('id,creator_profile_id,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('creator_status_events')
      .select('creator_profile_id,created_at,event_type')
      .order('created_at', { ascending: false }),
  ]);

  if (inviteError) throw new Error(`Failed to load invite summaries: ${inviteError.message}`);
  if (assessmentError) throw new Error(`Failed to load assessment summaries: ${assessmentError.message}`);
  if (eventError) throw new Error(`Failed to load activity summaries: ${eventError.message}`);

  const latestInviteByProfile = new Map<string, any>();
  for (const invite of inviteRows ?? []) {
    if (invite.creator_profile_id && !latestInviteByProfile.has(invite.creator_profile_id)) {
      latestInviteByProfile.set(invite.creator_profile_id, invite);
    }
  }

  const latestAssessmentByProfile = new Map<string, any>();
  for (const assessment of assessmentRows ?? []) {
    if (!latestAssessmentByProfile.has(assessment.creator_profile_id)) {
      latestAssessmentByProfile.set(assessment.creator_profile_id, assessment);
    }
  }

  const latestEventByProfile = new Map<string, any>();
  for (const event of eventRows ?? []) {
    if (!latestEventByProfile.has(event.creator_profile_id)) {
      latestEventByProfile.set(event.creator_profile_id, event);
    }
  }

  return profiles.map(profile => {
    const invite = latestInviteByProfile.get(profile.id);
    const assessment = latestAssessmentByProfile.get(profile.id);
    const event = latestEventByProfile.get(profile.id);
    const latestInviteStatus = invite?.status ?? null;
    const latestAssessmentStatus = assessment
      ? 'Completed'
      : latestInviteStatus === 'Started'
        ? 'Started'
        : 'Not Started';
    const activityDates = [
      profile.updated_at,
      invite?.status_updated_at,
      invite?.created_at,
      assessment?.created_at,
      event?.created_at,
    ].filter(Boolean).sort();
    const lastActivityAt = activityDates[activityDates.length - 1] ?? null;

    return {
      ...profile,
      latest_invite_status: latestInviteStatus,
      latest_assessment_status: latestAssessmentStatus,
      last_activity_at: lastActivityAt,
      next_action: nextActionForCreator(profile.status, latestInviteStatus, latestAssessmentStatus),
    };
  });
}

export async function getInvitesForProfile(profileId: string): Promise<CreatorAssessmentInviteLink[]> {
  const { data, error } = await (supabase as any)
    .from('creator_assessment_links')
    .select('*')
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load invite history: ${error.message}`);
  return (data ?? []) as CreatorAssessmentInviteLink[];
}

export async function getAssessmentsForProfile(profileId: string): Promise<CreatorAssessment[]> {
  const { data } = await supabase
    .from('creator_assessments')
    .select()
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data ?? []) as CreatorAssessment[];
}

export async function getReportsForProfile(profileId: string): Promise<CreatorReport[]> {
  const { data } = await supabase
    .from('creator_reports')
    .select()
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data ?? []) as CreatorReport[];
}

export async function getNotesForProfile(profileId: string): Promise<CreatorNote[]> {
  const { data } = await supabase
    .from('creator_notes')
    .select()
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data ?? []) as CreatorNote[];
}

export async function getStatusEventsForProfile(profileId: string): Promise<CreatorStatusEvent[]> {
  const { data } = await supabase
    .from('creator_status_events')
    .select()
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data ?? []) as CreatorStatusEvent[];
}

export async function updateCreatorStatus(
  profileId: string,
  status: CreatorStatus
): Promise<void> {
  const { error } = await supabase.from('creator_profiles').update({ status }).eq('id', profileId);
  if (error) throw new Error(`Failed to update creator status: ${error.message}`);
}

export async function updateCreatorQualification(
  profileId: string,
  input: {
    business_acumen?: number | null;
    coachability?: number | null;
    management_wraparound_potential?: ManagementWraparoundPotential | null;
    service_qualification?: ServiceQualification;
  }
): Promise<CreatorProfile> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .update(input)
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update creator qualification: ${error.message}`);
  return data as CreatorProfile;
}

export async function updateCreatorServiceQualification(
  profile: CreatorProfile,
  service: ServiceQualificationKey,
  status: ServiceQualificationStatus
): Promise<CreatorProfile> {
  return updateCreatorQualification(profile.id, {
    service_qualification: {
      ...profile.service_qualification,
      [service]: status,
    },
  });
}

export async function addCreatorNote(profileId: string, note: string): Promise<CreatorNote | null> {
  const { data } = await supabase
    .from('creator_notes')
    .insert({ creator_profile_id: profileId, note })
    .select()
    .single();
  return data as CreatorNote | null;
}

export async function getAssessmentInviteLinks(templateId?: string): Promise<CreatorAssessmentInviteLink[]> {
  let query = (supabase as any)
    .from('creator_assessment_links')
    .select(INVITE_LINK_SELECT_FIELDS)
    .order('created_at', { ascending: false });

  if (templateId) query = query.eq('template_id', templateId);

  const { data, error } = await query;
  if (error) {
    const message = String(error.message ?? '');
    if (isInviteLinkSchemaMismatch(message)) {
      let fallbackQuery = (supabase as any)
        .from('creator_assessment_links')
        .select(INVITE_LINK_BASE_SELECT_FIELDS)
        .order('created_at', { ascending: false });

      if (templateId) fallbackQuery = fallbackQuery.eq('template_id', templateId);

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) throw new Error(`Failed to load invite links: ${fallbackError.message}`);
      return (fallbackData ?? []) as CreatorAssessmentInviteLink[];
    }
  }

  if (error) throw new Error(`Failed to load invite links: ${error.message}`);
  return (data ?? []) as CreatorAssessmentInviteLink[];
}

export async function getCreatorDnaProfilesForProfile(profileId: string): Promise<CreatorDnaProfile[]> {
  const { data } = await supabase
    .from('creator_dna_profiles')
    .select()
    .eq('creator_profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data ?? []) as CreatorDnaProfile[];
}

// Assessment Template Management

export async function getQuestionBank(): Promise<CreatorQuestion[]> {
  const { data, error } = await supabase
    .from('creator_question_bank')
    .select('*')
    .order('section', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load question bank: ${error.message}`);
  return (data ?? []) as CreatorQuestion[];
}

export async function createQuestion(input: {
  question_key: string;
  response_key: string;
  question_text: string;
  help_text?: string | null;
  section: string;
  question_type: AssessmentQuestionType;
  scoring_dimension?: string | null;
  parent_question_key?: string | null;
  show_when_value?: string | null;
  show_when_operator?: 'equals' | 'includes';
  options?: unknown[];
  config?: Record<string, unknown>;
}): Promise<CreatorQuestion> {
  const { data, error } = await supabase
    .from('creator_question_bank')
    .insert({
      question_key: input.question_key,
      response_key: input.response_key,
      question_text: input.question_text,
      help_text: input.help_text ?? null,
      section: input.section,
      question_type: input.question_type,
      scoring_dimension: input.scoring_dimension ?? null,
      parent_question_key: input.parent_question_key ?? null,
      show_when_value: input.show_when_value ?? null,
      show_when_operator: input.show_when_operator ?? 'equals',
      options: input.options ?? [],
      config: input.config ?? {},
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create question: ${error.message}`);
  return data as CreatorQuestion;
}

export async function updateQuestion(
  id: string,
  input: Pick<CreatorQuestion, 'question_text' | 'help_text'> & Pick<Partial<CreatorQuestion>, 'question_key' | 'response_key' | 'question_type' | 'options' | 'config' | 'section' | 'scoring_dimension' | 'parent_question_key' | 'show_when_value' | 'show_when_operator'>
): Promise<CreatorQuestion> {
  const { data, error } = await supabase
    .from('creator_question_bank')
    .update({
      ...(input.question_key !== undefined ? { question_key: normalizeQuestionKey(input.question_key) } : {}),
      ...(input.response_key !== undefined ? { response_key: normalizeQuestionKey(input.response_key) } : {}),
      question_text: input.question_text,
      help_text: input.help_text,
      ...(input.question_type !== undefined ? { question_type: input.question_type } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.scoring_dimension !== undefined ? { scoring_dimension: input.scoring_dimension } : {}),
      ...(input.parent_question_key !== undefined ? { parent_question_key: input.parent_question_key } : {}),
      ...(input.show_when_value !== undefined ? { show_when_value: input.show_when_value } : {}),
      ...(input.show_when_operator !== undefined ? { show_when_operator: input.show_when_operator } : {}),
      ...(input.options ? { options: input.options } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update question: ${error.message}`);
  return data as CreatorQuestion;
}

export async function archiveQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('creator_question_bank')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(`Failed to archive question: ${error.message}`);
}

export async function restoreQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('creator_question_bank')
    .update({ is_active: true })
    .eq('id', id);

  if (error) throw new Error(`Failed to restore question: ${error.message}`);
}

export async function getQuestionDeleteEligibility(id: string): Promise<{ canDelete: boolean; reason?: string }> {
  const { count, error } = await supabase
    .from('creator_assessment_template_questions')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', id);

  if (error) throw new Error(`Failed to check question references: ${error.message}`);

  const { count: itemCount, error: itemError } = await (supabase as any)
    .from('creator_assessment_template_items')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', id);

  if (itemError) {
    const message = String(itemError.message ?? '');
    if (
      !message.includes('creator_assessment_template_items')
      && !message.includes('schema cache')
      && !message.includes('does not exist')
    ) {
      throw new Error(`Failed to check question item references: ${message}`);
    }
  }

  const totalReferences = (count ?? 0) + (itemError ? 0 : itemCount ?? 0);
  if (totalReferences > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete because this question is referenced by ${totalReferences} template record${totalReferences === 1 ? '' : 's'}. Archive it instead.`,
    };
  }

  return { canDelete: true };
}

export async function deleteQuestion(id: string): Promise<void> {
  const eligibility = await getQuestionDeleteEligibility(id);
  if (!eligibility.canDelete) throw new Error(eligibility.reason ?? 'Question cannot be deleted safely');

  const { error } = await supabase
    .from('creator_question_bank')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete question: ${error.message}`);
}

export async function getAssessmentTemplates(): Promise<CreatorAssessmentRuntimeTemplate[]> {
  const { data, error } = await supabase
    .from('creator_assessment_templates')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load assessment templates: ${error.message}`);

  const templates = (data ?? []) as CreatorAssessmentTemplate[];
  const templateIds = templates.map(template => template.id);
  const [questionRows, itemRows, branchRuleRows] = await Promise.all([
    loadTemplateQuestionRows(templateIds),
    loadTemplateItemRows(templateIds),
    loadBranchRuleRows(templateIds),
  ]);

  const questionsByTemplate = new Map<string, TemplateQuestionRow[]>();
  for (const row of questionRows) {
    questionsByTemplate.set(row.template_id, [...(questionsByTemplate.get(row.template_id) ?? []), row]);
  }

  const itemsByTemplate = new Map<string, TemplateItemRow[]>();
  for (const row of itemRows) {
    itemsByTemplate.set(row.template_id, [...(itemsByTemplate.get(row.template_id) ?? []), row]);
  }

  const branchRulesByTemplate = new Map<string, BranchRuleRow[]>();
  for (const row of branchRuleRows) {
    branchRulesByTemplate.set(row.template_id, [...(branchRulesByTemplate.get(row.template_id) ?? []), row]);
  }

  return templates.map(template => flattenTemplate(
    template,
    questionsByTemplate.get(template.id) ?? [],
    itemsByTemplate.get(template.id) ?? [],
    branchRulesByTemplate.get(template.id) ?? []
  ));
}

export async function upsertTemplateQuestion(
  templateId: string,
  question: Pick<CreatorAssessmentQuestion, 'id' | 'is_included' | 'sort_order'>,
  changes: Partial<Pick<CreatorAssessmentQuestion, 'is_included' | 'sort_order'>>
): Promise<void> {
  const { error } = await supabase
    .from('creator_assessment_template_questions')
    .upsert({
      template_id: templateId,
      question_id: question.id,
      is_included: changes.is_included ?? question.is_included,
      sort_order: changes.sort_order ?? question.sort_order,
    });

  if (error) throw new Error(`Failed to update template question: ${error.message}`);
}

export async function saveTemplateQuestions(
  templateId: string,
  questions: Array<Pick<CreatorAssessmentQuestion, 'id' | 'is_included' | 'sort_order'>>
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('creator_assessment_template_questions')
    .delete()
    .eq('template_id', templateId);

  if (deleteError) throw new Error(`Failed to clear template questions: ${deleteError.message}`);
  if (questions.length === 0) return;

  const { error } = await supabase
    .from('creator_assessment_template_questions')
    .insert(questions.map(question => ({
      template_id: templateId,
      question_id: question.id,
      is_included: question.is_included,
      sort_order: question.sort_order,
    })));

  if (error) throw new Error(`Failed to save template questions: ${error.message}`);
}

export async function saveTemplateItems(
  templateId: string,
  items: Array<Pick<CreatorAssessmentTemplateItem, 'id' | 'item_type' | 'question_id' | 'title' | 'description' | 'is_included' | 'sort_order'>>
): Promise<void> {
  const isPersistedItemId = (id: unknown): id is string => (
    typeof id === 'string'
    && id.length > 0
    && !id.startsWith('new-')
    && !id.includes(':')
  );

  const existingIds = items
    .filter(item => isPersistedItemId(item.id))
    .map(item => item.id);

  const { data: existingRows, error: existingError } = await (supabase as any)
    .from('creator_assessment_template_items')
    .select('id')
    .eq('template_id', templateId);

  if (existingError) throw new Error(`Failed to load existing template items: ${existingError.message}`);

  const removeIds = ((existingRows ?? []) as Array<{ id: string }>)
    .map(row => row.id)
    .filter(id => !existingIds.includes(id));

  if (removeIds.length > 0) {
    const { error: deleteError } = await (supabase as any)
      .from('creator_assessment_template_items')
      .delete()
      .in('id', removeIds);

    if (deleteError) throw new Error(`Failed to remove template items: ${deleteError.message}`);
  }

  const rows = items.map(item => ({
    id: isPersistedItemId(item.id) ? item.id : null,
    template_id: templateId,
    item_type: item.item_type,
    question_id: item.item_type === 'question' ? item.question_id : null,
    title: item.item_type === 'section_heading' ? item.title : null,
    description: item.item_type === 'section_heading' ? item.description : null,
    is_included: item.is_included,
    sort_order: item.sort_order,
  }));

  const existingRowsToUpsert = rows.filter(row => row.id);
  const newRowsToInsert = rows.map(({ id, ...row }) => row).filter((_, index) => !rows[index].id);

  if (existingRowsToUpsert.length > 0) {
    const { error } = await (supabase as any)
      .from('creator_assessment_template_items')
      .upsert(existingRowsToUpsert);

    if (error) throw new Error(`Failed to save template items: ${error.message}`);
  }

  if (newRowsToInsert.length > 0) {
    const { error } = await (supabase as any)
      .from('creator_assessment_template_items')
      .insert(newRowsToInsert);

    if (error) throw new Error(`Failed to save new template items: ${error.message}`);
  }

  const legacyQuestionRows = new Map<string, Pick<CreatorAssessmentQuestion, 'id' | 'is_included' | 'sort_order'>>();
  for (const item of items.filter(item => item.item_type === 'question' && item.question_id)) {
    const existing = legacyQuestionRows.get(item.question_id!);
    legacyQuestionRows.set(item.question_id!, {
      id: item.question_id!,
      is_included: Boolean(existing?.is_included || item.is_included),
      sort_order: Math.min(existing?.sort_order ?? item.sort_order, item.sort_order),
    });
  }

  await saveTemplateQuestions(templateId, Array.from(legacyQuestionRows.values()));
}

export async function saveTemplateBranchRules(
  templateId: string,
  rules: Array<Pick<CreatorAssessmentBranchRule, 'source_question_id' | 'option_value' | 'action' | 'target_question_id' | 'target_section_item_id'>>
): Promise<void> {
  const { error: deleteError } = await (supabase as any)
    .from('creator_assessment_branch_rules')
    .delete()
    .eq('template_id', templateId);

  if (deleteError) throw new Error(`Failed to clear branch rules: ${deleteError.message}`);

  const rows = rules
    .filter(rule => (
      rule.action === 'end'
      || (rule.action === 'jump_question' && rule.target_question_id)
      || (rule.action === 'jump_section' && rule.target_section_item_id)
    ))
    .map(rule => ({
      template_id: templateId,
      source_question_id: rule.source_question_id,
      option_value: rule.option_value,
      action: rule.action,
      target_question_id: rule.action === 'jump_question' ? rule.target_question_id : null,
      target_section_item_id: rule.action === 'jump_section' ? rule.target_section_item_id : null,
    }));

  if (rows.length === 0) return;

  const { error } = await (supabase as any)
    .from('creator_assessment_branch_rules')
    .insert(rows);

  if (error) throw new Error(`Failed to save branch rules: ${error.message}`);
}

export async function createAssessmentTemplate(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
  duplicateFromTemplateId?: string | null;
}): Promise<CreatorAssessmentTemplate> {
  const { data: template, error } = await supabase
    .from('creator_assessment_templates')
    .insert({
      name: input.name,
      slug: slugify(input.slug || input.name),
      description: input.description ?? null,
      is_public: true,
      is_active: false,
      is_default: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create template: ${error.message}`);

  if (input.duplicateFromTemplateId) {
    const { data: itemRows, error: itemRowsError } = await (supabase as any)
      .from('creator_assessment_template_items')
      .select('id,item_type,question_id,title,description,is_included,sort_order')
      .eq('template_id', input.duplicateFromTemplateId);

    if (itemRowsError) throw new Error(`Failed to duplicate template items: ${itemRowsError.message}`);

    if ((itemRows ?? []).length > 0) {
      const { data: insertedItems, error: insertItemsError } = await (supabase as any)
        .from('creator_assessment_template_items')
        .insert((itemRows ?? []).map((row: any) => ({
          template_id: template.id,
          item_type: row.item_type,
          question_id: row.question_id,
          title: row.title,
          description: row.description,
          is_included: row.is_included,
          sort_order: row.sort_order,
        })))
        .select('id,sort_order,item_type,title');

      if (insertItemsError) throw new Error(`Failed to attach duplicated template items: ${insertItemsError.message}`);

      const oldSectionRows = (itemRows ?? []).filter((row: any) => row.item_type === 'section_heading');
      const newSectionRows = (insertedItems ?? []).filter((row: any) => row.item_type === 'section_heading');
      const sectionIdMap = new Map<string, string>();
      oldSectionRows.forEach((oldRow: any, index: number) => {
        const match = newSectionRows.find((newRow: any) => newRow.sort_order === oldRow.sort_order && newRow.title === oldRow.title)
          ?? newSectionRows[index];
        if (match) sectionIdMap.set(oldRow.id, match.id);
      });

      const { data: branchRules, error: branchRulesError } = await (supabase as any)
        .from('creator_assessment_branch_rules')
        .select('source_question_id,option_value,action,target_question_id,target_section_item_id')
        .eq('template_id', input.duplicateFromTemplateId);

      if (branchRulesError) {
        const message = String(branchRulesError.message ?? '');
        if (
          !message.includes('creator_assessment_branch_rules')
          && !message.includes('schema cache')
          && !message.includes('does not exist')
        ) {
          throw new Error(`Failed to duplicate branch rules: ${message}`);
        }
      } else if ((branchRules ?? []).length > 0) {
        const duplicatedRules = (branchRules ?? []).map((rule: any) => ({
          template_id: template.id,
          source_question_id: rule.source_question_id,
          option_value: rule.option_value,
          action: rule.action,
          target_question_id: rule.target_question_id,
          target_section_item_id: rule.target_section_item_id ? sectionIdMap.get(rule.target_section_item_id) ?? null : null,
        })).filter((rule: any) => rule.action !== 'jump_section' || rule.target_section_item_id);

        if (duplicatedRules.length > 0) {
          const { error: insertRulesError } = await (supabase as any)
            .from('creator_assessment_branch_rules')
            .insert(duplicatedRules);

          if (insertRulesError) throw new Error(`Failed to attach duplicated branch rules: ${insertRulesError.message}`);
        }
      }
    }

    const { data: rows, error: rowsError } = await supabase
      .from('creator_assessment_template_questions')
      .select('question_id,is_included,sort_order')
      .eq('template_id', input.duplicateFromTemplateId);

    if (rowsError) throw new Error(`Failed to duplicate template questions: ${rowsError.message}`);

    if ((rows ?? []).length > 0) {
      const { error: insertRowsError } = await supabase
        .from('creator_assessment_template_questions')
        .insert((rows ?? []).map(row => ({
          template_id: template.id,
          question_id: row.question_id,
          is_included: row.is_included,
          sort_order: row.sort_order,
        })));

      if (insertRowsError) throw new Error(`Failed to attach duplicated questions: ${insertRowsError.message}`);
    }
  }

  return template as CreatorAssessmentTemplate;
}

export async function createAssessmentInviteLink(input: {
  templateId: string;
  creatorProfileId?: string | null;
  creatorName: string;
  creatorEmail?: string | null;
  onlyfansHandle?: string | null;
  modelName?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
  reportTier?: ReportTier;
}): Promise<CreatorAssessmentInviteLink> {
  const profile = await ensureCreatorProfileForInvite({
    creatorProfileId: input.creatorProfileId,
    creatorName: input.creatorName,
    creatorEmail: input.creatorEmail,
    onlyfansHandle: input.onlyfansHandle,
    modelName: input.modelName,
  });
  const creatorName = input.creatorName.trim() || profile.full_name;
  const creatorEmail = normalizeEmail(input.creatorEmail) ?? profile.email;

  const inviteCode = randomInviteCode();
  const insertPayload = {
    template_id: input.templateId,
    creator_profile_id: profile.id,
    invite_code: inviteCode,
    creator_name: creatorName,
    creator_email: creatorEmail,
    notes: normalizeNullableText(input.notes),
    status: 'Created',
    status_updated_at: new Date().toISOString(),
    is_active: true,
    expires_at: input.expiresAt || null,
  };

  let { data, error } = await (supabase as any)
    .from('creator_assessment_links')
    .insert(insertPayload)
    .select(INVITE_LINK_SELECT_FIELDS)
    .single();

  if (error && isInviteLinkSchemaMismatch(String(error.message ?? ''))) {
    ({ data, error } = await (supabase as any)
      .from('creator_assessment_links')
      .insert({
        template_id: input.templateId,
        invite_code: inviteCode,
        creator_name: creatorName,
        creator_email: creatorEmail,
        notes: normalizeNullableText(input.notes),
        is_active: true,
        expires_at: input.expiresAt || null,
      })
      .select(INVITE_LINK_BASE_SELECT_FIELDS)
      .single());
  }

  if (error) throw new Error(`Failed to create invite link: ${error.message}`);
  await trackCreatorEvent({
    profileId: profile.id,
    eventType: 'invite.created',
    details: {
      template_id: input.templateId,
      invite_link_id: data.id,
      invite_code: data.invite_code,
      creator_email: creatorEmail,
      expires_at: input.expiresAt || null,
      notes: normalizeNullableText(input.notes),
    },
  }).catch(() => undefined);
  return data as CreatorAssessmentInviteLink;
}

export async function createCreatorInviteRequest(input: {
  name: string;
  email: string;
  onlyfansHandle?: string | null;
}): Promise<void> {
  const name = normalizeNullableText(input.name);
  const email = normalizeEmail(input.email);
  if (!name || !email) throw new Error('Name and email are required to request an invite.');

  const { error } = await (supabase as any)
    .from('creator_invite_requests')
    .insert({
      name,
      email,
      onlyfans_handle: normalizeOnlyFansHandle(input.onlyfansHandle),
      status: 'New',
    });

  if (error) throw new Error(`Failed to request invite: ${error.message}`);
}

export async function getCreatorInviteRequests(): Promise<CreatorInviteRequest[]> {
  const { data, error } = await (supabase as any)
    .from('creator_invite_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load invite requests: ${error.message}`);
  return (data ?? []) as CreatorInviteRequest[];
}

export async function updateCreatorInviteRequest(
  requestId: string,
  input: {
    status: CreatorInviteRequestStatus;
    notes?: string | null;
  }
): Promise<CreatorInviteRequest> {
  const { data: userData } = await supabase.auth.getUser();
  const reviewed = input.status !== 'New';
  const { data, error } = await (supabase as any)
    .from('creator_invite_requests')
    .update({
      status: input.status,
      notes: normalizeNullableText(input.notes),
      reviewed_at: reviewed ? new Date().toISOString() : null,
      reviewed_by: reviewed ? userData.user?.id ?? null : null,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update invite request: ${error.message}`);
  return data as CreatorInviteRequest;
}

export async function updateAssessmentTemplate(
  templateId: string,
  input: Partial<Pick<CreatorAssessmentTemplate, 'name' | 'slug' | 'description'>>
): Promise<void> {
  const payload = {
    ...input,
    ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
  };
  const { error } = await supabase
    .from('creator_assessment_templates')
    .update(payload)
    .eq('id', templateId);

  if (error) throw new Error(`Failed to update template: ${error.message}`);
}

export async function setTemplateActive(templateId: string, isActive: boolean): Promise<void> {
  if (!isActive) {
    const { data: template, error: loadError } = await supabase
      .from('creator_assessment_templates')
      .select('is_default')
      .eq('id', templateId)
      .single();

    if (loadError) throw new Error(`Failed to load template: ${loadError.message}`);
    if (template?.is_default) {
      throw new Error('Set another active template as default before archiving the current default.');
    }
  }

  const { error } = await supabase
    .from('creator_assessment_templates')
    .update({ is_active: isActive })
    .eq('id', templateId);

  if (error) throw new Error(`Failed to update template status: ${error.message}`);
}

export async function setDefaultTemplate(templateId: string): Promise<void> {
  const { data: includedRows, error: includedError } = await (supabase as any)
    .from('creator_assessment_template_items')
    .select('question_id, is_included, creator_question_bank!inner(is_active)')
    .eq('template_id', templateId)
    .eq('item_type', 'question')
    .eq('is_included', true)
    .eq('creator_question_bank.is_active', true);

  if (includedError) throw new Error(`Failed to validate template questions: ${includedError.message}`);
  if ((includedRows ?? []).length === 0) {
    throw new Error('A template needs at least one included active question before it can be set as default.');
  }

  const { error: clearError } = await supabase
    .from('creator_assessment_templates')
    .update({ is_default: false })
    .eq('is_default', true);

  if (clearError) throw new Error(`Failed to clear default template: ${clearError.message}`);

  const { error } = await supabase
    .from('creator_assessment_templates')
    .update({ is_default: true, is_active: true })
    .eq('id', templateId);

  if (error) throw new Error(`Failed to set default template: ${error.message}`);
}

export async function getTemplateDeleteEligibility(templateId: string): Promise<{ canDelete: boolean; reason?: string }> {
  const { data: template, error: templateError } = await supabase
    .from('creator_assessment_templates')
    .select('is_default')
    .eq('id', templateId)
    .single();

  if (templateError) throw new Error(`Failed to load template delete safety: ${templateError.message}`);
  if (template?.is_default) return { canDelete: false, reason: 'Default templates cannot be deleted.' };

  const { count: assessmentCount, error: assessmentError } = await supabase
    .from('creator_assessments')
    .select('*', { count: 'exact', head: true })
    .eq('template_id', templateId);

  if (assessmentError) throw new Error(`Failed to check template assessments: ${assessmentError.message}`);
  if ((assessmentCount ?? 0) > 0) {
    return { canDelete: false, reason: `Cannot delete because ${assessmentCount} assessment${assessmentCount === 1 ? '' : 's'} use this template.` };
  }

  const { count: inviteCount, error: inviteError } = await (supabase as any)
    .from('creator_assessment_links')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId);

  if (inviteError) throw new Error(`Failed to check template invites: ${inviteError.message}`);
  if ((inviteCount ?? 0) > 0) {
    return { canDelete: false, reason: `Cannot delete because ${inviteCount} invite link${inviteCount === 1 ? '' : 's'} use this template. Archive it instead.` };
  }

  return { canDelete: true };
}

export async function deleteAssessmentTemplate(templateId: string): Promise<void> {
  const eligibility = await getTemplateDeleteEligibility(templateId);
  if (!eligibility.canDelete) throw new Error(eligibility.reason ?? 'Template cannot be deleted safely.');

  const { error } = await supabase
    .from('creator_assessment_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw new Error(`Failed to delete template: ${error.message}`);
}

// ── Dashboard Metrics ──

export interface DashboardMetrics {
  totalProfiles: number;
  invitesCreated: number;
  assessmentsStarted: number;
  assessmentsCompleted: number;
  completionRate: number;
  agencyInterestCount: number;
  strategyCallClicks: number;
  qualifiedCreators: number;
  activeCreators: number;
  avgAgencyScore: number;
  scaleCandidates: number;
  conversionRate: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data: profiles } = await supabase.from('creator_profiles').select('*');
  const p = (profiles ?? []) as CreatorProfile[];

  const totalProfiles = p.length;
  const qualifiedCreators = p.filter(x => ['Qualified', 'Meeting Booked', 'Client'].includes(x.status)).length;
  const activeCreators = p.filter(x => x.status === 'Client').length;
  const scaleCandidates = p.filter(x => x.management_readiness === 'Scale Candidate').length;
  const avgAgencyScore = totalProfiles > 0
    ? Math.round(p.reduce((sum, x) => sum + (x.agency_opportunity_score ?? 0), 0) / totalProfiles)
    : 0;

  const { count: assessmentCount } = await supabase
    .from('creator_assessments')
    .select('*', { count: 'exact', head: true });

  const { count: inviteCount } = await (supabase as any)
    .from('creator_assessment_links')
    .select('id', { count: 'exact', head: true });

  const { count: assessmentStartedCount } = await supabase
    .from('creator_status_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'assessment.started');

  const { count: agencyInterestCount } = await supabase
    .from('creator_status_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'agency_interest.yes');

  const { count: strategyCallClicks } = await supabase
    .from('creator_status_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'strategy_call.clicked');

  const completionBase = assessmentStartedCount || inviteCount || 0;

  const conversionRate = totalProfiles > 0
    ? Math.round(((activeCreators + qualifiedCreators) / totalProfiles) * 100)
    : 0;

  return {
    totalProfiles,
    invitesCreated: inviteCount ?? 0,
    assessmentsStarted: assessmentStartedCount ?? 0,
    assessmentsCompleted: assessmentCount ?? 0,
    completionRate: completionBase > 0 ? Math.round(((assessmentCount ?? 0) / completionBase) * 100) : 0,
    agencyInterestCount: agencyInterestCount ?? 0,
    strategyCallClicks: strategyCallClicks ?? 0,
    qualifiedCreators,
    activeCreators,
    avgAgencyScore,
    scaleCandidates,
    conversionRate,
  };
}
