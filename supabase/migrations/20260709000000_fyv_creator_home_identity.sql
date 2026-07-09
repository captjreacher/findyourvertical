-- ============================================================================
-- FYV Creator Home v0 — Identity & Access Boundary
-- ----------------------------------------------------------------------------
-- Purpose:
--   Introduce the smallest secure distinction between AGENCY users (cockpit)
--   and CREATOR users (self-service /my), plus the identity link that lets a
--   pre-provisioned authenticated creator (e.g. Emma) safely access ONLY their
--   own assessment/report history.
--
-- Why this is required (confirmed in investigation):
--   The app uses a single Supabase client whose JWT rides on every request, and
--   every creator-domain table currently has `authenticated FOR ALL USING(true)`.
--   Without this migration, any authenticated creator would gain full read/write
--   over ALL creators' data (including private agency notes).
--
-- Design (minimal, additive):
--   * public.agency_users            — tiny allowlist (seeded from existing auth.users)
--   * public.is_agency()             — stable security-definer membership check
--   * creator_profiles.auth_user_id  — one additive nullable identity link
--   * anon guard trigger             — anon can NEVER set/change/clear auth_user_id
--   * agency-only authenticated RLS  — replaces broad authenticated USING(true)
--   * creator-own SELECT RLS         — a creator reads only their own records
--   * claim_creator_profile()        — server-controlled identity linking by verified email
--   * create_creator_retake_invite() — server-controlled self-serve retake invite
--
-- Explicitly NOT changed:
--   * All existing `anon` policies (public assessment + public report flows).
--     The pre-existing broad anon-read posture is acknowledged tech debt and is
--     deferred; this migration does not widen it and never exposes auth_user_id.
--   * public.events policies (already narrow / FYV-scoped, not USING(true)).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Agency allowlist
-- ----------------------------------------------------------------------------
create table if not exists public.agency_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table public.agency_users enable row level security;

-- Seed every EXISTING auth user as agency. At cutover there are no creator
-- accounts (creator_profiles.auth_user_id is brand new / all NULL), so every
-- current authenticated user is an agency/admin operator. New creator accounts
-- created after cutover are NOT added here → deny-by-default for creators.
insert into public.agency_users (auth_user_id)
  select id from auth.users
  on conflict (auth_user_id) do nothing;

-- The allowlist is managed via SQL/admin only. No client writes.
-- A member may read their own row (defence in depth); membership checks in RLS
-- go through is_agency() (security definer), not direct table reads.
drop policy if exists "Agency member can read own allowlist row" on public.agency_users;
create policy "Agency member can read own allowlist row"
  on public.agency_users for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. is_agency() — stable, security-definer, safe search_path
-- ----------------------------------------------------------------------------
create or replace function public.is_agency()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.agency_users a where a.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_agency() from public;
grant execute on function public.is_agency() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Creator identity link (one additive field; no second identity store)
-- ----------------------------------------------------------------------------
alter table public.creator_profiles
  add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_profiles_auth_user_id_fkey'
  ) then
    alter table public.creator_profiles
      add constraint creator_profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- Unique when present (a given auth user maps to at most one creator profile).
create unique index if not exists creator_profiles_auth_user_id_key
  on public.creator_profiles(auth_user_id)
  where auth_user_id is not null;

-- Helper: the caller's own creator profile id (NULL if unlinked). Security
-- definer so creator-own RLS policies resolve deterministically without nested
-- RLS on creator_profiles.
create or replace function public.current_creator_profile_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select id
  from public.creator_profiles
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_creator_profile_id() from public;
grant execute on function public.current_creator_profile_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Guard: an anon (public) client must NEVER touch auth_user_id
--    (anon still has broad INSERT/UPDATE on creator_profiles for the public
--     assessment flow, so this column must be protected explicitly.)
--    NOT security-definer: it must observe the real request role via current_user.
-- ----------------------------------------------------------------------------
create or replace function public.fyv_guard_auth_user_id()
  returns trigger
  language plpgsql
as $$
begin
  if current_user = 'anon' then
    if tg_op = 'INSERT' and new.auth_user_id is not null then
      raise exception 'anon may not set auth_user_id' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (new.auth_user_id is distinct from old.auth_user_id) then
      raise exception 'anon may not modify auth_user_id' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fyv_guard_auth_user_id on public.creator_profiles;
