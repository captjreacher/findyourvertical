-- ============================================================================
-- FYV Creator Intelligence Package verification
-- ----------------------------------------------------------------------------
-- Run against a database with migration 20260712000000 applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_creator_intelligence_package.sql
--
-- Structural checks always run first. A functional block then exercises the
-- atomic publish RPC end-to-end inside a block whose changes are ROLLED BACK, so
-- it never mutates real data. Every check RAISEs NOTICE '... PASS' on success and
-- RAISEs EXCEPTION on failure, so the script exits non-zero if anything is wrong.
-- ============================================================================

-- 1. Table + dependencies exist ----------------------------------------------
do $$
begin
  if to_regclass('public.creator_intelligence_packages') is null then
    raise exception 'FAIL: public.creator_intelligence_packages does not exist';
  end if;
  if to_regclass('public.events') is null then
    raise exception 'FAIL: public.events (outbox) missing';
  end if;
  if to_regprocedure('public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text)') is null then
    raise exception 'FAIL: publish RPC missing';
  end if;
  if to_regprocedure('public.is_agency()') is null
     or to_regprocedure('public.current_creator_profile_id()') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'FAIL: creator-home helper functions missing';
  end if;
  raise notice 'CHECK table + dependencies exist ... PASS';
end $$;

-- 2. RLS enabled --------------------------------------------------------------
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.creator_intelligence_packages'::regclass) then
    raise exception 'FAIL: RLS not enabled on creator_intelligence_packages';
  end if;
  raise notice 'CHECK RLS enabled ... PASS';
end $$;

-- 3. anon has NO direct table privileges (writes flow via the definer RPC) ---
do $$
begin
  if has_table_privilege('anon', 'public.creator_intelligence_packages', 'select')
     or has_table_privilege('anon', 'public.creator_intelligence_packages', 'insert')
     or has_table_privilege('anon', 'public.creator_intelligence_packages', 'update')
     or has_table_privilege('anon', 'public.creator_intelligence_packages', 'delete') then
    raise exception 'FAIL: anon must have no direct privileges on the package table';
  end if;
  raise notice 'CHECK anon has no direct table privileges ... PASS';
end $$;

-- 4. anon CAN execute the publish RPC (public completion path) ----------------
do $$
begin
  if not has_function_privilege('anon',
       'public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text)', 'execute') then
    raise exception 'FAIL: anon cannot execute the publish RPC (public completion path would break)';
  end if;
  raise notice 'CHECK anon can execute publish RPC ... PASS';
end $$;

-- 5. one active published package per creator (partial unique index) ---------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'creator_intelligence_packages'
      and indexname = 'creator_intelligence_packages_one_published'
  ) then
    raise exception 'FAIL: one-active-published partial unique index missing';
  end if;
  raise notice 'CHECK one-active-published index ... PASS';
end $$;

-- 6. Functional: publish twice → supersede + events; invalid/dup rejected -----
--    All throwaway data is rolled back via a sentinel exception at the end.
do $$
declare
  v_creator     uuid;
  v_assessment  uuid;
  v_bad_creator uuid;
  v_r1 jsonb;
  v_r2 jsonb;
  v_ref1 text;
  v_ref2 text;
  v_active int;
  v_superseded int;
  v_events int;
begin
  insert into public.creator_profiles (full_name) values ('Verify CIP Creator')
    returning id into v_creator;
  insert into public.creator_assessments (creator_profile_id, responses)
    values (v_creator, '{}'::jsonb) returning id into v_assessment;

  -- First publication.
  v_r1 := public.publish_creator_intelligence_package(
    v_creator, v_assessment, 'report-ref-1', '{"version":"1"}'::jsonb, '1');
  v_ref1 := v_r1 ->> 'package_reference';
  if v_ref1 not like 'fyv.creator.intelligence.%' then
    raise exception 'FAIL: package_reference is not the opaque fyv.creator.intelligence.<uuid> form (got %)', v_ref1;
  end if;

  -- Second publication supersedes the first.
  v_r2 := public.publish_creator_intelligence_package(
    v_creator, v_assessment, 'report-ref-2', '{"version":"1"}'::jsonb, '1');
  v_ref2 := v_r2 ->> 'package_reference';
  if v_ref1 = v_ref2 then
    raise exception 'FAIL: republish must produce a new opaque reference';
  end if;

  select count(*) filter (where package_state = 'published'),
         count(*) filter (where package_state = 'superseded')
    into v_active, v_superseded
  from public.creator_intelligence_packages
  where creator_profile_id = v_creator;
  if v_active <> 1 then
    raise exception 'FAIL: expected exactly 1 active published package, got %', v_active;
  end if;
  if v_superseded <> 1 then
    raise exception 'FAIL: expected exactly 1 superseded package, got %', v_superseded;
  end if;

  select count(*) into v_events
  from public.events
  where event_type = 'creator.intelligence_package.published' and entity_id = v_creator;
  if v_events <> 2 then
    raise exception 'FAIL: expected 2 published outbox events, got %', v_events;
  end if;

  -- invalid assessment (mismatched creator) cannot publish.
  insert into public.creator_profiles (full_name) values ('Other Creator')
    returning id into v_bad_creator;
  begin
    perform public.publish_creator_intelligence_package(
      v_bad_creator, v_assessment, 'x', '{}'::jsonb, '1');
    raise exception 'FAIL: publish must reject an assessment that does not belong to the creator';
  exception when sqlstate '42501' then null; -- expected
  end;

  -- missing assessment reference fails validation.
  begin
    perform public.publish_creator_intelligence_package(
      v_creator, null, 'x', '{}'::jsonb, '1');
    raise exception 'FAIL: publish must reject a null assessment_id';
  exception when sqlstate '22023' then null; -- expected
  end;

  -- duplicate package_reference rejected safely (unique constraint).
  begin
    insert into public.creator_intelligence_packages
      (creator_profile_id, package_reference, package_state)
      values (v_creator, v_ref2, 'superseded');
    raise exception 'FAIL: duplicate package_reference must be rejected';
  exception when unique_violation then null; -- expected
  end;

  raise notice 'CHECK functional publish / supersede / validation / dedup ... PASS';

  raise exception 'ROLLBACK_SENTINEL'; -- undo all throwaway data
exception
  when others then
    if sqlerrm = 'ROLLBACK_SENTINEL' then
      raise notice 'Functional block rolled back cleanly (no data mutated).';
    else
      raise;
    end if;
end $$;

\echo 'ALL CREATOR INTELLIGENCE PACKAGE CHECKS PASSED'
