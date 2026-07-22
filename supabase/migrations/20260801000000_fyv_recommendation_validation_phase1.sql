-- ============================================================================
-- FYV Phase 1 — Recommendation Explainability & Validation
-- ----------------------------------------------------------------------------
-- Additive migration only. Reuses the existing FYV identity boundary:
--   creator_id = public.creator_profiles.id
--   creator writes through current_creator_profile_id() (auth.uid() → creator)
--   agency access through public.is_agency()
-- No modification to existing canonical intelligence / DNA / persona tables.
--
-- LEGACY UX CONTRACT (deliberate, documented):
--   Creators who finished onboarding before this migration shipped never had
--   their recommendation evidence computed. They MUST see:
--     - Predicted Fit: "Not yet calculated" (NOT 0)
--     - Validation Status: "Not tested" (NOT "0 of 5")
--     - Recommendation Evidence: "Not available"
--   The panel's `ensureSeededEvidence` path can write a row for legacy
--   profiles, but the row's predicted_fit_score is NULL by design (no full
--   intelligence graph is loaded in the seed path) and the UI shows "Not yet
--   calculated" until a NEW assessment is completed. The seeded row records
--   provenance so a future ruleset revision can rehydrate without losing
--   the original generation_method or source_assessment_id.
-- ============================================================================

begin;

-- ── Helpers (versioned, deterministic, single source of truth) ───────────────
-- Consensus confidence guards: numbers pulled from existing canonical fields.

create or replace function public.fyv_recommendation_version()
returns text
language sql
immutable
as $$
  select 'fyv/recommendation/v1';
$$;

-- ── Recommendation evidence (per recommended entity per creator) ─────────────
-- One row per (creator_id, recommendation_type, recommended_entity_id).
-- supporting_signals is JSONB so we can carry the structured payload the UI
-- displays WITHOUT bloating the column with prose.
-- Deterministic unique key prevents duplicate evidence rows.

create table if not exists public.creator_recommendation_evidence (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Canonical FYV creator identity.
  creator_id uuid not null
    references public.creator_profiles(id)
    on delete cascade,

  recommendation_type text not null
    check (recommendation_type in ('creator_profile', 'creator_vertical', 'archetype')),

  recommended_entity_id text not null,
  recommended_entity_label text not null,

  predicted_fit_score integer
    check (predicted_fit_score is null or (predicted_fit_score between 0 and 100)),
  predicted_fit_confidence integer
    check (predicted_fit_confidence is null or (predicted_fit_confidence between 0 and 100)),

  explanation_summary text not null,

  supporting_signals jsonb not null default '[]'::jsonb,
  source_question_keys text[] not null default '{}'::text[],
  source_assessment_id uuid
    references public.creator_assessments(id)
    on delete set null,

  generation_method text not null default 'fyv_ruleset_v1'
    check (generation_method in ('fyv_ruleset_v1', 'creator_edited', 'agency_overridden')),

  model_version text not null default public.fyv_recommendation_version(),

  validated_fit_score integer
    check (validated_fit_score is null or (validated_fit_score between 0 and 100)),
  last_validated_at timestamptz,

  -- Creator-owned editable provenance flag. When a creator edits the
  -- recommendation (e.g. swaps the vertical) we set this true on a NEW row,
  -- never overwrite this row. Original provenance lives forever.
  is_superseded boolean not null default false,

  -- Soft override by agency (rare; audit-visible).
  agency_archived boolean not null default false
);
-- NOTE: no full unique constraint here. Uniqueness is enforced by the partial
-- unique index below so superseded rows (provenance history) can accumulate.
-- The client-side upsert in src/lib/recommendations/evidence.ts soft-supersedes
-- any existing live row before inserting a new one, preserving the prior
-- generation_method / source_assessment_id for audit-grade traceability.

create index if not exists creator_recommendation_evidence_creator_idx
  on public.creator_recommendation_evidence (creator_id, created_at desc);

