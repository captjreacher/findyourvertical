import type { AssessmentResponses, CreatorDnaProfile } from '@/types/creator';

type WeightedScore = Record<string, number>;

const DNA_LABELS = [
  'Money First',
  'Attention Driven',
  'Validation Seeking',
  'Creative Expression',
  'Sexual Exploration',
  'Freedom & Independence',
  'Connection & Community',
] as const;

const CONSTRAINT_LABELS = [
  'Confidence',
  'Consistency',
  'Boundaries',
  'Planning',
  'Organisation',
  'Content Volume',
  'Monetisation Knowledge',
  'Communication',
] as const;

function text(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function textIncludes(value: unknown, terms: string[]): boolean {
  const source = text(value);
  return terms.some(term => source.includes(term));
}

function add(scores: WeightedScore, label: string, points: number): void {
  scores[label] = (scores[label] ?? 0) + points;
}

function sortedScores(scores: WeightedScore): Array<[string, number]> {
  return Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function confidenceFrom(scores: WeightedScore): number {
  const ranked = sortedScores(scores);
  const top = ranked[0]?.[1] ?? 0;
  const second = ranked[1]?.[1] ?? 0;
  return Math.max(45, Math.min(95, Math.round(55 + (top - second) * 4 + top * 0.6)));
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function strengthSignals(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item));

  const source = text(value);
  if (!source.trim()) return [];

  const signals: string[] = [];
  const addSignal = (signal: string, terms: string[]) => {
    if (terms.some(term => source.includes(term))) signals.push(signal);
  };

  addSignal('My confidence', ['confidence', 'confident', 'camera']);
  addSignal('My communication skills', ['communication', 'communicate', 'chat', 'talk']);
  addSignal('My energy', ['energy', 'energetic', 'high energy']);
  addSignal('My ability to entertain', ['entertain', 'perform', 'funny', 'humor', 'humour']);
  addSignal('My creativity', ['creative', 'creativity', 'ideas']);
  addSignal('My storytelling ability', ['story', 'storytelling']);
  addSignal('My fashion / beauty style', ['fashion', 'beauty', 'style']);
  addSignal('My authenticity', ['authentic', 'real', 'genuine']);
  addSignal('My consistency', ['consistent', 'consistency', 'routine']);
  addSignal('My work ethic', ['work ethic', 'discipline', 'hard work']);

  return [...new Set(signals)];
}

function hasAny(values: string[], candidates: string[]): boolean {
  return values.some(value => candidates.includes(value));
}

function determineCreatorDna(r: AssessmentResponses): Pick<CreatorDnaProfile, 'creator_dna_primary' | 'creator_dna_secondary' | 'confidence'> {
  const motivation = `${text(r.creator_motivation)} ${text(r.passion_topic)}`;
  const scores: WeightedScore = Object.fromEntries(DNA_LABELS.map(label => [label, 0]));

  if (textIncludes(motivation, ['money', 'income', 'cash', 'financial', 'pay', 'earn', 'wealth'])) add(scores, 'Money First', 28);
  if (textIncludes(motivation, ['attention', 'famous', 'seen', 'popular', 'audience', 'followers'])) add(scores, 'Attention Driven', 24);
  if (textIncludes(motivation, ['validation', 'confidence', 'desired', 'wanted', 'admired', 'approved'])) add(scores, 'Validation Seeking', 24);
  if (textIncludes(motivation, ['creative', 'art', 'expression', 'self-expression', 'perform', 'character', 'fashion'])) add(scores, 'Creative Expression', 24);
  if (textIncludes(motivation, ['sexual', 'explore', 'fantasy', 'kink', 'fetish', 'pleasure', 'turned on'])) add(scores, 'Sexual Exploration', 24);
  if (textIncludes(motivation, ['freedom', 'independence', 'control', 'flexible', 'escape', 'own boss'])) add(scores, 'Freedom & Independence', 24);
  if (textIncludes(motivation, ['connection', 'community', 'fans', 'companionship', 'relationships', 'talking'])) add(scores, 'Connection & Community', 24);

  if (r.audience_target === 'whales') add(scores, 'Money First', 12);
  if (r.parasocial_comfort) add(scores, 'Connection & Community', 12);
  if (r.comfort_level >= 8) add(scores, 'Attention Driven', 8);
  if (r.comfort_level <= 4) add(scores, 'Validation Seeking', 6);
  if (r.nudity_level === 'fetish' || r.nudity_level === 'full_nude') add(scores, 'Sexual Exploration', 10);
  if (strengthSignals(r.strengths).some(item => ['My confidence', 'My communication skills', 'My energy', 'My ability to entertain', 'Dancing', 'Public Speaking', 'High-Energy'].includes(item))) add(scores, 'Attention Driven', 8);
  if (strengthSignals(r.strengths).some(item => ['My creativity', 'My storytelling ability', 'My fashion / beauty style', 'Aesthetic/Cozy', 'Specialized Knowledge/Astrology'].includes(item))) add(scores, 'Creative Expression', 8);
  if (text(r.sexual_connection_to_content).includes('business')) add(scores, 'Money First', 10);
  if (text(r.sexual_connection_to_content).includes('strong')) add(scores, 'Sexual Exploration', 12);
  if (text(r.sexual_connection_to_content).includes('some')) add(scores, 'Validation Seeking', 6);

  const ranked = sortedScores(scores);
  return {
    creator_dna_primary: ranked[0]?.[0] ?? 'Creative Expression',
    creator_dna_secondary: ranked[1]?.[0] ?? 'Connection & Community',
    confidence: confidenceFrom(scores),
  };
}

function determineFantasyArchetype(r: AssessmentResponses): Pick<CreatorDnaProfile, 'fantasy_archetype' | 'archetype_confidence'> {
  const archetypes = arrayValue(r.persona_occupation);
  const fantasy = `${text(r.desired_fantasy_image)} ${text(r.fantasy_keywords)} ${text(r.fetish_description)} ${text(r.creator_motivation)} ${archetypes.join(' ')}`;
  const scores: WeightedScore = {
    'Girl Next Door': 0,
    'Innocent Tease': 0,
    'Confident Bombshell': 0,
    'Luxury Muse': 0,
    'Alternative Rebel': 0,
    'Dominant Temptress': 0,
    'Playful Exhibitionist': 0,
    'Fetish Specialist': 0,
  };

  if (textIncludes(fantasy, ['cute', 'soft', 'natural', 'cosy', 'cozy', 'relatable', 'sweet'])) add(scores, 'Girl Next Door', 20);
  if (textIncludes(fantasy, ['innocent', 'shy', 'tease', 'teasing', 'school', 'student'])) add(scores, 'Innocent Tease', 22);
  if (textIncludes(fantasy, ['confident', 'bombshell', 'hot', 'sexy', 'body', 'glam'])) add(scores, 'Confident Bombshell', 22);
  if (textIncludes(fantasy, ['luxury', 'expensive', 'exclusive', 'muse', 'high fashion', 'designer'])) add(scores, 'Luxury Muse', 24);
  if (textIncludes(fantasy, ['alternative', 'alt', 'rebel', 'tattoo', 'goth', 'punk', 'edgy'])) add(scores, 'Alternative Rebel', 22);
  if (textIncludes(fantasy, ['dominant', 'domme', 'control', 'power', 'command', 'temptress'])) add(scores, 'Dominant Temptress', 24);
  if (textIncludes(fantasy, ['playful', 'show off', 'exhibition', 'naughty', 'public', 'flirty'])) add(scores, 'Playful Exhibitionist', 22);
  if (textIncludes(fantasy, ['fetish', 'feet', 'armpit', 'roleplay', 'daddy', 'kink'])) add(scores, 'Fetish Specialist', 26);

  if (r.nudity_level === 'sfw_only' || r.nudity_level === 'teasing_only') add(scores, 'Innocent Tease', 10);
  if (r.nudity_level === 'full_nude') add(scores, 'Confident Bombshell', 10);
  if (r.nudity_level === 'fetish') add(scores, 'Fetish Specialist', 14);
  if (arrayValue(r.niche_interests).includes('High-Fashion')) add(scores, 'Luxury Muse', 14);
  if (arrayValue(r.niche_interests).includes('Roleplay')) add(scores, 'Fetish Specialist', 8);
  if (arrayValue(r.niche_interests).includes('Fitness/Muscle')) add(scores, 'Confident Bombshell', 8);
  if (hasAny(archetypes, ['Girl Next Door', 'Soft Girlfriend Experience'])) add(scores, 'Girl Next Door', 16);
  if (hasAny(archetypes, ['Luxury Muse', 'Rich Girl', 'Trophy Wife', 'High-Class Escort Fantasy'])) add(scores, 'Luxury Muse', 16);
  if (hasAny(archetypes, ['Dominatrix', 'Brat', 'Boss Babe'])) add(scores, 'Dominant Temptress', 16);
  if (hasAny(archetypes, ['Alternative / Tattooed', 'Gamer Girl', 'Cosplayer'])) add(scores, 'Alternative Rebel', 14);
  if (hasAny(archetypes, ['Bimbo', 'Party Girl', 'Seductress'])) add(scores, 'Playful Exhibitionist', 14);
  if (strengthSignals(r.strengths).includes('My authenticity') || strengthSignals(r.strengths).includes('Aesthetic/Cozy')) add(scores, 'Girl Next Door', 10);
  if (strengthSignals(r.strengths).includes('My energy') || strengthSignals(r.strengths).includes('High-Energy')) add(scores, 'Playful Exhibitionist', 8);

  const ranked = sortedScores(scores);
  return {
    fantasy_archetype: ranked[0]?.[0] ?? 'Girl Next Door',
    archetype_confidence: confidenceFrom(scores),
  };
}

function determineAuthenticity(r: AssessmentResponses, fantasyArchetype: string): Pick<CreatorDnaProfile, 'authenticity_band' | 'authenticity_flags'> {
  const flags: string[] = [];
  const sexualConnection = text(r.sexual_connection_to_content);
  const explicitFantasy = ['Confident Bombshell', 'Dominant Temptress', 'Playful Exhibitionist', 'Fetish Specialist'].includes(fantasyArchetype);
  const restrictiveBoundaries = r.nudity_level === 'sfw_only' || r.nudity_level === 'teasing_only';

  if (explicitFantasy && restrictiveBoundaries) flags.push('Strong sexual fantasy positioning with restrictive content boundaries.');
  if (sexualConnection.includes('business') && explicitFantasy) flags.push('Fantasy positioning is sexual but motivation appears mostly business-led.');
  if (r.audience_target === 'whales' && !textIncludes(`${r.desired_fantasy_image} ${r.fantasy_keywords}`, ['luxury', 'exclusive', 'premium', 'elegant', 'high fashion'])) {
    flags.push('Whale audience target without clear premium fantasy signals.');
  }
  if (r.parasocial_comfort === false && r.audience_target === 'masses') flags.push('Mass audience strategy may need more connection-building comfort.');
  if (r.comfort_level <= 4 && r.nudity_level !== 'sfw_only') flags.push('Content intent may exceed current camera confidence.');

  if (flags.length >= 2) return { authenticity_band: 'Potential Conflict', authenticity_flags: flags };
  if (flags.length === 1) return { authenticity_band: 'Moderate Authenticity', authenticity_flags: flags };
  return { authenticity_band: 'High Authenticity', authenticity_flags: [] };
}

function determineGrowthConstraints(r: AssessmentResponses): string[] {
  const weaknesses = text(r.creator_weaknesses);
  const scores: WeightedScore = Object.fromEntries(CONSTRAINT_LABELS.map(label => [label, 0]));

  if (textIncludes(weaknesses, ['confidence', 'camera', 'shy', 'insecure'])) add(scores, 'Confidence', 30);
  if (textIncludes(weaknesses, ['consistent', 'consistency', 'routine', 'discipline'])) add(scores, 'Consistency', 30);
  if (textIncludes(weaknesses, ['boundaries', 'saying no', 'people pleasing'])) add(scores, 'Boundaries', 30);
  if (textIncludes(weaknesses, ['planning', 'plan', 'calendar', 'strategy'])) add(scores, 'Planning', 30);
  if (textIncludes(weaknesses, ['organisation', 'organization', 'organised', 'organized', 'systems'])) add(scores, 'Organisation', 30);
  if (textIncludes(weaknesses, ['content', 'volume', 'posting', 'film', 'ideas'])) add(scores, 'Content Volume', 30);
  if (textIncludes(weaknesses, ['monetisation', 'monetization', 'pricing', 'sales', 'money'])) add(scores, 'Monetisation Knowledge', 30);
  if (textIncludes(weaknesses, ['communication', 'reply', 'dm', 'talking', 'chat'])) add(scores, 'Communication', 30);

  if (r.comfort_level <= 4) add(scores, 'Confidence', 12);
  if (!r.parasocial_comfort) add(scores, 'Communication', 8);
  if (r.nudity_level === 'sfw_only') add(scores, 'Monetisation Knowledge', 6);
  if (!r.passion_topic || r.passion_topic.length < 20) add(scores, 'Planning', 8);
  if (strengthSignals(r.strengths).length < 3) add(scores, 'Content Volume', 6);

  const fallbacks = ['Planning', 'Consistency', 'Content Volume'];
  return sortedScores(scores)
    .filter(([, score]) => score > 0)
    .map(([label]) => label)
    .concat(fallbacks)
    .filter((label, index, self) => self.indexOf(label) === index)
    .slice(0, 3);
}

function determineMonetisationReadiness(r: AssessmentResponses, authenticityBand: CreatorDnaProfile['authenticity_band']): CreatorDnaProfile['monetisation_readiness'] {
  let score = 0;
  if (r.nudity_level === 'fetish' || r.nudity_level === 'full_nude') score += 24;
  else if (r.nudity_level === 'topless') score += 18;
  else if (r.nudity_level === 'teasing_only') score += 10;
  if (r.comfort_level >= 8) score += 18;
  else if (r.comfort_level >= 5) score += 10;
  if (r.audience_target) score += 14;
  if (arrayValue(r.persona_occupation).some(value => value !== 'Other')) score += 10;
  if (r.fantasy_keywords || r.desired_fantasy_image) score += 12;
  if (r.parasocial_comfort) score += 10;
  if (arrayValue(r.niche_interests).length >= 2) score += 8;
  if (authenticityBand === 'Potential Conflict') score -= 14;

  if (score >= 78) return 'Advanced';
  if (score >= 58) return 'Ready';
  if (score >= 35) return 'Developing';
  return 'Low';
}

function determineAgencyScore(
  r: AssessmentResponses,
  monetisationReadiness: CreatorDnaProfile['monetisation_readiness'],
  authenticityBand: CreatorDnaProfile['authenticity_band'],
  growthConstraints: string[]
): Pick<CreatorDnaProfile, 'agency_opportunity_score' | 'agency_opportunity_band'> {
  const coachability = r.consent ? 16 : 6;
  const consistency = (hasAny(strengthSignals(r.strengths), ['My work ethic', 'My consistency', 'My energy', 'High-Energy']) ? 8 : 0) + (r.passion_topic && r.passion_topic.length > 20 ? 10 : 4);
  const professionalism = (r.full_name && r.email && r.country ? 14 : 5) + (growthConstraints.includes('Communication') ? -4 : 4);
  const growthPotential = (r.comfort_level >= 7 ? 14 : r.comfort_level >= 5 ? 9 : 4) + (arrayValue(r.niche_interests).length > 0 ? 6 : 2);
  const brandClarity = (arrayValue(r.persona_occupation).some(value => value !== 'Other') ? 12 : 4) + (r.fantasy_keywords || r.desired_fantasy_image ? 8 : 2);
  const readinessBonus = { Low: 0, Developing: 4, Ready: 8, Advanced: 12 }[monetisationReadiness];
  const authenticityPenalty = authenticityBand === 'Potential Conflict' ? -10 : authenticityBand === 'Moderate Authenticity' ? -3 : 5;
  const score = Math.max(0, Math.min(100, Math.round(coachability + consistency + professionalism + growthPotential + brandClarity + readinessBonus + authenticityPenalty)));

  const agency_opportunity_band =
    score >= 80 ? 'High Priority' :
    score >= 62 ? 'Qualified' :
    score >= 40 ? 'Needs Development' :
    'Not Suitable Yet';

  return { agency_opportunity_score: score, agency_opportunity_band };
}

function summaryFor(profile: Omit<CreatorDnaProfile, 'id' | 'creator_profile_id' | 'assessment_id' | 'created_at'>): string {
  return `${profile.creator_dna_primary} creator with ${profile.fantasy_archetype} positioning, ${profile.authenticity_band.toLowerCase()}, and ${profile.monetisation_readiness.toLowerCase()} monetisation readiness. Top blockers: ${profile.growth_constraints.join(', ')}.`;
}

export function generateCreatorDnaProfile(
  creatorProfileId: string,
  assessmentId: string,
  responses: AssessmentResponses
): Omit<CreatorDnaProfile, 'id' | 'created_at'> {
  const dna = determineCreatorDna(responses);
  const fantasy = determineFantasyArchetype(responses);
  const authenticity = determineAuthenticity(responses, fantasy.fantasy_archetype);
  const growth_constraints = determineGrowthConstraints(responses);
  const monetisation_readiness = determineMonetisationReadiness(responses, authenticity.authenticity_band);
  const agency = determineAgencyScore(responses, monetisation_readiness, authenticity.authenticity_band, growth_constraints);
  const profile = {
    creator_profile_id: creatorProfileId,
    assessment_id: assessmentId,
    ...dna,
    ...fantasy,
    ...authenticity,
    growth_constraints,
    monetisation_readiness,
    ...agency,
    summary: '',
  };

  return {
    ...profile,
    summary: summaryFor(profile),
  };
}
