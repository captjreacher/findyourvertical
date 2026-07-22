-- =============================================================================
-- FYV-CHARACTERS-1 — Character Portfolio Profiles & Version History
-- -----------------------------------------------------------------------------
-- Additive migration: creates new tables alongside existing `creator_personas`.
-- Does NOT modify any existing table, index, RLS policy, or migration.
--
-- `creator_character_profiles` (1:1 with creator_personas): stores editable
-- character settings, lifecycle status, and version counter.
--
-- `creator_character_version_history`: snapshot-based version history for
-- every save. Snapshots are immutable; no restore mechanism in this sprint.
--
-- RLS: creator-own-read-write, service-role full access, no cross-creator
-- visibility. Agency access follows existing relationship patterns.
-- =============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.creator_character_profiles (
  id            uuid        not null default gen_random_uuid(),
  persona_id    uuid        not null,
  creator_profile_id uuid  not null,

  -- Lifecycle: only Draft → Active → Archive. Delete while Draft only.
  status        text        not null default 'draft'
                            check (status in ('draft', 'active', 'archived')),
  activated_at  timestamptz,
  archived_at   timestamptz,

  -- Brand Identity
  personality          text       default ''::text,
  positioning          text       default ''::text,
  audience_description text       default ''::text,
  core_promise         text       default ''::text,
  differentiation      text       default ''::text,

  -- Tone of Voice (tags + free-text description)
  tone_of_voice        text[]     default '{}'::text[],
  tone_of_voice_notes  text       default ''::text,

  -- Content Pillars (5 editable slots)
  content_pillars      text[]     default '{}'::text[],

  -- Visual Identity
  primary_colors        text[]    default '{}'::text[],
  style_keywords        text[]    default '{}'::text[],
  photography_direction text      default ''::text,
  lighting_style        text      default ''::text,
  editing_style         text      default ''::text,
  wardrobe_direction    text      default ''::text,
  hair_style            text      default ''::text,
  makeup_style          text      default ''::text,
  props                 text[]    default '{}'::text[],

  -- Version counter (bumped on every save)
  version         integer     not null default 1,

  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Constraints
  constraint creator_character_profiles_pkey primary key (id),
  constraint creator_character_profiles_persona_id_unique unique (persona_id),
  constraint creator_character_profiles_persona_id_fkey
    foreign key (persona_id) references public.creator_personas(id)
    on delete cascade,
  constraint creator_character_profiles_creator_profile_id_fkey
    foreign key (creator_profile_id) references public.creator_profiles(id)
    on delete cascade
);

