-- ============================================================================
-- FYV-ONBOARDING-FIRST — Creator onboarding cases + secure invitations
-- ----------------------------------------------------------------------------
-- Introduces a genuine, resumable creator-onboarding architecture (there was
-- none — the previous /creator-services/onboarding page was a static public
-- placeholder that trusted a ?profileId= query param). This migration is
-- self-contained and additive; it does NOT touch assessment, scoring, report,
-- persona, auth, billing, or existing RLS policies.
--
-- Two tables:
--   1. public.creator_onboarding_cases       — one resumable onboarding process
--      per creator (lifecycle: not_started → in_progress → submitted →
--      review_required → complete). Ownership anchor = creator_profile_id.
--   2. public.creator_onboarding_invitations — single-purpose, HASHED tokens
--      (raw token returned only at creation, never stored) that resolve to
--      exactly one onboarding case.
--
-- Security model (mirrors PERSONA-1A/1B + creator-home conventions):
--   * Creators get READ-ONLY own-row access via RLS; all writes go through
--     SECURITY DEFINER RPCs that enforce ownership server-side.
--   * Agency operators manage everything via public.is_agency().
--   * anon + PUBLIC explicitly revoked on both tables.
--   * Identity is ALWAYS the authenticated creator linkage
--     (public.current_creator_profile_id()) — never a client-supplied id.
--
-- Approved adjustments baked in:
--   * accepted_at makes an invitation SINGLE-USE; redemption thereafter is by
--     authenticated ownership, not the token. Expired / revoked / already-
--     accepted / creator-mismatch fail distinctly (machine-readable codes).
--   * initiate_creator_onboarding(force_new boolean default false): reuse an
--     active non-complete case; else with force_new=false return the latest
--     completed case; else (or force_new=true) create a fresh not_started case.
--     force_new is agency-only.
--   * onboarding.invitation.created events carry ONLY creator_profile_id,
--     onboarding_case_id, invitation_id, expires_at, source — never the raw
--     token, full URL, or token hash.
-- ============================================================================

begin;

create extension if not exists pgcrypto;  -- digest(), gen_random_bytes()

-- ── 1. Onboarding cases ──────────────────────────────────────────────────────
create table if not exists public.creator_onboarding_cases (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  status              text not null default 'not_started'
                        check (status in ('not_started', 'in_progress', 'submitted', 'review_required', 'complete')),
  -- Resumable structured answers. JSONB (not child tables): onboarding intake is
  -- a free-form questionnaire with no cross-row querying need this sprint.
  responses           jsonb not null default '{}'::jsonb,
  -- Agency action-required metadata surfaced to the creator on review_required.
  review_notes        text,
  -- How the case was initiated ('agency' | 'creator').
  source              text not null default 'agency' check (source in ('agency', 'creator')),
  started_at          timestamptz,
  submitted_at        timestamptz,
  completed_at        timestamptz
);

-- At most ONE active (non-complete) case per creator → duplicate initiation
-- resumes rather than duplicating. Completed cases are exempt (history kept).
create unique index if not exists creator_onboarding_cases_one_active
  on public.creator_onboarding_cases (creator_profile_id)
  where status <> 'complete';

create index if not exists idx_creator_onboarding_cases_profile
  on public.creator_onboarding_cases (creator_profile_id, created_at desc);

alter table public.creator_onboarding_cases enable row level security;

revoke all on public.creator_onboarding_cases from public;
revoke all on public.creator_onboarding_cases from anon;
grant select on public.creator_onboarding_cases to authenticated;
grant select, insert, update, delete on public.creator_onboarding_cases to service_role;

drop policy if exists "Agency full access onboarding cases" on public.creator_onboarding_cases;
create policy "Agency full access onboarding cases"
  on public.creator_onboarding_cases for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own onboarding cases" on public.creator_onboarding_cases;
