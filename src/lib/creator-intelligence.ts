import type {
  AssessmentEvidence,
  AssessmentResponses,
  ConfidenceScore,
  CreatorArchetype,
  CreatorAssessmentQuestion,
  CreatorDnaProfile,
  CreatorIntelligenceResult,
  CreatorTrait,
  EvidenceDimension,
  ReportData,
  ReportTier,
  TraitWeight,
} from '@/types/creator';
import { generateCreatorDnaProfile } from './creator-dna';
import { enrichWithKnowledge } from './knowledge/enrichment';
import { scoreAssessment, type ScoreBreakdown, type ScoringResult } from './scoring';

const ARCHETYPE_TRAITS: Record<string, CreatorTrait[]> = {
  'Party Girl': ['social_energy', 'visibility_comfort', 'monetisation_fit'],
  'Girl Next Door': ['authenticity', 'emotional_familiarity', 'trust_building', 'fan_connection'],
  'Soft Girlfriend Experience': ['emotional_familiarity', 'trust_building', 'fan_connection'],
  'Fitness Goddess': ['body_confidence', 'routine_discipline', 'visual_discipline'],
  'Luxury Muse': ['positioning_clarity', 'visual_discipline', 'monetisation_fit'],
  'Gamer Girl': ['authenticity', 'fan_connection', 'positioning_clarity'],
  Submissive: ['trust_building', 'fan_connection', 'risk_awareness'],
  Dominatrix: ['visibility_comfort', 'risk_awareness', 'monetisation_fit'],
};

const CREATOR_TRAITS: CreatorTrait[] = [
  'visibility_comfort',
  'social_energy',
  'authenticity',
  'emotional_familiarity',
  'trust_building',
  'body_confidence',
  'routine_discipline',
  'visual_discipline',
  'monetisation_fit',
  'positioning_clarity',
  'fan_connection',
  'coachability',
  'risk_awareness',
];

const DIMENSION_BY_RESPONSE: Record<string, EvidenceDimension> = {
  strengths: 'identity',
  comfort_level: 'confidence',
  passion_topic: 'content_engine',
  persona_occupation: 'positioning',
  parasocial_comfort: 'audience',
  fantasy_keywords: 'positioning',
  nudity_level: 'boundaries',
  niche_interests: 'content_engine',
  audience_target: 'commercial_readiness',
  aspirational_creators: 'future_vision',
  alternative_content_ideas: 'growth_potential',
  future_improvements: 'growth_potential',
};

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

function text(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function includesAny(value: unknown, terms: string[]): boolean {
  const source = text(value);
  return terms.some(term => source.includes(term));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evidenceId(responseKey: string, dimension: EvidenceDimension, index = 0): string {
  return `${responseKey}:${dimension}:${index}`;
}

function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n|]+/).map(item => item.trim()).filter(Boolean);
  return [];
}

function traitArray(value: unknown): CreatorTrait[] {
  return metadataArray(value).filter((item): item is CreatorTrait => CREATOR_TRAITS.includes(item as CreatorTrait));
}

function traitEvidence(
  evidence: AssessmentEvidence[],
  trait: CreatorTrait,
  weight: number,
  evidenceIds: string[],
  rationale: string
): TraitWeight {
  const evidenceScore = evidenceIds
    .map(id => evidence.find(item => item.id === id)?.strength ?? 0)
    .reduce((sum, value) => sum + value, 0);

  return {
    trait,
    weight: clamp(weight + evidenceScore / Math.max(evidenceIds.length || 1, 1)),
    evidence_ids: evidenceIds,
    rationale,
  };
}

function questionSection(question?: CreatorAssessmentQuestion): AssessmentEvidence['section'] {
  const section = question?.section;
  if (section === 'Identity'
    || section === 'Positioning'
    || section === 'Audience'
    || section === 'Content Engine'
    || section === 'Commercial Readiness'
    || section === 'Growth Potential'
    || section === 'Future Vision') {
    return section;
  }

  if (section === 'Strengths') return 'Identity';
  if (section === 'Persona') return 'Positioning';
  if (section === 'Boundaries') return 'Commercial Readiness';
  if (section === 'Goals') return 'Future Vision';
  return 'Identity';
}

