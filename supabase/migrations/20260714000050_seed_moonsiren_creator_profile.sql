begin;

-- ============================================================================
-- Seed: MoonSiren FYV creator profile
-- ----------------------------------------------------------------------------
-- Canonical FYV identity used by:
--   seed_moonsiren_creator_relationship.sql
--
-- id:
--   16bab1fb-df50-4101-9e2c-749ab7ed3d5e
--
-- Handle is only a lookup attribute. Relationship mapping uses UUID only.
-- ============================================================================

insert into public.creator_profiles (
  id,
  full_name,
  email,
  country,
  creator_stage,
  status,
  ofmanager_creator_id,
  notes
)
values (
  '16bab1fb-df50-4101-9e2c-749ab7ed3d5e'::uuid,
  'MoonSiren',
  null,
  null,
  'active',
  'Client',
  'leahsiren',
  'Validated FYV → FMF intelligence handoff creator.'
)
on conflict (id) do nothing;

commit;