create policy "Creator can read own onboarding cases"
  on public.creator_onboarding_cases for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_onboarding_cases_updated_at on public.creator_onboarding_cases;
create trigger trg_creator_onboarding_cases_updated_at
  before update on public.creator_onboarding_cases
  for each row execute function public.set_updated_at();

-- ── 2. Onboarding invitations (single-purpose, hashed) ───────────────────────
create table if not exists public.creator_onboarding_invitations (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  onboarding_case_id  uuid not null references public.creator_onboarding_cases(id) on delete cascade,
  -- SHA-256 of the raw token. The raw token is returned ONCE at creation and is
  -- never stored. Lookups hash the presented token and compare.
  token_hash          bytea not null unique,
  expires_at          timestamptz not null,
  accepted_at         timestamptz,   -- set on first redemption → single-use
  revoked_at          timestamptz,
  created_by          uuid           -- auth.uid() of the agency operator
);

create index if not exists idx_creator_onboarding_invitations_profile
  on public.creator_onboarding_invitations (creator_profile_id);
create index if not exists idx_creator_onboarding_invitations_case
  on public.creator_onboarding_invitations (onboarding_case_id);

alter table public.creator_onboarding_invitations enable row level security;

revoke all on public.creator_onboarding_invitations from public;
revoke all on public.creator_onboarding_invitations from anon;
grant select on public.creator_onboarding_invitations to authenticated;
grant select, insert, update, delete on public.creator_onboarding_invitations to service_role;

-- Agency-only visibility. Creators never list invitations; they redeem via the
-- definer RPC using the raw token, so no creator SELECT policy is granted.
drop policy if exists "Agency full access onboarding invitations" on public.creator_onboarding_invitations;
create policy "Agency full access onboarding invitations"
  on public.creator_onboarding_invitations for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_onboarding_invitations_updated_at on public.creator_onboarding_invitations;
create trigger trg_creator_onboarding_invitations_updated_at
  before update on public.creator_onboarding_invitations
  for each row execute function public.set_updated_at();

-- ── 3. Best-effort audit emitter (reuses public.events; never breaks core txn) ─
create or replace function public.fyv_emit_onboarding_event(
  p_event_type         text,
  p_creator_profile_id uuid,
  p_case_id            uuid,
  p_payload            jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload
    ) values (
      'findyourvertical',
      p_event_type,
      'creator_onboarding_case',
      p_case_id,
      'creator_profile:' || p_creator_profile_id::text,
      null,
      coalesce(p_payload, '{}'::jsonb)
    );
  exception when others then
    null;  -- audit is best-effort; never fail the caller's transaction
  end;
end;
$$;

revoke all on function public.fyv_emit_onboarding_event(text, uuid, uuid, jsonb) from public;
grant execute on function public.fyv_emit_onboarding_event(text, uuid, uuid, jsonb) to service_role;

-- ── 4. Creator: start / resume own onboarding (create-or-resume, own only) ───
create or replace function public.start_my_onboarding()
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_case    public.creator_onboarding_cases;
begin
  if v_profile is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;

  -- Active non-complete case wins (resume).
  select * into v_case
  from public.creator_onboarding_cases
  where creator_profile_id = v_profile and status <> 'complete'
  order by created_at desc limit 1;
  if found then return v_case; end if;

  -- Otherwise reuse the latest completed case if present (creators cannot
  -- force a brand-new cycle — that is agency-only via initiate_creator_onboarding).
  select * into v_case
  from public.creator_onboarding_cases
  where creator_profile_id = v_profile and status = 'complete'
  order by completed_at desc nulls last, created_at desc limit 1;
  if found then return v_case; end if;

  insert into public.creator_onboarding_cases (creator_profile_id, status, source)
  values (v_profile, 'not_started', 'creator')
  returning * into v_case;

  perform public.fyv_emit_onboarding_event(
    'onboarding.case.initiated', v_profile, v_case.id,
    jsonb_build_object('creator_profile_id', v_profile, 'onboarding_case_id', v_case.id, 'source', 'creator')
  );
  return v_case;
