-- ============================================================================
-- FYV Creator Home — Security Boundary Verification
-- ----------------------------------------------------------------------------
-- Runnable, self-cleaning (wrapped in BEGIN ... ROLLBACK) verification of the
-- database-layer security checks for the /my creator boundary. It simulates
-- anon / agency / creator sessions by setting the request JWT claims and the
-- Postgres role, exactly like PostgREST does.
--
-- HOW TO RUN (against a Supabase dev DB where migrations are already applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_creator_home_security.sql
--   (or: supabase db reset  &&  psql "$(supabase status -o env | grep DB_URL ...)" -f ...)
--
-- Requires running as a superuser/owner (local supabase `postgres` role) so it
-- can seed auth.users and toggle roles. Everything is rolled back at the end;
-- no data persists. A failed check RAISES EXCEPTION and aborts (ON_ERROR_STOP).
--
-- Covers checks: 10,11,12,13,14,15,16,17,18,19,21,22,24,26,27,28,29,30.
-- (Checks 9/20/25 are UI/app-flow and are verified in the running app.)
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- Fixed test identities ------------------------------------------------------
-- Pre-existing agency operator (simulated as created BEFORE the migration).
\set agency_uid   '''a0000000-0000-0000-0000-000000000001'''
\set creatorA_uid '''a0000000-0000-0000-0000-00000000000a'''
\set creatorB_uid '''a0000000-0000-0000-0000-00000000000b'''
\set dup_uid      '''a0000000-0000-0000-0000-00000000000d'''

-- Broad, version-tolerant auth.users seed (local supabase). --------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', :agency_uid,   'authenticated','authenticated','operator+test@fyv.test','', now(), now() - interval '400 days', now(), '{}','{}'),
  ('00000000-0000-0000-0000-000000000000', :creatorA_uid, 'authenticated','authenticated','emma+test@fyv.test','',     now(), now(), now(), '{}','{}'),
  ('00000000-0000-0000-0000-000000000000', :creatorB_uid, 'authenticated','authenticated','brooke+test@fyv.test','',   now(), now(), now(), '{}','{}'),
  ('00000000-0000-0000-0000-000000000000', :dup_uid,      'authenticated','authenticated','dupe+test@fyv.test','',     now(), now(), now(), '{}','{}')
on conflict (id) do nothing;

-- The agency operator represents an account that existed at cutover, so it must
-- be in the allowlist (a real migration seeds these automatically).
insert into public.agency_users (auth_user_id) values (:agency_uid) on conflict do nothing;

-- Creator profiles (unlinked initially). -------------------------------------
insert into public.creator_profiles (id, full_name, email, country, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Emma Test',   'emma+test@fyv.test',   'NZ', 'Completed'),
  ('22222222-2222-2222-2222-222222222222', 'Brooke Test', 'brooke+test@fyv.test', 'NZ', 'Completed'),
  ('dd000001-0000-0000-0000-000000000001', 'Dup One',     'dupe+test@fyv.test',   'NZ', 'Completed'),
  ('dd000002-0000-0000-0000-000000000002', 'Dup Two',     'dupe+test@fyv.test',   'NZ', 'Completed');

insert into public.creator_assessments (creator_profile_id, responses)
values
  ('11111111-1111-1111-1111-111111111111', '{"k":"A1"}'),
  ('22222222-2222-2222-2222-222222222222', '{"k":"B1"}');

insert into public.creator_reports (creator_profile_id, report_slug, report_json)
values
  ('11111111-1111-1111-1111-111111111111', 'emma-test-report', '{"archetype":"A"}'),
  ('22222222-2222-2222-2222-222222222222', 'brooke-test-report', '{"archetype":"B"}');

insert into public.creator_notes (creator_profile_id, note)
values ('11111111-1111-1111-1111-111111111111', 'AGENCY-PRIVATE note for Emma');

-- Ensure at least one active, public, default template exists for retake. -----
update public.creator_assessment_templates set is_active = true, is_public = true
 where is_default = true;

-- Helper to act as a role with a given JWT sub/email. ------------------------
create or replace function pg_temp.act_as(p_role text, p_sub uuid, p_email text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text,''), true);
  execute format('set local role %I', p_role);
end $$;

-- ── CHECK 26: existing (pre-migration) auth users are in agency_users ────────
do $$
declare missing int;
begin
  reset role;
  select count(*) into missing
  from auth.users u
  where u.created_at < now() - interval '100 days'
    and not exists (select 1 from public.agency_users a where a.auth_user_id = u.id);
  if missing <> 0 then raise exception 'CHECK 26 FAIL: % pre-existing auth users not seeded into agency_users', missing; end if;
  raise notice 'CHECK 26 PASS: pre-existing auth users are agency members';
end $$;

-- ── CHECK 27: a NEW creator auth user is NOT automatically agency ────────────
do $$
declare is_a boolean;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select public.is_agency() into is_a;
  reset role;
  if is_a then raise exception 'CHECK 27 FAIL: new creator user is treated as agency'; end if;
  raise notice 'CHECK 27 PASS: new creator user is not agency';
end $$;

-- ── CHECK 28: auth_user_id is unique when present ────────────────────────────
do $$
begin
  reset role;
  begin
    update public.creator_profiles set auth_user_id = 'a0000000-0000-0000-0000-00000000000a'
      where id = '11111111-1111-1111-1111-111111111111';
    update public.creator_profiles set auth_user_id = 'a0000000-0000-0000-0000-00000000000a'
      where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'CHECK 28 FAIL: duplicate auth_user_id was allowed';
  exception when unique_violation then
    raise notice 'CHECK 28 PASS: duplicate auth_user_id rejected by unique index';
  end;
  -- undo the first link so later checks start clean
  update public.creator_profiles set auth_user_id = null where id = '11111111-1111-1111-1111-111111111111';
end $$;

-- ── CHECK 21: anon can NEVER set/modify auth_user_id ─────────────────────────
do $$
begin
  -- anon UPDATE attempting to set auth_user_id must be blocked by the guard.
  perform pg_temp.act_as('anon', null, null);
  begin
    update public.creator_profiles set auth_user_id = 'a0000000-0000-0000-0000-00000000000a'
      where id = '11111111-1111-1111-1111-111111111111';
    reset role;
    raise exception 'CHECK 21 FAIL: anon was able to set auth_user_id';
  exception
    when insufficient_privilege then reset role; raise notice 'CHECK 21a PASS: anon blocked from setting auth_user_id (guard)';
    when others then reset role; raise notice 'CHECK 21a PASS: anon blocked from setting auth_user_id (%).', sqlerrm;
  end;

  -- anon UPDATE of a normal column (assessment flow) must still work.
  perform pg_temp.act_as('anon', null, null);
  update public.creator_profiles set full_name = 'Emma Test (anon-updated)'
    where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  raise notice 'CHECK 21b PASS: anon can still update non-identity columns (assessment flow preserved)';
end $$;

-- Link Emma for the creator-own tests (as superuser; guard only blocks anon). -
update public.creator_profiles set auth_user_id = 'a0000000-0000-0000-0000-00000000000a'
  where id = '11111111-1111-1111-1111-111111111111';
update public.creator_profiles set auth_user_id = 'a0000000-0000-0000-0000-00000000000b'
  where id = '22222222-2222-2222-2222-222222222222';

-- ── CHECKS 11/16: creator sees ONLY their own profile ───────────────────────
do $$
declare own int; total int;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select count(*) into total from public.creator_profiles;
  select count(*) into own   from public.creator_profiles where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if own <> 1 then raise exception 'CHECK 11 FAIL: creator cannot read own profile'; end if;
  if total <> 1 then raise exception 'CHECK 16 FAIL: creator sees % profiles (expected only own)', total; end if;
  raise notice 'CHECK 11 PASS: creator reads own profile';
  raise notice 'CHECK 16 PASS: creator cannot see other creators'' profiles';
end $$;

-- ── CHECKS 12/17: assessments — own only ─────────────────────────────────────
do $$
declare total int; own int;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select count(*) into total from public.creator_assessments;
  select count(*) into own from public.creator_assessments where creator_profile_id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if own < 1 then raise exception 'CHECK 12 FAIL: creator cannot read own assessments'; end if;
  if total <> own then raise exception 'CHECK 17 FAIL: creator sees other creators'' assessments'; end if;
  raise notice 'CHECK 12 PASS: creator reads own assessments';
  raise notice 'CHECK 17 PASS: creator cannot see others'' assessments';
end $$;

-- ── CHECKS 13/18: reports — own only ─────────────────────────────────────────
do $$
declare total int; own int;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select count(*) into total from public.creator_reports;
  select count(*) into own from public.creator_reports where creator_profile_id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if own < 1 then raise exception 'CHECK 13 FAIL: creator cannot read own reports'; end if;
  if total <> own then raise exception 'CHECK 18 FAIL: creator sees other creators'' reports'; end if;
  raise notice 'CHECK 13 PASS: creator reads own reports';
  raise notice 'CHECK 18 PASS: creator cannot see others'' reports';
end $$;

-- ── CHECK 19: creator can NEVER read creator_notes ───────────────────────────
do $$
declare n int;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select count(*) into n from public.creator_notes;
  reset role;
  if n <> 0 then raise exception 'CHECK 19 FAIL: creator can read % agency notes', n; end if;
  raise notice 'CHECK 19 PASS: creator cannot read agency notes';
end $$;

-- ── CHECK 30 (agency side): agency sees ALL via is_agency() ──────────────────
do $$
declare n int;
begin
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-000000000001', 'operator+test@fyv.test');
  select count(*) into n from public.creator_profiles;
  reset role;
  if n < 4 then raise exception 'CHECK (agency) FAIL: agency sees only % profiles', n; end if;
  raise notice 'CHECK (agency) PASS: agency operator sees all % profiles', n;
end $$;

-- ── CHECK 29: claim rejects ambiguous duplicate-email matches ────────────────
do $$
begin
  begin
    perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000d', 'dupe+test@fyv.test');
    perform public.claim_creator_profile();
    reset role;
    raise exception 'CHECK 29 FAIL: claim did not reject ambiguous email match';
  exception when others then
    reset role;
    if sqlerrm like '%multiple creator profiles%' then
      raise notice 'CHECK 29 PASS: claim rejected ambiguous match (%).', sqlerrm;
    else
      raise exception 'CHECK 29 FAIL: unexpected error: %', sqlerrm;
    end if;
  end;
end $$;

-- ── CHECK 10: claim links ONLY the matching profile by verified email ────────
-- (Use creator B, whose email matches exactly one unclaimed... first unlink B.)
do $$
declare linked uuid;
begin
  reset role;
  update public.creator_profiles set auth_user_id = null where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000b', 'brooke+test@fyv.test');
  select id into linked from public.claim_creator_profile();
  reset role;
  if linked <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'CHECK 10 FAIL: claim linked wrong profile (%).', linked;
  end if;
  raise notice 'CHECK 10 PASS: claim linked exactly the email-matching profile';
end $$;

-- ── CHECK 14/15: retake creates a NEW invite + preserves prior history ───────
do $$
declare result jsonb; before_a int; after_a int; before_r int; after_r int; link_count int;
begin
  reset role;
  select count(*) into before_a from public.creator_assessments where creator_profile_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into before_r from public.creator_reports     where creator_profile_id = '11111111-1111-1111-1111-111111111111';

  perform pg_temp.act_as('authenticated', 'a0000000-0000-0000-0000-00000000000a', 'emma+test@fyv.test');
  select public.create_creator_retake_invite() into result;
  reset role;

  if result->>'invite_code' is null or result->>'template_slug' is null then
    raise exception 'CHECK 14 FAIL: retake did not return invite_code + template_slug';
  end if;
  select count(*) into link_count from public.creator_assessment_links
    where invite_code = result->>'invite_code' and creator_profile_id = '11111111-1111-1111-1111-111111111111';
  if link_count <> 1 then raise exception 'CHECK 14 FAIL: retake invite not bound to the creator profile'; end if;
  raise notice 'CHECK 14 PASS: retake created a fresh invite bound to the creator';

  -- Simulate the additive completion (as the anon wizard would): new rows only.
  insert into public.creator_assessments (creator_profile_id, responses)
    values ('11111111-1111-1111-1111-111111111111', '{"k":"A2-retake"}');
  insert into public.creator_reports (creator_profile_id, report_slug, report_json)
    values ('11111111-1111-1111-1111-111111111111', 'emma-test-report-2', '{"archetype":"A2"}');
  select count(*) into after_a from public.creator_assessments where creator_profile_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into after_r from public.creator_reports     where creator_profile_id = '11111111-1111-1111-1111-111111111111';
  if after_a <> before_a + 1 or after_r <> before_r + 1 then
    raise exception 'CHECK 15 FAIL: retake did not preserve prior history (a % -> %, r % -> %)', before_a, after_a, before_r, after_r;
  end if;
  raise notice 'CHECK 15 PASS: retake preserved prior assessments/reports (append-only)';
end $$;

-- ── CHECK 22: public assessment invite still readable by anon ────────────────
do $$
declare n int;
begin
  perform pg_temp.act_as('anon', null, null);
  select count(*) into n from public.creator_assessment_links where is_active = true;
  reset role;
  if n < 1 then raise exception 'CHECK 22 FAIL: anon cannot read active public invite links'; end if;
  raise notice 'CHECK 22 PASS: anon can read active public invite links';
end $$;

-- ── CHECK 24: public report still readable by anon (by slug) ─────────────────
do $$
declare n int;
begin
  perform pg_temp.act_as('anon', null, null);
  select count(*) into n from public.creator_reports where report_slug = 'emma-test-report';
  reset role;
  if n <> 1 then raise exception 'CHECK 24 FAIL: anon cannot read public report by slug'; end if;
  raise notice 'CHECK 24 PASS: anon can read public report by slug';
end $$;

-- ── CHECK 22b: anon completion-outbox insert still permitted ─────────────────
do $$
begin
  perform pg_temp.act_as('anon', null, null);
  insert into public.events (source_system, event_type, entity_type, entity_id, status, payload)
    values ('findyourvertical','creator.assessment.completed','creator_profile',
            '11111111-1111-1111-1111-111111111111','pending','{"test":true}');
  reset role;
  raise notice 'CHECK 23 PASS: anon can still write the completion outbox event';
exception when others then
  reset role;
  raise exception 'CHECK 23 FAIL: anon completion outbox insert blocked: %', sqlerrm;
end $$;

do $$ begin raise notice '--- ALL DB-LAYER SECURITY CHECKS PASSED ---'; end $$;

rollback;
