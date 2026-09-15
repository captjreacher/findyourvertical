/** Versioned interpretation only. Never replace the stored raw answers. */
export const ANSWER_INTERPRETATION_VERSION = 'fyv/answers/v2';
export function normalizeAssessmentEvidence<T extends Record<string, unknown>>(raw: T): T {
  const result: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'selectedOptionIds' in value) {
      result[key] = (value as { selectedOptionIds: unknown }).selectedOptionIds;
    }
  }
  const aliases: Record<string, string> = {
    what_is_it_that_you_re_most_passionate_about: 'passion_topic',
  };
  for (const [source, target] of Object.entries(aliases)) {
    if (!result[target] && result[source]) result[target] = result[source];
  }
  const niches: Record<string, string> = {
    fitness_muscle: 'Fitness/Muscle', high_fashion: 'High-Fashion', roleplay: 'Roleplay',
    daddy_dynamic: 'Daddy dynamic', feet: 'Feet', armpits: 'Armpits',
  };
  if (Array.isArray(result.niche_interests)) {
    result.niche_interests = result.niche_interests.map(v => niches[String(v)] ?? v);
  }
  // Do not collapse nuanced content boundaries into more permissive legacy enums.
  return result as T;
}

export const ADMINISTRATIVE_ANSWER_KEYS = new Set([
  'full_name', 'first_name', 'last_name', 'email', 'country', 'city', 'model_name',
  'onlyfans_handle', 'consent', 'mailing_list_opt_out',
]);

export function reportForAssessment<T extends { assessment_id?: string | null }>(
  assessmentId: string, reports: T[],
): T | null {
  // Older reports without a proven association remain in report history.
  return reports.find(report => report.assessment_id === assessmentId) ?? null;
}