-- Version history: append-only snapshots.
create table if not exists public.creator_character_version_history (
  id                    uuid        not null default gen_random_uuid(),
  character_profile_id  uuid        not null,
  version               integer     not null,
  snapshot              jsonb       not null,
  created_at            timestamptz not null default now(),

  constraint creator_character_version_history_pkey primary key (id),
  constraint creator_character_version_history_profile_id_fkey
    foreign key (character_profile_id) references public.creator_character_profiles(id)
    on delete cascade,
  constraint creator_character_version_history_profile_version_unique
    unique (character_profile_id, version)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists creator_character_profiles_creator_idx
  on public.creator_character_profiles (creator_profile_id);

create index if not exists creator_character_profiles_status_idx
  on public.creator_character_profiles (status);

create index if not exists creator_character_version_history_profile_idx
  on public.creator_character_version_history (character_profile_id, version desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.creator_character_profiles enable row level security;
alter table public.creator_character_version_history enable row level security;

-- Creator owns their character profiles: full CRUD.
create policy creator_character_profiles_owner_select
  on public.creator_character_profiles
  for select
  using (creator_profile_id = current_creator_profile_id());

create policy creator_character_profiles_owner_insert
  on public.creator_character_profiles
  for insert
  with check (creator_profile_id = current_creator_profile_id());

create policy creator_character_profiles_owner_update
  on public.creator_character_profiles
  for update
  using (creator_profile_id = current_creator_profile_id());

create policy creator_character_profiles_owner_delete
  on public.creator_character_profiles
  for delete
  using (
    creator_profile_id = current_creator_profile_id()
    and status = 'draft'
  );

-- Version history: creator reads own; written only via service role.
create policy creator_character_version_history_owner_select
  on public.creator_character_version_history
  for select
  using (
    character_profile_id in (
      select id from public.creator_character_profiles
      where creator_profile_id = current_creator_profile_id()
    )
  );

-- Service-role write for version snapshots (inserted by RPC or trigger).
create policy creator_character_version_history_service_insert
  on public.creator_character_version_history
  for insert
  with check (true);

-- Agency access: reuse existing relationship pattern (agency admin can read

-- ── Helper: upsert a brand-new character profile row (called by the service) ─
-- Idempotent: if a row already exists for this persona_id, it is returned as-is
-- (the caller updates via the standard UPDATE RLS path).
create or replace function public.fyv_ensure_character_profile(
  p_persona_id          uuid,
  p_creator_profile_id  uuid,
  p_personality         text default ''::text,
  p_positioning         text default ''::text,
  p_audience_description text default ''::text,
  p_core_promise        text default ''::text,
  p_differentiation     text default ''::text,
  p_tone_of_voice       text[] default '{}'::text[],
  p_tone_of_voice_notes text default ''::text,
  p_content_pillars     text[] default '{}'::text[],
  p_primary_colors      text[] default '{}'::text[],
  p_style_keywords      text[] default '{}'::text[],
  p_photography_direction text default ''::text,
  p_lighting_style      text default ''::text,
  p_editing_style       text default ''::text,
  p_wardrobe_direction  text default ''::text,
  p_hair_style          text default ''::text,
  p_makeup_style        text default ''::text,
  p_props               text[] default '{}'::text[]
)
returns public.creator_character_profiles
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.creator_character_profiles;
begin
  insert into public.creator_character_profiles (
    persona_id, creator_profile_id,
    personality, positioning, audience_description, core_promise, differentiation,
    tone_of_voice, tone_of_voice_notes, content_pillars,
    primary_colors, style_keywords, photography_direction, lighting_style,
    editing_style, wardrobe_direction, hair_style, makeup_style, props
  ) values (
    p_persona_id, p_creator_profile_id,
    p_personality, p_positioning, p_audience_description, p_core_promise, p_differentiation,
    p_tone_of_voice, p_tone_of_voice_notes, p_content_pillars,
    p_primary_colors, p_style_keywords, p_photography_direction, p_lighting_style,
    p_editing_style, p_wardrobe_direction, p_hair_style, p_makeup_style, p_props
  )
  on conflict (persona_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.creator_character_profiles
    where persona_id = p_persona_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.fyv_ensure_character_profile to authenticated, service_role;

-- ── Helper: update character profile + bump version + snapshot history ────────
create or replace function public.fyv_update_character_profile(
  p_profile_id    uuid,
  p_patches       jsonb
)
returns public.creator_character_profiles
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row         public.creator_character_profiles;
  v_snapshot    jsonb;
  v_new_version integer;
begin
  -- Lock the row for the update (prevents lost updates under concurrent saves).
  select * into v_row
  from public.creator_character_profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Character profile % not found', p_profile_id;
  end if;

  v_new_version := v_row.version + 1;

  update public.creator_character_profiles
  set
    personality          = coalesce(p_patches->>'personality',          personality),
    positioning          = coalesce(p_patches->>'positioning',          positioning),
    audience_description = coalesce(p_patches->>'audience_description', audience_description),
    core_promise         = coalesce(p_patches->>'core_promise',         core_promise),
    differentiation      = coalesce(p_patches->>'differentiation',      differentiation),
    tone_of_voice        = coalesce(p_patches->'tone_of_voice'::text[], tone_of_voice),
    tone_of_voice_notes  = coalesce(p_patches->>'tone_of_voice_notes',  tone_of_voice_notes),
    content_pillars      = coalesce(p_patches->'content_pillars'::text[], content_pillars),
    primary_colors       = coalesce(p_patches->'primary_colors'::text[], primary_colors),
    style_keywords       = coalesce(p_patches->'style_keywords'::text[], style_keywords),
    photography_direction = coalesce(p_patches->>'photography_direction', photography_direction),
    lighting_style       = coalesce(p_patches->>'lighting_style',       lighting_style),
    editing_style        = coalesce(p_patches->>'editing_style',        editing_style),
    wardrobe_direction   = coalesce(p_patches->>'wardrobe_direction',   wardrobe_direction),
    hair_style           = coalesce(p_patches->>'hair_style',           hair_style),
    makeup_style         = coalesce(p_patches->>'makeup_style',         makeup_style),
    props                = coalesce(p_patches->'props'::text[],         props),
    version              = v_new_version,
    updated_at           = now()
  where id = p_profile_id
  returning * into v_row;

  -- Snapshot the new state for version history.
  v_snapshot := row_to_json(v_row)::jsonb;

  insert into public.creator_character_version_history (
    character_profile_id, version, snapshot
  ) values (
    p_profile_id, v_new_version, v_snapshot
  );

  return v_row;
end;
$$;

grant execute on function public.fyv_update_character_profile to authenticated, service_role;

-- ── Helper: transition character lifecycle status ────────────────────────────
create or replace function public.fyv_transition_character_status(
  p_profile_id uuid,
  p_new_status text
)
returns public.creator_character_profiles
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.creator_character_profiles;
begin
  select * into v_row
  from public.creator_character_profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Character profile % not found', p_profile_id;
  end if;

  -- Validate transition rules.
  if v_row.status = 'archived' and p_new_status != 'draft' then
    raise exception 'Archived character can only transition back to draft.';
  end if;
  if v_row.status = 'active' and p_new_status = 'deleted' then
    raise exception 'Cannot delete an active character. Archive first.';
  end if;

  update public.creator_character_profiles
  set
    status       = p_new_status,
    activated_at = case when p_new_status = 'active'  then now() else activated_at end,
    archived_at  = case when p_new_status = 'archived' then now() else archived_at end,
    updated_at   = now()
  where id = p_profile_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fyv_transition_character_status to authenticated, service_role;

-- ── Helper: delete a Draft-only character profile ────────────────────────────
create or replace function public.fyv_delete_character_profile(
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row public.creator_character_profiles;
begin
  select * into v_row
  from public.creator_character_profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Character profile % not found', p_profile_id;
  end if;

  if v_row.status != 'draft' then
    raise exception 'Only draft character profiles can be deleted. Archive active profiles first.';
  end if;

  -- Cascade will delete version history.
  delete from public.creator_character_profiles where id = p_profile_id;
  return true;
end;
$$;

grant execute on function public.fyv_delete_character_profile to authenticated, service_role;

-- ── Event triggers (audit) ───────────────────────────────────────────────────

-- Reuse the existing completion_outbox table for audit events.
create or replace function public.fyv_character_profile_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.completion_outbox (
    creator_profile_id, event_type, payload
  ) values (
    coalesce(new.creator_profile_id, old.creator_profile_id),
    case
      when tg_op = 'INSERT' then 'character_profile_created'
      when tg_op = 'UPDATE' then
        case
          when new.status <> old.status then 'character_status_changed'
          else 'character_profile_updated'
        end
      when tg_op = 'DELETE' then 'character_profile_deleted'
    end,
    jsonb_build_object(
      'profile_id', coalesce(new.id, old.id),
      'persona_id', coalesce(new.persona_id, old.persona_id),
      'status', coalesce(new.status, old.status),
      'version', coalesce(new.version, old.version)
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_character_profile_audit
  after insert or update or delete on public.creator_character_profiles
  for each row
  execute function public.fyv_character_profile_audit_trigger();

-- ── Audit events for version history snapshots ───────────────────────────────

create or replace function public.fyv_character_version_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_creator_id uuid;
begin
  select creator_profile_id into v_creator_id
  from public.creator_character_profiles
  where id = new.character_profile_id;

  insert into public.completion_outbox (
    creator_profile_id, event_type, payload
  ) values (
    v_creator_id,
    'character_version_saved',
    jsonb_build_object(
      'profile_id', new.character_profile_id,
      'version', new.version
    )
  );
  return new;
end;
$$;

create trigger trg_character_version_audit
  after insert on public.creator_character_version_history
  for each row
  execute function public.fyv_character_version_audit_trigger();

create unique index if not exists creator_character_profiles_one_active_per_creator
on public.creator_character_profiles (creator_profile_id)
where status = 'active';
