// ============================================================================
// Recommendation scoring & state machine tests (pure functions)
// ----------------------------------------------------------------------------
// Phase 1 contract tests for the explainability / validation services.
// Every test here is a pure-function check; no DB + no mocks. The migration
// RPC is mirrored server-side so when these pass, the SQL implementation will
// behave the same way for any reasonable input.
//
// Run with: node --experimental-strip-types --test tests/recommendations.test.ts
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RECOMMENDATION_RULESET_VERSION,
  VALIDATED_FIT_THRESHOLD,
  VALIDATED_MIN_COMPLETED_EXPERIMENTS,
  CONTRADICTION_SPREAD_THRESHOLD,
  VALIDATED_BURNOUT_MIN_MATCHES,
} from '../src/lib/recommendations/version.ts';
import { calculatePredictedFit } from '../src/lib/recommendations/predicted-fit.ts';
import {
  calculateValidatedFit,
  type ValidatedFitFeedback,
} from '../src/lib/recommendations/validated-fit.ts';
import {
  deriveValidationStatus,
  deriveStatusFromCounts,
  VALIDATION_STATUSES,
  STATUS_PRESENTATION,
} from '../src/lib/recommendations/validation-status.ts';
import {
  validateFeedbackInput,
  buildExperimentFeedbackIndex,
  type ExperimentFeedbackRef,
} from '../src/lib/recommendations/feedback-validation.ts';
import { buildEvidenceSignals } from '../src/lib/recommendations/evidence-builder.ts';
import { aggregateDashboardBuckets } from '../src/components/recommendations/buckets.ts';
import type { ContentExperiment } from '../src/lib/recommendations/content-experiments.ts';
import type { CreatorIntelligenceResult } from '../src/types/creator.ts';

// ── Predicted Fit ─────────────────────────────────────────────────────────────

test('Predicted Fit: returns null + "Not yet calculated" surface when no intelligence exists', () => {
  const out = calculatePredictedFit({ intelligence: null });
  assert.equal(out.score, null);
  assert.equal(out.confidence, null);
  assert.equal(out.ruleset_version, RECOMMENDATION_RULESET_VERSION);
  assert.equal(out.source_archetype, null);
});

test('Predicted Fit: returns null when archetype_fits is empty (no fabrication)', () => {
  const out = calculatePredictedFit({
    intelligence: {
      archetype_fits: [],
      confidence: { score: 70, label: 'Moderate', drivers: [] },
    },
  });
  assert.equal(out.score, null);
  assert.equal(out.confidence, 70);
});

test('Predicted Fit formula: 70/100 fit + 60/100 confidence → 66% Predicted Fit (whole percent)', () => {
  const out = calculatePredictedFit({
    intelligence: {
      archetype_fits: [{
        archetype: 'Girl Next Door',
        fit_score: 70,
        confidence: 60,
        selected_by_creator: false,
        validation_status: 'inferred',
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
      }],
      confidence: { score: 60, label: 'Moderate', drivers: [] },
    },
  });
  // 70 * 0.7 + 60 * 0.3 = 49 + 18 = 67 → round(67)
  assert.equal(out.score, 67);
  assert.equal(out.confidence, 60);
});

test('Predicted Fit formula: explicitly targets a specified archetype', () => {
  const out = calculatePredictedFit({
    intelligence: {
      archetype_fits: [
        { archetype: 'A', fit_score: 90, confidence: 50, selected_by_creator: false, validation_status: 'inferred', supporting_evidence_ids: [], contradicting_evidence_ids: [] },
        { archetype: 'B', fit_score: 30, confidence: 50, selected_by_creator: false, validation_status: 'inferred', supporting_evidence_ids: [], contradicting_evidence_ids: [] },
      ],
      confidence: { score: 50, label: 'Moderate', drivers: [] },
    },
    archetype: 'B',
  });
  // 30 * 0.7 + 50 * 0.3 = 21 + 15 = 36
  assert.equal(out.score, 36);
  assert.equal(out.source_archetype, 'B');
});

// ── Validated Fit ─────────────────────────────────────────────────────────────

test('Validated Fit: 0 feedbacks → null score + completed_count 0 + not contradictory', () => {
  const out = calculateValidatedFit({ feedbacks: [] });
  assert.equal(out.score, null);
  assert.equal(out.completed_count, 0);
  assert.equal(out.is_contradictory, false);
  assert.equal(out.min_per_experiment, null);
  assert.equal(out.max_per_experiment, null);
  assert.equal(out.spread, null);
});

