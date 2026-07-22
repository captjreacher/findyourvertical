# Recommendation Validation Engine — ADR

**ADR id:** ADR-RECOMMENDATIONS-001
**Status:** Accepted for FYV Sprint 3.x (Recommendation explainability & validation, Phase 1).
**Supersedes:** None.
**Related ADRs:** `docs/architecture/creator-intelligence-architecture-adr.md` (Creator DNA canonical hierarchy).

---

## Context

Find Your Vertical's first-generation recommendation system treated assessment answers as direct inputs to a single blended score and showed that score on the creator's dashboard as if it were a fact about the creator. Two gaps followed:

1. **Scientific credibility.** A score generated from the creator's questionnaire can only be an *initial prediction*. It cannot claim to be validated by the world until a creator has actually attempted the direction with real audiences over time. The previous UI conflated these and overclaimed certainty.
2. **Auditability.** Every recommendation is a hypothesis that gets edited by creators and, occasionally, by their agency. The original evidence and ruleset version that produced the recommendation was being silently rewritten on every edit, so later debugging could not reproduce what the creator was originally shown and why.

Phase 1 introduces a small, deliberately versioned engine that resolves both gaps. Every recommendation now carries (a) a **Predicted Fit** derived strictly from assessment evidence, (b) a **Validation Status** derived from completed content experiments, and (c) an immutable provenance trail that records which ruleset version produced the recommendation and which creator/agency actions have touched it since.

---

## Decision

The Recommendation Validation Engine is split into three orthogonal decisions that hold the rest of the design together.

### 1. Predicted Fit and Validated Fit are SEPARATE signals

**Predicted Fit** is assessment-derived only.

- Inputs: `archetype_fits[].fit_score` and `intelligence.confidence.score` from `CreatorIntelligenceResult`.
- Formula (v1, frozen): `round(fit_score * 0.7 + confidence_score * 0.3)` over a 0–100 whole-percent scale.
- Explicitly excludes `creator_variation_selections`, audience engagement, content performance, monetisation, and creator feedback. These belong to Validated Fit, never Predicted Fit.
- Returns `null` when the intelligence package is empty, so the UI shows "Not yet calculated" instead of fabricating a number.

**Validated Fit** is usage-derived only.

- Inputs: rows in `experiment_feedback` for **completed** experiments only.
- Formula (v1, frozen): per experiment, `(energy + authenticity + (6 - friction_inverted) + willingness + audience)/25 * 100`; validated_fit_score is the mean across the batch.
- Volatility check: contradiction is set when `completed >= 2 AND spread > 20`, or when `completed >= 2 AND burnout-marker count >= 2` (burnout marker = `willingness_to_continue = 1 AND audience_response >= 4`).
- Returns `null` when `completed = 0`.

**Why separation:**

- They answer different questions. Predicted Fit answers *"Does this direction suit you?"* Validated Fit answers *"Did it actually work when you tried it?"* Blending them would mix a hypothesis with evidence about that hypothesis — a self-referential measurement error.
- Consumers disagree. Agency coaching reads Predicted Fit to prioritise; the dashboard's "Validated Fit" tells creators when a direction is safe to brief. Both must be readable independently.
- Drift isolation. If we later replace Predicted Fit with a market-analytics model, Validated Fit must not regress. They live in different files, different ruleset docs, different SQL functions.
- Tone discipline. Confident numerics on a hypothesis create false certainty. Showing two separate, versioned numbers trains the eye (and the agency portal) to read them as different things.

Authoritative files:
- `src/lib/recommendations/predicted-fit.ts` — pure `calculatePredictedFit()` + `PREDICTED_FIT_RULESET_DOC`.
- `src/lib/recommendations/validated-fit.ts` — pure `calculateValidatedFit()` + `VALIDATED_FIT_RULESET_DOC`.

### 2. Provenance rows are IMMUTABLE (`is_superseded`)

Every (creator_id, recommendation_type, recommended_entity_id) tuple in `creator_recommendation_evidence` accumulates history instead of being overwritten.

- The DB unique key is a **partial unique index** scoped to `where is_superseded = false and agency_archived = false`. Superseded rows are allowed to reuse the key.
- Mutation is a two-step transaction:
  1. `supersedeEvidenceRowByKey()` sets `is_superseded = true, updated_at = now()` on the live row for the tuple.
  2. `upsertRecommendationEvidence()` then `INSERT`s a brand-new row.
  3. The legacy full unique constraint was removed from the table definition; a defensive `DO` block drops it on prior environments.
