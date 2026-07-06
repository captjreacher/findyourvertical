import type {
  AssessmentResponses,
  CreatorAssessment,
  CreatorAssessmentInviteLink,
  CreatorCompletionNextAction,
  CreatorProfile,
  CreatorReport,
  ReportData,
} from '@/types/creator';

const DEFAULT_STRATEGY_CALL_URL = 'https://calendly.com/mikegrobinson/20-min';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function normalize(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function reportDataFrom(report?: CreatorReport | null): ReportData | null {
  return (report?.report_json as ReportData | undefined) ?? null;
}

function profileIdentityComplete(profile?: CreatorProfile | null, assessment?: CreatorAssessment | null): boolean {
  const responses = assessment?.answers ?? assessment?.responses ?? null;
  const fullName = normalize(profile?.full_name ?? responses?.full_name);
  const email = normalize(profile?.email ?? responses?.email);
  const country = normalize(profile?.country ?? responses?.country);
  return Boolean(fullName && email && country);
}

function hasAgencyInterest(profile?: CreatorProfile | null, reportData?: ReportData | null): boolean {
  if (profile?.status === 'Interested') return true;
  return reportData?.agency_recommendation.agency_priority === 'high';
}

function hasConflict(reportData?: ReportData | null): boolean {
  if (!reportData) return true;
  return (
    reportData.creator_dna_profile?.authenticity_band === 'Potential Conflict'
    || (reportData.internal_agency_scores.brand_risk ?? 0) >= 70
  );
}

function getAgencyScore(
  profile?: CreatorProfile | null,
  assessment?: CreatorAssessment | null,
  reportData?: ReportData | null
): number {
  return reportData?.scores.agency_opportunity
    ?? assessment?.agency_opportunity_score
    ?? profile?.agency_opportunity_score
    ?? 0;
}

export function determineCreatorCompletionNextAction(input: {
  profile?: CreatorProfile | null;
  assessment?: CreatorAssessment | null;
  report?: CreatorReport | null;
  reportData?: ReportData | null;
  invite?: Pick<CreatorAssessmentInviteLink, 'id' | 'invite_code' | 'status' | 'creator_name' | 'creator_email'> | null;
  completedAt?: string;
}): CreatorCompletionNextAction {
  const reportData = input.reportData ?? reportDataFrom(input.report);
  const consent = Boolean(input.profile?.consent_to_contact ?? input.assessment?.responses?.consent ?? input.assessment?.answers?.consent);
  const identityComplete = profileIdentityComplete(input.profile, input.assessment);
  const conflict = hasConflict(reportData);

  if (!consent || !identityComplete || conflict || !reportData) {
    return 'manual_review';
  }

  const agencyScore = getAgencyScore(input.profile, input.assessment, reportData);
  const agencyInterest = hasAgencyInterest(input.profile, reportData);

  if (agencyScore >= 80) {
    return agencyInterest ? 'onboard_to_creator_cockpit' : 'qualify_opportunity';
  }

  if (agencyScore >= 55) {
    return 'qualify_opportunity';
  }

  return 'book_strategy_call';
}

function origin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function configuredUrl(envKey: string, fallback: string): string {
  const value = import.meta.env[envKey];
  const url = normalize(value);
  return url || fallback;
}

export function getCreatorCompletionCta(
  nextAction: CreatorCompletionNextAction,
  profileId?: string | null
): { label: string; href: string } {
  const base = origin();
  const profileReviewUrl = profileId ? `${base}/#/cockpit/creators/${profileId}/review` : `${base}/#/cockpit/creators`;
  const cockpitUrl = `${base}/#/cockpit`;

  const ctaByAction: Record<CreatorCompletionNextAction, { label: string; href: string }> = {
    onboard_to_creator_cockpit: {
      label: 'Open Creator Cockpit',
      href: configuredUrl('VITE_FYV_CREATOR_COCKPIT_URL', cockpitUrl),
    },
    qualify_opportunity: {
      label: 'Qualify opportunity',
      href: configuredUrl('VITE_FYV_QUALIFY_OPPORTUNITY_URL', profileReviewUrl),
    },
    book_strategy_call: {
      label: 'Book strategy call',
      href: configuredUrl('VITE_FYV_STRATEGY_CALL_URL', DEFAULT_STRATEGY_CALL_URL),
    },
    manual_review: {
      label: 'Send to manual review',
      href: configuredUrl('VITE_FYV_MANUAL_REVIEW_URL', profileReviewUrl),
    },
  };

  return ctaByAction[nextAction];
}

export function buildCreatorAssessmentCompletedPayload(input: {
  profile: CreatorProfile;
  invite?: Pick<CreatorAssessmentInviteLink, 'id' | 'invite_code' | 'status' | 'creator_name' | 'creator_email'> | null;
  assessment: CreatorAssessment;
  report: CreatorReport;
  completedAt: string;
  recommendedNextAction: CreatorCompletionNextAction;
}): Record<string, unknown> {
  const reportData = reportDataFrom(input.report);
  const agencyScore = getAgencyScore(input.profile, input.assessment, reportData);

  return {
    creator: {
      id: input.profile.id,
      full_name: input.profile.full_name,
      email: input.profile.email,
      onlyfans_handle: input.profile.onlyfans_handle ?? null,
      country: input.profile.country,
      status: input.profile.status,
      consent_to_contact: input.profile.consent_to_contact,
    },
    invite: input.invite
      ? {
          id: input.invite.id,
          invite_code: input.invite.invite_code,
          status: input.invite.status ?? null,
          creator_name: input.invite.creator_name,
          creator_email: input.invite.creator_email,
        }
      : null,
    assessment: {
      id: input.assessment.id,
      created_at: input.assessment.created_at,
      template_id: input.assessment.template_id,
      template_slug: input.assessment.template_slug,
      invite_code: input.assessment.invite_code,
      invite_link_id: input.assessment.invite_link_id,
      creator_name: input.assessment.creator_name,
      submitted_answers: input.assessment.answers ?? input.assessment.responses,
      agency_opportunity_score: input.assessment.agency_opportunity_score,
    },
    report: {
      id: input.report.id,
      report_slug: input.report.report_slug,
      created_at: input.report.created_at,
      report_tier: input.report.report_tier ?? reportData?.report_tier ?? null,
      premium_report_available: input.report.premium_report_available ?? reportData?.premium_report_available ?? null,
      premium_report_generated: input.report.premium_report_generated ?? reportData?.premium_report_generated ?? null,
    },
    agency_score: agencyScore,
    completed_at: input.completedAt,
    recommended_next_action: input.recommendedNextAction,
  };
}