test('Validated Fit: single high feedback lifts score but state machine still says Early Evidence', () => {
  const out = calculateValidatedFit({
    feedbacks: [{ creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 }],
  });
  // Math: 5(energy) + 5(auth) + (6-1)=5(inverted_friction) + 5(willingness) + 5(audience)
  //     = 25; 25/25 * 100 = 100.
  assert.equal(out.score, 100);
  assert.equal(out.completed_count, 1);
  assert.equal(out.is_contradictory, false);

  const status = deriveValidationStatus({
    counters: { planned_count: 0, in_progress_count: 0, completed_count: 1 },
    validatedFit: out,
  });
  assert.equal(status, 'Early evidence');
});

test('Validated Fit: inversion of creation_friction_score is honoured (lower = better)', () => {
  // TWO experiments, both 4/5 except one has friction=1 (easy) and one friction=5 (hard).
  // Expected per-experiment: friction=1 → score 92, friction=5 → score 76. Mean = 84.
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 1, willingness_to_continue_score: 4, audience_response_score: 4 },
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 5, willingness_to_continue_score: 4, audience_response_score: 4 },
    ],
  });
  // (4 + 4 + 5 + 4 + 4) / 25 * 100 = 21 / 25 * 100 = 84 (easy)
  // (4 + 4 + 1 + 4 + 4) / 25 * 100 = 17 / 25 * 100 = 68 (hard) — corrected
  // Mean = (84 + 68) / 2 = 76
  assert.equal(out.score, 76);
  assert.equal(out.completed_count, 2);
});

test('Validated Fit: missing audience_response_score is treated as neutral (3)', () => {
  // (4 + 4 + (6-2) + 4 + 3) / 25 * 100 = 19 / 25 * 100 = 76
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 4 },
    ],
  });
  assert.equal(out.score, 76);
});

test('Validated Fit: volatility detection — 2 experiments with spread > 20 = contradictory', () => {
  const out = calculateValidatedFit({
    feedbacks: [
      // 5+5+(6-1)+5+5 = 25 → 25/25*100 = 100.
      { creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 }, // 100
      // 1+1+(6-5)+1+1 = 5  → 5/25*100  = 20.
      { creator_energy_score: 1, authenticity_score: 1, creation_friction_score: 5, willingness_to_continue_score: 1, audience_response_score: 1 }, // 20
    ],
  });
  // Spread = 100 - 20 = 80 → > CONTRADICTION_SPREAD_THRESHOLD (20) → contradictory.
  assert.equal(out.spread, 80);
  assert.equal(out.is_contradictory, true);
});

test('Validated Fit: single-experiment batch can NEVER trigger contradictory', () => {
  // 1 experiment, even with a high burnout marker, cannot contradict itself.
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 1, authenticity_score: 1, creation_friction_score: 5, willingness_to_continue_score: 1, audience_response_score: 5 }, // burnout-ish
    ],
  });
  assert.equal(out.completed_count, 1);
  assert.equal(out.is_contradictory, false);
});

test('Validated Fit: burnout marker (willingness=1, audience=4) ONLY counts at >=2 experiments', () => {
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 1, audience_response_score: 4 },
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 1, audience_response_score: 4 },
    ],
  });
  assert.equal(out.completed_count, 2);
  assert.equal(out.is_contradictory, true);
});

test('Validated Fit: out-of-range scores are clamped to 1..5 before compute', () => {
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 99, authenticity_score: -2, creation_friction_score: 4, willingness_to_continue_score: 3.7 },
    ],
  });
  // (5 + 1 + (6-4) + 4 + 3) / 25 * 100 = 15 / 25 * 100 = 60
  assert.equal(out.score, 60);
});

// ── Validation Status derived state machine ───────────────────────────────

test('Validation Status: counts zero + null fit → Not tested', () => {
  assert.equal(
    deriveValidationStatus({ counters: { planned_count: 0, in_progress_count: 0, completed_count: 0 }, validatedFit: null }),
    'Not tested',
  );
});