- Every row captures `source_assessment_id`, `generation_method` (`fyv_ruleset_v1 | creator_edited | agency_overridden`), and `model_version` (the ruleset version that produced it). The original "Why this was recommended" copy therefore survives every edit.
- Reads (`listMyLiveEvidence`) filter on `is_superseded = false AND agency_archived = false`. Historical rows are queryable for an audit path.

**Why immutability:**

- Creator edits must not destroy the recommendation that was originally shown. A creator who later disagrees with their own prediction is still entitled to ask "what was the original reasoning?" — that is the audit contract.
- Agency overrides must keep the agency-issued copy distinguishable from the creator-edited copy (`generation_method` does this).
- Ruleset upgrades must be reproducible. Storing `model_version` on every row means a v2 migration can answer the question "what would this row have looked like under the ruleset that produced it?" without a live recompute.
- Soft-delete vs hard-delete. Hard delete would orphan agency billing and audit logs; soft supersede keeps `created_at`, `source_assessment_id`, and the original scoring copy intact.

Authoritative files:
- `src/lib/recommendations/evidence.ts` — `upsertRecommendationEvidence`, `supersedeEvidenceRow`, `supersedeEvidenceRowByKey`, `listMyLiveEvidence`.
- `supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql` — table definition, partial unique index, defensive DO block.

### 3. One feedback submission is associated with ONE experiment

`experiment_feedback` carries a unique constraint on `experiment_id` (`experiment_feedback_one_per_experiment`), so the database refuses a second feedback row for the same completed experiment.

- The submit path is `public.fyv_submit_experiment_feedback`, a `SECURITY DEFINER` function that inserts a single `experiment_feedback` row per experiment and recalculates status in the same call.
- A creator who wants to record feedback for several experiments creates several `content_experiments` rows, completes each separately, and submits one feedback per experiment.
- Validated Fit aggregates across completed-experiment feedback rows. Independently submitted, independently validatable, independently auditable.

**Why one-to-one:**

- An experiment is one empirical observation by one creator. Letting one experiment carry multiple feedback entries invites shape-the-mean manipulation (resubmit until the score reflects what the creator wants).
- Set semantics matter. Validated Fit operates on a multiset of completed experiments; each must contribute one observation or none. Two feedbacks from one experiment would break that set semantics and over-weight that experiment in the mean.
- Atomicity. Combining "submit feedback" and "recompute status" in a single SECURITY DEFINER call guarantees the per-experiment one-to-one vote and removes a class of race-condition bugs around the status row.
- Clearer UI gating. The recommendation panel decides whether to show the feedback form for a single `experiment_id` against a single feedback existence check (`buildExperimentFeedbackIndex`). Aggregate gating would miss this.

Authoritative files:
- `src/lib/recommendations/feedback.ts` — `submitExperimentFeedback`, `listMySubmittedFeedbackIds`, re-export of `buildExperimentFeedbackIndex`.
- `src/lib/recommendations/feedback-validation.ts` — `validateFeedbackInput` (1–5 scale gate) + `buildExperimentFeedbackIndex` (pure helper used by the panel).
- `src/components/recommendations/CreatorProfileRecommendationPanel.tsx` — `feedbackExperimentIds.has(exp.id)` per card.

### 4. The validation state machine has seven DERIVED states

Validation status is **derived from counters and the latest Validated Fit**, never stored as an arbitrary flag.

| # | State | Trigger |
|---|---|---|
| 1 | `Not tested` | `completed = 0 AND in_progress = 0 AND planned = 0` |
| 2 | `Experiment planned` | `completed = 0 AND in_progress = 0 AND planned >= 1` |
| 3 | `Testing` | `completed = 0 AND in_progress >= 1` |
| 4 | `Early evidence` | `completed = 1` (anti-pattern guard; never Validated from one experiment) |
| 5 | `Validated` | `completed >= 4 AND score >= 80 AND not contradictory` |
| 6 | `Contradicted` | `is_contradictory = true` (spread > 20 OR ≥2 burnout markers) — beats Validated |
| 7 | `Inconclusive` | `completed >= 2 AND score < 75 AND not contradictory AND not still testing` |

Rules that protect the model from false-positive graduation:

- **Single experiment anti-pattern guard.** `completed === 1` ALWAYS lands on `Early evidence`, regardless of fit. Even a perfect 100% fit cannot graduate from one observation.
- **Contradiction beats Validated.** When the volatility or burnout rule fires on a non-trivial batch, status switches to `Contradicted` and cannot read as `Validated` until the contradiction clears.
- **Multi-match burnout.** A single burnout-with-loving-audience feedback is not contradiction on its own. Two or more `willingness=1 AND audience>=4` matches across the completed batch are required to escalate.
- **Status is never hand-set.** Status changes are produced EXCLUSIVELY by completing, abandoning, or submitting feedback for an experiment. The UI and API both refuse to write status directly.

