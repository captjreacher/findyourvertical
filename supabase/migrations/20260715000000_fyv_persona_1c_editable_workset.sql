-- ============================================================================
-- FYV-PERSONA-1C — Editable Creator Vertical + Variation Workset
-- ----------------------------------------------------------------------------
-- Purpose:
--   Let the creator turn the three assessment-recommended verticals into an
--   editable, ordered list of 1..6 verticals (with name + description edits,
--   and per-creator customised variations) WHILE preserving the existing
--   PRIMARY/SECONDARY/THIRD persona-generation contract.
--
-- Architecture (additive — no destructive change to existing tables):
--
--   1. public.creator_owned_verticals
--      The creator's own vertical definitions. Two shapes:
--        a. pure_creator       — entirely new ("Indie Filmmaker")
--        b. forked_from_system — copied from a system archetype so the creator
--           can rename/relabel it without mutating the global catalogue.
--
--      review_status drives the catalogue submission queue:
--        none          — privately visible to the creator only.
--        pending_review— submitted but not actioned.
--        approved / rejected — agency action.
--      A creator can SUBMIT for review (set review_status='pending_review').
--      Submissions are gated: approved catalogue rows would be exposed via a
--      future fyv_apply_catalogue_submission RPC. Until that runs we do not
--      write into creator_question_bank or archetype_variations, so the public
--      assessment question bank (creator_question_bank) is NEVER auto-exposed
--      to creator submissions.
--
--   2. public.creator_owned_variations
--      The creator's own variation definitions, analogously split into
--      pure_creator and forked_from_system (the catalogue_variation_id stores
--      the original archetype_variations row so the creator can re-fork).
--      Owned verticals can host multiple owned variations (owned_vertical_id
--      Is NOT NULL); system-forked variations can stand alone with a parent
--      system_archetype stored as text (mirrors the existing pattern).
--
--   3. public.creator_vertical_workset
--      The CURRENT working ordered list of 1..6 verticals for a snapshot.
--      Each row carries:
--        position          — 1..6 (drives the derived Primary/Secondary/...)
--        vertical_kind     — 'system_reference' | 'creator_owned'
--        system_archetype  — text reference for system rows (matches the
--                            snapshot's hard columns; non-null when kind =
--                            'system_reference')
--        owned_vertical_id — FK for creator_owned rows (non-null when kind =
--                            'creator_owned')
--        source_label      — one of:
--                            'recommended'  : origin = initial 3 from snapshot
--                            'catalogue'    : creator swapped in a different
--                                             system archetype
--                            'created'      : creator-owned vertical
--
--      The active workset per snapshot enforces uniqueness on (snapshot_id,
--      position) via a partial unique index — reordering rewrites positions.
--
--   4. public.creator_vertical_variation_entries
--      The CURRENT selections per workset row. variation_kind discriminates
--      between system catalogue selections (catalog_variation_id is NOT NULL)
--      and creator-owned selections (owned_variation_id is NOT NULL). Together
--      these replace the old per-rank-first-three minimums with a per-workset
--      position-derived structure.
--
--   5. public.materialise_vertical_workset_for_generation(p_snapshot_id)
--      RPC the UI calls RIGHT BEFORE requesting persona generation. Reads the
--      current workset + variation entries, takes the FIRST THREE workset
--      rows (position 1, 2, 3) which become 'primary', 'secondary', 'third',
--      and writes them into creator_variation_selections (the table the
--      existing Worker reads). This is what allows the persona generator and
--      the existing RLS policies to stay untouched — persona generation is
--      re-anchored onto the current workset transparently.
--
-- Identities reused:
--   * public.creator_profiles(id) — canonical creator identity.
--   * public.creator_archetype_snapshots — KEEPS its role as immutable
--     historical evidence (snapshot.primary_archetype / secondary_archetype /
--     third_archetype remain authoritative provenance).
--   * public.archetype_variations — system library. Creators only READ it
--     (the 'Public can read active archetype variations' policy from
--     FYV-PERSONA-1A). Write access is agency-only via is_agency() policy.
--   * public.creator_variation_selections — preserved as the Worker read
--     surface. This migration adds NO column to it (the materialise RPC is
--     the adapter).
--   * public.events — audit ledger reused (single event system).
--
-- Explicitly NOT changed:
--   * NO writes to creator_question_bank (assessment question bank).
--   * NO writes to archetype_variations from creators (system catalogue
--     mutation is blocked by the existing 'Agency full access archetype
--     variations' policy; creators get SELECT only on is_active rows).
--   * NO column changes to creator_archetype_snapshots / creator_personas /
--     creator_persona_generations / creator_reports / creator_assessments.
-- ============================================================================

begin;

-- ── 1. Creator-owned verticals (private; opt-in catalogue submission) ────────
create table if not exists public.creator_owned_verticals (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Canonical FYV creator identity.
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  description        text not null default '' check (char_length(description) <= 2000),
  -- Shape: pure_creator = fully new; forked_from_system = copied from a system
  -- archetype (system_archetype stores the original CREATOR_ARCHETYPES text).
  source_kind        text not null check (source_kind in ('pure_creator', 'forked_from_system')),
  system_archetype   text null,
  -- Catalogue submission queue. 'none' = purely private. 'pending_review'
  -- = submitted, waiting on agency action. 'approved' / 'rejected' = terminal.
  review_status      text not null default 'none'
                       check (review_status in ('none', 'pending_review', 'approved', 'rejected')),
  submitted_at       timestamptz null,
  reviewed_at        timestamptz null,
  reviewed_by        uuid null,
  -- Soft archive (distinct from row delete): keeps audit + handles "undo".
  is_archived        boolean not null default false,
  constraint creator_owned_verticals_source_kind_matches_fork
    check (
      (source_kind = 'pure_creator' and system_archetype is null)
      or
      (source_kind = 'forked_from_system' and system_archetype is not null)
    )
);

-- One active (non-archived) vertical per name per creator, case-insensitive.
create unique index if not exists creator_owned_verticals_active_name_key
  on public.creator_owned_verticals (creator_profile_id, lower(name))
  where is_archived = false;

create index if not exists idx_creator_owned_verticals_profile
  on public.creator_owned_verticals (creator_profile_id, updated_at desc);

create index if not exists idx_creator_owned_verticals_review_queue
  on public.creator_owned_verticals (review_status, submitted_at)
  where review_status = 'pending_review';

alter table public.creator_owned_verticals enable row level security;

-- These rows are PRIVATE. Anon + PUBLIC are explicitly revoked; only the
-- owning creator's JWT and the agency operator may read/write.
revoke all on public.creator_owned_verticals from public;
revoke all on public.creator_owned_verticals from anon;
grant select, insert, update, delete on public.creator_owned_verticals to authenticated;
grant select, insert, update, delete on public.creator_owned_verticals to service_role;

drop policy if exists "Creator can read own owned verticals" on public.creator_owned_verticals;
create policy "Creator can read own owned verticals"
  on public.creator_owned_verticals for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can insert own owned verticals" on public.creator_owned_verticals;
create policy "Creator can insert own owned verticals"
  on public.creator_owned_verticals for insert
  to authenticated
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can update own owned verticals" on public.creator_owned_verticals;
create policy "Creator can update own owned verticals"
  on public.creator_owned_verticals for update
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can delete own owned verticals" on public.creator_owned_verticals;
create policy "Creator can delete own owned verticals"
  on public.creator_owned_verticals for delete
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Agency full access owned verticals" on public.creator_owned_verticals;
create policy "Agency full access owned verticals"
  on public.creator_owned_verticals for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_owned_verticals_updated_at on public.creator_owned_verticals;
create trigger trg_creator_owned_verticals_updated_at
  before update on public.creator_owned_verticals
  for each row execute function public.set_updated_at();

-- ── 2. Creator-owned variations (private; opt-in catalogue submission) ──────
create table if not exists public.creator_owned_variations (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  -- Parent owned vertical (NULL when the variation is forked from a SYSTEM
  -- variation; in that case the parent is identified by system_archetype).
  owned_vertical_id  uuid null references public.creator_owned_verticals(id) on delete cascade,
  -- Parent system archetype (text, matching the FYV-PERSONA-1A pattern).
  -- NULL only when owned_vertical_id IS NOT NULL.
  system_archetype   text null,
  -- Original catalogue row when forked (kept immutable).
  catalog_variation_id uuid null references public.archetype_variations(id) on delete set null,
  name               text not null check (char_length(name) between 1 and 80),
  description        text not null default '' check (char_length(description) <= 2000),
  source_kind        text not null check (source_kind in ('pure_creator', 'forked_from_system')),
  review_status      text not null default 'none'
                       check (review_status in ('none', 'pending_review', 'approved', 'rejected')),
  submitted_at       timestamptz null,
  reviewed_at        timestamptz null,
  reviewed_by        uuid null,
  is_archived        boolean not null default false,
  constraint creator_owned_variations_source_kind_matches_fork
    check (
      (source_kind = 'pure_creator' and catalog_variation_id is null)
      or
      (source_kind = 'forked_from_system' and catalog_variation_id is not null)
    ),
  constraint creator_owned_variations_parent_kind
    check (
      (owned_vertical_id is not null and system_archetype is null)
      or
      (owned_vertical_id is null and system_archetype is not null)
    )
);

create index if not exists idx_creator_owned_variations_vertical
  on public.creator_owned_variations (owned_vertical_id, is_archived);

create index if not exists idx_creator_owned_variations_profile
  on public.creator_owned_variations (creator_profile_id, updated_at desc);

create index if not exists idx_creator_owned_variations_review_queue
  on public.creator_owned_variations (review_status, submitted_at)
  where review_status = 'pending_review';

alter table public.creator_owned_variations enable row level security;

revoke all on public.creator_owned_variations from public;
revoke all on public.creator_owned_variations from anon;
grant select, insert, update, delete on public.creator_owned_variations to authenticated;
grant select, insert, update, delete on public.creator_owned_variations to service_role;

drop policy if exists "Creator can read own owned variations" on public.creator_owned_variations;
create policy "Creator can read own owned variations"
  on public.creator_owned_variations for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can insert own owned variations" on public.creator_owned_variations;
create policy "Creator can insert own owned variations"
  on public.creator_owned_variations for insert
  to authenticated
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can update own owned variations" on public.creator_owned_variations;
create policy "Creator can update own owned variations"
  on public.creator_owned_variations for update
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can delete own owned variations" on public.creator_owned_variations;
create policy "Creator can delete own owned variations"
  on public.creator_owned_variations for delete
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Agency full access owned variations" on public.creator_owned_variations;
create policy "Agency full access owned variations"
  on public.creator_owned_variations for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_owned_variations_updated_at on public.creator_owned_variations;
create trigger trg_creator_owned_variations_updated_at
  before update on public.creator_owned_variations
  for each row execute function public.set_updated_at();

-- ── 3. Active vertical workset (1..6 per snapshot) ──────────────────────────
create table if not exists public.creator_vertical_workset (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  snapshot_id        uuid not null references public.creator_archetype_snapshots(id) on delete cascade,
  -- 1..6 (drives the derived rank label).
  position           integer not null check (position between 1 and 6),
  -- Creator-facing label (system archetype name OR owned vertical name).
  vertical_label     text not null,
  vertical_kind      text not null check (vertical_kind in ('system_reference', 'creator_owned')),
  -- Set when vertical_kind = 'system_reference' (provenance matches the FYV
  -- snapshot pattern that uses CREATOR_ARCHETYPES text).
  system_archetype   text null,
  -- Set when vertical_kind = 'creator_owned'.
  owned_vertical_id  uuid null references public.creator_owned_verticals(id) on delete cascade,
  -- Audit-friendly WHY this vertical is in the workset.
  source_label       text not null
                       check (source_label in ('recommended', 'catalogue', 'created')),
  status             text not null default 'active'
                       check (status in ('active', 'archived', 'removed')),
  constraint creator_vertical_workset_kind_matches_columns
    check (
      (vertical_kind = 'system_reference'
         and system_archetype is not null
         and owned_vertical_id is null)
      or
      (vertical_kind = 'creator_owned'
         and owned_vertical_id is not null
         and system_archetype is null)
    )
);

-- One ACTIVE row per (snapshot, position). Reordering rewrites positions; the
-- partial unique index guarantees no two active rows share the same slot.
create unique index if not exists creator_vertical_workset_active_position_key
  on public.creator_vertical_workset (snapshot_id, position)
  where status = 'active';

create index if not exists idx_creator_vertical_workset_snapshot
  on public.creator_vertical_workset (snapshot_id, position)
  where status = 'active';

create index if not exists idx_creator_vertical_workset_profile
  on public.creator_vertical_workset (creator_profile_id, updated_at desc);

alter table public.creator_vertical_workset enable row level security;

revoke all on public.creator_vertical_workset from public;
revoke all on public.creator_vertical_workset from anon;
grant select, insert, update, delete on public.creator_vertical_workset to authenticated;
grant select, insert, update, delete on public.creator_vertical_workset to service_role;

drop policy if exists "Creator can read own vertical workset" on public.creator_vertical_workset;
create policy "Creator can read own vertical workset"
  on public.creator_vertical_workset for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can write own vertical workset" on public.creator_vertical_workset;
create policy "Creator can write own vertical workset"
  on public.creator_vertical_workset for all
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Agency full access vertical workset" on public.creator_vertical_workset;
create policy "Agency full access vertical workset"
  on public.creator_vertical_workset for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_vertical_workset_updated_at on public.creator_vertical_workset;
create trigger trg_creator_vertical_workset_updated_at
  before update on public.creator_vertical_workset
  for each row execute function public.set_updated_at();

-- ── 4. Per-workset variation selections (system OR owned) ───────────────────
create table if not exists public.creator_vertical_variation_entries (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  snapshot_id        uuid not null references public.creator_archetype_snapshots(id) on delete cascade,
  workset_id         uuid not null references public.creator_vertical_workset(id) on delete cascade,
  variation_kind     text not null check (variation_kind in ('system_reference', 'creator_owned')),
  catalog_variation_id uuid null references public.archetype_variations(id) on delete cascade,
  owned_variation_id   uuid null references public.creator_owned_variations(id) on delete cascade,
  status             text not null default 'selected'
                       check (status in ('selected', 'deselected', 'removed')),
  constraint creator_vertical_variation_entries_kind_matches_columns
    check (
      (variation_kind = 'system_reference'
         and catalog_variation_id is not null
         and owned_variation_id is null)
      or
      (variation_kind = 'creator_owned'
         and owned_variation_id is not null
         and catalog_variation_id is null)
    )
);

-- A creator cannot select the same variation twice in the same workset row.
-- (Each kind has its own partial unique index because the nullable columns
-- can't share a single plain unique.)
create unique index if not exists creator_vertical_variation_entries_system_unique
  on public.creator_vertical_variation_entries (workset_id, catalog_variation_id)
  where catalog_variation_id is not null and status = 'selected';

create unique index if not exists creator_vertical_variation_entries_owned_unique
  on public.creator_vertical_variation_entries (workset_id, owned_variation_id)
  where owned_variation_id is not null and status = 'selected';

create index if not exists idx_creator_vertical_variation_entries_workset
  on public.creator_vertical_variation_entries (workset_id);

create index if not exists idx_creator_vertical_variation_entries_snapshot
  on public.creator_vertical_variation_entries (snapshot_id, workset_id);

alter table public.creator_vertical_variation_entries enable row level security;

revoke all on public.creator_vertical_variation_entries from public;
revoke all on public.creator_vertical_variation_entries from anon;
grant select, insert, update, delete on public.creator_vertical_variation_entries to authenticated;
grant select, insert, update, delete on public.creator_vertical_variation_entries to service_role;

drop policy if exists "Creator can read own variation entries" on public.creator_vertical_variation_entries;
create policy "Creator can read own variation entries"
  on public.creator_vertical_variation_entries for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can write own variation entries" on public.creator_vertical_variation_entries;
create policy "Creator can write own variation entries"
  on public.creator_vertical_variation_entries for all
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Agency full access variation entries" on public.creator_vertical_variation_entries;
create policy "Agency full access variation entries"
  on public.creator_vertical_variation_entries for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_vertical_variation_entries_updated_at on public.creator_vertical_variation_entries;
create trigger trg_creator_vertical_variation_entries_updated_at
  before update on public.creator_vertical_variation_entries
  for each row execute function public.set_updated_at();

-- ── 5. materialise_vertical_workset_for_generation(p_snapshot_id) ───────────
-- Reads the CURRENT workset + entries from the creator's NEW editable model
-- and writes the equivalent rows into creator_variation_selections. The Worker
-- contract and existing 3-2-1 file are unchanged; this RPC keeps the persona
-- generator anchored on the EDITABLE state.
create or replace function public.materialise_vertical_workset_for_generation(
  p_snapshot_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile_id     uuid := public.current_creator_profile_id();
  v_snapshot       public.creator_archetype_snapshots;
  v_workset        public.creator_vertical_workset;
  v_entry          public.creator_vertical_variation_entries;
  v_position       integer := 0;
  v_rank           text;
  v_writes         integer := 0;
  v_total_selected integer := 0;
begin
  if v_profile_id is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;
  if p_snapshot_id is null then
    raise exception 'snapshot_id is required' using errcode = '22023';
  end if;

  select * into v_snapshot
  from public.creator_archetype_snapshots
  where id = p_snapshot_id
    and creator_profile_id = v_profile_id;
  if not found then
    raise exception 'snapshot not found for this creator' using errcode = 'P0002';
  end if;

  -- Deactivate all previous selections for this snapshot. The workset is the
  -- canonical authority; we never carry stale writes forward.
  update public.creator_variation_selections
    set status = 'deselected'
  where snapshot_id = p_snapshot_id
    and creator_profile_id = v_profile_id
    and status = 'selected';

  -- Iterate the first three ACTIVE workset rows in position order, mapping
  -- them to the persona-generator rank contract (position 1=primary, 2=secondary,
  -- 3=third). Verticals 4..6 contribute to creator-context/audit but do NOT
  -- affect the 6-persona generator output (preserves the existing 3-2-1 contract).
  for v_workset in
    select *
    from public.creator_vertical_workset
    where snapshot_id = p_snapshot_id
      and creator_profile_id = v_profile_id
      and status = 'active'
    order by position asc
  loop
    v_position := v_position + 1;
    if v_position > 3 then exit; end if;
    v_rank := case v_position
                when 1 then 'primary'
                when 2 then 'secondary'
                when 3 then 'third'
              end;

    for v_entry in
      select *
      from public.creator_vertical_variation_entries
      where workset_id = v_workset.id
        and status = 'selected'
    loop
      if v_entry.variation_kind = 'system_reference' then
        -- Pure system-reference rows (one variation plays one rank).
        insert into public.creator_variation_selections
          (creator_profile_id, snapshot_id, archetype, archetype_rank,
           variation_id, status)
        values
          (v_profile_id, p_snapshot_id, v_workset.system_archetype, v_rank,
           v_entry.catalog_variation_id, 'selected');
        v_writes := v_writes + 1;
        v_total_selected := v_total_selected + 1;
      else
        -- The creator-owned-variation path has no archetype_variations row,
        -- so we back it with the source catalogue row when this is a fork
        -- (initial clone materialises one). For pure_creator forks there is
        -- no catalogue row, so we skip the materialise — those picks do not
        -- flow into persona generation in this sprint. (Catalogued as a known
        -- limitation; future sprints can extend the Worker to consume
        -- creator_owned_variations directly.)
        continue;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'writes', v_writes,
    'total_selected', v_total_selected
  );
end;
$$;

revoke all on function public.materialise_vertical_workset_for_generation(uuid) from public;
revoke all on function public.materialise_vertical_workset_for_generation(uuid) from anon;
grant execute on function public.materialise_vertical_workset_for_generation(uuid) to authenticated;

commit;
