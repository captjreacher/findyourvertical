-- ============================================================================
-- FYV-ONBOARDING-FIRST verification
-- ----------------------------------------------------------------------------
-- Run against a database with migration 20260711000000 applied (on top of the
-- creator-home identity + Persona work):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_onboarding.sql
--
-- Asserts EFFECTIVE privileges (has_table_privilege / has_function_privilege),
-- RLS, policies, constraints and FKs. RAISEs on any failure → non-zero exit.
-- ============================================================================

-- 1. Tables + dependencies ---------------------------------------------------
do $$
begin
  if to_regclass('public.creator_onboarding_cases') is null then
    raise exception 'FAIL: public.creator_onboarding_cases missing';
  end if;
  if to_regclass('public.creator_onboarding_invitations') is null then
    raise exception 'FAIL: public.creator_onboarding_invitations missing';
  end if;
  if to_regprocedure('public.is_agency()') is null
     or to_regprocedure('public.current_creator_profile_id()') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'FAIL: creator-home helper functions missing';
  end if;
  raise notice 'CHECK tables + dependencies exist ... PASS';
end $$;

-- 2. RLS enabled -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['creator_onboarding_cases', 'creator_onboarding_invitations'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL: RLS not enabled on public.%', t;
    end if;
  end loop;
  raise notice 'CHECK RLS enabled on both tables ... PASS';
end $$;

-- 3. anon has NO privileges --------------------------------------------------
do $$
declare t text; p text;
begin
  foreach t in array array['creator_onboarding_cases', 'creator_onboarding_invitations'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'FAIL: anon has % on public.%', p, t;
      end if;
    end loop;
  end loop;
  raise notice 'CHECK anon has no table privileges ... PASS';
end $$;

-- 4. authenticated SELECT only; service_role can write -----------------------
do $$
declare t text;
begin
  foreach t in array array['creator_onboarding_cases', 'creator_onboarding_invitations'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'FAIL: authenticated lacks SELECT on public.%', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'FAIL: authenticated has direct write on public.% (must go via RPC)', t;
    end if;
    if not (has_table_privilege('service_role', 'public.' || t, 'INSERT')
            and has_table_privilege('service_role', 'public.' || t, 'UPDATE')) then
      raise exception 'FAIL: service_role lacks write on public.%', t;
    end if;
  end loop;
  raise notice 'CHECK authenticated SELECT-only; service_role writes ... PASS';
end $$;

-- 5. Policies exist; creators are read-only ----------------------------------
do $$
declare missing text := ''; e record;
begin
  for e in
    select * from (values
      ('creator_onboarding_cases', 'Agency full access onboarding cases'),
      ('creator_onboarding_cases', 'Creator can read own onboarding cases'),
      ('creator_onboarding_invitations', 'Agency full access onboarding invitations')
    ) as v(tbl, pol)
  loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=e.tbl and policyname=e.pol) then
      missing := missing || format('%s.%s; ', e.tbl, e.pol);
    end if;
  end loop;
  if missing <> '' then raise exception 'FAIL: missing policies: %', missing; end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('creator_onboarding_cases','creator_onboarding_invitations')
      and cmd <> 'SELECT'
      and 'authenticated' = any(roles)
      and coalesce(qual,'') not ilike '%is_agency%'
      and coalesce(with_check,'') not ilike '%is_agency%'
  ) then
    raise exception 'FAIL: found a creator-scoped non-SELECT policy (creators must be read-only)';
  end if;
  raise notice 'CHECK policies exist + creators read-only ... PASS';
end $$;

-- 6. Constraints: one active case + hashed-token uniqueness ------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='creator_onboarding_cases'
      and indexname='creator_onboarding_cases_one_active'
  ) then
    raise exception 'FAIL: one-active-case partial unique index missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.creator_onboarding_invitations'::regclass and contype='u'
  ) then
    raise exception 'FAIL: unique token_hash constraint missing';
  end if;
  raise notice 'CHECK one-active-case + unique token_hash ... PASS';
end $$;

-- 7. Creator RPCs are creator-callable, not anon -----------------------------
do $$
declare fn text; sig text;
begin
  foreach fn in array array[
    'start_my_onboarding()',
    'get_my_onboarding_case()',
    'save_my_onboarding_progress(uuid, jsonb)',
    'submit_my_onboarding(uuid)',
    'redeem_onboarding_invitation(text)'
  ] loop
    sig := 'public.' || fn;
    if to_regprocedure(sig) is null then raise exception 'FAIL: % missing', sig; end if;
    if not has_function_privilege('authenticated', sig, 'EXECUTE') then
      raise exception 'FAIL: authenticated cannot execute %', sig;
    end if;
    if has_function_privilege('anon', sig, 'EXECUTE') then
      raise exception 'FAIL: anon can execute %', sig;
    end if;
  end loop;
  raise notice 'CHECK creator RPCs callable by authenticated, not anon ... PASS';
end $$;

-- 8. Agency RPCs exist, authenticated-executable (self-check is_agency), not anon
do $$
declare fn text; sig text;
begin
  foreach fn in array array[
    'initiate_creator_onboarding(uuid, boolean)',
    'create_onboarding_invitation(uuid, interval)',
    'revoke_onboarding_invitation(uuid)',
    'set_onboarding_review_required(uuid, text)',
    'complete_creator_onboarding(uuid)'
  ] loop
    sig := 'public.' || fn;
    if to_regprocedure(sig) is null then raise exception 'FAIL: % missing', sig; end if;
    if has_function_privilege('anon', sig, 'EXECUTE') then
      raise exception 'FAIL: anon can execute %', sig;
    end if;
  end loop;
  raise notice 'CHECK agency RPCs present + not anon-executable ... PASS';
end $$;

-- 9. Foreign keys ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.creator_onboarding_cases'::regclass and contype='f'
                   and confrelid='public.creator_profiles'::regclass) then
    raise exception 'FAIL: cases.creator_profile_id FK missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.creator_onboarding_invitations'::regclass and contype='f'
                   and confrelid='public.creator_onboarding_cases'::regclass) then
    raise exception 'FAIL: invitations.onboarding_case_id FK missing';
  end if;
  raise notice 'CHECK foreign keys establish ownership + case linkage ... PASS';
end $$;

do $$
begin
  raise notice '───────────────────────────────────────────────';
  raise notice 'FYV-ONBOARDING-FIRST verification: ALL CHECKS PASSED';
  raise notice '───────────────────────────────────────────────';
end $$;
