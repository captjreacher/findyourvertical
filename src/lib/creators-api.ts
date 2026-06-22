import { supabase } from './supabase';
import type {
  CreatorProfile,
  CreatorAssessment,
  CreatorDnaProfile,
  CreatorReport,
  CreatorNote,
  CreatorStatusEvent,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorAssessmentRuntimeTemplate,
  CreatorAssessmentTemplate,
  CreatorAssessmentTemplateQuestion,
  CreatorQuestion,
  AssessmentQuestionType,
  ReportData,
} from '@/types/creator';
import { scoreAssessment, generateReportSlug } from './scoring';
import { generateCreatorDnaProfile } from './creator-dna';

// ── Assessment Submission (public) ──

type TemplateQuestionRow = CreatorAssessmentTemplateQuestion & {
  creator_question_bank: CreatorQuestion | null;
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

async function findExistingCreatorProfile(
  email: string | null,
  onlyfansHandle: string | null
): Promise<CreatorProfile | null> {
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
  const existing = await findExistingCreatorProfile(payload.email, payload.onlyfans_handle);

  if (existing) {
    const { data, error } = await supabase
      .from('creator_profiles')
      .update(payload)
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

function flattenTemplate(
  template: CreatorAssessmentTemplate,
  rows: TemplateQuestionRow[] | null | undefined
): CreatorAssessmentRuntimeTemplate {
  return {
    ...template,
    questions: (rows ?? [])
      .filter(row => row.creator_question_bank)
      .map(row => ({
        ...row.creator_question_bank!,
        template_id: row.template_id,
        is_included: row.is_included,
        sort_order: row.sort_order,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function getDefaultAssessmentTemplate(): Promise<CreatorAssessmentRuntimeTemplate | null> {
  const { data, error } = await supabase
    .from('creator_assessment_templates')
    .select(`
      *,
      creator_assessment_template_questions (
        template_id,
        question_id,
        is_included,
        sort_order,
        created_at,
        updated_at,
        creator_question_bank (*)
      )
    `)
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (error) throw new Error(`Failed to load assessment template: ${error.message}`);
  if (!data) return null;

  return flattenTemplate(
    data as CreatorAssessmentTemplate,
    (data as { creator_assessment_template_questions?: TemplateQuestionRow[] }).creator_assessment_template_questions
  );
}

export async function submitAssessment(
  responses: AssessmentResponses,
  template?: CreatorAssessmentRuntimeTemplate | null
): Promise<{
  profile: CreatorProfile;
  assessment: CreatorAssessment;
  report: CreatorReport;
  dnaProfile: CreatorDnaProfile;
}> {
  // 1. Score the assessment
  if (responses.audience_target === null) {
    throw new Error('Audience target is required');
  }

  const result = scoreAssessment(responses);
  const slug = generateReportSlug(responses.full_name);
  const runtimeTemplate = template ?? await getDefaultAssessmentTemplate();
  const includedQuestions = (runtimeTemplate?.questions ?? []).filter(q => q.is_included);
  const assessmentSnapshot = runtimeTemplate
    ? {
        template_id: runtimeTemplate.id,
        template_name: runtimeTemplate.name,
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
    status: 'prospect',
    archetype: result.archetype,
    creator_dna_score: result.scores.creator_dna,
    brand_clarity_score: result.scores.brand_clarity,
    monetisation_score: result.scores.monetisation,
    consistency_score: result.scores.consistency,
    agency_opportunity_score: result.scores.agency_opportunity,
    management_readiness: result.management_readiness,
    audience_strategy: responses.audience_target,
    recommended_pricing_model: result.pricing_strategy,
    top_vertical_1: result.top_verticals[0]?.name ?? null,
    top_vertical_2: result.top_verticals[1]?.name ?? null,
    top_vertical_3: result.top_verticals[2]?.name ?? null,
    mailing_list_opt_out: responses.mailing_list_opt_out,
    consent_to_contact: consentToContact,
    consent_at: consentToContact ? new Date().toISOString() : null,
  });
  const profileId = profile.id;

  // 3. Create assessment
  const { data: assessment, error: assessmentErr } = await supabase
    .from('creator_assessments')
    .insert({
      creator_profile_id: profileId,
      responses,
      assessment_snapshot: assessmentSnapshot,
      creator_dna_score: result.scores.creator_dna,
      brand_clarity_score: result.scores.brand_clarity,
      monetisation_score: result.scores.monetisation,
      consistency_score: result.scores.consistency,
      agency_opportunity_score: result.scores.agency_opportunity,
    })
    .select()
    .single();

  if (assessmentErr) throw new Error(`Failed to save assessment: ${assessmentErr.message}`);

  // 4. Generate Creator DNA profile
  const dnaProfileInput = generateCreatorDnaProfile(profileId, assessment.id, responses);
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

  // 5. Create report
  const reportData: ReportData = {
    archetype: result.archetype,
    archetype_description: result.archetype_description,
    archetype_strengths: result.archetype_strengths,
    archetype_risks: result.archetype_risks,
    archetype_growth: result.archetype_growth,
    scores: result.scores,
    top_verticals: result.top_verticals,
    pricing_strategy: result.pricing_strategy,
    winning_10_framework: result.winning_10_framework,
    growth_strategy: result.growth_strategy,
    tech_stack: result.tech_stack,
    management_readiness: result.management_readiness,
    day_90_plan: result.day_90_plan,
    creator_dna_profile: dnaProfileInput,
    why_this_result: result.why_this_result,
    internal_agency_scores: result.internal_agency_scores,
  };

  const { data: report, error: reportErr } = await supabase
    .from('creator_reports')
    .insert({
      creator_profile_id: profileId,
      report_slug: slug,
      report_json: reportData,
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
    })
    .eq('id', profileId);

  // 7. Create assessment_completed event
  await supabase.from('creator_status_events').insert({
    creator_profile_id: profileId,
    event_type: 'assessment_completed',
    details: { assessment_id: assessment.id, dna_profile_id: dnaProfile.id, report_slug: slug },
  });

  return {
    profile: { ...profile, latest_assessment_id: assessment.id, latest_report_id: report.id },
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
  const requestedAt = new Date().toISOString();
  const details = {
    report_slug: input.reportSlug,
    agency_opportunity_flag: true,
    requested_at: requestedAt,
    notes: normalizeNullableText(input.notes),
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert({
    creator_profile_id: input.profileId,
    event_type: 'agency_strategy_discussion_requested',
    details,
  });

  if (eventError) throw new Error(`Failed to flag strategy request: ${eventError.message}`);

  const { error: profileError } = await supabase
    .from('creator_profiles')
    .update({
      consent_to_contact: true,
      consent_at: requestedAt,
      follow_up_required: true,
      follow_up_reason: 'strategy_discussion_requested',
    })
    .eq('id', input.profileId);

  if (profileError) throw new Error(`Failed to update contact consent: ${profileError.message}`);
}

export async function trackAgencyCalendarClick(input: {
  profileId: string;
  reportSlug: string;
}): Promise<void> {
  const clickedAt = new Date().toISOString();
  const details = {
    report_slug: input.reportSlug,
    follow_up_required: true,
    follow_up_reason: 'calendar_clicked_no_confirmed_booking',
    clicked_at: clickedAt,
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert({
    creator_profile_id: input.profileId,
    event_type: 'agency_calendar_clicked',
    details,
  });

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

// ── Public Reads ──

export async function getCreatorProfile(profileId: string): Promise<CreatorProfile | null> {
  const { data } = await supabase.from('creator_profiles').select().eq('id', profileId).single();
  return data as CreatorProfile | null;
}

export async function getReportBySlug(slug: string): Promise<CreatorReport | null> {
  const { data } = await supabase
    .from('creator_reports')
    .select()
    .eq('report_slug', slug)
    .single();
  return data as CreatorReport | null;
}

// ── Authenticated Cockpit API ──

export async function getAllCreatorProfiles(): Promise<CreatorProfile[]> {
  const { data } = await supabase
    .from('creator_profiles')
    .select('*')
    .order('agency_opportunity_score', { ascending: false });
  return (data ?? []) as CreatorProfile[];
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
  status: string,
  eventType: string,
  details?: Record<string, unknown>
): Promise<void> {
  await supabase.from('creator_profiles').update({ status }).eq('id', profileId);
  await supabase.from('creator_status_events').insert({
    creator_profile_id: profileId,
    event_type: eventType,
    details: details ?? {},
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
      config: {},
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create question: ${error.message}`);
  return data as CreatorQuestion;
}

export async function updateQuestion(
  id: string,
  input: Pick<CreatorQuestion, 'question_text' | 'help_text'> & Pick<Partial<CreatorQuestion>, 'options'>
): Promise<CreatorQuestion> {
  const { data, error } = await supabase
    .from('creator_question_bank')
    .update({
      question_text: input.question_text,
      help_text: input.help_text,
      ...(input.options ? { options: input.options } : {}),
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

  const { error: templateError } = await supabase
    .from('creator_assessment_template_questions')
    .update({ is_included: false })
    .eq('question_id', id);

  if (templateError) throw new Error(`Failed to remove archived question from templates: ${templateError.message}`);
}

export async function getAssessmentTemplates(): Promise<CreatorAssessmentRuntimeTemplate[]> {
  const { data, error } = await supabase
    .from('creator_assessment_templates')
    .select(`
      *,
      creator_assessment_template_questions (
        template_id,
        question_id,
        is_included,
        sort_order,
        created_at,
        updated_at,
        creator_question_bank (*)
      )
    `)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load assessment templates: ${error.message}`);

  return ((data ?? []) as Array<CreatorAssessmentTemplate & { creator_assessment_template_questions?: TemplateQuestionRow[] }>)
    .map(template => flattenTemplate(template, template.creator_assessment_template_questions));
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

export async function setDefaultTemplate(templateId: string): Promise<void> {
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

// ── Dashboard Metrics ──

export interface DashboardMetrics {
  totalProfiles: number;
  assessmentsCompleted: number;
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
  const qualifiedCreators = p.filter(x => x.status === 'qualified' || x.status === 'interviewed' || x.status === 'accepted' || x.status === 'onboarding' || x.status === 'active').length;
  const activeCreators = p.filter(x => x.status === 'active').length;
  const scaleCandidates = p.filter(x => x.management_readiness === 'Scale Candidate').length;
  const avgAgencyScore = totalProfiles > 0
    ? Math.round(p.reduce((sum, x) => sum + (x.agency_opportunity_score ?? 0), 0) / totalProfiles)
    : 0;

  const { count: assessmentCount } = await supabase
    .from('creator_assessments')
    .select('*', { count: 'exact', head: true });

  const conversionRate = totalProfiles > 0
    ? Math.round(((activeCreators + qualifiedCreators) / totalProfiles) * 100)
    : 0;

  return {
    totalProfiles,
    assessmentsCompleted: assessmentCount ?? 0,
    qualifiedCreators,
    activeCreators,
    avgAgencyScore,
    scaleCandidates,
    conversionRate,
  };
}