Authoritative files:
- `src/lib/recommendations/validation-status.ts` — `deriveValidationStatus`, `deriveStatusFromCounts`, `STATUS_PRESENTATION`, `VALIDATION_STATUS_RULESET_DOC`.
- `supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql` — `fyv_recalculate_creator_validated_fit()` triggers the same derivation server-side.

### 5. Ruleset versioning strategy (single version pin, mirrored)

The whole engine is governed by a single version pin: `RECOMMENDATION_RULESET_VERSION = 'fyv/recommendation/v1'` (declared in `src/lib/recommendations/version.ts`). The same constant is mirrored by the SQL function `public.fyv_recommendation_version()` in the migration.

- **Every evidence row carries `model_version`.** This is the ruleset version that produced the row at write time. Later ruleset upgrades cannot silently rewrite history.
- **Frozen threshold constants.** `VALIDATED_FIT_MIN_EVIDENCE_EXPERIMENTS`, `VALIDATED_MIN_COMPLETED_EXPERIMENTS = 4`, `VALIDATED_FIT_THRESHOLD = 80`, `CONTRADICTION_SPREAD_THRESHOLD = 20`, `VALIDATED_BURNOUT_MIN_MATCHES = 2` are exported from `version.ts` and re-imported by every scoring module and test. The SQL function mirrors each number in the same header comments so the two implementations cannot drift in silence.
- **`_RULESET_DOC` constants.** `PREDICTED_FIT_RULESET_DOC`, `VALIDATED_FIT_RULESET_DOC`, and `VALIDATION_STATUS_RULESET_DOC` are exported frozen `as const` literals. They are the canonical human-readable documentation of the v1 contract and are part of the import surface.
- **Upgrade protocol.** When the team issues v2, the protocol is:
  1. Bump `RECOMMENDATION_RULESET_VERSION` to `'fyv/recommendation/v2'`.
  2. Add a migration that bumps `public.fyv_recommendation_version()`.
  3. Add v2 modules alongside v1 (e.g. `predicted-fit.v2.ts`); keep v1 files untouched so the historical evidence rows for v1 remain reproducible.
  4. Extend the test suite with a `v2 contract` group. Existing v1 tests must continue to pass — that is the upgrade boundary.
- **Why a single pin instead of per-rule pins.** Per-rule versioning individually (one pin per constant) would let the model drift shape-by-shape with no aggregate audit. A single pin matches the product reality: when the team learns something that changes a threshold, we want a single ruleset version we can identify, audit, and reproduce.

Authoritative files:
- `src/lib/recommendations/version.ts` — version pin + frozen constants.
- `src/lib/recommendations/predicted-fit.ts`, `validated-fit.ts`, `validation-status.ts` — every `*_RULESET_DOC` export.
- `tests/recommendations.test.ts` — pins the v1 contract; any v2 work adds an additional test group, never edits v1.

### 6. Canonical source of truth

For Phase 1, several "sources of truth" coexist by role — each role has exactly one canonical surface.

| Concern | Canonical surface | Why |
|---|---|---|
| **Stored fact** (evidence rows, experiment rows, feedback rows, status) | Supabase Postgres tables | The DB is the system of record. RLS + a SECURITY DEFINER RPC boundary enforce ownership atomically. |
| **Predicted Fit / Validated Fit / Validation Status derivation** | `fyv_recalculate_creator_validated_fit()` and `fyv_submit_experiment_feedback()` in the migration (server-side `SECURITY DEFINER`); the TS modules mirror the formulas so the UI can preview without a round-trip | Atomic, transactional, and shared by every caller. The TS module is verified against the SQL in the test suite. |
| **Predicted Fit / Validated Fit math** at preview time | `src/lib/recommendations/predicted-fit.ts`, `validated-fit.ts`, `validation-status.ts` | Pure functions; safe to import from tests; pinned by `*_RULESET_DOC`. NEVER inline the formula in a component — always go through these functions. |
| **Ruleset contract** (the version + thresholds) | `src/lib/recommendations/version.ts` + the migration's `fyv_recommendation_version()` plus the migration's header comments naming the constants | Two artifacts that MUST agree. The SQL header references the TS constant names by path so a future editor sees the cross-reference at the top of the file. |
| **Creator assessment inputs** | `creator_intelligence_snapshots` + `creator_intelligence` graph (existing Sprint 3.0 schema) | Phase 1 deliberately does not duplicate intelligence; it consumes the proven graph. |
| **Computed status aggregate** | `creator_validation_status` row, updated by the `experiment_feedback_recalc` trigger on insert/update | One row per creator. The trigger always derives the same way the TS function does, so reads are consistent without per-page recompute. |

