-- ============================================================================
-- FYV-PERSONA-1A — Archetype Variation Library + Creator Variation Selection
-- ============================================================================
-- Purpose:
--   Establish the canonical foundation for the creator persona system. This
--   sprint stops at variation SELECTION (no persona generation, no deployments).
--
--   1. public.archetype_variations         — agency-managed library of the
--      creative variations available for each assessment archetype.
--   2. public.creator_archetype_snapshots  — a LOCKED, ranked top-three basis
--      (primary/secondary/third) captured once per creator when they enter the
--      selection step. This is the auditable creative basis: because top-three
--      is recomputed from mutable assessment responses, we snapshot it so later
--      scoring-code changes never silently replace a creator's chosen set.
--   3. public.creator_variation_selections  — the creator's chosen variations,
--      hung off a snapshot, one row per selected variation.
--
-- Design notes:
--   * Archetype identity is the display-name string (e.g. 'Girl Next Door'),
--     matching src/types/creator.ts CREATOR_ARCHETYPES. There is no archetype
--     table today, so the library keys on that text value.
--   * Reuses the canonical creator identity (public.creator_profiles) — NO new
--     creator identity system. Child rows cascade on profile delete.
--   * RLS mirrors the FYV-Creator-Home conventions (PR #11): anon/public read of
--     ACTIVE reference rows, agency full access via public.is_agency(), and
--     creator-own access via public.current_creator_profile_id().
--   * Extensible seam: archetype_variations.guidance jsonb holds future
--     prompt/visual/story/content/monetisation guidance without schema churn.
--
-- Explicitly NOT changed:
--   * No changes to assessment, scoring, report, or completion tables.
--   * No changes to existing RLS policies on existing tables.
--   * No onboarding_complete flag anywhere (completion is derived from counts).
-- ============================================================================

begin;

-- ── 1. Archetype variation library (agency-managed reference data) ───────────
create table if not exists public.archetype_variations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archetype     text not null,               -- CREATOR_ARCHETYPES display-name string
  name          text not null,               -- variation name (creator-facing)
  description   text not null default '',     -- short creator-facing description
  is_active     boolean not null default true,
  display_order integer not null default 0,
  -- Forward-compatible seam for future creative direction (prompt guidance,
  -- visual direction, story/content/monetisation potential, suitability). Kept
  -- as jsonb so the next sprint can extend without a schema migration.
  guidance      jsonb not null default '{}'::jsonb,
  constraint archetype_variations_archetype_name_key unique (archetype, name)
);

create index if not exists idx_archetype_variations_archetype_active_order
  on public.archetype_variations (archetype, is_active, display_order);

alter table public.archetype_variations enable row level security;

grant select on public.archetype_variations to anon;
grant select, insert, update, delete on public.archetype_variations to authenticated;

-- Public/creator read of ACTIVE variations (anon assessment flow + logged-in
-- creators on /my). Inactive rows are visible to agency only (via the FOR ALL
-- policy below).
drop policy if exists "Public can read active archetype variations" on public.archetype_variations;
create policy "Public can read active archetype variations"
  on public.archetype_variations for select
  to anon, authenticated
  using (is_active);

-- Agency operators manage the library.
drop policy if exists "Agency full access archetype variations" on public.archetype_variations;
create policy "Agency full access archetype variations"
  on public.archetype_variations for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_archetype_variations_updated_at on public.archetype_variations;
create trigger trg_archetype_variations_updated_at
  before update on public.archetype_variations
  for each row execute function public.set_updated_at();

-- ── 2. Creator archetype snapshot (locked ranked basis) ──────────────────────
create table if not exists public.creator_archetype_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  creator_profile_id   uuid not null references public.creator_profiles(id) on delete cascade,
  -- Provenance: which assessment produced this ranked basis. SET NULL (not
  -- CASCADE) so the auditable snapshot survives assessment cleanup.
  source_assessment_id uuid references public.creator_assessments(id) on delete set null,
  primary_archetype    text not null,
  secondary_archetype  text not null,
  third_archetype      text not null,
  status               text not null default 'active'
                         check (status in ('active', 'superseded')),
  constraint creator_archetype_snapshots_distinct_ranks
    check (primary_archetype <> secondary_archetype
           and primary_archetype <> third_archetype
           and secondary_archetype <> third_archetype)
);