create trigger trg_fyv_guard_auth_user_id
  before insert or update on public.creator_profiles
  for each row execute function public.fyv_guard_auth_user_id();

-- ----------------------------------------------------------------------------
-- 5. Replace broad `authenticated USING(true)` with agency-only access.
--    (Existing policy names verified against migrations before dropping.)
--    Anon policies are intentionally left untouched.
-- ----------------------------------------------------------------------------

-- Idempotency: also drop the *replacement* policy names up front, so this
-- migration can be safely re-run / retried after a partial failure.
drop policy if exists "Agency full access profiles" on public.creator_profiles;
drop policy if exists "Agency full access assessments" on public.creator_assessments;
drop policy if exists "Agency full access reports" on public.creator_reports;
drop policy if exists "Agency full access notes" on public.creator_notes;
drop policy if exists "Agency full access status events" on public.creator_status_events;
drop policy if exists "Agency full access creator dna profiles" on public.creator_dna_profiles;
drop policy if exists "Agency can review creator invite requests" on public.creator_invite_requests;
drop policy if exists "Agency full access creator assessment links" on public.creator_assessment_links;
drop policy if exists "Agency full access creator questions" on public.creator_question_bank;
drop policy if exists "Agency full access assessment templates" on public.creator_assessment_templates;
drop policy if exists "Agency full access assessment template questions" on public.creator_assessment_template_questions;
drop policy if exists "Agency full access assessment template items" on public.creator_assessment_template_items;
drop policy if exists "Agency full access assessment branch rules" on public.creator_assessment_branch_rules;

-- creator_profiles
drop policy if exists "Authenticated full access profiles" on public.creator_profiles;
create policy "Agency full access profiles"
  on public.creator_profiles for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessments
drop policy if exists "Authenticated full access assessments" on public.creator_assessments;
create policy "Agency full access assessments"
  on public.creator_assessments for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_reports
drop policy if exists "Authenticated full access reports" on public.creator_reports;
create policy "Agency full access reports"
  on public.creator_reports for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_notes (agency-private; NO creator access at all)
drop policy if exists "Authenticated full access notes" on public.creator_notes;
create policy "Agency full access notes"
  on public.creator_notes for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_status_events
drop policy if exists "Authenticated full access status events" on public.creator_status_events;
create policy "Agency full access status events"
  on public.creator_status_events for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_dna_profiles
drop policy if exists "Authenticated full access creator dna profiles" on public.creator_dna_profiles;
create policy "Agency full access creator dna profiles"
  on public.creator_dna_profiles for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_invite_requests (agency-private)
drop policy if exists "Authenticated can review creator invite requests" on public.creator_invite_requests;
create policy "Agency can review creator invite requests"
  on public.creator_invite_requests for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessment_links (agency-managed; anon keeps read of active/public links)
drop policy if exists "Authenticated full access creator assessment links" on public.creator_assessment_links;
create policy "Agency full access creator assessment links"
  on public.creator_assessment_links for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_question_bank (config; agency-only for authenticated)
drop policy if exists "Authenticated full access creator questions" on public.creator_question_bank;
create policy "Agency full access creator questions"
  on public.creator_question_bank for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessment_templates
drop policy if exists "Authenticated full access assessment templates" on public.creator_assessment_templates;
create policy "Agency full access assessment templates"
  on public.creator_assessment_templates for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessment_template_questions
drop policy if exists "Authenticated full access assessment template questions" on public.creator_assessment_template_questions;
create policy "Agency full access assessment template questions"
  on public.creator_assessment_template_questions for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessment_template_items
drop policy if exists "Authenticated full access assessment template items" on public.creator_assessment_template_items;
create policy "Agency full access assessment template items"
  on public.creator_assessment_template_items for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- creator_assessment_branch_rules
drop policy if exists "Authenticated full access assessment branch rules" on public.creator_assessment_branch_rules;
create policy "Agency full access assessment branch rules"
  on public.creator_assessment_branch_rules for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

-- ----------------------------------------------------------------------------
-- 6. Creator-own SELECT policies (narrow, read-only; keyed on auth.uid()).
--    A creator may read ONLY records tied to their own linked profile.
--    NOT granted: creator_notes, creator_status_events, creator_invite_requests,
--    invite links, or any config/admin table.
-- ----------------------------------------------------------------------------
drop policy if exists "Creator can read own profile" on public.creator_profiles;
create policy "Creator can read own profile"
  on public.creator_profiles for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "Creator can read own assessments" on public.creator_assessments;
