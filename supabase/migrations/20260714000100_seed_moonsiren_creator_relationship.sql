-- ============================================================================
-- Seed: MoonSiren FYV↔FMF creator relationship (validated handoff creator)
-- ----------------------------------------------------------------------------
-- MoonSiren is the creator with which the FYV → FMF intelligence handoff was
-- validated. This seeds the CANONICAL identity mapping in its initial state so
-- the agency can issue an FYV access invite:
--
--   FYV creator identity : creator_profiles.id 16bab1fb-df50-4101-9e2c-749ab7ed3d5e
--                          (onlyfans_handle 'leahsiren' — used only to locate the
--                           row here; the mapping key is the canonical uuid)
--   FMF creator id        : of_creators.id       20fdee3c-6998-4e8a-8611-04ab88949301
--   relationship_state    : draft
--
-- Idempotent + guarded: inserts only if the FYV profile exists and no relationship
-- is present yet (ON CONFLICT on the one-per-FYV-creator unique index). No
-- BetterFans username / alias is stored — canonical ids only.
-- ============================================================================

begin;

insert into public.creator_relationships (fyv_creator_id, fmf_creator_id, relationship_state)
select
  '16bab1fb-df50-4101-9e2c-749ab7ed3d5e'::uuid,
  '20fdee3c-6998-4e8a-8611-04ab88949301'::uuid,
  'draft'
where exists (
  select 1 from public.creator_profiles
  where id = '16bab1fb-df50-4101-9e2c-749ab7ed3d5e'::uuid
)
on conflict (fyv_creator_id) do nothing;

commit;
