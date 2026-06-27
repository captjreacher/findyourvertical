// ── Creator DNA Profile Generator ──
// Sprint FYV-3.3 calibrated: archetype names aligned with CREATOR_ARCHETYPES
// from types/creator.ts. Improved keyword coverage and contradiction detection.

import type { AssessmentResponses, CreatorDnaProfile } from '@/types/creator';

type WeightedScore = Record<string, number>;

/* ── DNA Labels ── */
const DNA_LABELS = [
  'Money First',
  'Attention Driven',
  'Validation Seeking',
  'Creative Expression',
  'Sexual Exploration',
  'Freedom & Independence',
  'Connection & Community',
] as const;

/* ── Fantasy Archetypes — aligned with types/creator.ts ── */
const FANTASY_ARCHETYPE_LABELS = [
  'Girl Next Door',
  'Hot Teacher',
  'Naughty Librarian',
  'Nurse',
  'Corporate Rebel',
  'Fitness Goddess',
  'Dominatrix',
  'Brat',
  'Submissive',
  'Trophy Wife',
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
  'Bimbo',
  'Seductress',
  'Soft Girlfriend Experience',
  'High-Class Escort Fantasy',
  'Model / Glamour',
  'Artist / Creative Muse',
] as const;

/* ── Constraint Labels ── */
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

/* ── helpers ── */

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
  return Math.max(40, Math.min(95, Math.round(50 + (top - second) * 3.5 + top * 0.5)));
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function hasAny(values: string[], candidates: string[]): boolean {
  return values.some(value => candidates.includes(value));
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
  addSignal('My fashion / beauty style', ['fashion', 'beauty', 'style', 'glam']);
  addSignal('My authenticity', ['authentic', 'real', 'genuine']);
  addSignal('My consistency', ['consistent', 'consistency', 'routine']);
  addSignal('My work ethic', ['work ethic', 'discipline', 'hard work']);
  addSignal('My fitness', ['fitness', 'sport', 'athletic', 'muscle', 'gym']);
  addSignal('My sensuality', ['sensual', 'sensuality', 'sexual']);
  addSignal('My humour', ['humour', 'humor', 'funny', 'comedy']);
  addSignal('My kindness', ['kind', 'kindness', 'warm', 'empathy']);
  addSignal('My intelligence', ['intelligent', 'smart', 'knowledge', 'expertise']);
  addSignal('My appearance', ['appearance', 'look', 'looks', 'body', 'face']);

  return [...new Set(signals)];
}

/* ═══════════════════════════════════════════════════════════════════════════
   Creator DNA
   ═══════════════════════════════════════════════════════════════════════════ */

