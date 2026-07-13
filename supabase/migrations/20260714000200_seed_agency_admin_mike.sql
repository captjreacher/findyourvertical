-- ============================================================================
-- Seed: agency administrator mike@mgrnz.com (allowlist model — no role enum)
-- ----------------------------------------------------------------------------
-- Identity in FYV is an ALLOWLIST, not a role column: membership in
-- public.agency_users (checked by public.is_agency()) is the source of truth for
-- agency/admin access. This migration simply guarantees mike@mgrnz.com is on
-- that allowlist, idempotently.
--
-- Guarantees (per spec):
--   * idempotent — ON CONFLICT DO NOTHING; safe to re-run.
--   * does NOT create a duplicate auth user — it only references the EXISTING
--     auth.users row by verified email; if none exists yet the insert is a no-op.
--   * does NOT attach a creator_profile_id / create a creator profile.
--   * does NOT create assessment records.
--   * introduces NO role column and does not alter the security model.
--
-- Agency admins are intentionally NOT creators: because there is no linked
-- creator_profile, current_creator_profile_id() stays NULL for mike and
-- CreatorGate already refuses to run agency operators through creator onboarding.
-- ============================================================================

begin;

insert into public.agency_users (auth_user_id)
select id
from auth.users
where lower(email) = lower('mike@mgrnz.com')
on conflict (auth_user_id) do nothing;

-- Informational invariant check (non-destructive): an agency admin should not
-- also be linked to a creator profile. We surface a NOTICE rather than mutate,
-- so this seed never repurposes/unlinks existing data.
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower('mike@mgrnz.com');
  if v_uid is null then
    raise notice 'agency seed: auth user mike@mgrnz.com not present yet — allowlist insert was a no-op';
  elsif exists (select 1 from public.creator_profiles where auth_user_id = v_uid) then
    raise notice 'agency seed: WARNING mike@mgrnz.com is also linked to a creator_profile (auth_user_id=%); review identity', v_uid;
  else
    raise notice 'agency seed: mike@mgrnz.com is agency-only (no linked creator profile)';
  end if;
end $$;

commit;