end;
$$;

revoke all on function public.start_my_onboarding() from public;
grant execute on function public.start_my_onboarding() to authenticated;

-- ── 5. Creator: fetch own onboarding case (most relevant; null if none) ──────
create or replace function public.get_my_onboarding_case()
  returns public.creator_onboarding_cases
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_case    public.creator_onboarding_cases;
begin
  if v_profile is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;
  select * into v_case
  from public.creator_onboarding_cases
  where creator_profile_id = v_profile and status <> 'complete'
  order by created_at desc limit 1;
  if found then return v_case; end if;
  select * into v_case
  from public.creator_onboarding_cases
  where creator_profile_id = v_profile
  order by completed_at desc nulls last, created_at desc limit 1;
  return v_case;  -- NULL row when the creator has no case yet
end;
$$;

revoke all on function public.get_my_onboarding_case() from public;
grant execute on function public.get_my_onboarding_case() to authenticated;

-- ── 6. Creator: save progress (own; resumable) ───────────────────────────────
create or replace function public.save_my_onboarding_progress(
  p_case_id   uuid,
  p_responses jsonb
)
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_case    public.creator_onboarding_cases;
begin
  if v_profile is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;
  select * into v_case from public.creator_onboarding_cases where id = p_case_id for update;
  if not found or v_case.creator_profile_id <> v_profile then
    raise exception 'onboarding case not found' using errcode = 'P0002';
  end if;
  if v_case.status not in ('not_started', 'in_progress', 'review_required') then
    raise exception 'this onboarding case is not editable in its current state' using errcode = 'P0001';
  end if;

  update public.creator_onboarding_cases
     set responses  = coalesce(p_responses, '{}'::jsonb),
         status     = 'in_progress',
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_case_id
  returning * into v_case;
  return v_case;
end;
$$;

revoke all on function public.save_my_onboarding_progress(uuid, jsonb) from public;
grant execute on function public.save_my_onboarding_progress(uuid, jsonb) to authenticated;

-- ── 7. Creator: submit onboarding (own) ──────────────────────────────────────
create or replace function public.submit_my_onboarding(p_case_id uuid)
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_case    public.creator_onboarding_cases;
begin
  if v_profile is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;
  select * into v_case from public.creator_onboarding_cases where id = p_case_id for update;
  if not found or v_case.creator_profile_id <> v_profile then
    raise exception 'onboarding case not found' using errcode = 'P0002';
  end if;
  if v_case.status not in ('not_started', 'in_progress', 'review_required') then
    raise exception 'this onboarding case cannot be submitted in its current state' using errcode = 'P0001';
  end if;

  update public.creator_onboarding_cases
     set status       = 'submitted',
         submitted_at = now(),
         started_at   = coalesce(started_at, now()),
         updated_at   = now()
   where id = p_case_id
  returning * into v_case;

  perform public.fyv_emit_onboarding_event(
    'onboarding.submitted', v_profile, v_case.id,
    jsonb_build_object('creator_profile_id', v_profile, 'onboarding_case_id', v_case.id)
  );
  return v_case;
end;
$$;

revoke all on function public.submit_my_onboarding(uuid) from public;
grant execute on function public.submit_my_onboarding(uuid) to authenticated;

