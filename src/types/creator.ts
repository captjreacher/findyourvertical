// ── Creator Profile (primary entity) ──
export type CreatorStatus =
  | 'prospect'
  | 'assessed'
  | 'qualified'
  | 'interviewed'
  | 'accepted'
  | 'onboarding'
  | 'active'
  | 'paused'
  | 'offboarded';

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
  | 'scale';

export type AssessmentQuestionOption =
  | string
  | {
      value: string;
      label: string;
      description?: string;
      is_active?: boolean;
    };

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
  show_when_operator: 'equals' | 'includes';
  options: AssessmentQuestionOption[];
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatorAssessmentTemplate {
  id: string;
  name: string;
  description: string | null;
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
}

export interface CreatorAssessment {
  id: string;
  creator_profile_id: string;
  created_at: string;
  responses: AssessmentResponses;
  assessment_snapshot: {
    template_id: string;
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
export type PremiumReportStatus = 'not_started' | 'available' | 'purchased' | 'delivered';

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
  pricing_strategy: string;
  winning_10_framework: string;
  growth_strategy: string;
  tech_stack: { tool: string; purpose: string }[];
  management_readiness: ManagementReadiness;
  day_90_plan: { phase: string; focus: string; actions: string[] }[];
  creator_dna_profile?: Omit<CreatorDnaProfile, 'id' | 'created_at'>;
  why_this_result: {
    summary: string;
    top_signals: string[];
    strongest_answers: string[];
    key_differentiators: string[];
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
  free_report_summary: string;
  premium_report_available: boolean;
  premium_report_status: PremiumReportStatus;
}

export interface CreatorReport {
  id: string;
  creator_profile_id: string;
  created_at: string;
  report_slug: string;
  report_json: ReportData;
  version: string;
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