**Honesty contract.** No UI surfaces a "Validated" status from a single experiment. No UI shows a numeric Predicted Fit or Validated Fit value that wasn't produced by one of the canonical functions. No UI writes status directly. The legacy fallback path (`deriveStatusFromCounts`) returns "Not tested" with all counters zero; it never fabricates a number.

**Hash of the invariants — what to break to break the contract:**

1. The DB partial unique index (`where is_superseded = false`) is removed (provenance is clobbered).
2. The `fyv_recalculate_creator_validated_fit()` invariants diverge from `deriveValidationStatus()` (status truth splits).
3. A constant in `version.ts` is edited without bumping the version pin (silent ruleset drift).
4. The frontend writes status directly without going through the trigger.

Any one of those is a rollback-worthy regression.

---

## Consequences

**Positive.**

- Creators always see a strictly separate assessment-derived prediction and a usage-derived validation, so the product cannot lie about confidence.
- Creator edits and agency overrides preserve prior reasoning, so debugging recommendations and training future rulesets is possible.
- A single ruleset pin lets the team audit, snapshot, reproduce, and upgrade the engine in lockstep.
- The TS ↔ SQL mirror pattern means tests can pin the contract without a database.
- Validation status is derived and atomic; there is no second-class path that could put it out of sync.

**Negative.**

- Two sources of truth (TS modules + SQL functions) have to stay in lockstep. Drift is mitigated by the test suite and the SQL header comments.
- Soft-supersede means the evidence row table grows monotonically and we never get history for free; the partial unique index keeps inserts cheap but the DB still accrues rows. Phase 2 may introduce a retention/process-archive job.
- One feedback per experiment constrains creators who want to iterate on a single direction. The product solution is "create another experiment", which is the intended behaviour to keep the set semantics honest.
- Phase 1 is deterministic and rules-based. Until real usage signal exists it cannot be calibrated against empirical outcomes, but the constants are versioned so a future recalibration is a v2 cut, not a hot-reload.

**Accepted trade-off.**

- We accept that Predicted Fit will look "low-precision" (whole numbers, occasional "Not yet calculated") in exchange for never claiming false certainty in front of creators.

---

## Non-Goals

- Not training a new ML model for Predicted Fit. v1 stays rules-based + intelligence-graph-driven.
- Not building machine learning models for Validated Fit. v1 stays transparent and rule-based.
- Not introducing external social-platform analytics. Audiences are observed by creators via the optional `audience_response_score` and never ingested from outside.
- Not rewriting assessment scoring. Phase 1 reuses the existing `creator_intelligence` graph exactly.
- Not retiring the legacy `creator_variation_selections` table in this ADR. Phase 1 leaves it in place but downstream UI reads no longer depend on it for explainability.
- Not collapsing Predicted and Validated into a single blended "Overall Fit" — they are deliberately separate.

---

## References

| Topic | Files |
|---|---|
| Predicted Fit | `src/lib/recommendations/predicted-fit.ts` |
| Validated Fit | `src/lib/recommendations/validated-fit.ts` |
| Validation status state machine | `src/lib/recommendations/validation-status.ts` |
| Provenance + immutable evidence | `src/lib/recommendations/evidence.ts` |
| Evidence signal builder (pure) | `src/lib/recommendations/evidence-builder.ts` |
| Feedback validation + index | `src/lib/recommendations/feedback-validation.ts` |
| Feedback submit service | `src/lib/recommendations/feedback.ts` |
| Content experiment lifecycle | `src/lib/recommendations/content-experiments.ts` |
| Public API barrel | `src/lib/recommendations/index.ts` |
| Ruleset version pin + constants | `src/lib/recommendations/version.ts` |
| Migration (canonical SQL + RLS) | `supabase/migrations/20260801000000_fyv_recommendation_validation_phase1.sql` |
| Creator panel (uses per-experiment feedback gate) | `src/components/recommendations/CreatorProfileRecommendationPanel.tsx` |
| Content experiment card | `src/components/recommendations/ContentExperimentCard.tsx` |
| Test contract | `tests/recommendations.test.ts` |
