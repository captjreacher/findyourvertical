import type { KnowledgeEnrichment } from '@/lib/knowledge/types';

// ── Creator Profile (primary entity) ──
export type CreatorStatus =
  | 'New'
  | 'Invited'
  | 'Started'
  | 'Completed'
  | 'Interested'
  | 'Qualified'
  | 'Meeting Booked'
  | 'Client'
  | 'Declined';

export type ServiceQualificationStatus =
  | 'Not Interested'
  | 'Not Suitable'
  | 'Future Opportunity'
  | 'Qualified'
  | 'Active Client';

export type ServiceQualificationKey =
  | 'financial_advice'
  | 'business_mentoring'
  | 'content_vertical_sprint'
  | 'chat_automation'
  | 'social_extension'
  | 'platform_extension'
  | 'management_package';

export type ServiceQualification = Record<ServiceQualificationKey, ServiceQualificationStatus>;

export type ManagementWraparoundPotential = 'Yes' | 'No' | 'Not Yet';

export type ManagementReadiness =
  | 'Scale Candidate'
  | 'Ready Now'
  | 'Needs Foundation'
  | 'Hobby Creator';

export type AudienceStrategy = 'whales' | 'masses';

export type ContentVertical =
  | 'Skill-Based Challenges'
  | 'Polarizing Storytimes'
  | 'Lifestyle Vlogging / GRWM'
  | 'Comedy Skits'
  | 'Confessional Storytime'
  | 'Fitness Journey'
  | 'Editorial / High-Fashion Shoots'
  | 'Roleplay / Character Content'
  | 'Cosy Authenticity'
  | 'Tease & Deny';

export interface CreatorProfile {
  id: string;
  created_at: string;
  updated_at: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  onlyfans_handle?: string | null;
  model_name?: string | null;
  city?: string | null;
  country: string | null;
  status: CreatorStatus;
  archetype: string | null;
  creator_dna_score: number | null;
  brand_clarity_score: number | null;
  monetisation_score: number | null;
  consistency_score: number | null;
  agency_opportunity_score: number | null;
  business_acumen: number | null;
  coachability: number | null;
  management_wraparound_potential: ManagementWraparoundPotential | null;
  service_qualification: ServiceQualification;
  management_readiness: ManagementReadiness | null;
  audience_strategy: AudienceStrategy | null;
  recommended_pricing_model: string | null;
  top_vertical_1: string | null;
  top_vertical_2: string | null;
  top_vertical_3: string | null;
  latest_assessment_id: string | null;
  latest_report_id: string | null;
  ofmanager_creator_id: string | null;
  consent_to_contact: boolean;
  consent_at: string | null;
  mailing_list_opt_out?: boolean;
  follow_up_required?: boolean | null;
  follow_up_reason?: string | null;
  strategy_meeting_booked_at?: string | null;
}

// ── Assessment ──
export interface AssessmentResponses {
  strengths: string[] | string;
  comfort_level: number;
  passion_topic: string;
  persona_occupation: string[];
  parasocial_comfort: boolean;
  fantasy_keywords: string;
  nudity_level: string;
  niche_interests: string[];
  audience_target: AudienceStrategy | null;
  first_name: string;
  last_name: string;
  onlyfans_handle: string;
  model_name: string;
  city: string;
  full_name: string;
  email: string;
  country: string;
  consent: boolean;
  mailing_list_opt_out: boolean;
  aspirational_creators?: string;
  alternative_content_ideas?: string;
  future_improvements?: string[];
  future_improvements_other?: string;
  [key: string]: unknown;
}

export type AssessmentQuestionType =
  | 'short_text'
  | 'long_text'
  | 'textarea'
  | 'single_choice'
  | 'multi_choice'
  | 'boolean'
  | 'scale'
  | 'scenario_ranking';

export type AssessmentQuestionOption =
  | string
  | {
      value: string;
      label: string;
      description?: string;
      is_active?: boolean;
    };

