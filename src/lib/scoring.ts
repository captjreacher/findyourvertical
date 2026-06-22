import type {
  AssessmentResponses,
  CreatorArchetype,
  ContentVertical,
  ManagementReadiness,
  ReportData,
} from '@/types/creator';

export interface ScoreBreakdown {
  creator_dna: number;
  brand_clarity: number;
  monetisation: number;
  consistency: number;
  agency_opportunity: number;
}

export interface ScoringResult {
  scores: ScoreBreakdown;
  archetype: CreatorArchetype;
  archetype_description: string;
  archetype_strengths: string[];
  archetype_risks: string[];
  archetype_growth: string[];
  top_verticals: { name: ContentVertical; rationale: string }[];
  management_readiness: ManagementReadiness;
  pricing_strategy: string;
  winning_10_framework: string;
  growth_strategy: string;
  tech_stack: { tool: string; purpose: string }[];
  day_90_plan: { phase: string; focus: string; actions: string[] }[];
  why_this_result: ReportData['why_this_result'];
  internal_agency_scores: ReportData['internal_agency_scores'];
  agency_recommendation: ReportData['agency_recommendation'];
  free_report_summary: string;
  premium_report_available: boolean;
  premium_report_status: ReportData['premium_report_status'];
}

type ArchetypeDetails = Pick<ReportData, 'archetype_description' | 'archetype_strengths' | 'archetype_risks' | 'archetype_growth'>;

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : value ? [String(value)] : [];
}

function textValue(value: unknown): string {
  return String(value ?? '').trim();
}

function textIncludes(value: unknown, terms: string[]): boolean {
  const source = textValue(value).toLowerCase();
  return terms.some(term => source.includes(term));
}

function strengthSignals(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item));

  const text = textValue(value);
  if (!text) return [];

  const signals: string[] = [];
  const addSignal = (signal: string, terms: string[]) => {
    if (textIncludes(text, terms)) signals.push(signal);
  };

  addSignal('My appearance', ['appearance', 'look', 'looks', 'body', 'face', 'unique look']);
  addSignal('My confidence', ['confidence', 'confident', 'camera confident', 'camera confidence']);
  addSignal('My humour', ['humour', 'humor', 'funny', 'comedy']);
  addSignal('My intelligence', ['intelligence', 'smart', 'knowledge', 'expertise']);
  addSignal('My kindness', ['kind', 'kindness', 'warm']);
  addSignal('My creativity', ['creative', 'creativity', 'ideas']);
  addSignal('My fitness', ['fitness', 'sport', 'athletic', 'muscle']);
  addSignal('My sensuality', ['sensual', 'sensuality', 'sexual']);
  addSignal('My authenticity', ['authentic', 'authenticity', 'real', 'genuine']);
  addSignal('My storytelling ability', ['story', 'storytelling', 'stories']);
  addSignal('My communication skills', ['communication', 'communicate', 'talking', 'chat']);
  addSignal('My ability to connect with people', ['connection', 'connect', 'fan connection', 'fans']);
  addSignal('My fashion / beauty style', ['fashion', 'beauty', 'style']);
  addSignal('My energy', ['energy', 'high energy', 'energetic']);
  addSignal('My work ethic', ['work ethic', 'discipline', 'hard work']);
  addSignal('My consistency', ['consistency', 'consistent', 'routine']);
  addSignal('My niche expertise', ['niche', 'expertise', 'specialist']);
  addSignal('My ability to entertain', ['entertain', 'entertaining', 'perform']);

  return signals.length > 0 ? [...new Set(signals)] : text.split(/[,\n.;]+/).map(item => item.trim()).filter(Boolean).slice(0, 3);
}

function hasAny(values: string[], candidates: string[]): boolean {
  return values.some(value => candidates.includes(value));
}

function selectedArchetypes(r: AssessmentResponses): string[] {
  return arrayValue(r.persona_occupation).filter(value => value && value !== 'Other');
}

