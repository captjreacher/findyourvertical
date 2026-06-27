// ── Creator Intelligence Engine (FYV-3.3 calibrated) ──
// Extracts evidence, infers traits, calculates archetype fits, and generates
// reports using calibrated weights, contradiction detection, and personalised
// text from the calibration module.

import type {
  AssessmentEvidence,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorDnaProfile,
  CreatorIntelligenceResult,
  CreatorTrait,
  ReportData,
  ReportTier,
  TraitWeight,
} from '@/types/creator';
import { generateCreatorDnaProfile } from './creator-dna';
import { scoreAssessment, type ScoreBreakdown, type ScoringResult } from './scoring';
import {
  calibratedStrength,
  calibratedPolarity,
  calibratedConfidence,
  detectContradictions,
  ARCHETYPE_TRAIT_MAP,
  archetypeSeparation,
  calibratedConfidenceScore,
  generateSignalSummaries,
  personalisedWhyThisResult,
  personalisedExecutiveSummary,
} from './calibration';

/* ── helpers ── */

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

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

function evidenceId(
  responseKey: string,
  dimension: string,
  index = 0,
): string {
  return `${responseKey}:${dimension}:${index}`;
}

/* ── dimension mapping ── */

const DIMENSION_BY_RESPONSE: Record<string, string> = {
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

const VALID_SECTIONS = new Set([
  'Identity', 'Positioning', 'Audience', 'Content Engine',
  'Commercial Readiness', 'Growth Potential', 'Future Vision',
]);

function questionSection(
  question?: CreatorAssessmentQuestion,
): AssessmentEvidence['section'] {
  const s = question?.section;
  if (s && VALID_SECTIONS.has(s)) return s as AssessmentEvidence['section'];
  if (s === 'Strengths') return 'Identity';
  if (s === 'Persona') return 'Positioning';
  if (s === 'Boundaries') return 'Commercial Readiness';
  if (s === 'Goals') return 'Future Vision';
  return 'Identity';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Evidence Extraction (calibrated)
   ═══════════════════════════════════════════════════════════════════════════ */

export function extractAssessmentEvidence(
  responses: AssessmentResponses,
  questions: CreatorAssessmentQuestion[] = [],
): AssessmentEvidence[] {
  const questionByResponse = new Map(
    questions.map(q => [q.response_key, q]),
  );
  const evidence: AssessmentEvidence[] = [];

  for (const [responseKey, value] of Object.entries(responses)) {
    if (value === '' || value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    const question = questionByResponse.get(responseKey);
    const dimension = question?.scoring_dimension
      ?? DIMENSION_BY_RESPONSE[responseKey]
      ?? 'identity';
    const questionType = question?.question_type;

    // Calibrated strength, polarity, confidence
    const strength = calibratedStrength(value, questionType);
    const polarity = calibratedPolarity(responseKey, value);
    const confidence = calibratedConfidence(question, value);

    // Metadata from question config
    const evidenceConfig = question?.config?.evidence
      ? (question.config.evidence as Record<string, unknown>)
      : {};
    const configuredTraits = Array.isArray(evidenceConfig?.traits)
      ? (evidenceConfig.traits as string[]).filter(t => typeof t === 'string')
      : [];
    const archetypeHypotheses = Array.isArray(evidenceConfig?.archetypeHypotheses)
      ? (evidenceConfig.archetypeHypotheses as string[]).filter(h => typeof h === 'string')
      : [];
    const reportHooks = Array.isArray(evidenceConfig?.reportHooks)
      ? (evidenceConfig.reportHooks as string[]).filter(h => typeof h === 'string')
      : [];

    const selectedArchetypes =
      responseKey === 'persona_occupation' ? asArray(value) : [];

    evidence.push({
      id: evidenceId(responseKey, dimension),
      source_question_key: question?.question_key ?? responseKey,
      response_key: responseKey,
      section: questionSection(question),
      dimension: dimension as AssessmentEvidence['dimension'],
      value: value as AssessmentEvidence['value'],
      strength,
      polarity,
      confidence,
      validates_archetype: archetypeHypotheses[0] ?? selectedArchetypes[0],
      tags: [
        ...(question?.scoring_dimension ? [question.scoring_dimension] : []),
        ...configuredTraits,
        ...archetypeHypotheses.map(h => `hypothesis:${h}`),
        ...reportHooks.map(h => `report:${h}`),
        ...(question?.question_type === 'scenario_ranking'
          ? ['scenario_rank']
          : []),
        ...selectedArchetypes.map(a => `selected:${a}`),
      ],
    });
  }

  // Archetype validation seeds from keyword matching
  if (includesAny(responses.fantasy_keywords, ['party', 'nightlife', 'club', 'wild'])) {
    evidence.push({
      id: evidenceId('fantasy_keywords', 'archetype_validation', 1),
      source_question_key: 'fantasy_keywords',
      response_key: 'fantasy_keywords',
      section: 'Positioning',
      dimension: 'archetype_validation',
      value: responses.fantasy_keywords,
      strength: 70,
      polarity: 'positive',
      confidence: 65,
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
      strength: 78,
      polarity: 'positive',
      confidence: 72,
      validates_archetype: 'Fitness Goddess',
      tags: ['body_confidence', 'routine', 'visual_discipline'],
    });
  }

  return evidence;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Trait Inference
   ═══════════════════════════════════════════════════════════════════════════ */

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

function traitEvidence(
  evidence: AssessmentEvidence[],
  trait: CreatorTrait,
  weight: number,
  evidenceIds: string[],
  rationale: string,
): TraitWeight {
  const evidenceScore = evidenceIds
    .map(id => evidence.find(item => item.id === id)?.strength ?? 0)
    .reduce((sum, v) => sum + v, 0);

  return {
    trait,
    weight: clamp(weight + evidenceScore / Math.max(evidenceIds.length || 1, 1)),
    evidence_ids: evidenceIds,
    rationale,
  };
}

export function inferCreatorTraits(
  evidence: AssessmentEvidence[],
): TraitWeight[] {
  const idsByResponse = (key: string) =>
    evidence.filter(e => e.response_key === key).map(e => e.id);

  const responseValue = (key: string) =>
    evidence.find(e => e.response_key === key)?.value;

  const selected = asArray(responseValue('persona_occupation'));

  const traits: TraitWeight[] = [
    traitEvidence(
      evidence, 'visibility_comfort',
      clamp(Number(responseValue('comfort_level') ?? 5) * 8),
      idsByResponse('comfort_level'),
      'Camera comfort indicates readiness to be visible.',
    ),
    traitEvidence(
      evidence, 'positioning_clarity',
      selected.length > 0 ? 72 : 42,
      idsByResponse('persona_occupation'),
      'Selected archetypes provide positioning hypotheses.',
    ),
    traitEvidence(
      evidence, 'fan_connection',
      responseValue('parasocial_comfort') === true ? 76 : 38,
      idsByResponse('parasocial_comfort'),
      'Audience connection comfort shapes fan relationship potential.',
    ),
    traitEvidence(
      evidence, 'monetisation_fit',
      responseValue('audience_target') === 'whales' ? 74 : 58,
      idsByResponse('audience_target'),
      'Audience strategy indicates commercial pathway fit.',
    ),
    traitEvidence(
      evidence, 'routine_discipline',
      text(responseValue('passion_topic')).length > 20 ? 68 : 44,
      idsByResponse('passion_topic'),
      'A repeatable topic signal supports sustainable content.',
    ),
    traitEvidence(
      evidence, 'coachability',
      asArray(responseValue('future_improvements')).length > 0 ? 70 : 45,
      idsByResponse('future_improvements'),
      'Future improvement choices indicate openness to structured support.',
    ),
    traitEvidence(
      evidence, 'risk_awareness',
      responseValue('nudity_level') === 'undecided' ? 42 : 64,
      idsByResponse('nudity_level'),
      'Boundary clarity reduces positioning and platform risk.',
    ),
  ];

  // Keyword-based traits from strengths
  if (includesAny(responseValue('strengths'), ['authentic', 'real', 'genuine', 'kind', 'connect', 'warm'])) {
    traits.push(
      traitEvidence(
        evidence, 'authenticity', 78,
        idsByResponse('strengths'),
        'Self-described strengths support authenticity-led positioning.',
      ),
    );
    traits.push(
      traitEvidence(
        evidence, 'trust_building', 70,
        idsByResponse('strengths'),
        'Warmth and connection signals support trust-building with audiences.',
      ),
    );
    traits.push(
      traitEvidence(
        evidence, 'emotional_familiarity', 65,
        idsByResponse('strengths'),
        'Emotional warmth signals suggest comfort with intimate fan relationships.',
      ),
    );
  }

  if (includesAny(responseValue('strengths'), ['energy', 'entertain', 'party', 'confidence', 'funny'])) {
    traits.push(
      traitEvidence(
        evidence, 'social_energy', 74,
        idsByResponse('strengths'),
        'High-energy strengths support social and performance-led content formats.',
      ),
    );
  }

  if (asArray(responseValue('niche_interests')).includes('Fitness/Muscle')) {
    traits.push(
      traitEvidence(
        evidence, 'body_confidence', 78,
        idsByResponse('niche_interests'),
        'Fitness interest validates body-led content potential.',
      ),
    );
    traits.push(
      traitEvidence(
        evidence, 'visual_discipline', 72,
        idsByResponse('niche_interests'),
        'Fitness content benefits from repeatable visual discipline.',
      ),
    );
  }

  // Catch-all for any remaining traits with tag-based evidence
  for (const trait of CREATOR_TRAITS) {
    if (traits.some(item => item.trait === trait)) continue;
    const evidenceIds = evidence
      .filter(e => e.tags.includes(trait))
      .map(e => e.id);
    if (evidenceIds.length > 0) {
      traits.push(
        traitEvidence(
          evidence, trait,
          58 + evidenceIds.length * 8,
          evidenceIds,
          `Assessment metadata supplied ${trait.replace(/_/g, ' ')} evidence.`,
        ),
      );
    }
  }

  return traits;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Archetype Fits (calibrated, full trait map)
   ═══════════════════════════════════════════════════════════════════════════ */

export function calculateArchetypeFits(
  responses: AssessmentResponses,
  evidence: AssessmentEvidence[],
  traits: TraitWeight[],
): CreatorIntelligenceResult['archetype_fits'] {
  const selected = asArray(responses.persona_occupation);
  const traitScore = (trait: CreatorTrait) =>
    traits.find(item => item.trait === trait)?.weight ?? 0;

  // Build candidate set: selected + hypothesis-tagged + a broad spread
  const candidates = [...new Set([
    ...selected,
    ...evidence.flatMap(e =>
      e.tags
        .filter(tag => tag.startsWith('hypothesis:'))
        .map(tag => tag.replace('hypothesis:', '')),
    ),
    ...Object.keys(ARCHETYPE_TRAIT_MAP).slice(0, 8), // include a default spread
  ])].filter(Boolean);

  return candidates
    .map(archetype => {
      const expectedTraits =
        ARCHETYPE_TRAIT_MAP[archetype] ?? ['positioning_clarity'];

      const supporting = evidence.filter(
        e =>
          e.validates_archetype === archetype ||
          expectedTraits.some(t => e.tags.includes(t)),
      );

      const contradicting = evidence.filter(
        e =>
          e.polarity === 'negative' &&
          expectedTraits.includes(e.response_key as CreatorTrait),
      );

      const base = selected.includes(archetype) ? 16 : 0;
      const traitAvg =
        expectedTraits.reduce((sum, t) => sum + traitScore(t), 0) /
        expectedTraits.length;
      const fitScore = clamp(
        base + traitAvg * 0.8 + supporting.length * 3 - contradicting.length * 4,
      );

      const confidence = clamp(
        40 +
          supporting.length * 10 +
          (selected.includes(archetype) ? 10 : 0) -
          contradicting.length * 8,
      );

      const validation_status = selected.includes(archetype)
        ? supporting.length > 1
          ? 'validated'
          : 'selected_only'
        : supporting.length > 0
          ? 'inferred'
          : 'selected_only';

      return {
        archetype,
        fit_score: fitScore,
        confidence,
        selected_by_creator: selected.includes(archetype),
        validation_status: validation_status as ArchetypeFit['validation_status'],
        supporting_evidence_ids: supporting.map(e => e.id),
        contradicting_evidence_ids: contradicting.map(e => e.id),
      };
    })
    .sort((a, b) => b.fit_score - a.fit_score);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Report Generation (personalised)
   ═══════════════════════════════════════════════════════════════════════════ */

function projectScoresFromDna(
  dna: Omit<CreatorDnaProfile, 'id' | 'created_at'>,
  traits: TraitWeight[],
  legacyScores: ScoreBreakdown,
): ScoreBreakdown {
  const ts = (trait: CreatorTrait) =>
    traits.find(item => item.trait === trait)?.weight ?? 50;
  const avg = (...values: number[]) =>
    values.reduce((s, v) => s + v, 0) / values.length;

  return {
    creator_dna: clamp(
      avg(dna.confidence, ts('visibility_comfort'), ts('authenticity')),
    ),
    brand_clarity: clamp(
      avg(dna.archetype_confidence, ts('positioning_clarity'), legacyScores.brand_clarity),
    ),
    monetisation: clamp(
      avg(
        dna.monetisation_readiness === 'Advanced'
          ? 88
          : dna.monetisation_readiness === 'Ready'
            ? 74
            : dna.monetisation_readiness === 'Developing'
              ? 55
              : 32,
        ts('monetisation_fit'),
        legacyScores.monetisation,
      ),
    ),
    consistency: clamp(
      avg(ts('routine_discipline'), ts('visual_discipline'), legacyScores.consistency),
    ),
    agency_opportunity: clamp(
      avg(dna.agency_opportunity_score, ts('coachability'), legacyScores.agency_opportunity),
    ),
  };
}

export function buildReportFromCreatorDna(input: {
  legacy: ScoringResult;
  dnaProfile: Omit<CreatorDnaProfile, 'id' | 'created_at'>;
  evidence: AssessmentEvidence[];
  traits: TraitWeight[];
  archetypeFits: CreatorIntelligenceResult['archetype_fits'];
  reportTier?: ReportTier;
  responses?: AssessmentResponses;
}): ReportData {
  const tier = input.reportTier ?? 'free';
  const scores = projectScoresFromDna(
    input.dnaProfile,
    input.traits,
    input.legacy.scores,
  );

  // Personalised text (when responses are available)
  const whySummary = input.responses
    ? personalisedWhyThisResult(
        input.responses,
        input.archetypeFits,
        input.traits.sort((a, b) => b.weight - a.weight)[0],
      )
    : input.legacy.why_this_result.summary;

  const execSummary = input.responses
    ? personalisedExecutiveSummary(input.responses, input.archetypeFits)
    : input.legacy.executive_summary.likely_creator_style;

  return {
    ...input.legacy,
    archetype: input.dnaProfile.fantasy_archetype as ReportData['archetype'],
    scores,
    classification_confidence:
      input.archetypeFits[0]?.confidence ?? input.legacy.classification_confidence,
    result_confidence:
      input.archetypeFits[0]?.confidence != null && input.archetypeFits[0].confidence >= 75
        ? 'High'
        : input.archetypeFits[0]?.confidence != null && input.archetypeFits[0].confidence >= 50
          ? 'Moderate'
          : 'Low',
    creator_dna_profile: input.dnaProfile,
    report_tier: tier,
    free_report_summary: execSummary,
    premium_report_available: tier === 'free',
    premium_report_generated: tier === 'premium',
    premium_report_status:
      tier === 'premium' ? 'delivered' : 'available',
    why_this_result: {
      ...input.legacy.why_this_result,
      summary: whySummary,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main entry point
   ═══════════════════════════════════════════════════════════════════════════ */

export function createCreatorIntelligenceResult(input: {
  creatorProfileId: string;
  assessmentId: string;
  responses: AssessmentResponses;
  questions?: CreatorAssessmentQuestion[];
  reportTier?: ReportTier;
}): CreatorIntelligenceResult {
  const evidence = extractAssessmentEvidence(
    input.responses,
    input.questions ?? [],
  );
  const traits = inferCreatorTraits(evidence);
  const archetype_fits = calculateArchetypeFits(
    input.responses,
    evidence,
    traits,
  );

  // Contradiction detection
  const contradictions = detectContradictions(
    input.responses,
    archetype_fits,
  );

  // Enhanced confidence
  const confidence = calibratedConfidenceScore({
    evidence,
    archetypeFits: archetype_fits,
    contradictions,
    totalQuestions: input.questions?.length,
    answeredQuestions: evidence.length,
  });

  const dnaProfile = generateCreatorDnaProfile(
    input.creatorProfileId,
    input.assessmentId,
    input.responses,
  );

  const legacy = scoreAssessment(input.responses);
  const reportData = buildReportFromCreatorDna({
    legacy,
    dnaProfile,
    evidence,
    traits,
    archetypeFits: archetype_fits,
    reportTier: input.reportTier,
    responses: input.responses,
  });

  return {
    evidence,
    traits,
    archetype_fits,
    confidence,
    creator_dna: dnaProfile,
    report: reportData,
  };
}