export type AssessmentBranchAction = 'continue' | 'jump_question' | 'jump_section' | 'end';

export interface CreatorAssessmentBranchRule {
  id?: string;
  template_id: string;
  source_question_id: string;
  option_value: string;
  action: AssessmentBranchAction;
  target_question_id: string | null;
  target_section_item_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatorQuestion {
  id: string;
  question_key: string;
  response_key: string;
  question_text: string;
  help_text: string | null;
  section: string;
  question_type: AssessmentQuestionType;
  scoring_dimension: string | null;
  parent_question_key: string | null;
  show_when_value: string | null;
  show_when_operator: 'equals' | 'includes' | 'includes_any' | 'not_equals';
  options: AssessmentQuestionOption[];
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatorAssessmentTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatorAssessmentTemplateQuestion {
  template_id: string;
  question_id: string;
  is_included: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  question?: CreatorQuestion;
}

export interface CreatorAssessmentQuestion extends CreatorQuestion {
  template_id: string;
  is_included: boolean;
  sort_order: number;
}

export type CreatorAssessmentTemplateItemType = 'section_heading' | 'question';

export interface CreatorAssessmentTemplateItem {
  id: string;
  template_id: string;
  item_type: CreatorAssessmentTemplateItemType;
  question_id: string | null;
  title: string | null;
  description: string | null;
  is_included: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  question?: CreatorQuestion | null;
}

export interface CreatorAssessmentRuntimeTemplate extends CreatorAssessmentTemplate {
  questions: CreatorAssessmentQuestion[];
  items?: CreatorAssessmentTemplateItem[];
  branch_rules?: CreatorAssessmentBranchRule[];
}

export interface CreatorAssessmentInviteLink {
  id: string;
  template_id: string;
  creator_profile_id?: string | null;
  invite_code: string;
  creator_name: string;
  creator_email: string | null;
  notes: string | null;
  report_tier?: ReportTier;
  status?: 'Created' | 'Sent' | 'Opened' | 'Email Verified' | 'Started' | 'Completed' | 'Expired' | 'Revoked';
  status_updated_at?: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export type CreatorInviteRequestStatus = 'New' | 'Reviewed' | 'Approved' | 'Declined';

export interface CreatorInviteRequest {
  id: string;
  name: string;
  email: string;
  onlyfans_handle: string | null;
  status: CreatorInviteRequestStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorAssessment {
  id: string;
  creator_profile_id: string;
  template_id: string | null;
  template_slug: string | null;
  invite_link_id: string | null;
  invite_code: string | null;
  creator_name: string | null;
  created_at: string;
  responses: AssessmentResponses;
  answers: AssessmentResponses | null;
  respondent: Record<string, unknown> | null;
  assessment_snapshot: {
    template_id: string;
    template_slug: string;
    template_name: string;
    question_snapshot: CreatorAssessmentQuestion[];
  } | null;
  creator_dna_score: number;
  brand_clarity_score: number;
  monetisation_score: number;
  consistency_score: number;
  agency_opportunity_score: number;
}

export type AuthenticityBand = 'High Authenticity' | 'Moderate Authenticity' | 'Potential Conflict';
export type MonetisationReadiness = 'Low' | 'Developing' | 'Ready' | 'Advanced';
export type AgencyOpportunityBand = 'High Priority' | 'Qualified' | 'Needs Development' | 'Not Suitable Yet';
export type AgencyPriority = 'low' | 'medium' | 'high';
export type CreatorCompletionNextAction =
  | 'onboard_to_creator_cockpit'
  | 'qualify_opportunity'
  | 'book_strategy_call'
  | 'manual_review';
/**
 * Creator-facing next action. Deliberately coarse and safe to show publicly:
 * it never exposes internal operator routing such as `qualify_opportunity`.
 * `recommended_next_action` drives internal/downstream consumption (FYV Cockpit,
 * MGRNZ, future Hermes/FMF); `creator_next_action` drives the public report CTA.
 */
export type CreatorPublicNextAction =
  | 'explore_creator_services'
  | 'book_strategy_call';
export type PremiumReportStatus = 'not_started' | 'available' | 'purchased' | 'delivered';
export type ResultConfidenceLabel = 'Low' | 'Moderate' | 'High';
export type ReportTier = 'free' | 'premium' | 'agency';

export type AssessmentV2Section =
  | 'Identity'
  | 'Positioning'
  | 'Audience'
  | 'Content Engine'
  | 'Commercial Readiness'
  | 'Growth Potential'
  | 'Future Vision';

export type EvidenceDimension =
  | 'identity'
  | 'positioning'
  | 'audience'
  | 'content_engine'
  | 'commercial_readiness'
  | 'growth_potential'
  | 'future_vision'
  | 'confidence'
  | 'boundaries'
  | 'archetype_validation';

export type CreatorTrait =
  | 'visibility_comfort'
  | 'social_energy'
  | 'authenticity'
  | 'emotional_familiarity'
  | 'trust_building'
  | 'body_confidence'
  | 'routine_discipline'
  | 'visual_discipline'
  | 'monetisation_fit'
  | 'positioning_clarity'
  | 'fan_connection'
  | 'coachability'
  | 'risk_awareness';

export interface AssessmentEvidence {
  id: string;
  source_question_key: string;
  response_key: string;
  section: AssessmentV2Section;
  dimension: EvidenceDimension;
  value: string | number | boolean | string[];
  strength: number;
  polarity: 'positive' | 'negative' | 'neutral';
  confidence: number;
  validates_archetype?: string;
  tags: string[];
}

export interface TraitWeight {
  trait: CreatorTrait;
  weight: number;
  evidence_ids: string[];
  rationale: string;
}

export interface ArchetypeFit {
  archetype: string;
  fit_score: number;
  confidence: number;
  selected_by_creator: boolean;
  validation_status: 'selected_only' | 'validated' | 'contradicted' | 'inferred';
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
}

export interface ConfidenceScore {
  score: number;
  label: ResultConfidenceLabel;
  drivers: string[];
}

export interface CreatorDnaProfile {
  id: string;
  creator_profile_id: string;
  assessment_id: string;
  creator_dna_primary: string;
  creator_dna_secondary: string;
  confidence: number;
  fantasy_archetype: string;
  archetype_confidence: number;
  authenticity_band: AuthenticityBand;
  authenticity_flags: string[];
  growth_constraints: string[];
  monetisation_readiness: MonetisationReadiness;
  agency_opportunity_score: number;
  agency_opportunity_band: AgencyOpportunityBand;
  summary: string;
  created_at: string;
}

// ── Report ──
export interface ReportData {
  archetype: string;
  archetype_description: string;
  archetype_strengths: string[];
  archetype_risks: string[];
  archetype_growth: string[];
  scores: {
    creator_dna: number;
    brand_clarity: number;
    monetisation: number;
    consistency: number;
    agency_opportunity: number;
  };
  top_verticals: { name: string; rationale: string }[];
  classification_confidence: number;
  result_confidence: ResultConfidenceLabel;
  pricing_strategy: string;
  winning_10_framework: string;
  growth_strategy: string;
  tech_stack: { tool: string; purpose: string }[];
  management_readiness: ManagementReadiness;
  day_90_plan: { phase: string; focus: string; actions: string[] }[];
  executive_summary?: {
    strengths: string[];
    growth_opportunities: string[];
    likely_creator_style: string;
    likely_monetisation_style: string;
    recommended_next_step: string;
  };
  score_interpretations?: Record<string, {
    meaning: string;
    why: string;
    improve: string;
  }>;
  creator_archetype_summary?: {
    primary_archetype: string;
    secondary_archetype: string;
    fit_explanation: string;
  };
  recommended_actions?: { title: string; rationale: string }[];
  creator_agency_opportunity?: {
    growth_potential: string;
    coaching_suitability: string;
    recommended_support: string;
  };
  creator_dna_profile?: Omit<CreatorDnaProfile, 'id' | 'created_at'>;
  why_this_result: {
    summary: string;
    strongest_behavioural_signals: string[];
    strongest_assessment_responses: string[];
    strongest_creator_strengths: string[];
    strongest_archetype_matches: string[];
    strongest_content_opportunity_signals: string[];
    top_signals?: string[];
    strongest_answers?: string[];
    key_differentiators?: string[];
  };
  internal_agency_scores: {
    commercial_potential: number | null;
    management_readiness: number | null;
    coachability: number | null;
    ambition: number | null;
    innovation: number | null;
    parasocial_strength: number | null;
    brand_risk: number | null;
    scalability: number | null;
    agency_opportunity: number | null;
  };
  agency_recommendation: {
    agency_priority: AgencyPriority;
    recommended_next_action: string;
    management_fit_summary: string;
    risk_notes: string[];
    opportunity_notes: string[];
  };
  completion_routing?: {
    /** Internal operator / downstream routing. NOT for creator-facing surfaces. */
    recommended_next_action: CreatorCompletionNextAction;
    /** Creator-facing CTA driver. Safe to render publicly. */
    creator_next_action: CreatorPublicNextAction;
    completed_at: string;
    agency_interest: boolean;
    consent: boolean;
    identity_complete: boolean;
    conflict: boolean;
  };
  report_tier: ReportTier;
  free_report_summary: string;
  premium_report_available: boolean;
  premium_report_generated: boolean;
  premium_report_status: PremiumReportStatus;
}

export interface CreatorIntelligenceResult {
  evidence: AssessmentEvidence[];
  traits: TraitWeight[];
  archetype_fits: ArchetypeFit[];
  confidence: ConfidenceScore;
  creator_dna: Omit<CreatorDnaProfile, 'id' | 'created_at'>;
  report: ReportData;
  /** Knowledge-enriched recommendations, opportunities, and risks. (FYV-3.4C) */
  knowledge?: KnowledgeEnrichment;
}

export interface CreatorReport {
  id: string;
  creator_profile_id: string;
  created_at: string;
  report_slug: string;
  report_json: ReportData;
  version: string;
  report_tier?: ReportTier;
  premium_report_available?: boolean;
  premium_report_generated?: boolean;
}

// ── Notes & Events ──
export interface CreatorNote {
  id: string;
  creator_profile_id: string;
  created_at: string;
  note: string;
}

export interface CreatorStatusEvent {
  id: string;
  creator_profile_id: string;
  created_at: string;
  event_type: string;
  details: Record<string, unknown>;
}

export interface CreatorPipelineSummary extends CreatorProfile {
  latest_invite_status: CreatorAssessmentInviteLink['status'] | null;
  latest_assessment_status: 'Not Started' | 'Started' | 'Completed';
  last_activity_at: string | null;
  next_action: string;
}

// ── Archetypes ──
export const CREATOR_ARCHETYPES = [
  'Girl Next Door',
  'Hot Teacher',
  'Naughty Librarian',
  'Nurse',
  'Doctor',
  'Corporate Rebel',
  'Fitness Goddess',
  'Dominatrix',
  'Brat',
  'Submissive',
  'Trophy Wife',
  'Rich Girl',
  'Luxury Muse',
  'Alternative / Tattooed',
  'Gamer Girl',
  'Cosplayer',
  'Spiritual Goddess',
  'MILF',
  'Single Mom',
  'College Girl',
  'Party Girl',
  'Boss Babe',
  'Country Girl',
  'Bimbo',
  'Soft Girlfriend Experience',
  'High-Class Escort Fantasy',
  'Seductress',
  'Artist / Creative Muse',
  'Other',
] as const;
export type CreatorArchetype = (typeof CREATOR_ARCHETYPES)[number];