create policy "Creator can read own assessments"
  on public.creator_assessments for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can read own reports" on public.creator_reports;
create policy "Creator can read own reports"
  on public.creator_reports for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop policy if exists "Creator can read own dna profiles" on public.creator_dna_profiles;
create policy "Creator can read own dna profiles"
  on public.creator_dna_profiles for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

-- ----------------------------------------------------------------------------
-- 7. claim_creator_profile() — controlled identity linking.
--    No client-supplied id or email. Uses the verified auth.users email.
-- ----------------------------------------------------------------------------
create or replace function public.claim_creator_profile()
  returns public.creator_profiles
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_email       text;
  v_profile     public.creator_profiles;
  v_match_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Agency operators are not creators.
  if public.is_agency() then
    raise exception 'agency users cannot claim a creator profile' using errcode = '42501';
  end if;

  -- Idempotent: already linked to this user.
  select * into v_profile
  from public.creator_profiles
  where auth_user_id = v_uid
  limit 1;
  if found then
    return v_profile;
  end if;

  -- Server-trusted, verified email (never taken from the client).
  select lower(btrim(email)) into v_email
  from auth.users
  where id = v_uid;

  if v_email is null or v_email = '' then
    raise exception 'no verified email on account' using errcode = '22023';
  end if;

  select count(*) into v_match_count
  from public.creator_profiles
  where auth_user_id is null
    and lower(btrim(email)) = v_email;

  if v_match_count = 0 then
    if exists (
      select 1 from public.creator_profiles
      where lower(btrim(email)) = v_email and auth_user_id is not null
    ) then
      raise exception 'a profile for your email is already linked to another account'
        using errcode = '42501';
    end if;
    raise exception 'no creator profile found for your account' using errcode = 'P0002';
  elsif v_match_count > 1 then
    raise exception 'multiple creator profiles match your email; contact the agency'
      using errcode = 'P0001';
  end if;

  update public.creator_profiles
     set auth_user_id = v_uid
   where auth_user_id is null
     and lower(btrim(email)) = v_email
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.claim_creator_profile() from public;
grant execute on function public.claim_creator_profile() to authenticated;

-- ----------------------------------------------------------------------------
-- 8. create_creator_retake_invite() — self-serve retake for a linked creator.
--    Resolves profile from auth.uid(); creates a fresh invite bound to that
--    same profile; returns ONLY the code + template slug for navigation.
-- ----------------------------------------------------------------------------
create or replace function public.create_creator_retake_invite()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.creator_profiles;
  v_template public.creator_assessment_templates;
  v_code     text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if public.is_agency() then
    raise exception 'agency users cannot create a retake invite' using errcode = '42501';
  end if;

  select * into v_profile
  from public.creator_profiles
  where auth_user_id = v_uid
  limit 1;
  if not found then
    raise exception 'no linked creator profile' using errcode = 'P0002';
  end if;

  -- Prefer the default active public template; else any active public template.
  select * into v_template
  from public.creator_assessment_templates
  where is_active = true and is_public = true
  order by is_default desc, created_at asc
  limit 1;
  if not found then
    raise exception 'no assessment template available' using errcode = 'P0001';
  end if;

  -- Unique invite code (dependency-free; gen_random_uuid already in use).
  loop
    v_code := replace(gen_random_uuid()::text, '-', '');
    exit when not exists (
      select 1 from public.creator_assessment_links where invite_code = v_code
    );
  end loop;

  insert into public.creator_assessment_links (
    template_id, invite_code, creator_name, creator_email,
    creator_profile_id, is_active, expires_at
  ) values (
    v_template.id, v_code,
    coalesce(nullif(btrim(v_profile.full_name), ''), 'Creator'),
    v_profile.email,
    v_profile.id, true, now() + interval '30 days'
  );

  return jsonb_build_object('invite_code', v_code, 'template_slug', v_template.slug);
end;
$$;

revoke all on function public.create_creator_retake_invite() from public;
grant execute on function public.create_creator_retake_invite() to authenticated;

commit;