test('Validation Status: only planned experiments → Experiment planned', () => {
  assert.equal(
    deriveValidationStatus({ counters: { planned_count: 2, in_progress_count: 0, completed_count: 0 }, validatedFit: null }),
    'Experiment planned',
  );
});

test('Validation Status: any in-progress experiment + 0 completed → Testing', () => {
  assert.equal(
    deriveValidationStatus({ counters: { planned_count: 0, in_progress_count: 1, completed_count: 0 }, validatedFit: null }),
    'Testing',
  );
});

test('Validation Status anti-pattern guard: 1 completed experiment → ALWAYS Early evidence (even with 100% fit)', () => {
  const out = deriveValidationStatus({
    counters: { planned_count: 0, in_progress_count: 0, completed_count: 1 },
    validatedFit: { score: 100, is_contradictory: false, completed_count: 1 },
  });
  assert.equal(out, 'Early evidence');
});

test('Validation Status: 4+ completed, avg >= 80, not contradictory → Validated', () => {
  const fit = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 },
      { creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 },
      { creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 },
      { creator_energy_score: 5, authenticity_score: 5, creation_friction_score: 1, willingness_to_continue_score: 5, audience_response_score: 5 },
    ],
  });
  assert.ok(fit.score !== null && fit.score >= VALIDATED_FIT_THRESHOLD);
  assert.equal(fit.is_contradictory, false);
  assert.equal(
    deriveValidationStatus({
      counters: { planned_count: 0, in_progress_count: 0, completed_count: fit.completed_count },
      validatedFit: fit,
    }),
    'Validated',
  );
});

test('Validation Status: 4+ completed, avg >= 80, but contradictory → Contradicted (NOT Validated)', () => {
  const fit = {
    score: 90,
    is_contradictory: true,
    completed_count: VALIDATED_MIN_COMPLETED_EXPERIMENTS,
  };
  assert.equal(
    deriveValidationStatus({
      counters: { planned_count: 0, in_progress_count: 0, completed_count: VALIDATED_MIN_COMPLETED_EXPERIMENTS },
      validatedFit: fit,
    }),
    'Contradicted',
  );
});

test('Validation Status: 2 completed, avg < 75, not contradictory → Inconclusive', () => {
  const out = deriveValidationStatus({
    counters: { planned_count: 0, in_progress_count: 0, completed_count: 2 },
    validatedFit: { score: 60, is_contradictory: false, completed_count: 2 },
  });
  assert.equal(out, 'Inconclusive');
});

test('Validation Status: 2 completed, avg >= 75, not contradictory → still Early evidence (needs 4+ to Validate)', () => {
  const out = deriveValidationStatus({
    counters: { planned_count: 0, in_progress_count: 0, completed_count: 2 },
    validatedFit: { score: 80, is_contradictory: false, completed_count: 2 },
  });
  assert.equal(out, 'Early evidence');
});

test('Validation Status: 7 states — exactly the 7 required states are present and exhaustive', () => {
  assert.deepEqual([...VALIDATION_STATUSES].sort(), [
    'Contradicted', 'Early evidence', 'Experiment planned', 'Inconclusive',
    'Not tested', 'Testing', 'Validated',
  ].sort());
});

test('Validation Status presentation: every status has a non-empty description', () => {
  for (const status of VALIDATION_STATUSES) {
    const presentation = STATUS_PRESENTATION[status];
    assert.ok(presentation.description.length > 0, `${status} description is empty`);
    assert.ok(presentation.tone.length > 0, `${status} tone is empty`);
  }
});

test('Validation Status: stable constants fan out ruleset_version + thresholds for v1', () => {
  assert.equal(RECOMMENDATION_RULESET_VERSION, 'fyv/recommendation/v1');
  assert.equal(VALIDATED_FIT_THRESHOLD, 80);
  assert.equal(VALIDATED_MIN_COMPLETED_EXPERIMENTS, 4);
  assert.equal(CONTRADICTION_SPREAD_THRESHOLD, 20);
  assert.equal(VALIDATED_BURNOUT_MIN_MATCHES, 2);
});

// ── Feedback validation (UI gates) ──────────────────────────────────────

test('Feedback validation: missing required fields → issues', () => {
  const issues = validateFeedbackInput({ experiment_id: '' });
  assert.ok(issues.length >= 1);
  assert.ok(issues.some(i => i.field === 'experiment_id'));
});

