begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- FYV Creator Intelligence Snapshot Foundation
-- ----------------------------------------------------------------------------
-- Stores immutable FYV intelligence packages published against a creator
-- profile. This is the persistence layer consumed by:
--
--   fyv_publish_intelligence_snapshot()
--
-- Identity boundary:
--   creator_id = public.creator_profiles.id
--
-- This is separate from:
--   - creator_relationships (FYV ↔ FMF access handoff)
--   - creator_onboarding_* (sales/onboarding lifecycle)
--   - creator_profiles.status (pipeline lifecycle)
-- ============================================================================

create table if not exists public.creator_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Canonical FYV creator identity
  creator_id uuid not null
    references public.creator_profiles(id)
    on delete cascade,

  source_product text not null,

  contract_version text not null,

  intelligence_version text not null default '1.0.0',

  source_package_reference text not null,

  source_assessment_reference text,

  package_payload jsonb not null default '{}'::jsonb
);


-- Idempotent publish boundary:
-- same creator + same package reference = same intelligence snapshot
create unique index if not exists creator_intelligence_snapshots_creator_package_key
  on public.creator_intelligence_snapshots (
    creator_id,
    source_package_reference
  );


alter table public.creator_intelligence_snapshots enable row level security;


revoke all on public.creator_intelligence_snapshots from public;
revoke all on public.creator_intelligence_snapshots from anon;


grant select on public.creator_intelligence_snapshots to authenticated;

grant select, insert, update, delete
on public.creator_intelligence_snapshots
to service_role;


-- Agency operators can manage intelligence snapshots
drop policy if exists "Agency full access intelligence snapshots"
on public.creator_intelligence_snapshots;

create policy "Agency full access intelligence snapshots"
on public.creator_intelligence_snapshots
for all
to authenticated
using (public.is_agency())
with check (public.is_agency());


-- Creator can only read their own intelligence packages
drop policy if exists "Creator can read own intelligence snapshots"
on public.creator_intelligence_snapshots;

create policy "Creator can read own intelligence snapshots"
on public.creator_intelligence_snapshots
for select
to authenticated
using (
  creator_id = public.current_creator_profile_id()
);


commit;