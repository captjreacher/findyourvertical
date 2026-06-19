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
  email: string;
  country: string;
  status: CreatorStatus;
  archetype: string;
  creator_dna_score: number;
  brand_clarity_score: number;
  monetisation_score: number;
  consistency_score: number;
  agency_opportunity_score: number;
  management_readiness: ManagementReadiness;
  audience_strategy: AudienceStrategy;
  recommended_pricing_model: string;
  top_vertical_1: string;
  top_vertical_2: string;
  top_vertical_3: string;
  latest_assessment_id: string | null;
  latest_report_id: string | null;
  ofmanager_creator_id: string | null;
  consent_to_contact: boolean;
  consent_at: string | null;
}

// ── Assessment ──
export interface AssessmentResponses {
  strengths: string[];
  comfort_level: number;
  passion_topic: string;
  persona_occupation: string;
  parasocial_comfort: boolean;
  fantasy_keywords: string;
  nudity_level: string;
  niche_interests: string[];
  audience_target: AudienceStrategy | null;
  full_name: string;
  email: string;
  country: string;
  consent: boolean;
  [key: string]: unknown;
}

export type AssessmentQuestionType =
  | 'short_text'
  | 'long_text'
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

export interface CreatorAssessmentRuntimeTemplate extends CreatorAssessmentTemplate {
  questions: CreatorAssessmentQuestion[];
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
  'Luxury Muse',
  'Corporate Rebel',
  'Fitness Tease',
  'Alternative Fantasy',
  'Soft-Girl Companion',
  'Intellectual Seductress',
  'Chaos Gremlin',
] as const;
export type CreatorArchetype = (typeof CREATOR_ARCHETYPES)[number];
