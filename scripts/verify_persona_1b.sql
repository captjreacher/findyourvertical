-- ============================================================================
-- FYV-PERSONA-1B verification
-- ----------------------------------------------------------------------------
-- Run against a database that has migration 20260710010000 applied (on top of
-- PERSONA-1A + creator-home identity):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_persona_1b.sql
--
-- Every check RAISEs NOTICE '... PASS' on success and RAISEs EXCEPTION on
-- failure, so the script exits non-zero if anything is wrong. Checks assert
-- EFFECTIVE privileges (has_table_privilege / has_function_privilege), not just
-- policy existence, to avoid the grant ambiguity noted in PERSONA-1A.
-- ============================================================================

-- 1. Tables + dependencies exist ---------------------------------------------
do $$
begin
  if to_regclass('public.creator_persona_generations') is null then
    raise exception 'FAIL: public.creator_persona_generations does not exist';
  end if;
  if to_regclass('public.creator_personas') is null then
    raise exception 'FAIL: public.creator_personas does not exist';
  end if;
  if to_regclass('public.creator_archetype_snapshots') is null then
    raise exception 'FAIL: PERSONA-1A snapshot table missing (apply 20260710000000 first)';
  end if;
  if to_regprocedure('public.is_agency()') is null
     or to_regprocedure('public.current_creator_profile_id()') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'FAIL: creator-home helper functions missing';
  end if;
  raise notice 'CHECK tables + dependencies exist ... PASS';
end $$;

-- 2. RLS enabled on both new tables ------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['creator_persona_generations', 'creator_personas'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL: RLS not enabled on public.%', t;
    end if;
  end loop;
  raise notice 'CHECK RLS enabled on both tables ... PASS';
end $$;

-- 3. anon has NO privileges on either table ----------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['creator_persona_generations', 'creator_personas'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'FAIL: anon has % on public.%', p, t;
      end if;
    end loop;
  end loop;
  raise notice 'CHECK anon has no table privileges ... PASS';
end $$;

-- 4. authenticated has SELECT only (no direct writes) ------------------------
do $$
declare
  t text;
begin
  foreach t in array array['creator_persona_generations', 'creator_personas'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'FAIL: authenticated lacks SELECT on public.%', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'FAIL: authenticated has direct write on public.% (must go via RPC)', t;
    end if;
  end loop;
  raise notice 'CHECK authenticated is SELECT-only ... PASS';
end $$;

-- 5. service_role can write (used by the definer RPCs / Worker) --------------
do $$
declare
  t text;
begin
  foreach t in array array['creator_persona_generations', 'creator_personas'] loop
    if not (has_table_privilege('service_role', 'public.' || t, 'INSERT')
            and has_table_privilege('service_role', 'public.' || t, 'UPDATE')
            and has_table_privilege('service_role', 'public.' || t, 'DELETE')) then
      raise exception 'FAIL: service_role lacks write on public.%', t;
    end if;
  end loop;
  raise notice 'CHECK service_role has write access ... PASS';
end $$;

-- 6. Expected policies exist (agency full + creator read-only) ---------------
do $$
declare
  missing text := '';
  expected record;
begin
  for expected in
    select * from (values
      ('creator_persona_generations', 'Agency full access persona generations'),
      ('creator_persona_generations', 'Creator can read own persona generations'),
      ('creator_personas', 'Agency full access personas'),
      ('creator_personas', 'Creator can read own personas')
    ) as v(tbl, pol)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = expected.tbl and policyname = expected.pol
    ) then
      missing := missing || format('%s.%s; ', expected.tbl, expected.pol);
    end if;
  end loop;
  if missing <> '' then
    raise exception 'FAIL: missing policies: %', missing;
  end if;
  raise notice 'CHECK expected policies exist ... PASS';
end $$;

-- 7. Creators have NO write policies on these tables (read-only this sprint) --
do $$
declare
  bad integer;
begin
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('creator_persona_generations', 'creator_personas')
    and cmd <> 'SELECT'
    and 'authenticated' = any(roles)
    and qual not ilike '%is_agency%'
    and coalesce(with_check, '') not ilike '%is_agency%';
  if bad > 0 then
    raise exception 'FAIL: found % creator-scoped non-SELECT policy(ies) on persona tables', bad;
  end if;
  raise notice 'CHECK creators have no write policies ... PASS';
end $$;

-- 8. Idempotency + lineage constraints ---------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'creator_persona_generations'
      and indexname = 'creator_persona_generations_one_active'
  ) then
    raise exception 'FAIL: one-active-per-snapshot index missing';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_personas_unique_source'
  ) then
    raise exception 'FAIL: unique (generation_id, source_variation_id) missing';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'creator_personas_unique_position'
  ) then
    raise exception 'FAIL: unique (generation_id, portfolio_position) missing';
  end if;
  raise notice 'CHECK idempotency + lineage constraints ... PASS';
end $$;

-- 9. Generation RPCs are service-role only -----------------------------------
do $$
declare
  fn text;
  sig text;
begin
  foreach fn in array array[
    'request_creator_persona_generation(uuid, uuid, text, text, text, jsonb, text, text, text)',
    'complete_creator_persona_generation(uuid, jsonb, text, text, jsonb)',
    'fail_creator_persona_generation(uuid, text, text)'
  ] loop
    sig := 'public.' || fn;
    if to_regprocedure(sig) is null then
      raise exception 'FAIL: % is missing', sig;
    end if;
    if not has_function_privilege('service_role', sig, 'EXECUTE') then
      raise exception 'FAIL: service_role cannot execute %', sig;
    end if;
    if has_function_privilege('anon', sig, 'EXECUTE') then
      raise exception 'FAIL: anon can execute % (must be service-role only)', sig;
    end if;
    if has_function_privilege('authenticated', sig, 'EXECUTE') then
      raise exception 'FAIL: authenticated can execute % (must be service-role only)', sig;
    end if;
  end loop;
  raise notice 'CHECK generation RPCs are service-role only ... PASS';
end $$;

-- 10. record_persona_portfolio_viewed is creator-callable, not anon ----------
do $$
declare
  sig text := 'public.record_persona_portfolio_viewed(uuid)';
begin
  if to_regprocedure(sig) is null then
    raise exception 'FAIL: % is missing', sig;
  end if;
  if not has_function_privilege('authenticated', sig, 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute %', sig;
  end if;
  if has_function_privilege('anon', sig, 'EXECUTE') then
    raise exception 'FAIL: anon can execute %', sig;
  end if;
  raise notice 'CHECK record_persona_portfolio_viewed is creator-callable ... PASS';
end $$;

-- 11. Foreign keys establish lineage -----------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.creator_persona_generations'::regclass and contype = 'f'
                   and confrelid = 'public.creator_archetype_snapshots'::regclass) then
    raise exception 'FAIL: generations.snapshot_id FK missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.creator_personas'::regclass and contype = 'f'
                   and confrelid = 'public.creator_persona_generations'::regclass) then
    raise exception 'FAIL: personas.generation_id FK missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.creator_personas'::regclass and contype = 'f'
                   and confrelid = 'public.archetype_variations'::regclass) then
    raise exception 'FAIL: personas.source_variation_id FK missing';
  end if;
  raise notice 'CHECK foreign keys establish lineage ... PASS';
end $$;

do $$
begin
  raise notice '───────────────────────────────────────────────';
  raise notice 'FYV-PERSONA-1B verification: ALL CHECKS PASSED';
  raise notice '───────────────────────────────────────────────';
end $$;
