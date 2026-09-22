/** Presentation-only compatibility. Never writes historical source records.
 * Match human services, not technical state management or AI agents.
 */
const HUMAN_SERVICE = /\b(coach(?:ing)?|consult(?:ation|ing|ancy)|(?:personal|creator|talent|agent|agency|management|booking) representation|(?:creator|agency)[ -](?:management|supported)|management support|(?:strategy|consultation|advisory) (?:call|discussion|session)|book (?:a |your )?(?:\w+ )?call|schedule (?:a |your )?call|contact (?:us|our|the team)|talk to|speak to|get in touch|personal support|one[ -]to[ -]one|work with (?:us|our team))\b|calendly\.com|mailto:/i;

export function selfServiceReportText(value: string): string {
  return HUMAN_SERVICE.test(value)
    ? 'Use your Personal Vertical Plan workspace to turn this assessment into practical next actions, with guided steps and AI assistance.'
    : value;
}

export function projectSelfServiceReport<T>(value: T): T {
  if (typeof value === 'string') return selfServiceReportText(value) as T;
  if (Array.isArray(value)) return value.map(projectSelfServiceReport) as T;
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, projectSelfServiceReport(item)])
  ) as T;
  return value;
}
