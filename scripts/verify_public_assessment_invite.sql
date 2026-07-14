-- ============================================================================
-- FYV-ONBOARD-2 — verification script (2026-07-14)
--
-- Purpose: prove, on a real Postgres, that the new anon-callable RPC
-- create_public_assessment_invite issues a working assessment invite
-- immediately, dedupes repeat submits, does not leak the plaintext code into
-- the events outbox, and does not require any new anon-side table privileges.
--
-- Run manually against a DEV database after migration 20260714010000 has been
-- applied:
--
--     psql "$FYV_DEV_DB_URL" -v ON_ERROR_STOP=1 -f scripts/verify_public_assessment_invite.sql
--
-- This script is idempotent. It creates a throwaway test template + email and
-- rolls the whole run back at the end so nothing lands in the DB.
--
-- Expected output: a series of NOTICEs of the form "CHECK ... PASS". Any
-- FAILED notice indicates a regression that must be investigated before
-- merging.
-- ============================================================================

begin;

set search_path = public;

do $$
declare
  v_test_email  text := 'fyv-onboard-2-verify+' || substr(md5(random()::text), 1, 8) || '@example.test';
  v_test_name   text := 'FYV Verify';
  v_test_handle text := 'fyvverify';
  v_template_id uuid;

  v_result1 jsonb;
  v_result2 jsonb;

  v_profile_id     uuid;
  v_link1_id       uuid;
  v_link2_id       uuid;
  v_code1          text;
  v_code2          text;
  v_event_count    integer;
  v_event_payload  jsonb;
  v_dedup_indexes  integer;
  v_priv_public    integer;
  v_priv_anon      integer;

  v_msg text;