create index if not exists creator_recommendation_evidence_status_idx
  on public.creator_recommendation_evidence (creator_id, recommendation_type)
  where is_superseded = false and agency_archived = false;

create index if not exists creator_recommendation_evidence_validated_at_idx
  on public.creator_recommendation_evidence (last_validated_at desc)
  where last_validated_at is not null;

-- Partial unique index: exactly ONE live row per (creator, type, entity).
-- Superseded rows may repeat the key, so creator/agency edits accumulate as
-- new rows instead of clobbering provenance.
create unique index if not exists creator_recommendation_evidence_live_uniq
  on public.creator_recommendation_evidence (creator_id, recommendation_type, recommended_entity_id)
  where is_superseded = false and agency_archived = false;

-- Defensive cleanup: if the original full unique constraint
-- `creator_recommendation_evidence_unique` was already shipped on a prior
-- environment, drop it now so the partial index becomes effective. Drop is
-- idempotent — DO statements are safe when the constraint doesn't exist.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'creator_recommendation_evidence_unique'
      and conrelid = 'public.creator_recommendation_evidence'::regclass
  ) then
    alter table public.creator_recommendation_evidence
      drop constraint creator_recommendation_evidence_unique;
  end if;
end
$$;

alter table public.creator_recommendation_evidence enable row level security;

revoke all on public.creator_recommendation_evidence from public;
revoke all on public.creator_recommendation_evidence from anon;

grant select, insert, update on public.creator_recommendation_evidence to authenticated;
grant select, insert, update, delete on public.creator_recommendation_evidence to service_role;

-- Creator can read/write their own evidence rows.
drop policy if exists "Creator read own recommendation evidence" on public.creator_recommendation_evidence;
create policy "Creator read own recommendation evidence"
  on public.creator_recommendation_evidence
  for select to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator write own recommendation evidence" on public.creator_recommendation_evidence;