-- At most one ACTIVE snapshot per creator (future sprints supersede + re-derive).
create unique index if not exists creator_archetype_snapshots_one_active
  on public.creator_archetype_snapshots (creator_profile_id)
  where status = 'active';

create index if not exists idx_creator_archetype_snapshots_profile
  on public.creator_archetype_snapshots (creator_profile_id, created_at desc);

alter table public.creator_archetype_snapshots enable row level security;

grant select, insert, update, delete on public.creator_archetype_snapshots to authenticated;

drop policy if exists "Agency full access archetype snapshots" on public.creator_archetype_snapshots;
create policy "Agency full access archetype snapshots"
  on public.creator_archetype_snapshots for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own archetype snapshots" on public.creator_archetype_snapshots;
create policy "Creator can read own archetype snapshots"
  on public.creator_archetype_snapshots for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can insert own archetype snapshots" on public.creator_archetype_snapshots;
create policy "Creator can insert own archetype snapshots"
  on public.creator_archetype_snapshots for insert
  to authenticated
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can update own archetype snapshots" on public.creator_archetype_snapshots;
create policy "Creator can update own archetype snapshots"
  on public.creator_archetype_snapshots for update
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_archetype_snapshots_updated_at on public.creator_archetype_snapshots;
create trigger trg_creator_archetype_snapshots_updated_at
  before update on public.creator_archetype_snapshots
  for each row execute function public.set_updated_at();

-- ── 3. Creator variation selections (chosen variations for a snapshot) ───────
create table if not exists public.creator_variation_selections (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  snapshot_id        uuid not null references public.creator_archetype_snapshots(id) on delete cascade,
  -- Snapshotted archetype + rank (denormalised from the snapshot) so the future
  -- persona generator can read the selected creative basis directly and
  -- auditably, independent of any later scoring changes.
  archetype          text not null,
  archetype_rank     text not null check (archetype_rank in ('primary', 'secondary', 'third')),
  variation_id       uuid not null references public.archetype_variations(id) on delete cascade,
  status             text not null default 'selected' check (status in ('selected', 'deselected')),
  -- Prevent duplicate selection of the same variation within a snapshot cycle.
  constraint creator_variation_selections_unique unique (snapshot_id, variation_id)
);

create index if not exists idx_creator_variation_selections_snapshot
  on public.creator_variation_selections (snapshot_id, archetype_rank);

create index if not exists idx_creator_variation_selections_profile
  on public.creator_variation_selections (creator_profile_id);

alter table public.creator_variation_selections enable row level security;

grant select, insert, update, delete on public.creator_variation_selections to authenticated;

drop policy if exists "Agency full access variation selections" on public.creator_variation_selections;
create policy "Agency full access variation selections"
  on public.creator_variation_selections for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own variation selections" on public.creator_variation_selections;
create policy "Creator can read own variation selections"
  on public.creator_variation_selections for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can insert own variation selections" on public.creator_variation_selections;
create policy "Creator can insert own variation selections"
  on public.creator_variation_selections for insert
  to authenticated
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can update own variation selections" on public.creator_variation_selections;
create policy "Creator can update own variation selections"
  on public.creator_variation_selections for update
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id())
  with check (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can delete own variation selections" on public.creator_variation_selections;
create policy "Creator can delete own variation selections"
  on public.creator_variation_selections for delete
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_variation_selections_updated_at on public.creator_variation_selections;
create trigger trg_creator_variation_selections_updated_at
  before update on public.creator_variation_selections
  for each row execute function public.set_updated_at();

commit;
