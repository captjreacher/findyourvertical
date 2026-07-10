-- ============================================================================
-- FYV-PERSONA-1B — 3-2-1 Persona Portfolio Generation
-- ----------------------------------------------------------------------------
-- Purpose:
--   Turn a creator's LOCKED PERSONA-1A archetype snapshot + variation selections
--   into a balanced six-persona draft portfolio (3 primary / 2 secondary /
--   1 third). This sprint stops at generated DRAFT personas displayed in a
--   read-only workspace. No editing, activation, photos, or platform deployment.
--
--   1. public.creator_persona_generations — one generation event per active
--      snapshot. Holds lifecycle state, provider/model + prompt/schema versions,
--      an idempotency digest, and IMMUTABLE input/output provenance snapshots.
--   2. public.creator_personas — the six structured draft personas produced by a
--      generation, each linked to exactly one source variation (lineage).
--
-- Security model (deliberate):
--   * Creator access to generated records is READ-ONLY via own-row RLS.
--   * Generation is initiated ONLY by the Cloudflare Worker using the service
--     role, through SECURITY DEFINER RPCs (request / complete / fail). Creators
--     cannot insert/update/delete these rows directly.
--   * anon and PUBLIC are explicitly revoked on both tables.
--   * completion inserts all six personas AND marks the generation complete in a
--     single transaction; failure records a sanitised reason and guarantees ZERO
--     persona rows.
--   * One ACTIVE generation per snapshot (partial unique index) + a stable
--     request digest prevent duplicate active portfolios; failed generations are
--     retried in place.
--
-- Conventions reused from PERSONA-1A / Creator-Home (PR #11):
--   * public.is_agency(), public.current_creator_profile_id() (security definer)
--   * public.set_updated_at() trigger fn
--   * gen_random_uuid(); guarded CREATE ... IF NOT EXISTS; DROP POLICY IF EXISTS
--   * Audit via the existing public.events ledger (no second event system).
-- ============================================================================

begin;

-- ── 1. Persona generation event (provenance + lifecycle) ─────────────────────
create table if not exists public.creator_persona_generations (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  snapshot_id         uuid not null references public.creator_archetype_snapshots(id) on delete cascade,
  -- Lifecycle of THIS generation attempt.
  status              text not null default 'pending'
                        check (status in ('pending', 'generating', 'completed', 'failed')),
  -- 'active' is the current generation for a snapshot; a future re-derivation
  -- may 'supersede' it. Retryable failures stay 'active'.
  lifecycle_status    text not null default 'active'
                        check (lifecycle_status in ('active', 'superseded')),
  generation_method   text not null default 'ai_provider'
                        check (generation_method in ('ai_provider', 'fixture')),
  provider            text,
  model               text,
  prompt_version      text not null,
  schema_version      text not null,
  -- Stable idempotency digest over (snapshot + exact source variation ids +
  -- prompt version + schema version). Repeated identical requests reuse the row.
  request_digest      text not null,
  -- IMMUTABLE provenance. input_snapshot preserves enough to reproduce/audit:
  -- locked archetypes, selected variation ids/names/descriptions, chosen source
  -- set, creator context used, generation rules, prompt/schema versions.
  input_snapshot      jsonb not null default '{}'::jsonb,
  -- Raw validated model output (null until completed).
  output_snapshot     jsonb,
  attempts            integer not null default 0,
  failure_code        text,
  failure_reason      text,
  completed_at        timestamptz
);

-- At most one ACTIVE generation per snapshot (prevents duplicate portfolios).
create unique index if not exists creator_persona_generations_one_active
  on public.creator_persona_generations (snapshot_id)
  where lifecycle_status = 'active';

create index if not exists idx_creator_persona_generations_profile
  on public.creator_persona_generations (creator_profile_id, created_at desc);

create index if not exists idx_creator_persona_generations_digest
  on public.creator_persona_generations (request_digest);

alter table public.creator_persona_generations enable row level security;

-- Explicitly deny anon + PUBLIC. Creators get READ-ONLY own-row via RLS below;
-- writes happen only through the service-role definer RPCs.
revoke all on public.creator_persona_generations from public;
revoke all on public.creator_persona_generations from anon;
grant select on public.creator_persona_generations to authenticated;
grant select, insert, update, delete on public.creator_persona_generations to service_role;

drop policy if exists "Agency full access persona generations" on public.creator_persona_generations;
create policy "Agency full access persona generations"
  on public.creator_persona_generations for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own persona generations" on public.creator_persona_generations;
create policy "Creator can read own persona generations"
  on public.creator_persona_generations for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_persona_generations_updated_at on public.creator_persona_generations;
create trigger trg_creator_persona_generations_updated_at
  before update on public.creator_persona_generations
  for each row execute function public.set_updated_at();

-- ── 2. Generated draft personas ──────────────────────────────────────────────
create table if not exists public.creator_personas (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  generation_id       uuid not null references public.creator_persona_generations(id) on delete cascade,
  snapshot_id         uuid not null references public.creator_archetype_snapshots(id) on delete cascade,
  -- Lineage: the exact variation this persona was built from. RESTRICT so the
  -- creative source survives (a library variation cannot be deleted out from
  -- under a generated persona).
  source_variation_id uuid not null references public.archetype_variations(id) on delete restrict,
  source_archetype    text not null,
  archetype_rank      text not null check (archetype_rank in ('primary', 'secondary', 'third')),
  portfolio_position  integer not null check (portfolio_position between 1 and 6),
  -- Stable creator-facing display fields (explicit columns for the workspace +
  -- future setup flow); variable-length creative detail lives in profile jsonb.
  display_name        text not null,
  persona_title       text not null,
  one_line_premise    text not null,
  profile             jsonb not null default '{}'::jsonb,
  -- draft/archived now; ready/active/superseded/setup_incomplete are a forward
  -- seam so PERSONA-1C can advance status without a schema migration.
  status              text not null default 'draft'
                        check (status in ('draft', 'archived', 'setup_incomplete', 'ready', 'active', 'superseded')),
  sort_order          integer not null default 0,
  -- One persona per selected source variation, and one persona per position.
  constraint creator_personas_unique_source unique (generation_id, source_variation_id),
  constraint creator_personas_unique_position unique (generation_id, portfolio_position)
);

create index if not exists idx_creator_personas_generation
  on public.creator_personas (generation_id, portfolio_position);

create index if not exists idx_creator_personas_profile
  on public.creator_personas (creator_profile_id, created_at desc);

alter table public.creator_personas enable row level security;

revoke all on public.creator_personas from public;
revoke all on public.creator_personas from anon;
grant select on public.creator_personas to authenticated;
grant select, insert, update, delete on public.creator_personas to service_role;

drop policy if exists "Agency full access personas" on public.creator_personas;
create policy "Agency full access personas"
  on public.creator_personas for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own personas" on public.creator_personas;
create policy "Creator can read own personas"
  on public.creator_personas for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_personas_updated_at on public.creator_personas;
create trigger trg_creator_personas_updated_at
  before update on public.creator_personas
  for each row execute function public.set_updated_at();

-- ── 3. Best-effort audit emitter (reuses public.events; never breaks core txn) ─
-- SECURITY DEFINER so it can insert regardless of the narrow anon FYV policy.
-- Wrapped by callers in an exception-swallowing block: audit is not allowed to
-- roll back a successful generation/completion.
create or replace function public.fyv_emit_persona_event(
  p_event_type         text,
  p_creator_profile_id uuid,
  p_generation_id      uuid,
  p_status             text,
  p_payload            jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload
    ) values (
      'findyourvertical',
      p_event_type,
      'creator_persona_generation',
      p_generation_id,
      'creator_profile:' || p_creator_profile_id::text,
      p_status,
      coalesce(p_payload, '{}'::jsonb)
    );
  exception when others then
    -- Audit is best-effort; never fail the caller's transaction on ledger drift.
    null;
  end;
end;
$$;

revoke all on function public.fyv_emit_persona_event(text, uuid, uuid, text, jsonb) from public;
grant execute on function public.fyv_emit_persona_event(text, uuid, uuid, text, jsonb) to service_role;

-- ── 4. request_creator_persona_generation() — service-role only ──────────────
-- Validates ownership + active snapshot + PERSONA-1A completeness, then creates
-- or reuses the single ACTIVE generation for the snapshot. Idempotent:
--   * completed  → returns { already_completed: true, started: false }
--   * generating → returns { started: false } (a run is already in progress)
--   * failed     → reset to 'generating' and returns { started: true } (retry)
--   * none       → insert 'generating' and returns { started: true }
create or replace function public.request_creator_persona_generation(
  p_creator_profile_id uuid,
  p_snapshot_id        uuid,
  p_prompt_version     text,
  p_schema_version     text,
  p_request_digest     text,
  p_input_snapshot     jsonb,
  p_generation_method  text default 'ai_provider',
  p_provider           text default null,
  p_model              text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_snapshot   public.creator_archetype_snapshots;
  v_gen        public.creator_persona_generations;
  v_primary    integer;
  v_secondary  integer;
  v_third      integer;
  v_started    boolean := false;
begin
  if p_creator_profile_id is null or p_snapshot_id is null then
    raise exception 'creator_profile_id and snapshot_id are required' using errcode = '22023';
  end if;

  select * into v_snapshot
  from public.creator_archetype_snapshots
  where id = p_snapshot_id;

  if not found then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;
  if v_snapshot.creator_profile_id <> p_creator_profile_id then
    raise exception 'snapshot does not belong to creator' using errcode = '42501';
  end if;
  if v_snapshot.status <> 'active' then
    raise exception 'snapshot is not active' using errcode = 'P0001';
  end if;

  -- PERSONA-1A completeness gate (>=3 primary, >=2 secondary, >=1 third).
  select
    count(*) filter (where archetype_rank = 'primary'),
    count(*) filter (where archetype_rank = 'secondary'),
    count(*) filter (where archetype_rank = 'third')
  into v_primary, v_secondary, v_third
  from public.creator_variation_selections
  where snapshot_id = p_snapshot_id and status = 'selected';

  if coalesce(v_primary, 0) < 3 or coalesce(v_secondary, 0) < 2 or coalesce(v_third, 0) < 1 then
    raise exception 'variation selection is incomplete for a 3-2-1 portfolio'
      using errcode = 'P0001';
  end if;

  -- Existing active generation for this snapshot?
  select * into v_gen
  from public.creator_persona_generations
  where snapshot_id = p_snapshot_id and lifecycle_status = 'active'
  limit 1;

  if found then
    if v_gen.status = 'completed' then
      return jsonb_build_object(
        'generation_id', v_gen.id, 'status', v_gen.status,
        'started', false, 'already_completed', true
      );
    elsif v_gen.status in ('pending', 'generating') then
      return jsonb_build_object(
        'generation_id', v_gen.id, 'status', v_gen.status,
        'started', false, 'already_completed', false
      );
    else
      -- failed → retry in place.
      update public.creator_persona_generations
         set status            = 'generating',
             generation_method = p_generation_method,
             provider          = p_provider,
             model             = p_model,
             prompt_version    = p_prompt_version,
             schema_version    = p_schema_version,
             request_digest    = p_request_digest,
             input_snapshot    = coalesce(p_input_snapshot, '{}'::jsonb),
             output_snapshot   = null,
             failure_code      = null,
             failure_reason    = null,
             attempts          = v_gen.attempts + 1,
             completed_at      = null,
             updated_at        = now()
       where id = v_gen.id
      returning * into v_gen;
      v_started := true;
    end if;
  else
    insert into public.creator_persona_generations (
      creator_profile_id, snapshot_id, status, lifecycle_status,
      generation_method, provider, model, prompt_version, schema_version,
      request_digest, input_snapshot, attempts
    ) values (
      p_creator_profile_id, p_snapshot_id, 'generating', 'active',
      p_generation_method, p_provider, p_model, p_prompt_version, p_schema_version,
      p_request_digest, coalesce(p_input_snapshot, '{}'::jsonb), 1
    )
    returning * into v_gen;
    v_started := true;
  end if;

  perform public.fyv_emit_persona_event(
    'persona.generation.requested', p_creator_profile_id, v_gen.id, v_gen.status,
    jsonb_build_object('snapshot_id', p_snapshot_id, 'attempts', v_gen.attempts,
                       'generation_method', p_generation_method)
  );

  return jsonb_build_object(
    'generation_id', v_gen.id, 'status', v_gen.status,
    'started', v_started, 'already_completed', false
  );
end;
$$;

revoke all on function public.request_creator_persona_generation(uuid, uuid, text, text, text, jsonb, text, text, text) from public;
revoke all on function public.request_creator_persona_generation(uuid, uuid, text, text, text, jsonb, text, text, text) from anon;
revoke all on function public.request_creator_persona_generation(uuid, uuid, text, text, text, jsonb, text, text, text) from authenticated;
grant execute on function public.request_creator_persona_generation(uuid, uuid, text, text, text, jsonb, text, text, text) to service_role;

-- ── 5. complete_creator_persona_generation() — service-role only, atomic ─────
-- Inserts EXACTLY six personas and marks the generation complete in one txn.
-- Rejects unless the generation is currently 'generating' (guards double runs).
create or replace function public.complete_creator_persona_generation(
  p_generation_id  uuid,
  p_output_snapshot jsonb,
  p_provider       text,
  p_model          text,
  p_personas       jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_gen public.creator_persona_generations;
begin
  select * into v_gen
  from public.creator_persona_generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;
  if v_gen.status <> 'generating' then
    raise exception 'generation is not in the generating state' using errcode = 'P0001';
  end if;

  if p_personas is null or jsonb_typeof(p_personas) <> 'array' then
    raise exception 'personas payload must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_personas) <> 6 then
    raise exception 'exactly six personas are required' using errcode = 'P0001';
  end if;

  insert into public.creator_personas (
    creator_profile_id, generation_id, snapshot_id, source_variation_id,
    source_archetype, archetype_rank, portfolio_position,
    display_name, persona_title, one_line_premise, profile, status, sort_order
  )
  select
    v_gen.creator_profile_id,
    v_gen.id,
    v_gen.snapshot_id,
    (e ->> 'source_variation_id')::uuid,
    e ->> 'source_archetype',
    e ->> 'archetype_rank',
    (e ->> 'portfolio_position')::integer,
    e ->> 'display_name',
    e ->> 'persona_title',
    e ->> 'one_line_premise',
    coalesce(e -> 'profile', '{}'::jsonb),
    'draft',
    coalesce((e ->> 'sort_order')::integer, (e ->> 'portfolio_position')::integer)
  from jsonb_array_elements(p_personas) as e;

  update public.creator_persona_generations
     set status          = 'completed',
         output_snapshot  = coalesce(p_output_snapshot, '{}'::jsonb),
         provider         = coalesce(p_provider, provider),
         model            = coalesce(p_model, model),
         failure_code     = null,
         failure_reason   = null,
         completed_at     = now(),
         updated_at       = now()
   where id = p_generation_id
  returning * into v_gen;

  perform public.fyv_emit_persona_event(
    'persona.generation.completed', v_gen.creator_profile_id, v_gen.id, v_gen.status,
    jsonb_build_object('snapshot_id', v_gen.snapshot_id, 'persona_count', 6)
  );

  return jsonb_build_object('generation_id', v_gen.id, 'status', 'completed', 'persona_count', 6);
end;
$$;

revoke all on function public.complete_creator_persona_generation(uuid, jsonb, text, text, jsonb) from public;
revoke all on function public.complete_creator_persona_generation(uuid, jsonb, text, text, jsonb) from anon;
revoke all on function public.complete_creator_persona_generation(uuid, jsonb, text, text, jsonb) from authenticated;
grant execute on function public.complete_creator_persona_generation(uuid, jsonb, text, text, jsonb) to service_role;

-- ── 6. fail_creator_persona_generation() — service-role only ─────────────────
-- Records a sanitised failure and GUARANTEES zero persona rows for the run.
create or replace function public.fail_creator_persona_generation(
  p_generation_id uuid,
  p_failure_code  text,
  p_failure_reason text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_gen public.creator_persona_generations;
begin
  select * into v_gen
  from public.creator_persona_generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;

  -- Defensive: a failed run must leave NO personas behind.
  delete from public.creator_personas where generation_id = p_generation_id;

  update public.creator_persona_generations
     set status         = 'failed',
         failure_code    = left(coalesce(p_failure_code, 'generation_failed'), 100),
         failure_reason  = left(coalesce(p_failure_reason, 'Generation failed'), 500),
         output_snapshot = null,
         completed_at     = null,
         updated_at       = now()
   where id = p_generation_id
  returning * into v_gen;

  perform public.fyv_emit_persona_event(
    'persona.generation.failed', v_gen.creator_profile_id, v_gen.id, v_gen.status,
    jsonb_build_object('snapshot_id', v_gen.snapshot_id, 'failure_code', v_gen.failure_code)
  );

  return jsonb_build_object('generation_id', v_gen.id, 'status', 'failed');
end;
$$;

revoke all on function public.fail_creator_persona_generation(uuid, text, text) from public;
revoke all on function public.fail_creator_persona_generation(uuid, text, text) from anon;
revoke all on function public.fail_creator_persona_generation(uuid, text, text) from authenticated;
grant execute on function public.fail_creator_persona_generation(uuid, text, text) to service_role;

-- ── 7. record_persona_portfolio_viewed() — creator-callable audit ────────────
-- The only persona RPC a creator's own JWT may call. Resolves the caller's
-- profile, verifies ownership of the generation, and emits a 'viewed' event.
create or replace function public.record_persona_portfolio_viewed(
  p_generation_id uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_creator_profile_id();
  v_gen        public.creator_persona_generations;
begin
  if v_profile_id is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;

  select * into v_gen
  from public.creator_persona_generations
  where id = p_generation_id;

  if not found or v_gen.creator_profile_id <> v_profile_id then
    -- Do not leak existence of other creators' generations.
    return;
  end if;

  perform public.fyv_emit_persona_event(
    'persona.portfolio.viewed', v_profile_id, v_gen.id, v_gen.status,
    jsonb_build_object('snapshot_id', v_gen.snapshot_id)
  );
end;
$$;

revoke all on function public.record_persona_portfolio_viewed(uuid) from public;
revoke all on function public.record_persona_portfolio_viewed(uuid) from anon;
grant execute on function public.record_persona_portfolio_viewed(uuid) to authenticated;

commit;
