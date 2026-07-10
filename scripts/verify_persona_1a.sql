-- ============================================================================
-- FYV-PERSONA-1A verification
-- ----------------------------------------------------------------------------
-- Run against a database that has migrations 20260710000000 +
-- 20260710000100 applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_persona_1a.sql
--
-- Every check RAISEs NOTICE '... PASS' on success and RAISEs EXCEPTION on
-- failure, so the script exits non-zero if anything is wrong.
-- ============================================================================

-- 1. Tables exist ------------------------------------------------------------
do $$
begin
  if to_regclass('public.archetype_variations') is null then
    raise exception 'FAIL: public.archetype_variations does not exist';
  end if;
  if to_regclass('public.creator_archetype_snapshots') is null then
    raise exception 'FAIL: public.creator_archetype_snapshots does not exist';
  end if;
  if to_regclass('public.creator_variation_selections') is null then
    raise exception 'FAIL: public.creator_variation_selections does not exist';
  end if;
  raise notice 'CHECK tables exist ... PASS';
end $$;

-- 2. Dependencies from PR #11 are present ------------------------------------
do $$
begin
  if to_regprocedure('public.is_agency()') is null then
    raise exception 'FAIL: public.is_agency() is missing (apply the creator-home identity migration first)';
  end if;
  if to_regprocedure('public.current_creator_profile_id()') is null then
    raise exception 'FAIL: public.current_creator_profile_id() is missing';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'FAIL: public.set_updated_at() trigger function is missing';
  end if;
  raise notice 'CHECK helper functions exist ... PASS';
end $$;

-- 3. RLS enabled on all three tables -----------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('archetype_variations', 'creator_archetype_snapshots', 'creator_variation_selections')
  loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || r.relname)::regclass) then
      raise exception 'FAIL: RLS not enabled on public.%', r.relname;
    end if;
  end loop;
  raise notice 'CHECK RLS enabled on all three tables ... PASS';
end $$;

-- 4. Expected policies exist -------------------------------------------------
do $$
declare
  missing text := '';
  expected record;
begin
  for expected in
    select * from (values
      ('archetype_variations', 'Public can read active archetype variations'),
      ('archetype_variations', 'Agency full access archetype variations'),
      ('creator_archetype_snapshots', 'Agency full access archetype snapshots'),
      ('creator_archetype_snapshots', 'Creator can read own archetype snapshots'),
      ('creator_archetype_snapshots', 'Creator can insert own archetype snapshots'),
      ('creator_archetype_snapshots', 'Creator can update own archetype snapshots'),
      ('creator_variation_selections', 'Agency full access variation selections'),
      ('creator_variation_selections', 'Creator can read own variation selections'),
      ('creator_variation_selections', 'Creator can insert own variation selections'),
      ('creator_variation_selections', 'Creator can update own variation selections'),
      ('creator_variation_selections', 'Creator can delete own variation selections')
    ) as t(tbl, pol)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = expected.tbl and policyname = expected.pol
    ) then
      missing := missing || format(E'\n  - %s.%s', expected.tbl, expected.pol);
    end if;
  end loop;
  if missing <> '' then
    raise exception 'FAIL: missing policies:%', missing;
  end if;
  raise notice 'CHECK expected RLS policies exist ... PASS';
end $$;

-- 5. One-active-snapshot unique index ----------------------------------------
do $$
begin
  if to_regclass('public.creator_archetype_snapshots_one_active') is null then
    raise exception 'FAIL: partial unique index creator_archetype_snapshots_one_active is missing';
  end if;
  raise notice 'CHECK one-active-snapshot unique index exists ... PASS';
end $$;

-- 6. Grants: anon read library; authenticated writes creator tables ----------
do $$
begin
  if not has_table_privilege('anon', 'public.archetype_variations', 'SELECT') then
    raise exception 'FAIL: anon cannot SELECT public.archetype_variations';
  end if;
  if not has_table_privilege('authenticated', 'public.creator_variation_selections', 'INSERT') then
    raise exception 'FAIL: authenticated cannot INSERT public.creator_variation_selections';
  end if;
  if not has_table_privilege('authenticated', 'public.creator_archetype_snapshots', 'INSERT') then
    raise exception 'FAIL: authenticated cannot INSERT public.creator_archetype_snapshots';
  end if;
  -- anon must NOT be able to write creator selections.
  if has_table_privilege('anon', 'public.creator_variation_selections', 'INSERT') then
    raise exception 'FAIL: anon should not be able to INSERT public.creator_variation_selections';
  end if;
  raise notice 'CHECK grants (anon read library, authenticated creator writes, anon no selection writes) ... PASS';
end $$;

-- 7. Seed coverage: every seeded archetype can satisfy the minimums ----------
do $$
declare
  distinct_archetypes int;
  total_active int;
  thin int;
begin
  select count(distinct archetype) into distinct_archetypes
    from public.archetype_variations where is_active;
  select count(*) into total_active
    from public.archetype_variations where is_active;
  select count(*) into thin from (
    select archetype from public.archetype_variations where is_active
    group by archetype having count(*) < 6
  ) t;

  if distinct_archetypes < 28 then
    raise exception 'FAIL: only % archetypes seeded with active variations (expected >= 28)', distinct_archetypes;
  end if;
  if thin > 0 then
    raise exception 'FAIL: % archetype(s) have fewer than 6 active variations (min primary requirement is 3)', thin;
  end if;
  -- 'Other' is intentionally not seeded.
  if exists (select 1 from public.archetype_variations where archetype = 'Other') then
    raise exception 'FAIL: the Other sentinel archetype should not be seeded';
  end if;

  raise notice 'CHECK seed coverage ... PASS (% archetypes, % active variations)', distinct_archetypes, total_active;
end $$;

do $$
begin
  raise notice '======================================================';
  raise notice 'FYV-PERSONA-1A verification complete — all checks PASS.';
  raise notice '======================================================';
end $$;