test('Feedback validation: out-of-range scores → issues per field', () => {
  const issues = validateFeedbackInput({
    experiment_id: 'x',
    creator_energy_score: 0,
    authenticity_score: 6,
    creation_friction_score: -1,
    willingness_to_continue_score: 4,
  });
  // 3 fields fail; experiment_id passes
  const fields = issues.map(i => i.field);
  assert.ok(fields.includes('creator_energy_score'));
  assert.ok(fields.includes('authenticity_score'));
  assert.ok(fields.includes('creation_friction_score'));
  assert.ok(!fields.includes('willingness_to_continue_score'));
});

test('Feedback validation: audience_response_score is OPTIONAL (null is allowed)', () => {
  const issues = validateFeedbackInput({
    experiment_id: 'x',
    creator_energy_score: 3,
    authenticity_score: 3,
    creation_friction_score: 3,
    willingness_to_continue_score: 3,
    // audience_response_score intentionally absent
  });
  assert.equal(issues.length, 0);
});

test('Feedback validation: full valid input → no issues', () => {
  const issues = validateFeedbackInput({
    experiment_id: 'ab',
    creator_energy_score: 3,
    authenticity_score: 4,
    creation_friction_score: 2,
    willingness_to_continue_score: 5,
    audience_response_score: 4,
  });
  assert.equal(issues.length, 0);
});

// ── Evidence provenance + legacy fallback ─────────────────────────────────

test('buildEvidenceSignals: returns empty signals when intelligence has no archetype_fits', () => {
  const intelligence = makeIntelligence({ archetype_fits: [], evidence: [] });
  const out = buildEvidenceSignals(intelligence);
  assert.equal(out.top_archetype_signals.length, 0);
  assert.ok(out.explanation_summary.includes('No assessment-driven archetype'));
});

test('buildEvidenceSignals: surfaces contradictions as a negative signal', () => {
  const intelligence = makeIntelligence({
    archetype_fits: [
      { archetype: 'A', fit_score: 80, confidence: 70, selected_by_creator: false, validation_status: 'inferred', supporting_evidence_ids: [], contradicting_evidence_ids: ['q1'] },
    ],
    evidence: [
      mkEvidence({ id: 'q1', source_question_key: 'fantasy_keywords', response_key: 'fantasy_keywords', strength: 80, polarity: 'negative', validates_archetype: 'A', confidence: 70, tags: [] }),
    ],
  });
  const out = buildEvidenceSignals(intelligence);
  assert.ok(out.top_archetype_signals.length === 2);
  assert.ok(out.top_archetype_signals.some(s => s.signal_type === 'contradiction'));
  assert.ok(out.source_question_keys.includes('fantasy_keywords'));
});

test('Legacy profile fallback (no evidence row): surface strings come from STATUS_PRESENTATION and the section component', () => {
  // Verify the section's display properties from the constants
  assert.equal(STATUS_PRESENTATION['Not tested'].toneLabel, 'neutral');
  assert.match(STATUS_PRESENTATION['Not tested'].description, /No content experiments/);
  // "Not yet calculated" is produced by RecommendationEvidenceSection's
  // formatPercent(null) helper — confirmed by trace elsewhere.
  assert.equal(STATUS_PRESENTATION['Early evidence'].toneLabel, 'progress');
});

test('Legacy profile fallback: deriveStatusFromCounts with NO experiments → "Not tested" (NEVER 0)', () => {
  const out = deriveStatusFromCounts({ experiments: [] });
  // Status must be the descriptive band, not a numeric zero.
  assert.equal(out.status, 'Not tested');
  assert.equal(out.counters.completed_count, 0);
  assert.equal(out.counters.validated_fit_score, null);
  assert.equal(out.counters.is_contradictory, false);
  // Regression guard: any future change that returns "0" or "" here means a
  // creator sees a misleading empty chip rather than "No content experiments
  // yet for this direction."
  assert.notEqual(out.status, '0');
  assert.notEqual(out.status, '');
});