function scoreFrom(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function computeCreatorDNA(r: AssessmentResponses): number {
  const strengths = strengthSignals(r.strengths);
  let score = 50 + r.comfort_level * 3;

  if (hasAny(strengths, ['My humour', 'Humor'])) score += 10;
  if (hasAny(strengths, ['My confidence', 'My sensuality'])) score += 8;
  if (hasAny(strengths, ['My communication skills', 'My ability to connect with people', 'Public Speaking'])) score += 10;
  if (hasAny(strengths, ['My energy', 'High-Energy'])) score += 8;
  if (hasAny(strengths, ['My creativity', 'My storytelling ability', 'My ability to entertain'])) score += 8;
  score += Math.min((r.fantasy_keywords?.split(',').length ?? 0) * 2, 10);

  return scoreFrom(score);
}

function computeBrandClarity(r: AssessmentResponses): number {
  const strengths = strengthSignals(r.strengths);
  let score = 40;

  if (selectedArchetypes(r).length > 0) score += 15;
  if (r.niche_interests.length >= 2) score += 12;
  else if (r.niche_interests.length === 1) score += 6;
  if (r.nudity_level !== 'undecided') score += 10;
  if (r.fantasy_keywords) score += 8;
  if (hasAny(strengths, ['My intelligence', 'My niche expertise', 'Specialized Knowledge/Astrology'])) score += 10;

  return scoreFrom(score);
}

function computeMonetisation(r: AssessmentResponses): number {
  let score = 30;

  if (r.audience_target === 'whales') score += 20;
  else score += 10;
  if (r.parasocial_comfort) score += 15;
  if (r.nudity_level === 'full_nude' || r.nudity_level === 'fetish') score += 15;
  else if (r.nudity_level === 'topless') score += 10;
  if (r.niche_interests.includes('Roleplay') || r.niche_interests.includes('Daddy dynamic')) score += 10;
  if (r.comfort_level >= 7) score += 10;

  return scoreFrom(score);
}

function computeConsistency(r: AssessmentResponses): number {
  const strengths = strengthSignals(r.strengths);
  let score = 50;

  if (hasAny(strengths, ['My work ethic', 'My consistency'])) score += 15;
  if (hasAny(strengths, ['My energy', 'High-Energy'])) score += 8;
  if (r.passion_topic && r.passion_topic.length > 20) score += 10;
  if (selectedArchetypes(r).length > 0) score += 10;
  if (r.audience_target === 'masses') score += 10;
  if (r.consent) score += 5;

  return scoreFrom(score);
}

function computeAgencyOpportunity(r: AssessmentResponses, scores: ScoreBreakdown): number {
  const avg = (scores.creator_dna + scores.brand_clarity + scores.monetisation + scores.consistency) / 4;
  let score = Math.round(avg * 0.7);

  if (r.consent) score += 10;
  if (r.audience_target === 'whales') score += 8;
  if (r.comfort_level >= 7) score += 7;
  if (strengthSignals(r.strengths).length >= 3) score += 5;

  return scoreFrom(score);
}

function scoreTextDepth(value: unknown, max = 20): number {
  const wordCount = textValue(value).split(/\s+/).filter(Boolean).length;
  return Math.min(wordCount * 3, max);
}

function includesFutureImprovement(values: string[], terms: string[]): boolean {
  return values.some(value => textIncludes(value, terms));
}

function determineArchetype(r: AssessmentResponses): CreatorArchetype {
  const archetypes = selectedArchetypes(r);
  const strengths = strengthSignals(r.strengths);

  if (archetypes.length > 0) return archetypes[0] as CreatorArchetype;
  if (hasAny(strengths, ['My fitness', 'Specific Sport'])) return 'Fitness Goddess';
  if (hasAny(strengths, ['My fashion / beauty style', 'My appearance'])) return 'Luxury Muse';
  if (hasAny(strengths, ['My intelligence', 'My niche expertise', 'Specialized Knowledge/Astrology'])) return 'Hot Teacher';
  if (hasAny(strengths, ['My kindness', 'My authenticity', 'My ability to connect with people'])) return 'Soft Girlfriend Experience';
  if (r.nudity_level === 'fetish') return 'Dominatrix';
  if (r.nudity_level === 'sfw_only' || r.nudity_level === 'teasing_only') return 'Girl Next Door';
  return 'Seductress';
}

function detailFor(archetype: CreatorArchetype): ArchetypeDetails {
  const details: Partial<Record<CreatorArchetype, ArchetypeDetails>> = {
    'Girl Next Door': {
      archetype_description: 'Relatable, approachable, and emotionally familiar. This positioning builds trust through natural intimacy and everyday access.',
      archetype_strengths: ['High parasocial trust', 'Broad audience appeal', 'Strong retention potential', 'Easy lifestyle content fit'],
      archetype_risks: ['Can become too generic without a clear hook', 'Requires consistent connection-building', 'May need stronger premium positioning'],
      archetype_growth: ['Build repeatable lifestyle formats', 'Create intimacy-led retention offers', 'Use story-led short-form content to drive discovery'],
    },
    'Luxury Muse': {
      archetype_description: 'Aspirational, polished, and premium. This creator identity works best when content feels selective, high-value, and visually elevated.',
      archetype_strengths: ['Premium pricing power', 'Strong visual positioning', 'Whale audience alignment', 'Brand partnership potential'],
      archetype_risks: ['Higher production expectations', 'Smaller but more demanding audience', 'Must maintain a consistent luxury signal'],
      archetype_growth: ['Develop editorial shoot formats', 'Package premium PPV offers', 'Use scarcity and exclusivity in promotions'],
    },
    'Fitness Goddess': {
      archetype_description: 'Body-led, disciplined, and high-energy. Fitness positioning creates a natural content engine through routines, progress, and physical confidence.',
      archetype_strengths: ['Built-in content formats', 'Strong consistency signal', 'Visual transformation hooks', 'Brand-safe crossover potential'],
      archetype_risks: ['Body-image pressure', 'Niche can flatten without personality', 'Requires regular content cadence'],
      archetype_growth: ['Build challenge content', 'Create workout-adjacent verticals', 'Pair fitness authority with personality-led storylines'],
    },
    'Corporate Rebel': {
      archetype_description: 'Professional polish with a rebellious edge. This identity works when authority, ambition, and controlled provocation are part of the fantasy.',
      archetype_strengths: ['Strong narrative contrast', 'Authority-driven positioning', 'High curiosity factor', 'Clear character hook'],
      archetype_risks: ['Reputation risk if boundaries are unclear', 'Can polarise audiences', 'Needs careful separation from real-world identity'],
      archetype_growth: ['Use workplace-coded storylines', 'Build authority-led short-form hooks', 'Create premium fantasy sets around power and control'],
    },
    'Dominatrix': {
      archetype_description: 'Commanding, controlled, and power-led. This archetype monetises through authority, boundaries, and clear fantasy structure.',
      archetype_strengths: ['Strong niche loyalty', 'High custom content potential', 'Clear premium fantasy', 'Boundary clarity'],
      archetype_risks: ['Requires confident delivery', 'Potential brand-safety concerns', 'Niche expectations can be specific'],
      archetype_growth: ['Define clear menu boundaries', 'Create ritualised recurring formats', 'Use premium custom pathways for qualified fans'],
    },
    'Soft Girlfriend Experience': {
      archetype_description: 'Warm, attentive, and connection-led. This creator identity is strongest when emotional intimacy and personal attention are the product.',
      archetype_strengths: ['High retention potential', 'Strong DM monetisation fit', 'Audience loyalty', 'Natural parasocial strength'],
      archetype_risks: ['Emotional labour load', 'Boundary management', 'Can be hard to scale without systems'],
      archetype_growth: ['Create sustainable connection routines', 'Segment high-value fans', 'Build repeatable soft-intimacy content series'],
    },
    'Artist / Creative Muse': {
      archetype_description: 'Expressive, aesthetic, and concept-led. This identity turns creativity and personal taste into a differentiated creator world.',
      archetype_strengths: ['Distinctive visual identity', 'Strong creative hooks', 'Cross-platform potential', 'Memorable positioning'],
      archetype_risks: ['Can overcomplicate content production', 'May need clearer monetisation offers', 'Requires consistent creative direction'],
      archetype_growth: ['Build recurring visual themes', 'Test character-led concepts', 'Turn creative process into content'],
    },
  };

  return details[archetype] ?? {
    archetype_description: `${archetype} positioning gives your content a clear fantasy, role, or identity that fans can understand quickly.`,
    archetype_strengths: ['Clear character signal', 'Strong roleplay potential', 'Differentiated creator identity', 'Audience expectation clarity'],
    archetype_risks: ['Needs consistent execution', 'Requires clear personal boundaries', 'May need testing to find the strongest monetisation angle'],
    archetype_growth: ['Test three recurring content formats', 'Clarify the fantasy in bio and pinned content', 'Use fan response to refine the character angle'],
  };
}

function determineVerticals(r: AssessmentResponses, archetype: CreatorArchetype): { name: ContentVertical; rationale: string }[] {
  const results: { name: ContentVertical; rationale: string }[] = [];
  const strengths = strengthSignals(r.strengths);

  if (hasAny(strengths, ['My fitness', 'Specific Sport']) || r.niche_interests.includes('Fitness/Muscle') || archetype === 'Fitness Goddess') {
    results.push({ name: 'Fitness Journey', rationale: 'Fitness and body confidence create repeatable visual content with built-in progression hooks.' });
  }
  if (hasAny(strengths, ['My storytelling ability', 'My communication skills', 'My humour', 'Humor'])) {
    results.push({ name: 'Confessional Storytime', rationale: 'Communication and storytelling strengths support personality-led content that builds fan connection.' });
  }
  if (hasAny(strengths, ['My fashion / beauty style', 'My appearance']) || r.niche_interests.includes('High-Fashion') || archetype === 'Luxury Muse') {
    results.push({ name: 'Editorial / High-Fashion Shoots', rationale: 'A strong visual style supports premium, aspirational content and higher-value positioning.' });
  }
  if (r.niche_interests.includes('Roleplay') || ['Dominatrix', 'Brat', 'Submissive', 'Hot Teacher', 'Naughty Librarian', 'Nurse', 'Doctor', 'Cosplayer'].includes(archetype)) {
    results.push({ name: 'Roleplay / Character Content', rationale: 'Character-led archetypes create reusable fantasy formats and clearer subscriber expectations.' });
  }
  if (hasAny(strengths, ['My authenticity', 'My kindness', 'My ability to connect with people']) || archetype === 'Girl Next Door' || archetype === 'Soft Girlfriend Experience') {
    results.push({ name: 'Cosy Authenticity', rationale: 'Authenticity and connection are strong retention signals for relationship-led creator content.' });
  }
  if (hasAny(strengths, ['My energy', 'My ability to entertain', 'High-Energy'])) {
    results.push({ name: 'Comedy Skits', rationale: 'High energy and entertainment value create short-form formats with strong discovery potential.' });
  }

  const fallbacks: { name: ContentVertical; rationale: string }[] = [
    { name: 'Tease & Deny', rationale: 'Build anticipation through previews, countdowns, and limited-time unlocks that gamify the fan experience.' },
    { name: 'Lifestyle Vlogging / GRWM', rationale: 'Document your routine to build familiarity, trust, and repeat viewing habits.' },
    { name: 'Confessional Storytime', rationale: 'Use personal stories to create emotional connection and parasocial investment.' },
  ];

  for (const fallback of fallbacks) {
    if (results.length >= 3) break;
    if (!results.some(result => result.name === fallback.name)) results.push(fallback);
  }

  return results.slice(0, 3);
}

function determineReadiness(r: AssessmentResponses, scores: ScoreBreakdown): ManagementReadiness {
  const avg = (scores.agency_opportunity + scores.consistency + scores.brand_clarity) / 3;
  if (avg >= 70 && scores.agency_opportunity >= 65 && r.consent) return 'Scale Candidate';
  if (avg >= 55 && r.comfort_level >= 5) return 'Ready Now';
  if (avg >= 35) return 'Needs Foundation';
  return 'Hobby Creator';
}

function generatePlan(readiness: ManagementReadiness, topVerticals: { name: ContentVertical; rationale: string }[]): { phase: string; focus: string; actions: string[] }[] {
  const vNames = topVerticals.map(v => v.name);
  const base = [
    {
      phase: 'Foundation Opportunity',
      focus: 'Clarify positioning, capacity, and the first content tests.',
      actions: ['Review which parts of your current approach create the strongest fan response', `Explore whether ${vNames[0]} could become a repeatable content lane`, 'Identify the minimum sustainable posting rhythm for your lifestyle'],
    },
    {
      phase: 'Growth Opportunity',
      focus: 'Turn early signals into clearer acquisition and retention choices.',
      actions: ['Look for patterns in the content that attracts attention versus content that converts', 'Decide which audience segment is most worth prioritising', 'Map where premium offers, bundles, or fan conversations could fit'],
    },
    {
      phase: 'Scale Opportunity',
      focus: 'Decide what should be systemised, delegated, or developed further.',
      actions: ['Identify which parts of the workflow are limiting growth', 'Consider whether collaborations or channel expansion would accelerate discovery', 'Review whether management support would improve consistency, monetisation, or positioning'],
    },
  ];

  if (readiness === 'Scale Candidate') {
    base[2].actions.push('Explore what an agency-supported growth plan would need to prioritise first');
  }
  if (readiness === 'Needs Foundation' || readiness === 'Hobby Creator') {
    base[0].actions.unshift('Clarify your creator identity before adding more complexity');
    base[0].actions.unshift('Build confidence with small, repeatable content experiments');
  }

  return base;
}

function internalAgencyScores(r: AssessmentResponses, scores: ScoreBreakdown): ReportData['internal_agency_scores'] {
  const futureImprovements = arrayValue(r.future_improvements);
  const strengths = strengthSignals(r.strengths);
  const polarisingArchetypes = ['Dominatrix', 'Brat', 'Submissive', 'Bimbo', 'High-Class Escort Fantasy', 'Corporate Rebel'];
  const boundaryRisk = ['full_nude', 'fetish'].includes(r.nudity_level) ? 18 : r.nudity_level === 'undecided' ? 14 : 4;

  const coachability = scoreFrom(
    35
    + Math.min(futureImprovements.length * 7, 28)
    + (includesFutureImprovement(futureImprovements, ['content direction', 'skills match', 'audience growth', 'subscriber retention']) ? 12 : 0)
    + (textValue(r.future_improvements_other) ? 5 : 0)
    + (selectedArchetypes(r).length > 0 ? 8 : 0)
    + (r.consent ? 7 : 0)
  );
  const ambition = scoreFrom(
    35
    + scoreTextDepth(r.aspirational_creators, 24)
    + (includesFutureImprovement(futureImprovements, ['financial', 'channel expansion', 'long-term', 'audience growth']) ? 18 : 0)
    + (r.audience_target === 'whales' ? 12 : 7)
    + (r.comfort_level >= 8 ? 8 : 0)
  );
  const innovation = scoreFrom(
    30
    + scoreTextDepth(r.alternative_content_ideas, 32)
    + (includesFutureImprovement(futureImprovements, ['content direction', 'channel expansion']) ? 16 : 0)
    + (hasAny(strengths, ['My creativity', 'My storytelling ability', 'My ability to entertain']) ? 12 : 0)
  );
  const managementReadiness = scoreFrom(
    scores.agency_opportunity * 0.35
    + scores.consistency * 0.25
    + coachability * 0.25
    + ambition * 0.15
  );
  const commercialPotential = scoreFrom(
    scores.monetisation * 0.35
    + scores.brand_clarity * 0.25
    + scores.creator_dna * 0.2
    + (r.parasocial_comfort ? 12 : 0)
    + (r.audience_target === 'whales' ? 8 : 4)
  );
  const parasocialStrength = scoreFrom(
    (r.parasocial_comfort ? 58 : 28)
    + (hasAny(strengths, ['My storytelling ability', 'My communication skills', 'My ability to connect with people', 'My kindness', 'My authenticity']) ? 22 : 0)
    + (r.audience_target === 'whales' ? 8 : 4)
    + Math.min(scoreTextDepth(r.passion_topic, 12), 12)
  );
  const brandRisk = scoreFrom(
    20
    + boundaryRisk
    + (selectedArchetypes(r).some(archetype => polarisingArchetypes.includes(archetype)) ? 22 : 0)
    + (includesFutureImprovement(futureImprovements, ['moderation', 'compliance', 'restrictions', 'platform concerns']) ? 18 : 0)
    - (selectedArchetypes(r).length > 0 && r.nudity_level !== 'undecided' ? 8 : 0)
  );
  const scalability = scoreFrom(
    scores.consistency * 0.45
    + managementReadiness * 0.2
    + coachability * 0.2
    + (includesFutureImprovement(futureImprovements, ['lifestyle', 'channel expansion', 'subscriber retention']) ? 15 : 5)
  );
  const agencyOpportunity = scoreFrom(
    commercialPotential * 0.25
    + managementReadiness * 0.2
    + coachability * 0.15
    + ambition * 0.15
    + innovation * 0.1
    + parasocialStrength * 0.1
    + scalability * 0.1
    - brandRisk * 0.05
  );

  return {
    commercial_potential: commercialPotential,
    management_readiness: managementReadiness,
    coachability,
    ambition,
    innovation,
    parasocial_strength: parasocialStrength,
    brand_risk: brandRisk,
    scalability,
    agency_opportunity: agencyOpportunity,
  };
}

function agencyRecommendation(
  r: AssessmentResponses,
  scores: ReportData['internal_agency_scores'],
  readiness: ManagementReadiness
): ReportData['agency_recommendation'] {
  const opportunity = scores.agency_opportunity ?? 0;
  const brandRisk = scores.brand_risk ?? 0;
  const priority = opportunity >= 72 && brandRisk < 70 ? 'high' : opportunity >= 50 ? 'medium' : 'low';
  const futureImprovements = arrayValue(r.future_improvements);
  const riskNotes = [
    brandRisk >= 65 ? 'Elevated brand/reputation risk; review boundaries, platform constraints, and identity separation before outreach.' : null,
    scores.scalability !== null && scores.scalability < 50 ? 'Scalability is limited by consistency or systemisation signals.' : null,
    !r.parasocial_comfort ? 'Lower comfort with fan relationship content may reduce retention and DM monetisation upside.' : null,
    includesFutureImprovement(futureImprovements, ['moderation', 'compliance']) ? 'Creator explicitly raised moderation or compliance as an area to improve.' : null,
  ].filter(Boolean) as string[];
  const opportunityNotes = [
    scores.commercial_potential !== null && scores.commercial_potential >= 70 ? 'Strong monetisation and positioning signal for agency review.' : null,
    scores.coachability !== null && scores.coachability >= 70 ? 'High openness to guidance and structured improvement.' : null,
    scores.parasocial_strength !== null && scores.parasocial_strength >= 70 ? 'Relationship-led content could support retention and high-value fan journeys.' : null,
    scores.innovation !== null && scores.innovation >= 70 ? 'Creator has clear appetite for testing new content directions.' : null,
  ].filter(Boolean) as string[];
  const recommendedNextAction = priority === 'high'
    ? 'Invite to a strategy discussion and review management fit.'
    : priority === 'medium'
      ? 'Add to nurture queue; request more detail on goals, cadence, and boundaries.'
      : 'Keep in low-priority nurture; revisit after stronger consistency or monetisation signals.';

  return {
    agency_priority: priority,
    recommended_next_action: recommendedNextAction,
    management_fit_summary: `${readiness}. Internal scores indicate ${priority} agency priority with ${opportunity}/100 opportunity and ${brandRisk}/100 brand risk.`,
    risk_notes: riskNotes.length > 0 ? riskNotes : ['No major internal risk signal detected from available responses.'],
    opportunity_notes: opportunityNotes.length > 0 ? opportunityNotes : ['Opportunity is still developing; strongest next step is gathering clearer goals and content cadence evidence.'],
  };
}

function whyThisResult(r: AssessmentResponses, scores: ScoreBreakdown, archetype: CreatorArchetype, topVerticals: { name: ContentVertical; rationale: string }[]): ReportData['why_this_result'] {
  const strengths = strengthSignals(r.strengths);
  const signals = [
    ...(strengths.length > 0 ? strengths : ['Clear creator self-awareness']),
    ...(selectedArchetypes(r).length > 0 ? [`${archetype} archetype resonance`] : []),
    ...(r.comfort_level >= 7 ? ['High camera comfort'] : []),
    ...(r.parasocial_comfort ? ['Comfort with audience connection'] : []),
    ...(r.audience_target === 'whales' ? ['Premium audience ambition'] : ['Mass audience growth ambition']),
  ].slice(0, 5);

  const strongestAnswers = [
    ...strengths.slice(0, 3),
    ...selectedArchetypes(r).slice(0, 2),
    topVerticals[0]?.name,
  ].filter(Boolean) as string[];

  const differentiators = [
    scores.brand_clarity >= 70 ? 'Clear positioning signal' : 'Positioning can be sharpened through testing',
    scores.monetisation >= 70 ? 'Strong monetisation fit' : 'Monetisation pathway needs staged development',
    scores.consistency >= 70 ? 'Strong execution and consistency indicators' : 'Consistency is a key growth lever',
  ];

  return {
    summary: `You matched most strongly with ${archetype} because your answers point toward ${signals.slice(0, 3).join(', ').toLowerCase()}. This combination creates a creator identity with clear content angles and monetisation potential.`,
    top_signals: signals,
    strongest_answers: strongestAnswers,
    key_differentiators: differentiators,
  };
}

export function scoreAssessment(r: AssessmentResponses): ScoringResult {
  const creator_dna = computeCreatorDNA(r);
  const brand_clarity = computeBrandClarity(r);
  const monetisation = computeMonetisation(r);
  const consistency = computeConsistency(r);
  const scores = {
    creator_dna,
    brand_clarity,
    monetisation,
    consistency,
    agency_opportunity: 0,
  };
  const agency_opportunity = computeAgencyOpportunity(r, scores);
  const fullScores = { ...scores, agency_opportunity };
  const archetype = determineArchetype(r);
  const details = detailFor(archetype);
  const top_verticals = determineVerticals(r, archetype);
  const management_readiness = determineReadiness(r, fullScores);
  const agencyScores = internalAgencyScores(r, fullScores);
  const recommendation = agencyRecommendation(r, agencyScores, management_readiness);

  const pricing_strategy = r.audience_target === 'whales'
    ? 'Premium positioning appears worth exploring: selective access, high-touch fan journeys, and carefully packaged premium offers may be stronger than broad low-ticket volume.'
    : 'A volume-led pathway appears worth exploring: low-friction access, recurring fan engagement, and staged upsell opportunities may help turn discovery into revenue.';

  return {
    scores: fullScores,
    archetype,
    ...details,
    top_verticals,
    management_readiness,
    pricing_strategy,
    winning_10_framework: 'Your answers suggest there may be a repeatable content hook to uncover. The next strategic step is identifying which concepts are most natural for you, then testing them without overcommitting to one format too early.',
    growth_strategy: 'Short-form discovery content is likely an important growth lever, but the exact platform mix, cadence, and conversion path should be shaped around your capacity, boundaries, and strongest audience response.',
    tech_stack: [
      { tool: 'Fan CRM / tracking', purpose: 'Useful when subscriber volume grows enough to need clearer follow-up and segmentation.' },
      { tool: 'Chat support tooling', purpose: 'Worth considering if DMs become a revenue driver or time bottleneck.' },
      { tool: 'Planning workspace', purpose: 'Helpful for collecting ideas, content themes, and repeatable posting routines.' },
      { tool: 'Lightweight design tools', purpose: 'Useful for keeping promotional assets consistent as your positioning sharpens.' },
    ],
    day_90_plan: generatePlan(management_readiness, top_verticals),
    why_this_result: whyThisResult(r, fullScores, archetype, top_verticals),
    internal_agency_scores: agencyScores,
    agency_recommendation: recommendation,
    free_report_summary: `Your creator report identifies ${archetype} as your strongest current positioning and recommends testing ${top_verticals[0]?.name ?? 'a clearer content lane'} as a first growth opportunity.`,
    premium_report_available: false,
    premium_report_status: 'not_started',
  };
}

export function generateReportSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}