export function extractAssessmentEvidence(
  responses: AssessmentResponses,
  questions: CreatorAssessmentQuestion[] = []
): AssessmentEvidence[] {
  const questionByResponse = new Map(questions.map(question => [question.response_key, question]));
  const evidence: AssessmentEvidence[] = [];

  for (const [responseKey, value] of Object.entries(responses)) {
    if (value === '' || value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const question = questionByResponse.get(responseKey);
    const evidenceConfig = configRecord(question?.config?.evidence);
    const configuredDimensions = metadataArray(evidenceConfig.dimensions) as EvidenceDimension[];
    const configuredTraits = traitArray(evidenceConfig.traits);
    const archetypeHypotheses = metadataArray(evidenceConfig.archetypeHypotheses);
    const reportHooks = metadataArray(evidenceConfig.reportHooks);
    const confidenceBoost = Number(evidenceConfig.archetypeConfidence ?? evidenceConfig.confidenceBoost ?? 0);
    const dimension = configuredDimensions[0] ?? DIMENSION_BY_RESPONSE[responseKey] ?? 'identity';
    const strength = typeof value === 'number'
      ? clamp(value * 10)
      : Array.isArray(value)
        ? clamp(45 + value.length * 12)
        : clamp(35 + Math.min(text(value).length, 80));

    const selectedArchetypes = responseKey === 'persona_occupation' ? asArray(value) : [];
    evidence.push({
      id: evidenceId(responseKey, dimension),
      source_question_key: question?.question_key ?? responseKey,
      response_key: responseKey,
      section: questionSection(question),
      dimension,
      value: value as AssessmentEvidence['value'],
      strength: clamp(strength + confidenceBoost),
      polarity: 'positive',
      confidence: clamp((question ? 78 : 62) + confidenceBoost / 2),
      validates_archetype: archetypeHypotheses[0] ?? selectedArchetypes[0],
      tags: [
        ...(question?.scoring_dimension ? [question.scoring_dimension] : []),
        ...configuredDimensions,
        ...configuredTraits,
        ...archetypeHypotheses.map(item => `hypothesis:${item}`),
        ...reportHooks.map(item => `report:${item}`),
        ...(question?.question_type === 'scenario_ranking' ? ['scenario_rank'] : []),
        ...selectedArchetypes.map(item => `selected:${item}`),
      ],
    });
  }

  if (includesAny(responses.fantasy_keywords, ['party', 'nightlife', 'club', 'wild'])) {
    evidence.push({
      id: evidenceId('fantasy_keywords', 'archetype_validation', 1),
      source_question_key: 'fantasy_keywords',
      response_key: 'fantasy_keywords',
      section: 'Positioning',
      dimension: 'archetype_validation',
      value: responses.fantasy_keywords,
      strength: 74,
      polarity: 'positive',
      confidence: 70,
      validates_archetype: 'Party Girl',
      tags: ['scenario_seed', 'nightlife', 'visibility'],
    });
  }

  if (asArray(responses.niche_interests).includes('Fitness/Muscle')) {
    evidence.push({
      id: evidenceId('niche_interests', 'archetype_validation', 1),
      source_question_key: 'niche_interests',
      response_key: 'niche_interests',
      section: 'Content Engine',
      dimension: 'archetype_validation',
      value: 'Fitness/Muscle',
      strength: 82,
      polarity: 'positive',
      confidence: 78,
      validates_archetype: 'Fitness Goddess',
      tags: ['body_confidence', 'routine', 'visual_discipline'],
    });
  }

  return evidence;
}

export function inferCreatorTraits(evidence: AssessmentEvidence[]): TraitWeight[] {
  const idsByResponse = (key: string) => evidence.filter(item => item.response_key === key).map(item => item.id);
  const responseValue = (key: string) => evidence.find(item => item.response_key === key)?.value;
  const selected = asArray(responseValue('persona_occupation'));

  const traits: TraitWeight[] = [
    traitEvidence(evidence, 'visibility_comfort', Number(responseValue('comfort_level') ?? 5) * 8, idsByResponse('comfort_level'), 'Camera comfort indicates readiness to be visible.'),
    traitEvidence(evidence, 'positioning_clarity', selected.length > 0 ? 72 : 42, idsByResponse('persona_occupation'), 'Selected archetypes provide positioning hypotheses.'),
    traitEvidence(evidence, 'fan_connection', responseValue('parasocial_comfort') === true ? 76 : 38, idsByResponse('parasocial_comfort'), 'Audience connection comfort shapes fan relationship potential.'),
    traitEvidence(evidence, 'monetisation_fit', responseValue('audience_target') === 'whales' ? 74 : 58, idsByResponse('audience_target'), 'Audience strategy indicates commercial pathway fit.'),
    traitEvidence(evidence, 'routine_discipline', text(responseValue('passion_topic')).length > 20 ? 68 : 44, idsByResponse('passion_topic'), 'A repeatable topic signal supports sustainable content.'),
    traitEvidence(evidence, 'coachability', asArray(responseValue('future_improvements')).length > 0 ? 70 : 45, idsByResponse('future_improvements'), 'Future improvement choices indicate openness to structured support.'),
    traitEvidence(evidence, 'risk_awareness', responseValue('nudity_level') === 'undecided' ? 42 : 64, idsByResponse('nudity_level'), 'Boundary clarity reduces positioning and platform risk.'),
  ];

  if (includesAny(responseValue('strengths'), ['authentic', 'real', 'genuine', 'kind', 'connect'])) {
    traits.push(traitEvidence(evidence, 'authenticity', 78, idsByResponse('strengths'), 'Self-described strengths support authenticity-led positioning.'));
    traits.push(traitEvidence(evidence, 'trust_building', 70, idsByResponse('strengths'), 'Warmth and connection signals support trust.'));
  }

  if (includesAny(responseValue('strengths'), ['energy', 'entertain', 'party', 'confidence'])) {
    traits.push(traitEvidence(evidence, 'social_energy', 74, idsByResponse('strengths'), 'High-energy strengths support social content formats.'));
  }

  if (asArray(responseValue('niche_interests')).includes('Fitness/Muscle')) {
    traits.push(traitEvidence(evidence, 'body_confidence', 78, idsByResponse('niche_interests'), 'Fitness interest validates body-led content potential.'));
    traits.push(traitEvidence(evidence, 'visual_discipline', 72, idsByResponse('niche_interests'), 'Fitness content benefits from repeatable visual discipline.'));
  }

  for (const trait of CREATOR_TRAITS) {
    if (traits.some(item => item.trait === trait)) continue;
    const evidenceIds = evidence.filter(item => item.tags.includes(trait)).map(item => item.id);
    if (evidenceIds.length > 0) {
      traits.push(traitEvidence(evidence, trait, 58 + evidenceIds.length * 8, evidenceIds, `Assessment metadata supplied ${trait.replace(/_/g, ' ')} evidence.`));
    }
  }

  return traits;
}

export function calculateArchetypeFits(
  responses: AssessmentResponses,
  evidence: AssessmentEvidence[],
  traits: TraitWeight[]
): CreatorIntelligenceResult['archetype_fits'] {
  const selected = asArray(responses.persona_occupation);
  const traitScore = (trait: CreatorTrait) => traits.find(item => item.trait === trait)?.weight ?? 0;
  const candidates = [...new Set([
    ...selected,
    'Girl Next Door',
    'Party Girl',
    'Fitness Goddess',
    'Luxury Muse',
    'Gamer Girl',
    'Submissive',
    'Dominatrix',
    ...evidence.flatMap(item => item.tags.filter(tag => tag.startsWith('hypothesis:')).map(tag => tag.replace('hypothesis:', ''))),
  ])].filter(Boolean);

  return candidates.map(archetype => {
    const expectedTraits = ARCHETYPE_TRAITS[archetype] ?? ['positioning_clarity'];
    const supportingEvidence = evidence.filter(item => (
      item.validates_archetype === archetype
      || expectedTraits.some(trait => item.tags.includes(trait))
    ));
    const base = selected.includes(archetype) ? 18 : 0;
    const traitAverage = expectedTraits.reduce((sum, trait) => sum + traitScore(trait), 0) / expectedTraits.length;
    const fitScore = clamp(base + traitAverage * 0.82 + supportingEvidence.length * 4);
    const validation_status: 'selected_only' | 'validated' | 'inferred' = selected.includes(archetype)
      ? supportingEvidence.length > 1 ? 'validated' : 'selected_only'
      : supportingEvidence.length > 0 ? 'inferred' : 'selected_only';

    return {
      archetype,
      fit_score: fitScore,
      confidence: clamp(45 + supportingEvidence.length * 12 + (selected.includes(archetype) ? 10 : 0)),
      selected_by_creator: selected.includes(archetype),
      validation_status,
      supporting_evidence_ids: supportingEvidence.map(item => item.id),
      contradicting_evidence_ids: [],
    };
  }).sort((a, b) => b.fit_score - a.fit_score);
}

function confidenceScore(evidence: AssessmentEvidence[], archetypeFits: CreatorIntelligenceResult['archetype_fits']): ConfidenceScore {
  const top = archetypeFits[0]?.fit_score ?? 0;
  const second = archetypeFits[1]?.fit_score ?? 0;
  const spread = Math.max(0, top - second);
  const evidenceDiversity = new Set(evidence.map(item => item.dimension)).size;

  // CAL-001: Weight evidence by quality, not just count
  const avgStrength = evidence.length > 0
    ? evidence.reduce((sum, e) => sum + e.strength, 0) / evidence.length
    : 0;
  const strongEvidence = evidence.filter(e => e.strength >= 60).length;

  const score = clamp(
    25                                         // lower base (was 42)
    + Math.round(avgStrength * 0.3)            // 0-30 from evidence quality
    + Math.min(strongEvidence * 3, 15)         // 0-15 from strong evidence count
    + Math.min(evidenceDiversity * 2, 12)      // 0-12 from dimension diversity (was *4)
    + Math.min(spread, 20)                     // 0-20 from archetype clarity
  );

  return {
    score,
    label: score >= 75 ? 'High' : score >= 50 ? 'Moderate' : 'Low',
    drivers: [
      `${evidence.length} evidence signals (avg strength ${Math.round(avgStrength)})`,
      `${strongEvidence} strong signals (strength >= 60)`,
      `${evidenceDiversity} evidence dimensions represented`,
      `Top archetype spread is ${spread} points`,
    ],
  };
}

function projectScoresFromDna(
  dna: Omit<CreatorDnaProfile, 'id' | 'created_at'>,
  traits: TraitWeight[],
  legacyScores: ScoreBreakdown
): ScoreBreakdown {
  const traitScore = (trait: CreatorTrait) => traits.find(item => item.trait === trait)?.weight ?? 50;
  const average = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  // CAL-002: Cap archetype_confidence contribution and add quality penalties
  const brandBase = average(
    Math.min(dna.archetype_confidence, 75),   // cap at 75 (was raw ~95)
    traitScore('positioning_clarity'),
    legacyScores.brand_clarity
  );
  const brandPenalty =
    (dna.authenticity_band === 'Potential Conflict' ? 12 : dna.authenticity_band === 'Moderate Authenticity' ? 5 : 0)
    + (dna.archetype_confidence <= 70 ? 8 : 0);

  return {
    creator_dna: clamp(average(dna.confidence, traitScore('visibility_comfort'), traitScore('authenticity'))),
    brand_clarity: clamp(brandBase - brandPenalty),
    monetisation: clamp(average(
      dna.monetisation_readiness === 'Advanced' ? 88 : dna.monetisation_readiness === 'Ready' ? 74 : dna.monetisation_readiness === 'Developing' ? 55 : 32,
      traitScore('monetisation_fit'),
      legacyScores.monetisation
    )),
    consistency: clamp(average(traitScore('routine_discipline'), traitScore('visual_discipline'), legacyScores.consistency)),
    agency_opportunity: clamp(average(dna.agency_opportunity_score, traitScore('coachability'), legacyScores.agency_opportunity)),
  };
}

function recommendationForTier(tier: ReportTier, report: ReportData): string {
  if (tier === 'agency') return report.agency_recommendation.recommended_next_action;
  if (tier === 'premium') return report.executive_summary?.recommended_next_step ?? report.free_report_summary;
  return report.recommended_actions?.[0]?.rationale ?? report.free_report_summary;
}

export function buildReportFromCreatorDna(input: {
  legacy: ScoringResult;
  dnaProfile: Omit<CreatorDnaProfile, 'id' | 'created_at'>;
  evidence: AssessmentEvidence[];
  traits: TraitWeight[];
  confidence: ConfidenceScore;
  reportTier?: ReportTier;
}): ReportData {
  const tier = input.reportTier ?? 'free';
  const scores = projectScoresFromDna(input.dnaProfile, input.traits, input.legacy.scores);
  const reportHooks = [...new Set(input.evidence.flatMap(item => item.tags
    .filter(tag => tag.startsWith('report:'))
    .map(tag => tag.replace('report:', '').replace(/_/g, ' '))
  ))].slice(0, 5);
  const confidenceExplanation = [
    ...input.confidence.drivers,
    `Creator DNA confidence is ${input.dnaProfile.confidence}/100`,
    `Archetype confidence is ${input.dnaProfile.archetype_confidence}/100`,
    ...reportHooks.map(hook => `Report interpretation hook: ${hook}`),
  ];
  const freeSummary = `${input.dnaProfile.summary} Recommendation: ${recommendationForTier(tier, input.legacy)}`;

  return {
    ...input.legacy,
    archetype: input.dnaProfile.fantasy_archetype as CreatorArchetype,
    scores,
    classification_confidence: input.confidence.score,
    result_confidence: input.confidence.label,
    creator_dna_profile: input.dnaProfile,
    report_tier: tier,
    free_report_summary: freeSummary,
    premium_report_available: tier === 'free',
    premium_report_generated: tier === 'premium',
    premium_report_status: tier === 'premium' ? 'delivered' : 'available',
    why_this_result: {
      ...input.legacy.why_this_result,
      summary: `${input.dnaProfile.summary} This report is projected from Creator DNA using ${input.evidence.length} evidence signals rather than direct answer-to-score mapping.`,
      strongest_behavioural_signals: confidenceExplanation,
    },
  };
}

export function createCreatorIntelligenceResult(input: {
  creatorProfileId: string;
  assessmentId: string;
  responses: AssessmentResponses;
  questions?: CreatorAssessmentQuestion[];
  reportTier?: ReportTier;
}): CreatorIntelligenceResult {
  const evidence = extractAssessmentEvidence(input.responses, input.questions ?? []);
  const traits = inferCreatorTraits(evidence);
  const archetype_fits = calculateArchetypeFits(input.responses, evidence, traits);
  const confidence = confidenceScore(evidence, archetype_fits);
  const dnaProfile = generateCreatorDnaProfile(input.creatorProfileId, input.assessmentId, input.responses);
  const legacy = scoreAssessment(input.responses);
  const reportData = buildReportFromCreatorDna({
    legacy,
    dnaProfile,
    evidence,
    traits,
    confidence,
    reportTier: input.reportTier,
  });

  const knowledge = enrichWithKnowledge({
    archetypeFits: archetype_fits,
    traits,
    topVerticals: reportData.top_verticals,
    audienceStrategy: input.responses.audience_target ?? undefined,
  });

  return {
    evidence,
    traits,
    archetype_fits,
    confidence,
    creator_dna: dnaProfile,
    report: reportData,
    knowledge,
  };
}