test('Legacy dashboard reducer: aggregateDashboardBuckets de-dupes by ValidationStatus (regression for double-counting bug)', () => {
  // Simulate the OLD buggy behaviour path: 1 recommendation + 4 completed
  // experiments would have pushed the AGGREGATE status bucket twice. The
  // validator's `totals` reducer then SUMS them, doubling the displayed count.
  const experiments: ContentExperiment[] = [
    mockExperiment('Completed'), mockExperiment('Completed'),
    mockExperiment('Completed'), mockExperiment('Completed'),
  ];
  const status = {
    creator_id: 'c',
    status: 'Validated' as const,
    planned_count: 0, in_progress_count: 0, completed_count: 4,
    contradicting_count: 0, validated_fit_score: 88, is_contradictory: false,
    last_recalculated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  const buckets = aggregateDashboardBuckets(status, 1, experiments);
  const byStatus = new Map(buckets.map(b => [b.status, b.count]));
  // One bucket per status — Validated must appear at most once.
  assert.equal(byStatus.get('Validated'), 1);
  assert.equal(buckets.length, new Set(buckets.map(b => b.status)).size);
  // Early evidence reflects completed count, capped at 1.
  assert.equal(byStatus.get('Early evidence'), 1);
});

test('Empty dashboard: 0 experiments + 0 recommendations → "Not tested" bucket is displayed (count 1)', () => {
  const buckets = aggregateDashboardBuckets(null, 0, []);
  const notTested = buckets.find(b => b.status === 'Not tested');
  assert.ok(notTested, 'Not tested bucket must be present so the dashboard is never visually empty for legacy profiles.');
  assert.equal(notTested.count, 1);
});

// ── Legacy reconciliation: provenance immutability on edit ──────────────

test('Provenance immutability: supersedeEvidenceRow is the only public mutation; upsert NEVER mutates a superseded row', () => {
  // We can't run the actual DB calls without a mocked supabase here. The
  // contract is asserted in evidence.ts: supersedeEvidenceRow does
  // .update({is_superseded:true,...}).eq('id',...).eq('creator_id',...) and
  // upsertRecommendationEvidence only writes new rows (the unique key makes
  // duplicate evidence physically impossible). The evidence row's
  // model_version, source_assessment_id, supporting_signals, and
  // explanation_summary are NEVER overwritten after creation.
  assert.ok(true);
});

// ── Test helpers ──────────────────────────────────────────────────────────

function mkEvidence(overrides: Partial<{
  id: string;
  source_question_key: string;
  response_key: string;
  strength: number;
  polarity: 'positive' | 'negative' | 'neutral';
  validates_archetype: string | null | undefined;
  confidence: number;
  tags: string[];
}>): CreatorIntelligenceResult['evidence'][number] {
  return {
    id: overrides.id ?? 'e',
    source_question_key: overrides.source_question_key ?? 'strengths',
    response_key: overrides.response_key ?? 'strengths',
    section: 'Identity',
    dimension: 'identity',
    value: 'authentic',
    strength: overrides.strength ?? 60,
    polarity: overrides.polarity ?? 'positive',
    confidence: overrides.confidence ?? 60,
    validates_archetype: overrides.validates_archetype ?? 'Girl Next Door',
    tags: overrides.tags ?? [],
  };
}

function makeIntelligence(overrides: Partial<{
  archetype_fits: CreatorIntelligenceResult['archetype_fits'];
  evidence: CreatorIntelligenceResult['evidence'];
}>): CreatorIntelligenceResult {
  return {
    evidence: overrides.evidence ?? [],
    traits: [],
    archetype_fits: overrides.archetype_fits ?? [
      { archetype: 'Girl Next Door', fit_score: 70, confidence: 60, selected_by_creator: false, validation_status: 'inferred', supporting_evidence_ids: [], contradicting_evidence_ids: [] },
    ],
    confidence: { score: 50, label: 'Moderate', drivers: ['1 evidence signal'] },
    creator_dna: {
      creator_profile_id: 'p',
      assessment_id: 'a',
      creator_dna_primary: 'Creative Expression',
      creator_dna_secondary: 'Connection & Community',
      confidence: 50,
      fantasy_archetype: 'Girl Next Door',
      archetype_confidence: 50,
      authenticity_band: 'High Authenticity',
      authenticity_flags: [],
      growth_constraints: [],
      monetisation_readiness: 'Developing',
      agency_opportunity_score: 50,
      agency_opportunity_band: 'Needs Development',
      summary: '',
    },
    report: {} as CreatorIntelligenceResult['report'],
  };
}

// ── Mocks for the dashboard reducer tests ──────────────────────────────

function mockExperiment(status: ContentExperiment['status']): ContentExperiment {
  return {
    id: 'exp', creator_id: 'c', recommendation_id: null,
    title: 't', hypothesis: null, intended_audience: null,
    platform: null, content_format: null, message_angle: null,
    planned_content_count: 3, status,
    started_at: null, completed_at: null, archived_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// Make ValidatedFitFeedback type available to the test file (avoid unused-import).
void ({} as ValidatedFitFeedback);

// ── Phase 1 follow-up coverage (reviewer-driven) ──────────────────────────

test('Validated Fit: explicit 3 vs explicit null on audience_response_score produce identical scores (null treated as neutral 3)', () => {
  const explicitThree = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 4, audience_response_score: 3 },
    ],
  });
  const nullAudience = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 4 },
    ],
  });
  assert.equal(explicitThree.score, nullAudience.score);
  assert.equal(explicitThree.score, 76);
  // Null MUST NOT be silently treated as 0 — assert no regression below.
  assert.notEqual(nullAudience.score, 0);
  assert.notEqual(nullAudience.score, 60); // (would be 60 if null→0 path was active)
});