function determineCreatorDna(
  r: AssessmentResponses,
): Pick<CreatorDnaProfile, 'creator_dna_primary' | 'creator_dna_secondary' | 'confidence'> {
  const motivation = `${text(r.creator_motivation)} ${text(r.passion_topic)}`;
  const scores: WeightedScore = Object.fromEntries(
    DNA_LABELS.map(label => [label, 0]),
  );

  // Keyword-based scoring from motivation text
  if (textIncludes(motivation, ['money', 'income', 'cash', 'financial', 'pay', 'earn', 'wealth'])) add(scores, 'Money First', 28);
  if (textIncludes(motivation, ['attention', 'famous', 'seen', 'popular', 'audience', 'followers'])) add(scores, 'Attention Driven', 24);
  if (textIncludes(motivation, ['validation', 'confidence', 'desired', 'wanted', 'admired', 'approved'])) add(scores, 'Validation Seeking', 24);
  if (textIncludes(motivation, ['creative', 'art', 'expression', 'self-expression', 'perform', 'character', 'fashion'])) add(scores, 'Creative Expression', 24);
  if (textIncludes(motivation, ['sexual', 'explore', 'fantasy', 'kink', 'fetish', 'pleasure', 'turned on'])) add(scores, 'Sexual Exploration', 24);
  if (textIncludes(motivation, ['freedom', 'independence', 'control', 'flexible', 'escape', 'own boss'])) add(scores, 'Freedom & Independence', 24);
  if (textIncludes(motivation, ['connection', 'community', 'fans', 'companionship', 'relationships', 'talking'])) add(scores, 'Connection & Community', 24);

  // Behaviour-based bonuses
  if (r.audience_target === 'whales') add(scores, 'Money First', 12);
  if (r.parasocial_comfort) add(scores, 'Connection & Community', 14);
  if (r.comfort_level >= 8) add(scores, 'Attention Driven', 8);
  if (r.comfort_level <= 4) add(scores, 'Validation Seeking', 6);
  if (r.nudity_level === 'fetish' || r.nudity_level === 'full_nude') add(scores, 'Sexual Exploration', 10);

  const strengths = strengthSignals(r.strengths);
  if (hasAny(strengths, ['My confidence', 'My communication skills', 'My energy', 'My ability to entertain', 'My humour'])) add(scores, 'Attention Driven', 8);
  if (hasAny(strengths, ['My creativity', 'My storytelling ability', 'My fashion / beauty style'])) add(scores, 'Creative Expression', 10);
  if (hasAny(strengths, ['My authenticity', 'My kindness'])) add(scores, 'Connection & Community', 8);
  if (hasAny(strengths, ['My sensuality', 'My appearance'])) add(scores, 'Sexual Exploration', 6);

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

/* ═══════════════════════════════════════════════════════════════════════════
   Fantasy Archetype (aligned with types/creator.ts CREATOR_ARCHETYPES)
   ═══════════════════════════════════════════════════════════════════════════ */

function determineFantasyArchetype(
  r: AssessmentResponses,
): Pick<CreatorDnaProfile, 'fantasy_archetype' | 'archetype_confidence'> {
  const archetypes = arrayValue(r.persona_occupation);
  const fantasy = `${text(r.desired_fantasy_image)} ${text(r.fantasy_keywords)} ${text(r.fetish_description)} ${text(r.creator_motivation)} ${archetypes.join(' ')}`;
  const scores: WeightedScore = Object.fromEntries(
    FANTASY_ARCHETYPE_LABELS.map(label => [label, 0]),
  );

  // Keyword → archetype mapping
  if (textIncludes(fantasy, ['cute', 'soft', 'natural', 'cosy', 'cozy', 'relatable', 'sweet'])) add(scores, 'Girl Next Door', 20);
  if (textIncludes(fantasy, ['innocent', 'shy', 'tease', 'teasing', 'school', 'student'])) add(scores, 'Hot Teacher', 22);
  if (textIncludes(fantasy, ['confident', 'bombshell', 'hot', 'sexy', 'body', 'glam', 'glamour'])) add(scores, 'Seductress', 22);
  if (textIncludes(fantasy, ['luxury', 'expensive', 'exclusive', 'muse', 'high fashion', 'designer'])) add(scores, 'Luxury Muse', 24);
  if (textIncludes(fantasy, ['alternative', 'alt', 'rebel', 'tattoo', 'goth', 'punk', 'edgy'])) add(scores, 'Alternative / Tattooed', 22);
  if (textIncludes(fantasy, ['dominant', 'domme', 'control', 'power', 'command', 'temptress', 'boss'])) add(scores, 'Dominatrix', 24);
  if (textIncludes(fantasy, ['submissive', 'sub', 'obey', 'surrender'])) add(scores, 'Submissive', 24);
  if (textIncludes(fantasy, ['playful', 'show off', 'exhibition', 'naughty', 'public', 'flirty'])) add(scores, 'Party Girl', 20);
  if (textIncludes(fantasy, ['fetish', 'feet', 'armpit', 'roleplay', 'daddy', 'kink', 'specialist'])) add(scores, 'Dominatrix', 22);
  if (textIncludes(fantasy, ['mom', 'mother', 'milf', 'mature', 'experienced'])) add(scores, 'MILF', 24);
  if (textIncludes(fantasy, ['fitness', 'fit', 'gym', 'athletic', 'muscle', 'sport'])) add(scores, 'Fitness Goddess', 24);
  if (textIncludes(fantasy, ['spiritual', 'goddess', 'meditation', 'mystic', 'witch', 'tarot'])) add(scores, 'Spiritual Goddess', 24);
  if (textIncludes(fantasy, ['gamer', 'game', 'gaming', 'geek', 'nerd', 'anime'])) add(scores, 'Gamer Girl', 22);
  if (textIncludes(fantasy, ['artist', 'art', 'paint', 'creative muse', 'creative', 'photography'])) add(scores, 'Artist / Creative Muse', 22);
  if (textIncludes(fantasy, ['bimbo', 'dumb', 'dumb blonde', 'plastic'])) add(scores, 'Bimbo', 24);
  if (textIncludes(fantasy, ['boss', 'babe', 'ceo', 'entrepreneur', 'business'])) add(scores, 'Boss Babe', 22);
  if (textIncludes(fantasy, ['college', 'university', 'sorority'])) add(scores, 'College Girl', 24);
  if (textIncludes(fantasy, ['brat', 'spoiled', 'demanding'])) add(scores, 'Brat', 24);
  if (textIncludes(fantasy, ['nurse', 'doctor', 'medical'])) add(scores, 'Nurse', 20);
  if (textIncludes(fantasy, ['librarian', 'nerd', 'studious'])) add(scores, 'Naughty Librarian', 20);
  if (textIncludes(fantasy, ['party', 'nightlife', 'club', 'wild', 'drinking'])) add(scores, 'Party Girl', 22);
  if (textIncludes(fantasy, ['trophy', 'rich girl', 'escort', 'high class', 'elite'])) add(scores, 'High-Class Escort Fantasy', 22);
  if (textIncludes(fantasy, ['girlfriend', 'gf experience', 'soft', 'girlfriend', 'caring'])) add(scores, 'Soft Girlfriend Experience', 22);
  if (textIncludes(fantasy, ['country', 'farm', 'cowgirl', 'outdoors'])) add(scores, 'Country Girl', 22);
  if (textIncludes(fantasy, ['cosplay', 'cosplayer', 'costume'])) add(scores, 'Cosplayer', 24);
  if (textIncludes(fantasy, ['corporate', 'office', 'rebel', 'professional'])) add(scores, 'Corporate Rebel', 20);

  // Boundary & interest modifiers
  if (r.nudity_level === 'sfw_only' || r.nudity_level === 'teasing_only') add(scores, 'Girl Next Door', 10);
  if (r.nudity_level === 'full_nude') add(scores, 'Seductress', 10);
  if (r.nudity_level === 'fetish') add(scores, 'Dominatrix', 14);
  if (arrayValue(r.niche_interests).includes('High-Fashion')) add(scores, 'Luxury Muse', 14);
  if (arrayValue(r.niche_interests).includes('Roleplay')) add(scores, 'Cosplayer', 10);
  if (arrayValue(r.niche_interests).includes('Fitness/Muscle')) add(scores, 'Fitness Goddess', 12);

  // Explicit archetype selects
  for (const a of archetypes) {
    if (FANTASY_ARCHETYPE_LABELS.includes(a as any)) {
      add(scores, a, 16);
    }
  }

  // Strength signal bonuses
  const strengths = strengthSignals(r.strengths);
  if (hasAny(strengths, ['My authenticity', 'My kindness'])) add(scores, 'Girl Next Door', 10);
  if (hasAny(strengths, ['My energy', 'My humour'])) add(scores, 'Party Girl', 8);
  if (hasAny(strengths, ['My fitness'])) add(scores, 'Fitness Goddess', 12);
  if (hasAny(strengths, ['My fashion / beauty style', 'My appearance'])) add(scores, 'Luxury Muse', 10);
  if (hasAny(strengths, ['My intelligence', 'My creativity'])) add(scores, 'Artist / Creative Muse', 8);
  if (hasAny(strengths, ['My sensuality'])) add(scores, 'Seductress', 10);

  const ranked = sortedScores(scores);
  return {
    fantasy_archetype: ranked[0]?.[0] ?? 'Girl Next Door',
    archetype_confidence: confidenceFrom(scores),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Authenticity
   ═══════════════════════════════════════════════════════════════════════════ */

function determineAuthenticity(
  r: AssessmentResponses,
  fantasyArchetype: string,
): Pick<CreatorDnaProfile, 'authenticity_band' | 'authenticity_flags'> {
  const flags: string[] = [];
  const sexualConnection = text(r.sexual_connection_to_content);
  const explicitFantasy = [
    'Seductress', 'Dominatrix', 'Party Girl', 'Bimbo',
    'High-Class Escort Fantasy',
  ].includes(fantasyArchetype);
  const restrictiveBoundaries =
    r.nudity_level === 'sfw_only' || r.nudity_level === 'teasing_only';

  if (explicitFantasy && restrictiveBoundaries)
    flags.push('Strong sexual fantasy positioning with restrictive content boundaries.');
  if (sexualConnection.includes('business') && explicitFantasy)
    flags.push('Fantasy positioning is sexual but motivation appears mostly business-led.');
  if (
    r.audience_target === 'whales' &&
    !textIncludes(
      `${r.desired_fantasy_image} ${r.fantasy_keywords}`,
      ['luxury', 'exclusive', 'premium', 'elegant', 'high fashion'],
    )
  )
    flags.push('Whale audience target without clear premium fantasy signals.');
  if (r.parasocial_comfort === false && r.audience_target === 'masses')
    flags.push('Mass audience strategy may need more connection-building comfort.');
  if (r.comfort_level <= 4 && r.nudity_level !== 'sfw_only')
    flags.push('Content intent may exceed current camera confidence.');

  if (flags.length >= 2)
    return { authenticity_band: 'Potential Conflict', authenticity_flags: flags };
  if (flags.length === 1)
    return { authenticity_band: 'Moderate Authenticity', authenticity_flags: flags };
  return { authenticity_band: 'High Authenticity', authenticity_flags: [] };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Growth Constraints
   ═══════════════════════════════════════════════════════════════════════════ */

function determineGrowthConstraints(r: AssessmentResponses): string[] {
  const weaknesses = text(r.creator_weaknesses);
  const scores: WeightedScore = Object.fromEntries(
    CONSTRAINT_LABELS.map(label => [label, 0]),
  );

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

/* ═══════════════════════════════════════════════════════════════════════════
   Monetisation Readiness
   ═══════════════════════════════════════════════════════════════════════════ */

function determineMonetisationReadiness(
  r: AssessmentResponses,
  authenticityBand: CreatorDnaProfile['authenticity_band'],
): CreatorDnaProfile['monetisation_readiness'] {
  let score = 0;
  if (r.nudity_level === 'fetish' || r.nudity_level === 'full_nude') score += 24;
  else if (r.nudity_level === 'topless') score += 18;
  else if (r.nudity_level === 'teasing_only') score += 10;
  if (r.comfort_level >= 8) score += 18;
  else if (r.comfort_level >= 5) score += 10;
  if (r.audience_target) score += 14;
  if (arrayValue(r.persona_occupation).some(v => v !== 'Other')) score += 10;
  if (r.fantasy_keywords || r.desired_fantasy_image) score += 12;
  if (r.parasocial_comfort) score += 10;
  if (arrayValue(r.niche_interests).length >= 2) score += 8;
  if (authenticityBand === 'Potential Conflict') score -= 14;

  if (score >= 78) return 'Advanced';
  if (score >= 58) return 'Ready';
  if (score >= 35) return 'Developing';
  return 'Low';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Agency Score
   ═══════════════════════════════════════════════════════════════════════════ */

function determineAgencyScore(
  r: AssessmentResponses,
  monetisationReadiness: CreatorDnaProfile['monetisation_readiness'],
  authenticityBand: CreatorDnaProfile['authenticity_band'],
  growthConstraints: string[],
): Pick<CreatorDnaProfile, 'agency_opportunity_score' | 'agency_opportunity_band'> {
  const strengths = strengthSignals(r.strengths);

  const coachability = r.consent ? 16 : 6;
  const consistency =
    (hasAny(strengths, ['My work ethic', 'My consistency', 'My energy']) ? 8 : 0) +
    (r.passion_topic && r.passion_topic.length > 20 ? 10 : 4);
  const professionalism =
    (r.full_name && r.email && r.country ? 14 : 5) +
    (growthConstraints.includes('Communication') ? -4 : 4);
  const growthPotential =
    (r.comfort_level >= 7 ? 14 : r.comfort_level >= 5 ? 9 : 4) +
    (arrayValue(r.niche_interests).length > 0 ? 6 : 2);
  const brandClarity =
    (arrayValue(r.persona_occupation).some(v => v !== 'Other') ? 12 : 4) +
    (r.fantasy_keywords || r.desired_fantasy_image ? 8 : 2);
  const readinessBonus: Record<string, number> = {
    Low: 0, Developing: 4, Ready: 8, Advanced: 12,
  };
  const bonus = readinessBonus[monetisationReadiness] ?? 0;
  const authenticityPenalty =
    authenticityBand === 'Potential Conflict'
      ? -10
      : authenticityBand === 'Moderate Authenticity'
        ? -3
        : 5;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        coachability + consistency + professionalism + growthPotential +
        brandClarity + bonus + authenticityPenalty,
      ),
    ),
  );

  const band =
    score >= 80
      ? 'High Priority'
      : score >= 62
        ? 'Qualified'
        : score >= 40
          ? 'Needs Development'
          : 'Not Suitable Yet';

  return { agency_opportunity_score: score, agency_opportunity_band: band };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Summary
   ═══════════════════════════════════════════════════════════════════════════ */

function summaryFor(
  profile: Omit<CreatorDnaProfile, 'id' | 'creator_profile_id' | 'assessment_id' | 'created_at'>,
): string {
  return `${profile.creator_dna_primary} creator with ${profile.fantasy_archetype} positioning, ${profile.authenticity_band.toLowerCase()}, and ${profile.monetisation_readiness.toLowerCase()} monetisation readiness. Top growth areas: ${profile.growth_constraints.join(', ')}.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════════════════════════ */

export function generateCreatorDnaProfile(
  creatorProfileId: string,
  assessmentId: string,
  responses: AssessmentResponses,
): Omit<CreatorDnaProfile, 'id' | 'created_at'> {
  const dna = determineCreatorDna(responses);
  const fantasy = determineFantasyArchetype(responses);
  const authenticity = determineAuthenticity(responses, fantasy.fantasy_archetype);
  const growth_constraints = determineGrowthConstraints(responses);
  const monetisation_readiness = determineMonetisationReadiness(
    responses,
    authenticity.authenticity_band,
  );
  const agency = determineAgencyScore(
    responses,
    monetisation_readiness,
    authenticity.authenticity_band,
    growth_constraints,
  );

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