-- ── 8. Creator: redeem an invitation (single-use; distinct safe failures) ────
-- Returns jsonb { ok, code?, onboarding_case_id?, status? }. Ownership is the
-- authenticated creator; the token is only a one-time entry mechanism.
create or replace function public.redeem_onboarding_invitation(p_token text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_inv     public.creator_onboarding_invitations;
  v_case    public.creator_onboarding_cases;
begin
  if v_profile is null then
    return jsonb_build_object('ok', false, 'code', 'authentication_required');
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select * into v_inv
  from public.creator_onboarding_invitations
  where token_hash = digest(p_token, 'sha256')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  -- Creator-mismatch takes precedence over accepted state.
  if v_inv.creator_profile_id <> v_profile then
    return jsonb_build_object('ok', false, 'code', 'creator_mismatch');
  end if;
  if v_inv.accepted_at is not null then
    -- Single-use: already redeemed. The owner still resumes via ownership, so
    -- surface the case id for a graceful client redirect.
    return jsonb_build_object('ok', false, 'code', 'already_accepted',
                              'onboarding_case_id', v_inv.onboarding_case_id);
  end if;

  update public.creator_onboarding_invitations
     set accepted_at = now(), updated_at = now()
   where id = v_inv.id;

  select * into v_case from public.creator_onboarding_cases where id = v_inv.onboarding_case_id;

  perform public.fyv_emit_onboarding_event(
    'onboarding.invitation.accepted', v_profile, v_inv.onboarding_case_id,
    jsonb_build_object('creator_profile_id', v_profile, 'onboarding_case_id', v_inv.onboarding_case_id,
                       'invitation_id', v_inv.id)
  );

  return jsonb_build_object('ok', true, 'onboarding_case_id', v_inv.onboarding_case_id,
                            'status', coalesce(v_case.status, 'not_started'));
end;
$$;

revoke all on function public.redeem_onboarding_invitation(text) from public;
revoke all on function public.redeem_onboarding_invitation(text) from anon;
grant execute on function public.redeem_onboarding_invitation(text) to authenticated;

-- ── 9. Agency: initiate / resume a case (force_new-aware) ────────────────────
create or replace function public.initiate_creator_onboarding(
  p_creator_profile_id uuid,
  p_force_new          boolean default false
)
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_case public.creator_onboarding_cases;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;
  if p_creator_profile_id is null then
    raise exception 'creator_profile_id is required' using errcode = '22023';
  end if;

  -- Active non-complete case → resume.
  select * into v_case
  from public.creator_onboarding_cases
  where creator_profile_id = p_creator_profile_id and status <> 'complete'
  order by created_at desc limit 1;
  if found then return v_case; end if;

  -- Only completed cases (or none). Without force_new, return the latest
  -- completed case if one exists; with force_new, always start a fresh cycle.
  if not p_force_new then
    select * into v_case
    from public.creator_onboarding_cases
    where creator_profile_id = p_creator_profile_id and status = 'complete'
    order by completed_at desc nulls last, created_at desc limit 1;
    if found then return v_case; end if;
  end if;

  insert into public.creator_onboarding_cases (creator_profile_id, status, source)
  values (p_creator_profile_id, 'not_started', 'agency')
  returning * into v_case;

  perform public.fyv_emit_onboarding_event(
    'onboarding.case.initiated', p_creator_profile_id, v_case.id,
    jsonb_build_object('creator_profile_id', p_creator_profile_id, 'onboarding_case_id', v_case.id, 'source', 'agency')
  );
  return v_case;
end;
$$;

revoke all on function public.initiate_creator_onboarding(uuid, boolean) from public;
revoke all on function public.initiate_creator_onboarding(uuid, boolean) from anon;
grant execute on function public.initiate_creator_onboarding(uuid, boolean) to authenticated;

-- ── 10. Agency: create a single-use invitation (raw token returned ONCE) ─────
create or replace function public.create_onboarding_invitation(
  p_creator_profile_id uuid,
  p_expires_in         interval default interval '14 days'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_case  public.creator_onboarding_cases;
  v_raw   text;
  v_inv   public.creator_onboarding_invitations;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;

  -- Ensure an ACTIVE case to onboard into (resume active; else fresh cycle).
  v_case := public.initiate_creator_onboarding(p_creator_profile_id, true);

  v_raw := encode(gen_random_bytes(32), 'hex');  -- 64 hex chars, URL-safe

  insert into public.creator_onboarding_invitations (
    creator_profile_id, onboarding_case_id, token_hash, expires_at, created_by
  ) values (
    p_creator_profile_id, v_case.id, digest(v_raw, 'sha256'), now() + p_expires_in, auth.uid()
  )
  returning * into v_inv;

  -- SAFE event payload ONLY — never the raw token, URL, or token hash.
  perform public.fyv_emit_onboarding_event(
    'onboarding.invitation.created', p_creator_profile_id, v_case.id,
    jsonb_build_object(
      'creator_profile_id', p_creator_profile_id,
      'onboarding_case_id', v_case.id,
      'invitation_id', v_inv.id,
      'expires_at', v_inv.expires_at,
      'source', 'agency'
    )
  );

  -- Raw token + path returned once to the caller (agency cockpit) for copying.
  return jsonb_build_object(
    'invitation_id', v_inv.id,
    'onboarding_case_id', v_case.id,
    'expires_at', v_inv.expires_at,
    'raw_token', v_raw,
    'accept_path', '/my/onboarding/accept?token=' || v_raw
  );
end;
$$;

revoke all on function public.create_onboarding_invitation(uuid, interval) from public;
revoke all on function public.create_onboarding_invitation(uuid, interval) from anon;
grant execute on function public.create_onboarding_invitation(uuid, interval) to authenticated;

-- ── 11. Agency: revoke an invitation ─────────────────────────────────────────
create or replace function public.revoke_onboarding_invitation(p_invitation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;
  update public.creator_onboarding_invitations
     set revoked_at = coalesce(revoked_at, now()), updated_at = now()
   where id = p_invitation_id;
end;
$$;

revoke all on function public.revoke_onboarding_invitation(uuid) from public;
revoke all on function public.revoke_onboarding_invitation(uuid) from anon;
grant execute on function public.revoke_onboarding_invitation(uuid) to authenticated;

-- ── 12. Agency: review outcomes (return for changes / complete) ──────────────
create or replace function public.set_onboarding_review_required(
  p_case_id uuid,
  p_notes   text default null
)
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_case public.creator_onboarding_cases;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;
  update public.creator_onboarding_cases
     set status = 'review_required', review_notes = p_notes, updated_at = now()
   where id = p_case_id
  returning * into v_case;
  if not found then
    raise exception 'onboarding case not found' using errcode = 'P0002';
  end if;
  perform public.fyv_emit_onboarding_event(
    'onboarding.review_required', v_case.creator_profile_id, v_case.id,
    jsonb_build_object('creator_profile_id', v_case.creator_profile_id, 'onboarding_case_id', v_case.id)
  );
  return v_case;
end;
$$;

revoke all on function public.set_onboarding_review_required(uuid, text) from public;
revoke all on function public.set_onboarding_review_required(uuid, text) from anon;
grant execute on function public.set_onboarding_review_required(uuid, text) to authenticated;

create or replace function public.complete_creator_onboarding(p_case_id uuid)
  returns public.creator_onboarding_cases
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_case public.creator_onboarding_cases;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;
  update public.creator_onboarding_cases
     set status = 'complete', completed_at = now(), review_notes = null, updated_at = now()
   where id = p_case_id
  returning * into v_case;
  if not found then
    raise exception 'onboarding case not found' using errcode = 'P0002';
  end if;
  perform public.fyv_emit_onboarding_event(
    'onboarding.completed', v_case.creator_profile_id, v_case.id,
    jsonb_build_object('creator_profile_id', v_case.creator_profile_id, 'onboarding_case_id', v_case.id)
  );
  return v_case;
end;
$$;

revoke all on function public.complete_creator_onboarding(uuid) from public;
revoke all on function public.complete_creator_onboarding(uuid) from anon;
grant execute on function public.complete_creator_onboarding(uuid) to authenticated;

commit;
