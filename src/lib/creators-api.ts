import { supabase } from './supabase';
import type {
  CreatorProfile,
  CreatorAssessment,
  CreatorDnaProfile,
  CreatorReport,
  CreatorNote,
  CreatorStatusEvent,
  CreatorStatus,
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
  CreatorInviteRequest,
  CreatorInviteRequestStatus,
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

type TemplateQuestionJoinRow = Omit<CreatorAssessmentTemplateQuestion, 'question'>;
type TemplateItemRow = Omit<CreatorAssessmentTemplateItem, 'question'>;
type AssessmentInviteContext = Pick<CreatorAssessmentInviteLink, 'id' | 'invite_code' | 'creator_name'>;

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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template';
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

function flattenTemplate(
  template: CreatorAssessmentTemplate,
  rows: TemplateQuestionRow[] | null | undefined,
  itemRows?: TemplateItemRow[] | null
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

async function loadTemplateQuestionRows(templateIds: string[]): Promise<TemplateQuestionRow[]> {
  if (templateIds.length === 0) return [];

  const { data: joinRows, error: joinError } = await supabase
    .from('creator_assessment_template_questions')
    .select('template_id,question_id,is_included,sort_order,created_at,updated_at')
    .in('template_id', templateIds);

  if (joinError) throw new Error(`Failed to load template questions: ${joinError.message}`);

  const questionIds = [...new Set(((joinRows ?? []) as TemplateQuestionJoinRow[]).map(row => row.question_id))];
  const { data: questionRows, error: questionError } = questionIds.length > 0
    ? await supabase.from('creator_question_bank').select('*').in('id', questionIds)
    : { data: [], error: null };

  if (questionError) throw new Error(`Failed to load template question bank rows: ${questionError.message}`);

  const questionById = new Map(((questionRows ?? []) as CreatorQuestion[]).map(question => [question.id, question]));
  return ((joinRows ?? []) as TemplateQuestionJoinRow[]).map(row => ({
    ...row,
    creator_question_bank: questionById.get(row.question_id) ?? null,
  }));
}

async function loadTemplateItemRows(templateIds: string[]): Promise<TemplateItemRow[]> {
  if (templateIds.length === 0) return [];

  const { data, error } = await (supabase as any)
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
  const { data, error } = await supabase
    .from('creator_assessment_templates')
    .select('*')
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (error) throw new Error(`Failed to load assessment template: ${error.message}`);
  if (!data) return null;

  const template = data as CreatorAssessmentTemplate;
  const [questionRows, itemRows] = await Promise.all([
    loadTemplateQuestionRows([template.id]),
    loadTemplateItemRows([template.id]),
  ]);

  return flattenTemplate(template, questionRows, itemRows);
}

export async function getAssessmentTemplateBySlug(slug: string): Promise<CreatorAssessmentRuntimeTemplate | null> {
  const normalizedSlug = slugify(slug);
  const { data, error } = await (supabase as any)
    .from('creator_assessment_templates')
    .select('*')
    .eq('slug', normalizedSlug)
    .eq('is_active', true)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load assessment template: ${error.message}`);
  if (!data) return null;

  const template = data as CreatorAssessmentTemplate;
  const [questionRows, itemRows] = await Promise.all([
    loadTemplateQuestionRows([template.id]),
    loadTemplateItemRows([template.id]),
  ]);

  return flattenTemplate(template, questionRows, itemRows);
}

export async function getAssessmentInviteLink(inviteCode: string): Promise<CreatorAssessmentInviteLink | null> {
  const code = inviteCode.trim();
  if (!code) return null;

  const { data, error } = await (supabase as any)
    .from('creator_assessment_links')
    .select('*')
    .eq('invite_code', code)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error) throw new Error(`Failed to load invite link: ${error.message}`);
  return (data ?? null) as CreatorAssessmentInviteLink | null;
}

export async function submitAssessment(
  responses: AssessmentResponses,
  template?: CreatorAssessmentRuntimeTemplate | null,
  invite?: AssessmentInviteContext | null
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
    status: 'Assessment Complete',
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
      p_creator_dna_score: result.scores.creator_dna,
      p_brand_clarity_score: result.scores.brand_clarity,
      p_monetisation_score: result.scores.monetisation,
      p_consistency_score: result.scores.consistency,
      p_agency_opportunity_score: result.scores.agency_opportunity,
    });

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
    classification_confidence: result.classification_confidence,
    result_confidence: result.result_confidence,
    pricing_strategy: result.pricing_strategy,
    winning_10_framework: result.winning_10_framework,
    growth_strategy: result.growth_strategy,
    tech_stack: result.tech_stack,
    management_readiness: result.management_readiness,
    day_90_plan: result.day_90_plan,
    creator_dna_profile: dnaProfileInput,
    why_this_result: result.why_this_result,
    internal_agency_scores: result.internal_agency_scores,
    agency_recommendation: result.agency_recommendation,
    report_tier: result.report_tier,
    free_report_summary: result.free_report_summary,
    premium_report_available: result.premium_report_available,
    premium_report_generated: result.premium_report_generated,
    premium_report_status: result.premium_report_status,
  };

  const { data: report, error: reportErr } = await supabase
    .from('creator_reports')
    .insert({
      creator_profile_id: profileId,
      report_slug: slug,
      report_json: reportData,
      report_tier: reportData.report_tier,
      premium_report_available: reportData.premium_report_available,
      premium_report_generated: reportData.premium_report_generated,
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
    details: {
      assessment_id: assessment.id,
      dna_profile_id: dnaProfile.id,
      report_slug: slug,
      template_id: runtimeTemplate?.id ?? null,
      template_slug: runtimeTemplate?.slug ?? null,
      invite_code: invite?.invite_code ?? null,
      creator_name: invite?.creator_name ?? null,
    },
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
    funnel_step: 'booking_requested',
    requested_at: requestedAt,
    notes: normalizeNullableText(input.notes),
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_strategy_discussion_requested',
      details,
    },
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_discussion_requested',
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
    funnel_step: 'calendar_clicked',
    follow_up_required: true,
    follow_up_reason: 'calendar_clicked_no_confirmed_booking',
    clicked_at: clickedAt,
  };

  const { error: eventError } = await supabase.from('creator_status_events').insert([
    {
      creator_profile_id: input.profileId,
      event_type: 'agency_calendar_clicked',
      details,
    },
    {
      creator_profile_id: input.profileId,
      event_type: 'calendly_clicked',
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

export async function trackCreatorEvent(input: {
  profileId: string;
  eventType: string;
  details?: Record<string, unknown>;
}): Promise<void> {
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
    .select('*')
    .order('created_at', { ascending: false });

  if (templateId) query = query.eq('template_id', templateId);

  const { data, error } = await query;
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
  const [questionRows, itemRows] = await Promise.all([
    loadTemplateQuestionRows(templateIds),
    loadTemplateItemRows(templateIds),
  ]);

  const questionsByTemplate = new Map<string, TemplateQuestionRow[]>();
  for (const row of questionRows) {
    questionsByTemplate.set(row.template_id, [...(questionsByTemplate.get(row.template_id) ?? []), row]);
  }

  const itemsByTemplate = new Map<string, TemplateItemRow[]>();
  for (const row of itemRows) {
    itemsByTemplate.set(row.template_id, [...(itemsByTemplate.get(row.template_id) ?? []), row]);
  }

  return templates.map(template => flattenTemplate(
    template,
    questionsByTemplate.get(template.id) ?? [],
    itemsByTemplate.get(template.id) ?? []
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
  if (questions.length === 0) return;

  const { error } = await supabase
    .from('creator_assessment_template_questions')
    .upsert(questions.map(question => ({
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
  const existingIds = items
    .filter(item => !item.id.startsWith('new-') && !item.id.includes(':'))
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
    ...(item.id.startsWith('new-') || item.id.includes(':') ? {} : { id: item.id }),
    template_id: templateId,
    item_type: item.item_type,
    question_id: item.item_type === 'question' ? item.question_id : null,
    title: item.item_type === 'section_heading' ? item.title : null,
    description: item.item_type === 'section_heading' ? item.description : null,
    is_included: item.is_included,
    sort_order: item.sort_order,
  }));

  if (rows.length > 0) {
    const { error } = await (supabase as any)
      .from('creator_assessment_template_items')
      .upsert(rows);

    if (error) throw new Error(`Failed to save template items: ${error.message}`);
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
      .select('item_type,question_id,title,description,is_included,sort_order')
      .eq('template_id', input.duplicateFromTemplateId);

    if (itemRowsError) throw new Error(`Failed to duplicate template items: ${itemRowsError.message}`);

    if ((itemRows ?? []).length > 0) {
      const { error: insertItemsError } = await (supabase as any)
        .from('creator_assessment_template_items')
        .insert((itemRows ?? []).map((row: any) => ({
          template_id: template.id,
          item_type: row.item_type,
          question_id: row.question_id,
          title: row.title,
          description: row.description,
          is_included: row.is_included,
          sort_order: row.sort_order,
        })));

      if (insertItemsError) throw new Error(`Failed to attach duplicated template items: ${insertItemsError.message}`);
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
  creatorName: string;
  creatorEmail?: string | null;
  notes?: string | null;
}): Promise<CreatorAssessmentInviteLink> {
  const { data, error } = await (supabase as any)
    .from('creator_assessment_links')
    .insert({
      template_id: input.templateId,
      invite_code: randomInviteCode(),
      creator_name: input.creatorName.trim(),
      creator_email: normalizeEmail(input.creatorEmail),
      notes: normalizeNullableText(input.notes),
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create invite link: ${error.message}`);
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
  const qualifiedCreators = p.filter(x => ['Qualified', 'Discovery Booked', 'Proposal Sent', 'Client', 'Managed Creator'].includes(x.status)).length;
  const activeCreators = p.filter(x => x.status === 'Client' || x.status === 'Managed Creator').length;
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
