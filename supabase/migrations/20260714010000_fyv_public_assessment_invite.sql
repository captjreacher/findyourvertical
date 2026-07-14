-- FYV-ONBOARD-2 (2026-07-14) — remove the pre-approval gate from public
-- assessment onboarding.
--
-- Adds ONE SECURITY DEFINER RPC, public.create_public_assessment_invite, that
-- lets an anonymous visitor immediately provision (or reuse) a creator_profile
-- and issue a working assessment invite in public.creator_assessment_links —
-- the same table the agency already writes to via the Assessment Templates
-- "New Assessment Invite" modal. The public form becomes another PRODUCER of
-- creator_assessment_links; no new invitation mechanism is introduced.
--
-- Approved boundary (Decisions doc, 2026-07-14):
--   Public assessment request
--     → creator_assessment_links
--     → assessment
--     → assessment complete
--     → agency review
--     → creator relationship/onboarding (existing PR#17 flow)
--
-- Implementation requirements applied:
--   * SECURITY DEFINER with fixed search_path = public, pg_temp
--   * Fully qualified object references throughout
--   * EXECUTE granted only on this RPC (anon, authenticated); PUBLIC revoked
--   * No new table-level privileges for anon — the RPC is the only path
--   * Input validation (name/email shape + length caps, trimmed) rejects bad
--     input with SQLSTATE 22023 before any writes
--   * Retake / repeat-submit dedupe: reuses an active, non-expired,
--     non-terminal link for the same (creator_profile_id, template_id)
--     created within a 30-minute window instead of issuing duplicates. This
--     matches the "reuse or rotate active links" semantics for
--     creator_assessment_links (no duplicate active invitations).
--   * Emits a single deduped events-outbox row per (profile, template, day)
--     via a partial unique index. Payload never contains the plaintext code.
--
-- This migration is additive only. It touches NO existing table, NO existing
-- policy, and NO other RPC. It adds one function + one partial unique index on
-- public.events.

begin;

create or replace function public.create_public_assessment_invite(
  p_name text,
  p_email text,
  p_onlyfans_handle text default null,
  p_template_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now             timestamptz := now();
  v_dedupe_window   interval    := interval '30 minutes';
  v_default_expiry  interval    := interval '90 days';

  v_name    text;
  v_email   text;
  v_handle  text;

  v_template public.creator_assessment_templates%rowtype;

  v_profile_id     uuid;
  v_link           public.creator_assessment_links%rowtype;
  v_invite_code    text;
  v_expires_at     timestamptz;
  v_correlation_id text;
  v_reused         boolean := false;
begin
  -- ── Input validation (visitor-supplied; must be trimmed and shaped).
  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    raise exception 'Name is required'
      using errcode = '22023';
  end if;
  if length(v_name) > 200 then
    raise exception 'Name is too long (max 200 chars)'
      using errcode = '22023';
  end if;

  v_email := lower(nullif(btrim(p_email), ''));
  if v_email is null then
    raise exception 'Email is required'
      using errcode = '22023';
  end if;
  if length(v_email) > 320 then
    raise exception 'Email is too long'
      using errcode = '22023';
  end if;
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'A valid email is required'
      using errcode = '22023';
  end if;

  v_handle := nullif(btrim(p_onlyfans_handle), '');
  if v_handle is not null then
    if length(v_handle) > 200 then
      raise exception 'Handle is too long'
        using errcode = '22023';
    end if;
    -- Match the wizard's normalise-handle behaviour: strip a leading @.
    if left(v_handle, 1) = '@' then
      v_handle := nullif(btrim(substr(v_handle, 2)), '');
    end if;
  end if;

  -- ── Resolve the target assessment template.
  -- Precedence: explicit slug > default active public template > earliest
  -- active public template.
  if p_template_slug is not null then
    select *
      into v_template
      from public.creator_assessment_templates
     where slug = p_template_slug
       and is_active = true
       and is_public = true
     limit 1;
  end if;

  if v_template.id is null then
    select *
      into v_template
      from public.creator_assessment_templates
     where is_active = true
       and is_public = true
     order by is_default desc nulls last, created_at asc
     limit 1;
  end if;

  if v_template.id is null then
    raise exception 'No active assessment template is available'
      using errcode = 'P0001';
  end if;

  -- ── Upsert creator_profile by lower(email).
  select id
    into v_profile_id
    from public.creator_profiles
   where lower(email) = v_email
   limit 1;

  if v_profile_id is null then
    -- Fresh visitor — provision at the top of the qualification pipeline.
    -- 'Invited' matches the pipeline's post-invitation state
    -- (see public.creator_profiles.status CHECK: valid_creator_workflow_status).
    insert into public.creator_profiles (
      full_name,
      email,
      onlyfans_handle,
      status
    )
    values (
      v_name,
      v_email,
      v_handle,
      'Invited'
    )
    returning id into v_profile_id;
  else
    -- Existing profile — never overwrite an operator-set name/handle, only
    -- backfill missing fields.
    update public.creator_profiles
       set full_name       = coalesce(full_name, v_name),
           onlyfans_handle = coalesce(onlyfans_handle, v_handle),
           updated_at      = v_now
     where id = v_profile_id;
  end if;

  -- ── Dedupe: reuse an active, non-expired, non-terminal link for the same
  -- (profile, template) created within the dedupe window. This is the
  -- "reuse or rotate" behaviour approved in the Decisions doc — no duplicate
  -- active invitations for the same person+template inside the window.
  select *
    into v_link
    from public.creator_assessment_links
   where creator_profile_id = v_profile_id
     and template_id        = v_template.id
     and is_active          = true
     and status not in ('Revoked', 'Expired', 'Completed')
     and (expires_at is null or expires_at > v_now)
     and created_at > v_now - v_dedupe_window
   order by created_at desc
   limit 1;

  if v_link.id is not null then
    v_reused := true;
  else
    -- Fresh invite. invite_code shape (32 hex chars) mirrors what agency's
    -- AssessmentTemplates modal generates so downstream code (wizard invite
    -- check, cockpit listings) treats both sources identically.
    v_invite_code := encode(gen_random_bytes(16), 'hex');
    v_expires_at  := v_now + v_default_expiry;

    insert into public.creator_assessment_links (
      template_id,
      invite_code,
      creator_name,
      creator_email,
      creator_profile_id,
      is_active,
      expires_at,
      status,
      status_updated_at
    )
    values (
      v_template.id,
      v_invite_code,
      v_name,
      v_email,
      v_profile_id,
      true,
      v_expires_at,
      'Created',
      v_now
    )
    returning * into v_link;
  end if;

  -- ── Emit a deduped events-outbox row so agency sees public traffic.
  -- Correlation keys off (profile, template, day) so repeated submits inside a
  -- day roll up into one audit row. The plaintext invite_code is NEVER in the
  -- payload (only the link uuid).
  v_correlation_id := 'fyv/assessment-invite/self/'
                      || v_profile_id::text
                      || '/' || v_template.id::text
                      || '/' || to_char((v_now at time zone 'utc'), 'YYYY-MM-DD');

  insert into public.events (
    event_type,
    source_system,
    entity_type,
    entity_id,
    entity_ref,
    status,
    payload,
    correlation_id
  )
  select
    'creator.assessment_invite.self_requested',
    'findyourvertical',
    'creator_assessment_links',
    v_link.id,
    'fyv:' || v_profile_id::text,
    case when v_reused then 'reused' else 'emitted' end,
    jsonb_build_object(
      'event_type',          'creator.assessment_invite.self_requested',
      'creator_profile_id',  v_profile_id,
      'invite_link_id',      v_link.id,
      'template_id',         v_template.id,
      'template_slug',       v_template.slug,
      'source',              'public',
      'reused',              v_reused,
      'timestamp',           to_char((v_now at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    v_correlation_id
  where not exists (
    select 1
      from public.events
     where event_type     = 'creator.assessment_invite.self_requested'
       and correlation_id = v_correlation_id
  );

  return jsonb_build_object(
    'invite_link_id',     v_link.id,
    'invite_code',        v_link.invite_code,
    'template_id',        v_template.id,
    'template_slug',      v_template.slug,
    'creator_profile_id', v_profile_id,
    'creator_email',      v_link.creator_email,
    'creator_name',       v_link.creator_name,
    'expires_at',         v_link.expires_at,
    'reused',             v_reused,
    'source',             'public'
  );
end;
$$;

revoke all on function public.create_public_assessment_invite(text, text, text, text) from public;
grant execute on function public.create_public_assessment_invite(text, text, text, text) to anon, authenticated;

comment on function public.create_public_assessment_invite(text, text, text, text) is
  'FYV-ONBOARD-2 (2026-07-14): anon-callable SECURITY DEFINER that issues an assessment invite immediately for a visitor. Reuses creator_assessment_links (System A); no new invitation mechanism. Dedupes on (creator_profile_id, template_id) within a 30-minute window and emits creator.assessment_invite.self_requested to the events outbox. Callers: publicSupabase (browser) and authenticated agency flows if they choose to route through the same helper.';

-- ── Dedupe index for the self-requested event so retries / concurrent
-- submits inside the same day never write duplicates. Scoped by event_type so
-- it never collides with other events' partial unique indexes on correlation_id
-- (creator.intelligence_package.published, creator_invited/_accepted/_activated).
create unique index if not exists events_assessment_invite_self_correlation_uidx
  on public.events (correlation_id)
  where event_type = 'creator.assessment_invite.self_requested';

commit;