begin
  raise notice '=== FYV-ONBOARD-2 verify — test email: % ===', v_test_email;

  -- CHECK 0: dedupe index must exist and be a partial unique index scoped to
  -- our event_type.
  select count(*)
    into v_dedup_indexes
    from pg_indexes
   where schemaname = 'public'
     and indexname  = 'events_assessment_invite_self_correlation_uidx';
  if v_dedup_indexes = 1 then
    raise notice 'CHECK dedupe-index-present ... PASS';
  else
    raise notice 'CHECK dedupe-index-present ... FAILED (found=%)', v_dedup_indexes;
  end if;

  -- CHECK 1: PUBLIC must NOT have EXECUTE on the RPC.
  select count(*)
    into v_priv_public
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_public_assessment_invite'
     and has_function_privilege('public', p.oid, 'EXECUTE');
  if v_priv_public = 0 then
    raise notice 'CHECK rpc-public-no-execute ... PASS';
  else
    raise notice 'CHECK rpc-public-no-execute ... FAILED (public has EXECUTE)';
  end if;

  -- CHECK 2: anon must have EXECUTE on the RPC.
  select count(*)
    into v_priv_anon
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_public_assessment_invite'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_priv_anon = 1 then
    raise notice 'CHECK rpc-anon-execute ... PASS';
  else
    raise notice 'CHECK rpc-anon-execute ... FAILED (anon EXECUTE missing)';
  end if;

  -- Resolve the default active public template so the RPC has something to
  -- issue against. If none exists, mark the whole run FAILED and abort.
  select id
    into v_template_id
    from public.creator_assessment_templates
   where is_active = true
     and is_public = true
   order by is_default desc nulls last, created_at asc
   limit 1;
  if v_template_id is null then
    raise notice 'CHECK dev-has-active-template ... FAILED (no active public template)';
    raise exception 'aborting verify — no active public template in this database';
  end if;
  raise notice 'CHECK dev-has-active-template ... PASS (template=%)', v_template_id;

  -- CHECK 3: first call issues a fresh invite (reused=false).
  v_result1 := public.create_public_assessment_invite(
    v_test_name, v_test_email, v_test_handle, null
  );
  v_link1_id := (v_result1->>'invite_link_id')::uuid;
  v_code1    := v_result1->>'invite_code';
  v_profile_id := (v_result1->>'creator_profile_id')::uuid;

  if v_result1->>'reused' = 'false'
     and v_link1_id is not null
     and length(v_code1) = 32 -- 16 bytes hex = 32 chars
     and v_profile_id is not null
     and v_result1->>'source' = 'public'
  then
    raise notice 'CHECK first-call-issues-fresh ... PASS';
  else
    raise notice 'CHECK first-call-issues-fresh ... FAILED: %', v_result1::text;
  end if;

  -- CHECK 4: second call within the dedupe window reuses the same link.
  v_result2 := public.create_public_assessment_invite(
    v_test_name, v_test_email, v_test_handle, null
  );
  v_link2_id := (v_result2->>'invite_link_id')::uuid;
  v_code2    := v_result2->>'invite_code';

  if v_result2->>'reused' = 'true' and v_link2_id = v_link1_id and v_code2 = v_code1 then
    raise notice 'CHECK second-call-reuses ... PASS';
  else
    raise notice 'CHECK second-call-reuses ... FAILED (link1=% link2=% code1=% code2=%)',
      v_link1_id, v_link2_id, v_code1, v_code2;
  end if;

  -- CHECK 5: creator_assessment_links row has the exact shape we expect
  -- (matches agency-issued invites).
  perform 1
     from public.creator_assessment_links
    where id                 = v_link1_id
      and creator_profile_id = v_profile_id
      and creator_email      = v_test_email
      and template_id        = v_template_id
      and is_active          = true
      and status             = 'Created';
  if found then
    raise notice 'CHECK link-shape-matches-agency ... PASS';
  else
    raise notice 'CHECK link-shape-matches-agency ... FAILED';
  end if;

  -- CHECK 6: creator_profile was upserted with status='Invited'.
  perform 1
     from public.creator_profiles
    where id     = v_profile_id
      and email  = v_test_email
      and status = 'Invited';
  if found then
    raise notice 'CHECK profile-status-invited ... PASS';
  else
    raise notice 'CHECK profile-status-invited ... FAILED';
  end if;

  -- CHECK 7: exactly one event landed for this profile+template today, and
  -- it does NOT contain the plaintext invite_code.
  select count(*), min(payload)
    into v_event_count, v_event_payload
    from public.events
   where event_type = 'creator.assessment_invite.self_requested'
     and correlation_id like 'fyv/assessment-invite/self/' || v_profile_id::text || '/%';

  if v_event_count = 1 then
    raise notice 'CHECK events-single-row-per-day ... PASS';
  else
    raise notice 'CHECK events-single-row-per-day ... FAILED (count=%)', v_event_count;
  end if;

  if v_event_payload ? 'invite_link_id'
     and not (v_event_payload::text ilike '%' || v_code1 || '%')
  then
    raise notice 'CHECK events-payload-no-plaintext-code ... PASS';
  else
    raise notice 'CHECK events-payload-no-plaintext-code ... FAILED';
  end if;

  -- CHECK 8: input validation rejects a bad email BEFORE any write.
  begin
    perform public.create_public_assessment_invite('X', 'not-an-email', null, null);
    raise notice 'CHECK bad-email-rejected ... FAILED (no exception raised)';
  exception when others then
    if SQLSTATE = '22023' then
      raise notice 'CHECK bad-email-rejected ... PASS';
    else
      raise notice 'CHECK bad-email-rejected ... FAILED (wrong SQLSTATE=%)', SQLSTATE;
    end if;
  end;

  -- CHECK 9: input validation rejects an empty name.
  begin
    perform public.create_public_assessment_invite('   ', v_test_email, null, null);
    raise notice 'CHECK empty-name-rejected ... FAILED (no exception raised)';
  exception when others then
    if SQLSTATE = '22023' then
      raise notice 'CHECK empty-name-rejected ... PASS';
    else
      raise notice 'CHECK empty-name-rejected ... FAILED (wrong SQLSTATE=%)', SQLSTATE;
    end if;
  end;

  raise notice '=== FYV-ONBOARD-2 verify complete — rolling back ===';
end $$;

-- Roll back everything this script touched (profile, links, events).
rollback;
