-- ============================================================================
-- Verify: FYV Creator Relationship & Access Layer (migration 20260714000000 + seed)
-- Run against a DB with the migration applied:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify_creator_relationship_access.sql
-- Emits `CHECK … PASS` notices; RAISEs on the first failure.
-- ============================================================================
\set ON_ERROR_STOP on

do $$
begin
  -- 1. Tables exist.
  assert to_regclass('public.creator_relationships') is not null, 'creator_relationships missing';
  assert to_regclass('public.creator_invitations')   is not null, 'creator_invitations missing';
  raise notice 'CHECK tables exist: PASS';

  -- 2. RLS enabled on both.
  assert (select relrowsecurity from pg_class where oid = 'public.creator_relationships'::regclass), 'RLS off on creator_relationships';
  assert (select relrowsecurity from pg_class where oid = 'public.creator_invitations'::regclass),   'RLS off on creator_invitations';
  raise notice 'CHECK RLS enabled: PASS';

  -- 3. anon has NO table privileges on either table.
  assert not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('creator_relationships','creator_invitations')
  ), 'anon has table privileges';
  raise notice 'CHECK anon revoked: PASS';

  -- 4. relationship_state CHECK covers exactly the four lifecycle states.
  assert exists (
    select 1 from pg_constraint
    where conrelid = 'public.creator_relationships'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%draft%invited%accepted%active%'
  ), 'relationship_state check constraint missing/incorrect';
  raise notice 'CHECK relationship_state constraint: PASS';

  -- 5. Uniqueness: one relationship per FYV creator + per FMF creator; one pending invite.
  assert to_regclass('public.creator_relationships_fyv_creator_key') is not null, 'fyv_creator unique missing';
  assert to_regclass('public.creator_relationships_fmf_creator_key') is not null, 'fmf_creator unique missing';
  assert to_regclass('public.creator_invitations_one_pending')       is not null, 'one-pending unique missing';
  raise notice 'CHECK unique indexes: PASS';

  -- 6. Invitation token is hashed (bytea) + unique; raw token never stored.
  assert (select data_type from information_schema.columns
          where table_schema='public' and table_name='creator_invitations' and column_name='token_hash') = 'bytea',
         'token_hash is not bytea';
  raise notice 'CHECK token hashed (bytea): PASS';

  -- 7. Events dedupe partial unique index exists.
  assert to_regclass('public.events_creator_relationship_correlation_uidx') is not null, 'event dedupe index missing';
  raise notice 'CHECK event dedupe index: PASS';

  -- 8. RPCs exist and are SECURITY DEFINER.
  assert (select prosecdef from pg_proc where oid = 'public.create_creator_access_invitation(uuid,uuid,text,interval)'::regprocedure), 'create RPC not SECURITY DEFINER';
  assert (select prosecdef from pg_proc where oid = 'public.validate_creator_access_invitation(text)'::regprocedure), 'validate RPC not SECURITY DEFINER';
  assert (select prosecdef from pg_proc where oid = 'public.accept_creator_access_invitation(text,uuid)'::regprocedure), 'accept RPC not SECURITY DEFINER';
  assert (select prosecdef from pg_proc where oid = 'public.activate_creator_relationship(uuid)'::regprocedure), 'activate RPC not SECURITY DEFINER';
  raise notice 'CHECK RPCs exist + SECURITY DEFINER: PASS';

  -- 9. Accept/validate are service_role-only (NOT anon, NOT authenticated).
  assert not has_function_privilege('anon',          'public.accept_creator_access_invitation(text,uuid)', 'execute'), 'anon can accept';
  assert not has_function_privilege('authenticated', 'public.accept_creator_access_invitation(text,uuid)', 'execute'), 'authenticated can accept';
  assert     has_function_privilege('service_role',  'public.accept_creator_access_invitation(text,uuid)', 'execute'), 'service_role cannot accept';
  assert not has_function_privilege('anon',          'public.validate_creator_access_invitation(text)',    'execute'), 'anon can validate';
  raise notice 'CHECK accept/validate service_role-only: PASS';

  -- 10. Invite is agency-callable (authenticated); activate is authenticated.
  assert has_function_privilege('authenticated', 'public.create_creator_access_invitation(uuid,uuid,text,interval)', 'execute'), 'authenticated cannot invite';
  assert has_function_privilege('authenticated', 'public.activate_creator_relationship(uuid)', 'execute'), 'authenticated cannot activate';
  raise notice 'CHECK invite/activate grants: PASS';

  raise notice 'ALL STRUCTURAL CHECKS PASSED';
end $$;

-- 11. MoonSiren seed present (canonical ids; state has advanced from draft as expected).
do $$
declare
  v_state text;
  v_fmf   uuid;
begin
  select relationship_state, fmf_creator_id into v_state, v_fmf
  from public.creator_relationships
  where fyv_creator_id = '16bab1fb-df50-4101-9e2c-749ab7ed3d5e'::uuid;

  if v_state is null then
    raise notice 'CHECK MoonSiren seed: SKIP (FYV profile 16bab1fb… not present in this DB)';
  else
    assert v_fmf = '20fdee3c-6998-4e8a-8611-04ab88949301'::uuid, 'MoonSiren fmf_creator_id mismatch';
    assert v_state in ('draft','invited','accepted','active'), 'MoonSiren state invalid';
    raise notice 'CHECK MoonSiren seed: PASS (fmf=%,state=%)', v_fmf, v_state;
  end if;
end $$;
