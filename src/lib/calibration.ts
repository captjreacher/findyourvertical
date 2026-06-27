// ── Calibration Utilities ──
// Sprint FYV-3.3: reusable helpers for evidence weighting, contradiction
// detection, archetype separation, confidence calculation, signal summaries,
// and personalised text generation.
//
// These utilities are separated from UI components and from the core engine
// so calibration logic can be audited, tested, and tuned independently.

import type {
  AssessmentEvidence,
  AssessmentResponses,
  CreatorAssessmentQuestion,
  CreatorTrait,
  TraitWeight,
  ArchetypeFit,
  ConfidenceScore,
} from '@/types/creator';

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

/* ═══════════════════════════════════════════════════════════════════════════
   1. Evidence Strength Calibration
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Calculate evidence strength based on question type and response shape,
 * NOT on arbitrary text length.
 *
 * By type:
 *   text/long_text/textarea — base 55 (moderate, always present)
 *   single_choice / boolean — base 52
 *   multi_choice — base 48 + 6 per selection
 *   scale — maps 1-10 → 25-85 linearly
 *   scenario_ranking — base 50 + 8 per ranked item
 *   unknown — base 45 (conservative)
 */
export function calibratedStrength(
  value: unknown,
  questionType?: string,
): number {
  if (value === null || value === undefined || value === '' ||
      (Array.isArray(value) && value.length === 0)) {
    return 0;
  }

  switch (questionType) {
    case 'short_text':
    case 'long_text':
    case 'textarea':
      return clamp(55 + Math.min(
        String(value).split(/\s+/).filter(Boolean).length * 2, 25,
      ));

    case 'single_choice':
      return 52;

    case 'multi_choice': {
      const count = Array.isArray(value) ? value.length : 1;
      return clamp(48 + count * 6);
    }

    case 'boolean':
      return 52;

    case 'scale': {
      const n = Number(value);
      if (isNaN(n)) return 40;
      return clamp(25 + n * 6);
    }

    case 'scenario_ranking': {
      const count = Array.isArray(value) ? value.length : 1;
      return clamp(50 + count * 8);
    }

    default:
      return 45;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Evidence Polarity
   ═══════════════════════════════════════════════════════════════════════════ */

export function calibratedPolarity(
  responseKey: string,
  value: unknown,
): 'positive' | 'negative' | 'neutral' {
  if (responseKey === 'nudity_level') {
    if (value === 'undecided') return 'negative';
    if (value === 'sfw_only' || value === 'teasing_only') return 'neutral';
    return 'positive';
  }

  if (responseKey === 'comfort_level') {
    const n = Number(value);
    if (n <= 3) return 'negative';
    if (n <= 5) return 'neutral';
    return 'positive';
  }

  if (responseKey === 'parasocial_comfort') {
    if (value === false) return 'negative';
    return 'positive';
  }

  return 'positive';
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. Evidence Confidence
   ═══════════════════════════════════════════════════════════════════════════ */

export function calibratedConfidence(
  question: CreatorAssessmentQuestion | undefined,
  value: unknown,
): number {
  let base = question ? 75 : 58;

  if (question?.scoring_dimension) base += 5;
  if (question?.config?.evidence) base += 3;

  if (value === null || value === undefined || value === '') return 0;
  if (Array.isArray(value) && value.length === 0) return 0;
  if (typeof value === 'string' && value.trim().length < 3) base -= 10;

  return clamp(base);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Contradiction Detection
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Contradiction {
  label: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export function detectContradictions(
  responses: AssessmentResponses,
  archetypeFits: ArchetypeFit[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  const comfortLevel = Number(responses.comfort_level);
  const selectedArchetypes = asArray(responses.persona_occupation);

  // 1. Ambitious positioning with low camera comfort
  if (comfortLevel <= 3 && responses.nudity_level !== 'sfw_only') {
    contradictions.push({
      label: 'positioning_vs_comfort',
      severity: 'high',
      description:
        'Content boundaries exceed current camera confidence — may create execution friction.',
    });
  }

  // 2. High sexual fantasy but softer archetype
  const sexualFantasy = ['full_nude', 'fetish'].includes(responses.nudity_level);
  if (
    sexualFantasy &&
    selectedArchetypes.some(a =>
      ['Soft Girlfriend Experience', 'Girl Next Door', 'Cosplayer'].includes(a),
    )
  ) {
    contradictions.push({
      label: 'fantasy_vs_persona',
      severity: 'medium',
      description:
        'Explicit content boundaries clash with softer archetype positioning.',
    });
  }

  // 3. Whale targeting without premium positioning
  if (
    responses.audience_target === 'whales' &&
    !selectedArchetypes.some(a =>
      ['Luxury Muse', 'Rich Girl', 'High-Class Escort Fantasy', 'Dominatrix'].includes(a),
    )
  ) {
    contradictions.push({
      label: 'premium_vs_positioning',
      severity: 'medium',
      description:
        'Whale audience target without clear premium fantasy positioning.',
    });
  }

  // 4. Mass audience but low parasocial comfort
  if (
    responses.audience_target === 'masses' &&
    responses.parasocial_comfort === false
  ) {
    contradictions.push({
      label: 'audience_vs_connection',
      severity: 'medium',
      description:
        'Mass audience strategy with low comfort in fan connection.',
    });
  }

  // 5. Unanswered critical questions
  const criticalKeys = ['passion_topic', 'fantasy_keywords', 'niche_interests'];
  const unanswered = criticalKeys.filter(key => {
    const v = responses[key];
    return v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0);
  });

  if (unanswered.length >= 2) {
    contradictions.push({
      label: 'missing_critical_data',
      severity: 'high',
      description: `${unanswered.length} critical positioning questions were left unanswered.`,
    });
  }

  return contradictions;
}

export function contradictionPenalty(contradictions: Contradiction[]): number {
  if (contradictions.length === 0) return 0;
  return contradictions.reduce((sum, c) => {
    return sum + (c.severity === 'high' ? 12 : 6);
  }, 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Archetype Trait Map (complete, 29 archetypes)
   ═══════════════════════════════════════════════════════════════════════════ */

export const ARCHETYPE_TRAIT_MAP: Record<string, CreatorTrait[]> = {
  'Girl Next Door': ['authenticity', 'emotional_familiarity', 'trust_building', 'fan_connection'],
  'Soft Girlfriend Experience': ['emotional_familiarity', 'trust_building', 'fan_connection'],
  'Hot Teacher': ['positioning_clarity', 'authenticity', 'risk_awareness'],
  'Naughty Librarian': ['positioning_clarity', 'authenticity', 'risk_awareness'],
  'Nurse': ['emotional_familiarity', 'trust_building', 'positioning_clarity'],
  'Doctor': ['positioning_clarity', 'risk_awareness', 'monetisation_fit'],
  'Corporate Rebel': ['positioning_clarity', 'risk_awareness', 'visibility_comfort'],
  'Fitness Goddess': ['body_confidence', 'routine_discipline', 'visual_discipline'],
  'Dominatrix': ['visibility_comfort', 'risk_awareness', 'monetisation_fit', 'positioning_clarity'],
  'Brat': ['social_energy', 'visibility_comfort', 'fan_connection'],
  'Submissive': ['trust_building', 'fan_connection', 'risk_awareness'],
  'Trophy Wife': ['positioning_clarity', 'visual_discipline', 'monetisation_fit'],
  'Rich Girl': ['monetisation_fit', 'positioning_clarity', 'visual_discipline'],
  'Luxury Muse': ['positioning_clarity', 'visual_discipline', 'monetisation_fit'],
  'Alternative / Tattooed': ['authenticity', 'risk_awareness', 'positioning_clarity'],
  'Gamer Girl': ['authenticity', 'fan_connection', 'positioning_clarity'],
  'Cosplayer': ['visual_discipline', 'authenticity', 'positioning_clarity'],
  'Spiritual Goddess': ['authenticity', 'emotional_familiarity', 'trust_building'],
  'MILF': ['trust_building', 'emotional_familiarity', 'monetisation_fit'],
  'Single Mom': ['authenticity', 'trust_building', 'routine_discipline'],
  'College Girl': ['social_energy', 'authenticity', 'fan_connection'],
  'Party Girl': ['social_energy', 'visibility_comfort', 'monetisation_fit'],
  'Boss Babe': ['positioning_clarity', 'monetisation_fit', 'routine_discipline'],
  'Country Girl': ['authenticity', 'emotional_familiarity', 'routine_discipline'],
  'Bimbo': ['social_energy', 'visibility_comfort', 'monetisation_fit'],
  'High-Class Escort Fantasy': ['positioning_clarity', 'monetisation_fit', 'visual_discipline'],
  'Seductress': ['visibility_comfort', 'monetisation_fit', 'social_energy'],
  'Artist / Creative Muse': ['authenticity', 'visual_discipline', 'positioning_clarity'],
  'Other': ['authenticity', 'positioning_clarity', 'social_energy'],
};

/* ═══════════════════════════════════════════════════════════════════════════
   6. Archetype Separation
   ═══════════════════════════════════════════════════════════════════════════ */

export function archetypeSeparation(
  top: ArchetypeFit | undefined,
  second: ArchetypeFit | undefined,
): { score: number; isCloseCall: boolean } {
  if (!top || !second) return { score: 100, isCloseCall: false };

  const topTraits = ARCHETYPE_TRAIT_MAP[top.archetype] ?? ['positioning_clarity'];
  const secondTraits = ARCHETYPE_TRAIT_MAP[second.archetype] ?? ['positioning_clarity'];
  const overlap = topTraits.filter(t => secondTraits.includes(t)).length;
  const total = [...new Set([...topTraits, ...secondTraits])].length;
  const distinctiveness = total > 0 ? Math.round((1 - overlap / total) * 100) : 50;

  const fitGap = Math.max(0, top.fit_score - second.fit_score);
  const separation = Math.round(distinctiveness * 0.5 + (fitGap > 0 ? Math.min(fitGap, 40) * 1.25 : 0));

  return {
    score: clamp(separation),
    isCloseCall: fitGap < 10,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. Confidence Calculation (enhanced)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ConfidenceInput {
  evidence: AssessmentEvidence[];
  archetypeFits: ArchetypeFit[];
  contradictions: Contradiction[];
  totalQuestions?: number;
  answeredQuestions?: number;
}

export function calibratedConfidenceScore(input: ConfidenceInput): ConfidenceScore {
  const { evidence, archetypeFits, contradictions, totalQuestions, answeredQuestions } = input;

  const avgStrength = evidence.length > 0
    ? evidence.reduce((s, e) => s + e.strength, 0) / evidence.length
    : 0;

  const dimensions = new Set(evidence.map(e => e.dimension)).size;
  const { score: separationScore } = archetypeSeparation(
    archetypeFits[0],
    archetypeFits[1],
  );

  const penalty = contradictionPenalty(contradictions);

  const completionRatio = totalQuestions && totalQuestions > 0
    ? (answeredQuestions ?? evidence.length) / totalQuestions
    : 0.7;

  const score = clamp(
    30
    + Math.min(evidence.length, 30) * 0.8
    + avgStrength * 0.25
    + dimensions * 3
    + (separationScore - 50) * 0.3
    + completionRatio * 10
    - penalty,
  );

  const drivers: string[] = [
    `${evidence.length} evidence signals (avg ${Math.round(avgStrength)} strength)`,
    `${dimensions} dimensions covered`,
    `Archetype separation: ${separationScore}/100${separationScore < 50 ? ' (low)' : ''}`,
    `Completion: ${Math.round(completionRatio * 100)}% of questions answered`,
  ];

  if (contradictions.length > 0) {
    drivers.push(`${contradictions.length} contradiction${contradictions.length > 1 ? 's' : ''} (${penalty}pt penalty)`);
  }

  return {
    score,
    label: score >= 75 ? 'High' : score >= 50 ? 'Moderate' : 'Low',
    drivers,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. Signal Summaries
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SignalSummary {
  strongestStrength: { label: string; detail: string };
  biggestOpportunity: { label: string; detail: string };
  biggestRisk: { label: string; detail: string };
  highestConfidenceFinding: { label: string; detail: string };
  lowestConfidenceFinding: { label: string; detail: string };
  mostCommercialTrait: { label: string; detail: string };
  mostAuthenticTrait: { label: string; detail: string };
}

export function generateSignalSummaries(
  evidence: AssessmentEvidence[],
  traits: TraitWeight[],
  contradictions: Contradiction[],
): SignalSummary {
  const strongestEvidence = [...evidence]
    .sort((a, b) => b.strength - a.strength)[0];

  const weakestEvidence = [...evidence]
    .filter(e => e.strength > 0)
    .sort((a, b) => a.strength - b.strength)[0];

  const highestTrait = [...traits].sort((a, b) => b.weight - a.weight)[0];

  const commercialTraits = traits.filter(t =>
    ['monetisation_fit', 'positioning_clarity', 'visibility_comfort'].includes(t.trait),
  );
  const mostCommercial = [...commercialTraits].sort((a, b) => b.weight - a.weight)[0];

  const authenticTraits = traits.filter(t =>
    ['authenticity', 'emotional_familiarity', 'trust_building', 'fan_connection'].includes(t.trait),
  );
  const mostAuthentic = [...authenticTraits].sort((a, b) => b.weight - a.weight)[0];

  return {
    strongestStrength: {
      label: strongestEvidence
        ? `Strongest signal: ${strongestEvidence.dimension.replace(/_/g, ' ')}`
        : 'No dominant signal',
      detail: strongestEvidence
        ? `Strength ${strongestEvidence.strength}/100 from "${String(strongestEvidence.value).slice(0, 80)}"`
        : 'Evidence pool is small or weak.',
    },
    biggestOpportunity: {
      label: highestTrait
        ? `Strongest trait: ${highestTrait.trait.replace(/_/g, ' ')}`
        : 'No trait data',
      detail: highestTrait
        ? `${highestTrait.weight}/100 — ${highestTrait.rationale}`
        : 'More data needed to surface opportunities.',
    },
    biggestRisk: {
      label: contradictions.length > 0
        ? `${contradictions.length} contradiction${contradictions.length > 1 ? 's' : ''}`
        : 'No major risks',
      detail: contradictions.length > 0
        ? contradictions[0].description
        : 'No contradictions detected in current responses.',
    },
    highestConfidenceFinding: {
      label: strongestEvidence
        ? `Dimension: ${strongestEvidence.dimension.replace(/_/g, ' ')}`
        : 'Insufficient data',
      detail: strongestEvidence
        ? `Confidence ${strongestEvidence.confidence}%, strength ${strongestEvidence.strength}/100`
        : 'Not enough evidence to surface high-confidence findings.',
    },
    lowestConfidenceFinding: {
      label: weakestEvidence
        ? `Dimension: ${weakestEvidence.dimension.replace(/_/g, ' ')}`
        : 'Insufficient data',
      detail: weakestEvidence
        ? `Confidence ${weakestEvidence.confidence}%, strength ${weakestEvidence.strength}/100`
        : 'All evidence is moderately strong.',
    },
    mostCommercialTrait: {
      label: mostCommercial
        ? mostCommercial.trait.replace(/_/g, ' ')
        : 'Not assessed',
      detail: mostCommercial
        ? `${mostCommercial.weight}/100`
        : 'No commercial trait data.',
    },
    mostAuthenticTrait: {
      label: mostAuthentic
        ? mostAuthentic.trait.replace(/_/g, ' ')
        : 'Not assessed',
      detail: mostAuthentic
        ? `${mostAuthentic.weight}/100`
        : 'No authenticity trait data.',
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. Personalised Text (evidence-driven, not boilerplate)
   ═══════════════════════════════════════════════════════════════════════════ */

export function personalisedInsight(
  responseKey: string,
  value: unknown,
  traitLabel: string,
): string {
  const responseText = Array.isArray(value)
    ? value.join(', ')
    : String(value ?? '');

  if (!responseText.trim()) {
    return `No response provided for ${responseKey.replace(/_/g, ' ')}.`;
  }

  const excerpt = responseText.length > 120
    ? `${responseText.slice(0, 120)}...`
    : responseText;

  switch (responseKey) {
    case 'strengths':
      return `You described your strengths as "${excerpt}". This supports ${traitLabel} positioning because it reveals how you see your own creator identity.`;

    case 'comfort_level':
      return `Your camera comfort is ${value}/10. ${Number(value) >= 7
        ? 'This suggests readiness for visibility-led content formats.'
        : Number(value) >= 5
          ? 'You have developing comfort that can grow with structured practice.'
          : 'Lower comfort may benefit from confidence-building content formats first.'}`;

    case 'parasocial_comfort':
      return `You ${value ? 'are' : 'are not'} comfortable building one-to-one fan relationships. ${value
        ? 'This supports a connection-led strategy with strong retention potential.'
        : 'A content-first strategy may suit you better than heavy fan interaction.'}`;

    case 'audience_target':
      return `You target ${value === 'whales' ? 'high-value fans (whales)' : 'a broad audience (masses)'}. ${value === 'whales'
        ? 'This premium approach works best with exclusive, high-touch experiences.'
        : 'This volume approach benefits from scalable content and staged upsells.'}`;

    case 'nudity_level':
      return `Your content boundaries are set to "${value}". ${String(value).includes('sfw') || String(value).includes('teasing')
        ? 'This positions you for broader platform reach but may limit certain premium fantasy angles.'
        : String(value) === 'undecided'
          ? 'Clarifying your boundaries would strengthen positioning confidence.'
          : 'This opens up more explicit fantasy positioning with corresponding boundary awareness.'}`;

    case 'passion_topic':
      return `Your passion topic is "${excerpt}". This is the foundation for sustainable, repeatable content.`;

    case 'niche_interests':
      return `Your niche interests include "${excerpt}". These differentiate your content and attract specific audience segments.`;

    case 'fantasy_keywords':
      return `Your fantasy keywords are "${excerpt}". These shape the emotional and visual language of your creator persona.`;

    case 'future_improvements':
      return `You want to improve: "${excerpt}". This openness to growth is a strong signal for coachability.`;

    default:
      return `Your response to "${responseKey.replace(/_/g, ' ')}" was "${excerpt}".`;
  }
}

export function personalisedWhyThisResult(
  responses: AssessmentResponses,
  archetypeFits: ArchetypeFit[],
  topTrait: TraitWeight | undefined,
): string {
  const topArchetype = archetypeFits[0];
  if (!topArchetype) return 'Insufficient data to produce a personalised result.';

  const comfortPart = responses.comfort_level != null
    ? `Your camera comfort (${responses.comfort_level}/10)`
    : 'Your responses';

  const archetypeSelect = asArray(responses.persona_occupation);
  const personaPart = archetypeSelect.length > 0
    ? `your choice of ${archetypeSelect[0]} as your persona`
    : 'your responses';

  const traitPart = topTrait
    ? `combined with a strong ${topTrait.trait.replace(/_/g, ' ')} signal (${topTrait.weight}/100)`
    : '';

  const audiencePart = responses.audience_target === 'whales'
    ? 'and your preference for a premium, high-value audience strategy'
    : responses.audience_target === 'masses'
      ? 'and your broad-audience growth ambition'
      : '';

  return [
    comfortPart,
    `points toward ${topArchetype.archetype} as your primary creative identity.`,
    personaPart,
    `reinforces this fit,`,
    traitPart,
    audiencePart,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ');
}

export function personalisedExecutiveSummary(
  responses: AssessmentResponses,
  archetypeFits: ArchetypeFit[],
): string {
  const top = archetypeFits[0];
  if (!top) return '';

  const strengthNote = responses.strengths
    ? `You described your strengths as "${Array.isArray(responses.strengths)
      ? asArray(responses.strengths).slice(0, 2).join(' and ')
      : String(responses.strengths).slice(0, 80)}"`
    : 'Your responses';

  const nicheNote = asArray(responses.niche_interests).length > 0
    ? `Your interest in ${asArray(responses.niche_interests)[0]} content`
    : 'Your content interests';

  const connectionNote = responses.parasocial_comfort
    ? 'You are comfortable building personal fan relationships, which supports a retention-led strategy.'
    : 'You prefer content-led connection over heavy fan interaction, which supports a scalable production approach.';

  return [
    `${strengthNote}.`,
    `${nicheNote} and ${top.archetype} archetype fit (${top.fit_score}%) suggest a creator identity with clear differentiation.`,
    connectionNote,
  ].join(' ');
}