create policy "Creator write own recommendation evidence"
  on public.creator_recommendation_evidence
  for insert to authenticated
  with check (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator update own recommendation evidence" on public.creator_recommendation_evidence;
create policy "Creator update own recommendation evidence"
  on public.creator_recommendation_evidence
  for update to authenticated
  using (creator_id = public.current_creator_profile_id());

-- Agency: full read/write (cockpit operators need to see contradictions + override archived).
drop policy if exists "Agency full access recommendation evidence" on public.creator_recommendation_evidence;
create policy "Agency full access recommendation evidence"
  on public.creator_recommendation_evidence
  for all to authenticated
  using (public.is_agency())
  with check (public.is_agency());


-- ── Content experiments (creator-lightweight) ────────────────────────────────
-- One row per experiment. References the recommendation it's testing so we can
-- re-link Validated Fit back to the recommendation that predicted it.
create table if not exists public.content_experiments (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  creator_id uuid not null
    references public.creator_profiles(id)
    on delete cascade,

  -- Optional link to the recommendation this experiment is testing.
  recommendation_id uuid
    references public.creator_recommendation_evidence(id)
    on delete set null,

  title text not null,
  hypothesis text,
  intended_audience text,
  platform text,
  content_format text,
  message_angle text,
  planned_content_count integer
    check (planned_content_count is null or planned_content_count > 0),

  status text not null default 'Draft'
    check (status in ('Draft', 'Planned', 'In progress', 'Completed', 'Abandoned')),

  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,

  notes text
);

create index if not exists content_experiments_creator_status_idx
  on public.content_experiments (creator_id, status, created_at desc);

create index if not exists content_experiments_recommendation_idx
  on public.content_experiments (recommendation_id)
  where recommendation_id is not null;

create index if not exists content_experiments_completed_idx
  on public.content_experiments (creator_id, completed_at desc)
  where status = 'Completed';

alter table public.content_experiments enable row level security;

revoke all on public.content_experiments from public;
revoke all on public.content_experiments from anon;

grant select, insert, update on public.content_experiments to authenticated;
grant select, insert, update, delete on public.content_experiments to service_role;

drop policy if exists "Creator read own experiments" on public.content_experiments;
create policy "Creator read own experiments"
  on public.content_experiments
  for select to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator write own experiments" on public.content_experiments;
create policy "Creator write own experiments"
  on public.content_experiments
  for insert to authenticated
  with check (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator update own experiments" on public.content_experiments;
create policy "Creator update own experiments"
  on public.content_experiments
  for update to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Agency full access experiments" on public.content_experiments;
create policy "Agency full access experiments"
  on public.content_experiments
  for all to authenticated
  using (public.is_agency())
  with check (public.is_agency());


-- ── Experiment feedback (the 5 validated-fit dimensions) ────────────────────
-- Always linked to a completed experiment. Per-experiment row, not per-post.
create table if not exists public.experiment_feedback (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),

  experiment_id uuid not null
    references public.content_experiments(id)
    on delete cascade,

  creator_id uuid not null
    references public.creator_profiles(id)
    on delete cascade,

  -- All five 1-5 scales. Lower friction = better (we invert at compute time).
  creator_energy_score smallint not null
    check (creator_energy_score between 1 and 5),
  authenticity_score smallint not null
    check (authenticity_score between 1 and 5),
  creation_friction_score smallint not null
    check (creation_friction_score between 1 and 5),
  willingness_to_continue_score smallint not null
    check (willingness_to_continue_score between 1 and 5),

  -- Audience response: documented as only one part of validation.
  audience_response_score smallint
    check (audience_response_score is null or audience_response_score between 1 and 5),

  notes text,

  constraint experiment_feedback_one_per_experiment
    unique (experiment_id)
);

create index if not exists experiment_feedback_creator_idx
  on public.experiment_feedback (creator_id, created_at desc);

create index if not exists experiment_feedback_experiment_idx
  on public.experiment_feedback (experiment_id);

alter table public.experiment_feedback enable row level security;

revoke all on public.experiment_feedback from public;
revoke all on public.experiment_feedback from anon;

grant select, insert, update on public.experiment_feedback to authenticated;
grant select, insert, update, delete on public.experiment_feedback to service_role;

drop policy if exists "Creator read own experiment feedback" on public.experiment_feedback;
create policy "Creator read own experiment feedback"
  on public.experiment_feedback
  for select to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator write own experiment feedback" on public.experiment_feedback;
create policy "Creator write own experiment feedback"
  on public.experiment_feedback
  for insert to authenticated
  with check (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator update own experiment feedback" on public.experiment_feedback;
create policy "Creator update own experiment feedback"
  on public.experiment_feedback
  for update to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Agency full access experiment feedback" on public.experiment_feedback;
create policy "Agency full access experiment feedback"
  on public.experiment_feedback
  for all to authenticated
  using (public.is_agency())
  with check (public.is_agency());


-- ── Validation status — single source of truth at the creator level ─────────
-- Aggregates across all live (non-superseded) recommendations for a creator.
-- One row per creator; UPDATE on every feedback submission / status change.
create table if not exists public.creator_validation_status (
  creator_id uuid primary key
    references public.creator_profiles(id)
    on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Derived from (planned, in_progress, completed, contradicting) counts.
  status text not null default 'Not tested'
    check (status in ('Not tested', 'Experiment planned', 'Testing', 'Early evidence',
                     'Validated', 'Contradicted', 'Inconclusive')),

  -- Aggregate counts feeding the state machine.
  planned_count integer not null default 0,
  in_progress_count integer not null default 0,
  completed_count integer not null default 0,
  contradicting_count integer not null default 0,

  -- Aggregate Validated Fit across all completed experiments for the creator.
  validated_fit_score integer
    check (validated_fit_score is null or (validated_fit_score between 0 and 100)),

  -- True iff any per-experiment band triggered Contradicted.
  is_contradictory boolean not null default false,

  last_recalculated_at timestamptz not null default now()
);

alter table public.creator_validation_status enable row level security;

revoke all on public.creator_validation_status from public;
revoke all on public.creator_validation_status from anon;

grant select, insert, update on public.creator_validation_status to authenticated;
grant select, insert, update, delete on public.creator_validation_status to service_role;

drop policy if exists "Creator read own validation status" on public.creator_validation_status;
create policy "Creator read own validation status"
  on public.creator_validation_status
  for select to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator upsert own validation status" on public.creator_validation_status;
create policy "Creator upsert own validation status"
  on public.creator_validation_status
  for insert to authenticated
  with check (creator_id = public.current_creator_profile_id());

drop policy if exists "Creator update own validation status" on public.creator_validation_status;
create policy "Creator update own validation status"
  on public.creator_validation_status
  for update to authenticated
  using (creator_id = public.current_creator_profile_id());

drop policy if exists "Agency full access validation status" on public.creator_validation_status;
create policy "Agency full access validation status"
  on public.creator_validation_status
  for all to authenticated
  using (public.is_agency())
  with check (public.is_agency());


-- ── Atomic RPC: submit feedback → recalculate Validated Fit → emit event ──
-- SECURITY DEFINER so the cross-table update is atomic and the resulting state
-- is consistent regardless of which client calls.
create or replace function public.fyv_submit_experiment_feedback(
  p_experiment_id uuid,
  p_creator_energy_score smallint,
  p_authenticity_score smallint,
  p_creation_friction_score smallint,
  p_willingness_to_continue_score smallint,
  p_audience_response_score smallint,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_creator_id uuid;
  v_experiment_status text;
  v_feedback_id uuid;
  v_calculation jsonb;
begin
  if p_creator_energy_score is null
     or p_authenticity_score is null
     or p_creation_friction_score is null
     or p_willingness_to_continue_score is null then
    raise exception 'Core dimensions (creator_energy, authenticity, friction, willingness) are required.'
      using errcode = '22023';
  end if;

  if (p_creator_energy_score < 1 or p_creator_energy_score > 5)
     or (p_authenticity_score < 1 or p_authenticity_score > 5)
     or (p_creation_friction_score < 1 or p_creation_friction_score > 5)
     or (p_willingness_to_continue_score < 1 or p_willingness_to_continue_score > 5) then
    raise exception 'Core dimension scores must be 1-5'
      using errcode = '22023';
  end if;

  if p_audience_response_score is not null
     and (p_audience_response_score < 1 or p_audience_response_score > 5) then
    raise exception 'Audience response score must be 1-5'
      using errcode = '22023';
  end if;

  -- Resolve experiment + ensure ownership.
  select creator_id, status
    into v_creator_id, v_experiment_status
  from public.content_experiments
  where id = p_experiment_id;

  if v_creator_id is null then
    raise exception 'Experiment not found'
      using errcode = 'P0002';
  end if;

  if v_creator_id <> public.current_creator_profile_id() and not public.is_agency() then
    raise exception 'You can only submit feedback for your own experiments'
      using errcode = '42501';
  end if;

  if v_experiment_status <> 'Completed' then
    raise exception 'Feedback requires a Completed experiment (current status: %)',
      v_experiment_status
      using errcode = '22023';
  end if;

  -- Upsert the feedback. Unique constraint prevents double-submission.
  insert into public.experiment_feedback (
    experiment_id, creator_id,
    creator_energy_score, authenticity_score, creation_friction_score,
    willingness_to_continue_score, audience_response_score, notes
  ) values (
    p_experiment_id, v_creator_id,
    p_creator_energy_score, p_authenticity_score, p_creation_friction_score,
    p_willingness_to_continue_score, p_audience_response_score, p_notes
  )
  on conflict (experiment_id) do update set
    creator_energy_score = excluded.creator_energy_score,
    authenticity_score = excluded.authenticity_score,
    creation_friction_score = excluded.creation_friction_score,
    willingness_to_continue_score = excluded.willingness_to_continue_score,
    audience_response_score = excluded.audience_response_score,
    notes = excluded.notes
  returning id into v_feedback_id;

  -- Recalculate Validated Fit + status for the creator.
  v_calculation := public.fyv_recalculate_creator_validated_fit(v_creator_id);

  return jsonb_build_object(
    'feedback_id', v_feedback_id,
    'experiment_id', p_experiment_id,
    'creator_id', v_creator_id,
    'validated_fit_score', v_calculation -> 'validated_fit_score',
    'status', v_calculation -> 'status',
    'completed_count', v_calculation -> 'completed_count',
    'is_contradictory', v_calculation -> 'is_contradictory'
  );
end;
$$;

revoke all on function public.fyv_submit_experiment_feedback(
  uuid, smallint, smallint, smallint, smallint, smallint, text
) from public;
grant execute on function public.fyv_submit_experiment_feedback(
  uuid, smallint, smallint, smallint, smallint, smallint, text
) to authenticated, service_role;


-- ── Validation recalculation: single source of truth ──────────────────────
-- Phase 1 formula (documented; replaceable by editing this function only):
--   Validated Fit = mean over COMPLETED experiments of:
--     (energy + auth + (6 - friction) + willingness + audience) / 25 * 100
--   - lower friction scoring is inverted here so higher = better
--   - one experiment alone is allowed but the state machine still gates
--     "Validated" on count.
create or replace function public.fyv_recalculate_creator_validated_fit(
  p_creator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_planned_count integer := 0;
  v_in_progress_count integer := 0;
  v_completed_count integer := 0;
  v_contradicting_count integer := 0;
  v_validated_fit integer := null;
  v_is_contradictory boolean := false;
  v_status text;
  v_now timestamptz := now();
  rec record;
  v_avg numeric;
  v_min integer;
  v_max integer;
  v_score integer;
  v_one_band_count integer := 0;
  v_three_plus_high_count integer := 0;
  -- Burnout-contradiction counter. Threshold = 2 matches in the COMPLETED
  -- batch elevates the direction to Contradicted. MUST stay in lockstep with
  -- src/lib/recommendations/version.ts → VALIDATED_BURNOUT_MIN_MATCHES.
  -- If you bump one, bump the other and run tests/recommendations.test.ts.
  v_burnout_match_count integer := 0;
  v_three_plus_low_count integer := 0;
begin
  if p_creator_id is null then
    raise exception 'creator_id is required' using errcode = '22023';
  end if;

  -- Aggregate state counts.
  select count(*) into v_planned_count
  from public.content_experiments
  where creator_id = p_creator_id and status = 'Planned';

  select count(*) into v_in_progress_count
  from public.content_experiments
  where creator_id = p_creator_id and status = 'In progress';

  select count(*) into v_completed_count
  from public.content_experiments
  where creator_id = p_creator_id and status = 'Completed';

  -- Validated Fit = mean across completed experiments. Edge case: no feedback
  -- rows yet (e.g. experiment just marked Complete without feedback). Skip.
  select avg(
      (
        (f.creator_energy_score)
        + (f.authenticity_score)
        + (6 - f.creation_friction_score)
        + (f.willingness_to_continue_score)
        + coalesce(f.audience_response_score, 3)
      )::numeric / 25.0 * 100.0
    ),
    max(
      ((f.creator_energy_score)
       + (f.authenticity_score)
       + (6 - f.creation_friction_score)
       + (f.willingness_to_continue_score)
       + coalesce(f.audience_response_score, 3))::numeric / 25.0 * 100.0
    ),
    min(
      ((f.creator_energy_score)
       + (f.authenticity_score)
       + (6 - f.creation_friction_score)
       + (f.willingness_to_continue_score)
       + coalesce(f.audience_response_score, 3))::numeric / 25.0 * 100.0
    )
    into v_avg, v_max, v_min
  from public.experiment_feedback f
  join public.content_experiments e on e.id = f.experiment_id
  where e.creator_id = p_creator_id
    and e.status = 'Completed';

  if v_avg is not null then
    v_validated_fit := round(v_avg)::integer;
  end if;

  -- Volatility check: if at least 2 completed experiments and the spread
  -- between highest and lowest is > 20 points, mark this batch contradictory.
  -- (Single experiment can NEVER trigger this; it cannot contradict itself.)
  if v_completed_count >= 2 and v_max is not null and v_min is not null
     and (v_max - v_min) > 20 then
    v_is_contradictory := true;
    v_contradicting_count := v_completed_count;
  end if;

  -- Per-experiment banding for the additional contradiction rule (high burnout):
  -- willingness_to_continue_score = 1 AND audience_response_score >= 4 (people
  -- loved it but the creator hated it). A SINGLE such row is not contradiction
  -- by itself; the rule elevates only when >=2 burnout matches accumulate in
  -- the COMPLETED batch (mirrors validated-fit.ts hasBurnoutMarker logic + the
  -- VALIDATED_BURNOUT_MIN_MATCHES constant).
  v_burnout_match_count := 0;
  for rec in
    select f.willingness_to_continue_score, f.audience_response_score
    from public.experiment_feedback f
    join public.content_experiments e on e.id = f.experiment_id
    where e.creator_id = p_creator_id and e.status = 'Completed'
  loop
    if rec.willingness_to_continue_score = 1 and coalesce(rec.audience_response_score, 0) >= 4 then
      v_burnout_match_count := v_burnout_match_count + 1;
    end if;
  end loop;

  if v_completed_count >= 2 and v_burnout_match_count >= 2 then
    v_is_contradictory := true;
    v_contradicting_count := v_completed_count;
  end if;

  -- State machine (single source of truth — UI never sets this directly):
  -- Not tested          when planned=0, in_progress=0, completed=0
  -- Experiment planned  when planned>=1, completed=0
  -- Testing             when in_progress>=1
  -- Early evidence      when completed=1
  -- ConValided          when completed>=4 AND avg>=80 AND not contradictory
  -- Contradicted        when contradictory batch detected (>=2 with high spread OR burnout marker)
  -- Inconclusive        when completed>=2 AND avg<75 AND not contradictory AND no in_progress
  if v_completed_count = 0 and v_in_progress_count = 0 and v_planned_count = 0 then
    v_status := 'Not tested';
  elsif v_completed_count = 0 and v_in_progress_count >= 1 then
    v_status := 'Testing';
  elsif v_completed_count = 0 and v_planned_count >= 1 then
    v_status := 'Experiment planned';
  elsif v_completed_count = 1 then
    v_status := 'Early evidence';
  elsif v_completed_count >= 4 and v_validated_fit is not null
        and v_validated_fit >= 80 and not v_is_contradictory then
    v_status := 'Validated';
  elsif v_is_contradictory then
    v_status := 'Contradicted';
  elsif v_in_progress_count >= 1 then
    v_status := 'Testing';
  elsif v_validated_fit is not null and v_validated_fit < 75 then
    v_status := 'Inconclusive';
  else
    v_status := 'Early evidence';
  end if;

  -- Upsert the aggregate. Single row per creator.
  insert into public.creator_validation_status (
    creator_id, status,
    planned_count, in_progress_count, completed_count, contradicting_count,
    validated_fit_score, is_contradictory,
    last_recalculated_at, created_at, updated_at
  ) values (
    p_creator_id, v_status,
    v_planned_count, v_in_progress_count, v_completed_count, v_contradicting_count,
    v_validated_fit, v_is_contradictory,
    v_now, v_now, v_now
  )
  on conflict (creator_id) do update set
    status = excluded.status,
    planned_count = excluded.planned_count,
    in_progress_count = excluded.in_progress_count,
    completed_count = excluded.completed_count,
    contradicting_count = excluded.contradicting_count,
    validated_fit_score = excluded.validated_fit_score,
    is_contradictory = excluded.is_contradictory,
    last_recalculated_at = v_now,
    updated_at = v_now;

  -- Update last_validated_at on associated recommendation evidence (latest
  -- non-superseded) if requested by trigger.
  update public.creator_recommendation_evidence
    set last_validated_at = v_now,
        updated_at = v_now,
        validated_fit_score = v_validated_fit
  where creator_id = p_creator_id
    and is_superseded = false
    and agency_archived = false;

  -- Emit audit event using the existing fyv_emit_event RPC pattern.
  perform public.fyv_emit_validation_change(
    p_creator_id, v_status, v_validated_fit, v_completed_count, v_is_contradictory
  );

  return jsonb_build_object(
    'status', v_status,
    'validated_fit_score', v_validated_fit,
    'planned_count', v_planned_count,
    'in_progress_count', v_in_progress_count,
    'completed_count', v_completed_count,
    'contradicting_count', v_contradicting_count,
    'is_contradictory', v_is_contradictory
  );
end;
$$;

revoke all on function public.fyv_recalculate_creator_validated_fit(uuid) from public;
grant execute on function public.fyv_recalculate_creator_validated_fit(uuid)
  to authenticated, service_role;


-- ── Diagnostic event emission for validation lifecycle transitions ─────────
create or replace function public.fyv_emit_validation_change(
  p_creator_id uuid,
  p_status text,
  p_validated_fit_score integer,
  p_completed_count integer,
  p_is_contradictory boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correlation text;
begin
  v_correlation := 'fyv:validation:' || p_creator_id::text
    || ':' || extract(epoch from now())::bigint::text;

  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload, correlation_id
    )
    values (
      'findyourvertical',
      'creator.recommendation_validation.recalculated',
      'creator_profile',
      p_creator_id,
      'fyv_creator:' || p_creator_id::text,
      'pending',
      jsonb_build_object(
        'event_type', 'creator.recommendation_validation.recalculated',
        'source_product', 'FYV',
        'creator_reference', 'fyv:' || p_creator_id::text,
        'validation_status', p_status,
        'validated_fit_score', p_validated_fit_score,
        'completed_experiment_count', p_completed_count,
        'is_contradictory', p_is_contradictory,
        'ruleset_version', public.fyv_recommendation_version(),
        'recalculated_at', now()::text
      ),
      v_correlation
    )
    on conflict do nothing;
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.fyv_emit_validation_change(
  uuid, text, integer, integer, boolean
) from public;
grant execute on function public.fyv_emit_validation_change(
  uuid, text, integer, integer, boolean
) to authenticated, service_role;


-- ── Maintain trigger: any status / feedback change triggers recalculation ──
create or replace function public.fyv_trigger_validation_recalc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fyv_recalculate_creator_validated_fit(coalesce(new.creator_id, old.creator_id));
  return null;
end;
$$;

drop trigger if exists content_experiment_status_recalc on public.content_experiments;
create trigger content_experiment_status_recalc
  after update of status on public.content_experiments
  for each row
  execute function public.fyv_trigger_validation_recalc();

drop trigger if exists content_experiment_insert_recalc on public.content_experiments;
create trigger content_experiment_insert_recalc
  after insert on public.content_experiments
  for each row
  execute function public.fyv_trigger_validation_recalc();

drop trigger if exists experiment_feedback_recalc on public.experiment_feedback;
create trigger experiment_feedback_recalc
  after insert or update on public.experiment_feedback
  for each row
  execute function public.fyv_trigger_validation_recalc();


commit;