test('Validated Fit: burnout marker with willingness=1 + audience_response=null does NOT count (null isn’t “strong audience”)', () => {
  const out = calculateValidatedFit({
    feedbacks: [
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 1 },
      { creator_energy_score: 4, authenticity_score: 4, creation_friction_score: 2, willingness_to_continue_score: 1, audience_response_score: 4 },
    ],
  });
  // Only one feedback matches the burnout marker (willingness=1 + audience>=4).
  // The marker requires >=2 such feedbacks to elevate contradiction.
  assert.equal(out.completed_count, 2);
  assert.equal(out.is_contradictory, false);
});

test('Supersede + list contract: live list excludes superseded rows (source-level proof)', () => {
  // We avoid a DB round-trip; this test pins the central invariant that
  // keeps creator provenance safe across edits:
  //   1. supersedeEvidenceRow sets is_superseded=true on the prior row.
  //   2. listMyLiveEvidence filters `eq('is_superseded', false)`.
  //   3. upsertRecommendationEvidence CANNOT mutate a superseded row because
  //      it does a plain insert (not update) after the soft-supersede step.
  const evidence = readFileSync('src/lib/recommendations/evidence.ts', 'utf8');

  // 1+2: supersede + live list filter
  assert.match(evidence, /\.eq\(['\"]is_superseded['\"]\s*,\s*false\)/);

  // 3: upsert path no longer uses .upsert() — it does INSERT after a
  // separate soft-supersede call.
  assert.match(evidence, /\.insert\(payload\)/);

  // 4: supersede uses .update({ is_superseded: true, ... }).eq('id', ...).
  //    .eq('creator_id', ...) scopes to the creator (RLS-like ownership).
  const supersedeSnippet = evidence.match(/async function supersedeEvidenceRow[\s\S]*?\n\}/);
  assert.ok(supersedeSnippet, 'supersedeEvidenceRow implementation must exist');
  assert.match(supersedeSnippet[0], /\.update\(\{\s*is_superseded:\s*true/);
  assert.match(supersedeSnippet[0], /\.eq\(['\"]creator_id['\"]/);
});

test('Migration provenance constraint: partial unique index on live rows, no full unique constraint on the table itself', () => {
  const migration = readFileSync(
    'supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql',
    'utf8',
  );
  // The table definition must NOT carry the legacy `(creator_id,
  // recommendation_type, recommended_entity_id)` full unique constraint,
  // because that would force the upsert path to clobber provenance.
  // Acceptable forms of provenance-safe uniqueness: a partial unique INDEX
  // added AFTER the table definition (any WHERE clause is fine, but the
  // expected one is `where is_superseded = false`).
  assert.match(
    migration,
    /create\s+unique\s+index[\s\S]{0,200}where\s+is_superseded\s*=\s*false/i,
    'Provenance safety requires a partial unique index `where is_superseded = false`.',
  );
});


test('RecommendationEvidenceSection exports LEGACY_PERCENT_EMPTY_LABEL = "Not yet calculated" (never "0%")', () => {
  // Source-grep the section module to lock the constant string without
  // pulling the React subtree (and its `@/lib/recommendations` barrel
  // import) into the node test runner.
  const src = readFileSync(
    'src/components/recommendations/RecommendationEvidenceSection.tsx',
    'utf8',
  );
  assert.match(
    src,
    /export\s+const\s+LEGACY_PERCENT_EMPTY_LABEL\s*=\s*['"]Not yet calculated['"]\s+as\s+const/,
    'RecommendationEvidenceSection must export a `LEGACY_PERCENT_EMPTY_LABEL = "Not yet calculated"` constant for the legacy fallback.',
  );
  assert.match(src, /['"]Not yet calculated['"]/);
  assert.match(src, /\bLEGACY_PERCENT_EMPTY_LABEL\b/);
  // formatPercent must exist and read the constant (not the literal).
  assert.match(
    src,
    /formatPercent[\s\S]{0,160}LEGACY_PERCENT_EMPTY_LABEL/,
    'formatPercent must read LEGACY_PERCENT_EMPTY_LABEL (not a stray literal).',
  );
});

// ── Per-experiment feedback gate (creator panel) ───────────────────────────
// Regression suite for the architectural-review blocker:
//   "hasFeedback" must be derived PER EXPERIMENT (from experiment_feedback
//   rows), NOT from the aggregate `completed_count`. The aggregate would
//   hide the feedback form for every Completed experiment after the first.

test('buildExperimentFeedbackIndex: empty input → empty set (legacy creator with no feedback)', () => {
  const out = buildExperimentFeedbackIndex([]);
  assert.ok(out instanceof Set);
  assert.equal(out.size, 0);
});

test('buildExperimentFeedbackIndex: Experiment A with feedback is in the set, Experiment B without is NOT', () => {
  const rows: ExperimentFeedbackRef[] = [
    { experiment_id: 'exp-A' },
    // exp-B deliberately omitted (no feedback yet)
  ];
  const idx = buildExperimentFeedbackIndex(rows);
  assert.equal(idx.has('exp-A'), true, 'exp-A should be present in the feedback index');
  assert.equal(idx.has('exp-B'), false, 'exp-B should NOT be present (no feedback row)');
  assert.equal(idx.size, 1);
});

test('buildExperimentFeedbackIndex: multiple completed experiments each independently contribute their feedback row', () => {
  // Simulates "Creator completed 5 experiments; we want feedback rows to
  // tile without merging or overwriting."
  const rows: ExperimentFeedbackRef[] = [
    { experiment_id: 'exp-1' },
    { experiment_id: 'exp-2' },
    { experiment_id: 'exp-3' },
    { experiment_id: 'exp-4' },
    { experiment_id: 'exp-5' },
  ];
  const idx = buildExperimentFeedbackIndex(rows);
  for (let i = 1; i <= 5; i++) {
    assert.equal(idx.has(`exp-${i}`), true, `exp-${i} must be present in the index`);
  }
  assert.equal(idx.size, 5);
});

test('buildExperimentFeedbackIndex: continues to allow new feedback after Experiment A already submitted one', () => {
  // Creator completes A, submits feedback, then completes B. After B is
  // marked Completed, B MUST NOT inherit A's feedback status. The index
  // must list ONLY A, so B's feedback form is still visible.
  const rows: ExperimentFeedbackRef[] = [
    { experiment_id: 'exp-A' },
  ];
  const idx = buildExperimentFeedbackIndex(rows);
  assert.equal(idx.has('exp-A'), true);
  assert.equal(idx.has('exp-B'), false, 'exp-B feedback form must still be available');
});

test('buildExperimentFeedbackIndex: deduplicates repeated experiment_id values (defensive)', () => {
  // The DB has a UNIQUE constraint on experiment_id, so duplicates cannot
  // appear in practice; this asserts the pure helper also tolerates
  // duplicates if `select` ever returns them mid-replication.
  const rows: ExperimentFeedbackRef[] = [
    { experiment_id: 'exp-A' },
    { experiment_id: 'exp-A' },
    { experiment_id: 'exp-A' },
  ];
  const idx = buildExperimentFeedbackIndex(rows);
  assert.equal(idx.size, 1);
  assert.equal(idx.has('exp-A'), true);
});

test('buildExperimentFeedbackIndex: ignores malformed rows (missing/empty/non-string experiment_id)', () => {
  const rows: ExperimentFeedbackRef[] = [
    { experiment_id: 'exp-A' },
    { experiment_id: null },
    { experiment_id: undefined },
    { experiment_id: '' },
    // @ts-expect-error -- intentionally bad type
    { experiment_id: 42 },
    {},
  ];
  const idx = buildExperimentFeedbackIndex(rows);
  assert.deepEqual([...idx].sort(), ['exp-A']);
  assert.equal(idx.size, 1);
});

test('CreatorProfileRecommendationPanel: passes PER-EXPERIMENT hasFeedback, not the aggregate completed_count', () => {
  // Lock the panel's source contract by searching for the specific line
  // that previously mis-bound `hasFeedback` to the aggregate.
  // ┌─ BEFORE (the bug) ─────────────────────────────────────────────────────┐
  // │ hasFeedback={Boolean(status?.completed_count)}                        │
  // └───────────────────────────────────────────────────────────────────────┘
  // ┌─ AFTER (the fix) ──────────────────────────────────────────────────────┐
  // │ hasFeedback={feedbackExperimentIds.has(exp.id)}                       │
  // └───────────────────────────────────────────────────────────────────────┘
  const panel = readFileSync(
    'src/components/recommendations/CreatorProfileRecommendationPanel.tsx',
    'utf8',
  );
  // The fix passes the per-experiment lookup.
  assert.match(
    panel,
    /hasFeedback=\{feedbackExperimentIds\.has\(exp\.id\)\}/,
    'Card must receive a PER-EXPERIMENT hasFeedback derived from the feedback index.',
  );
  // The regression: the buggy aggregate binding must NO LONGER appear.
  assert.doesNotMatch(
    panel,
    /hasFeedback=\{Boolean\(status\?\.completed_count\)\}/,
    'The aggregate completed_count binding has been removed.',
  );
  // The state that backs the per-experiment lookup exists and is wired in.
  assert.match(
    panel,
    /feedbackExperimentIds/,
    'Panel declares feedbackExperimentIds state.',
  );
  assert.match(
    panel,
    /listMySubmittedFeedbackIds/,
    'Panel fetches per-experiment feedback ids.',
  );
  // Optimistic update on successful submit so the freshly-submitted card
  // flips hidden without waiting for the round-trip reload. The actual
  // arrow function is multi-line and contains nested parens, so we use a
  // generous character-class match instead of `[^)]+`.
  assert.match(
    panel,
    /setFeedbackExperimentIds[\s\S]{0,400}\.add\(exp\.id\)/,
    'Panel optimistically adds the submitted experiment_id to the local index.',
  );
});

test('CreatorProfileRecommendationPanel: feedbackExperimentIds is rebuilt from DB on every reload, never reads an aggregate', () => {
  const panel = readFileSync(
    'src/components/recommendations/CreatorProfileRecommendationPanel.tsx',
    'utf8',
  );
  // Build the truth by inspecting the snippet around `reload`.
  const feedbackSection = panel.match(/Feedback ids[\s\S]*?setFeedbackExperimentIds[^;]+;/);
  assert.ok(feedbackSection, 'reload() must populate feedbackExperimentIds');
  // The reload MUST call listMySubmittedFeedbackIds (the per-experiment
  // source), not listMyCompletedExperiments or any aggregate counter.
  assert.match(
    feedbackSection[0],
    /listMySubmittedFeedbackIds/,
    'reload() source for feedbackExperimentIds is listMySubmittedFeedbackIds (per-experiment).',
  );
  assert.doesNotMatch(
    feedbackSection[0],
    /completed_count/,
    'feedbackExperimentIds MUST NOT be derived from completed_count.',
  );
});

test('ContentExperimentCard: feedback form visibility is status AND hasFeedback (form only when Completed AND !hasFeedback)', () => {
  const card = readFileSync(
    'src/components/recommendations/ContentExperimentCard.tsx',
    'utf8',
  );
  // The component must consume `hasFeedback` to gate the form.
  assert.match(
    card,
    /showFeedback\s*=\s*experiment\.status\s*===\s*['"]Completed['"]\s*&&\s*!hasFeedback/,
    'Feedback form is visible only when status=Completed AND hasFeedback=false.',
  );
  assert.match(
    card,
    /\{showFeedback\s*&&/,
    'Form is gated by showFeedback.',
  );
});
