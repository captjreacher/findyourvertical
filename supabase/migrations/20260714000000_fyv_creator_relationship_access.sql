-- ============================================================================
-- FYV Creator Relationship & Access Layer  (FYV → FMF identity + access handoff)
-- ----------------------------------------------------------------------------
-- Adds the missing FYV-owned layer that maps a FYV creator identity to an FMF
-- creator identity (by CANONICAL ids only — never BetterFans usernames / handles /
-- aliases) and tracks a creator's FYV ACCESS lifecycle:
--
--     draft → invited → accepted → active
--
-- This is a NEW, self-contained, additive layer. It does NOT touch and does NOT
-- depend on:
--   * the intelligence-package handoff (fyv_publish_intelligence_snapshot,
--     creator_intelligence_snapshots / _opportunity_projections, of_creators),
--   * assessment / scoring / report / persona generation,
--   * the FYV onboarding-case tables (creator_onboarding_*),
--   * creator_profiles.status (the sales-pipeline lifecycle — a different axis).
--
-- Two tables:
--   1. public.creator_relationships  — one FYV↔FMF mapping per creator, carrying
--      the access relationship_state. Anchored on creator_profiles.id (canonical
--      FYV id) and fmf_creator_id (canonical FMF creator id).
--   2. public.creator_invitations    — single-use, HASHED invite tokens (raw token
--      returned only at creation, never stored) resolving to one relationship.
--
-- Security model (mirrors creator-home + onboarding conventions):
--   * Creators get READ-ONLY own-row access to their relationship via RLS.
--   * Invitations are never creator-readable; redemption is via SECURITY DEFINER
--     RPC using the raw token.
--   * anon + PUBLIC are explicitly revoked on both tables.
--   * All state transitions go through SECURITY DEFINER RPCs that enforce
--     agency (is_agency()) / ownership (current_creator_profile_id()) / service_role
--     boundaries server-side. Identity is never client-supplied where it matters.
--
-- Integration contract (consumed by FMF, asynchronously, downstream):
--   creator_invited / creator_accepted / creator_activated are emitted into the
--   existing public.events outbox with a flat, canonical payload:
--     { event_type, creator_id, creator_reference, fmf_creator_id,
--       relationship_id, source_product:'FYV', relationship_state, timestamp }
--   Emission is append-only and deterministically deduped on correlation_id
--   ('fyv/creator-relationship/<relationship_id>/<state>').
-- ============================================================================

begin;

create extension if not exists pgcrypto;  -- digest(), gen_random_bytes()

-- ── 1. Relationship: FYV creator identity ↔ FMF creator id ───────────────────
create table if not exists public.creator_relationships (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Canonical FYV creator identity (creator_profiles.id) — NOT a username.
  fyv_creator_id     uuid not null references public.creator_profiles(id) on delete cascade,
  -- Canonical FMF creator id (funk-my-brand of_creators.id). No FK: it lives in a
  -- separate database. Stored as an opaque uuid; FMF owns its resolution.
  fmf_creator_id     uuid not null,
  relationship_state text not null default 'draft'
                       check (relationship_state in ('draft', 'invited', 'accepted', 'active'))
);

-- Strict 1:1 mapping: one relationship per FYV creator, and per FMF creator.
create unique index if not exists creator_relationships_fyv_creator_key
  on public.creator_relationships (fyv_creator_id);
create unique index if not exists creator_relationships_fmf_creator_key
  on public.creator_relationships (fmf_creator_id);

alter table public.creator_relationships enable row level security;

revoke all on public.creator_relationships from public;
revoke all on public.creator_relationships from anon;
grant select on public.creator_relationships to authenticated;
grant select, insert, update, delete on public.creator_relationships to service_role;

drop policy if exists "Agency full access creator relationships" on public.creator_relationships;
create policy "Agency full access creator relationships"
  on public.creator_relationships for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own relationship" on public.creator_relationships;
create policy "Creator can read own relationship"
  on public.creator_relationships for select
  to authenticated
  using (fyv_creator_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_relationships_updated_at on public.creator_relationships;
create trigger trg_creator_relationships_updated_at
  before update on public.creator_relationships
  for each row execute function public.set_updated_at();

-- ── 2. Invitations: single-use, hashed magic-link tokens ─────────────────────
create table if not exists public.creator_invitations (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  relationship_id  uuid not null references public.creator_relationships(id) on delete cascade,
  -- SHA-256 of the raw token. The raw token is returned ONCE at creation and is
  -- never stored. Lookups hash the presented token and compare.
  token_hash       bytea not null unique,
  email            text not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  created_by       uuid  -- auth.uid() of the agency operator (null when service_role)
);

create index if not exists idx_creator_invitations_relationship
  on public.creator_invitations (relationship_id);

-- At most ONE pending invitation per relationship (reissue supersedes explicitly).
create unique index if not exists creator_invitations_one_pending
  on public.creator_invitations (relationship_id)
  where status = 'pending';

alter table public.creator_invitations enable row level security;

revoke all on public.creator_invitations from public;
revoke all on public.creator_invitations from anon;
grant select on public.creator_invitations to authenticated;
grant select, insert, update, delete on public.creator_invitations to service_role;

-- Agency-only visibility. Creators never list invitations; the acceptance flow
-- resolves the token via the SECURITY DEFINER RPC (service_role), so no creator
-- SELECT policy is granted.
drop policy if exists "Agency full access creator invitations" on public.creator_invitations;
create policy "Agency full access creator invitations"
  on public.creator_invitations for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop trigger if exists trg_creator_invitations_updated_at on public.creator_invitations;
create trigger trg_creator_invitations_updated_at
  before update on public.creator_invitations
  for each row execute function public.set_updated_at();

-- ── 3. Integration event outbox: append-only + deterministic dedupe ──────────
-- One row per (relationship, state) transition. correlation_id encodes the state
-- so distinct transitions never collide, while a repeated transition is a no-op.
create unique index if not exists events_creator_relationship_correlation_uidx
  on public.events (correlation_id)
  where event_type in ('creator_invited', 'creator_accepted', 'creator_activated');

create or replace function public.fyv_emit_creator_relationship_event(
  p_event_type         text,
  p_relationship_id    uuid,
  p_fyv_creator_id     uuid,
  p_fmf_creator_id     uuid,
  p_relationship_state text
)
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_corr    text := 'fyv/creator-relationship/' || p_relationship_id::text || '/' || p_relationship_state;
  v_emitted boolean := false;
begin
  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload, correlation_id
    )
    select
      'findyourvertical',
      p_event_type,
      'creator_relationship',
      p_relationship_id,
      'creator_profile:' || p_fyv_creator_id::text,
      'pending',
      jsonb_build_object(
        'event_type', p_event_type,
        -- Canonical FYV creator identity (creator_profiles.id). Never a username.
        'creator_id', p_fyv_creator_id::text,
        'creator_reference', 'fyv:' || p_fyv_creator_id::text,
        -- Canonical FMF creator id (of_creators.id in funk-my-brand).
        'fmf_creator_id', p_fmf_creator_id::text,
        'relationship_id', p_relationship_id::text,
        'source_product', 'FYV',
        'relationship_state', p_relationship_state,
        'timestamp', to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      v_corr
    where not exists (
      select 1 from public.events
      where event_type = p_event_type and correlation_id = v_corr
    );
    v_emitted := found;
  exception when unique_violation then
    v_emitted := false;  -- concurrent emit already wrote it
  end;
  return v_emitted;
end;
$$;

revoke all on function public.fyv_emit_creator_relationship_event(text, uuid, uuid, uuid, text) from public;
grant execute on function public.fyv_emit_creator_relationship_event(text, uuid, uuid, uuid, text) to service_role;

-- ── 4. Agency: create-or-reuse relationship + issue an invitation ────────────
-- draft → invited. Generates a secure random raw token (returned ONCE); stores
-- only its SHA-256 hash. Emits creator_invited. fmf_creator_id is CANONICAL and
-- required. Email defaults to the creator's profile email when omitted.
create or replace function public.create_creator_access_invitation(
  p_fyv_creator_id uuid,
  p_fmf_creator_id uuid,
  p_email          text default null,
  p_expires_in     interval default interval '14 days'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_rel    public.creator_relationships;
  v_email  text;
  v_raw    text;
  v_inv    public.creator_invitations;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;
  if p_fyv_creator_id is null or p_fmf_creator_id is null then
    raise exception 'fyv_creator_id and fmf_creator_id are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.creator_profiles where id = p_fyv_creator_id) then
    raise exception 'creator profile not found' using errcode = 'P0002';
  end if;

  -- Resolve the email server-side (never trust a client-only value blindly).
  select coalesce(nullif(btrim(p_email), ''), nullif(btrim(email), ''))
    into v_email
  from public.creator_profiles where id = p_fyv_creator_id;
  if v_email is null or v_email = '' then
    raise exception 'no email available for this creator' using errcode = '22023';
  end if;

  -- Create or reuse the relationship (one per FYV creator).
  select * into v_rel from public.creator_relationships where fyv_creator_id = p_fyv_creator_id;
  if not found then
    insert into public.creator_relationships (fyv_creator_id, fmf_creator_id, relationship_state)
    values (p_fyv_creator_id, p_fmf_creator_id, 'invited')
    returning * into v_rel;
  else
    if v_rel.fmf_creator_id <> p_fmf_creator_id then
      raise exception 'relationship already mapped to a different FMF creator id' using errcode = 'P0001';
    end if;
    -- Advance draft → invited (idempotent for invited/accepted/active).
    if v_rel.relationship_state = 'draft' then
      update public.creator_relationships
         set relationship_state = 'invited', updated_at = now()
       where id = v_rel.id
      returning * into v_rel;
    end if;
  end if;

  -- Supersede any prior pending invitation for this relationship (one-pending index).
  update public.creator_invitations
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where relationship_id = v_rel.id and status = 'pending';

  v_raw := encode(gen_random_bytes(32), 'hex');  -- 64 hex chars, URL-safe

  insert into public.creator_invitations (
    relationship_id, token_hash, email, status, expires_at, created_by
  ) values (
    v_rel.id, digest(v_raw, 'sha256'), lower(v_email), 'pending', now() + p_expires_in, auth.uid()
  )
  returning * into v_inv;

  perform public.fyv_emit_creator_relationship_event(
    'creator_invited', v_rel.id, v_rel.fyv_creator_id, v_rel.fmf_creator_id, 'invited'
  );

  -- Raw token + accept path returned ONCE for the operator to copy/send.
  return jsonb_build_object(
    'relationship_id', v_rel.id,
    'invitation_id', v_inv.id,
    'relationship_state', v_rel.relationship_state,
    'fmf_creator_id', v_rel.fmf_creator_id,
    'email', v_inv.email,
    'expires_at', v_inv.expires_at,
    'raw_token', v_raw,
    'accept_path', '/accept-invite?token=' || v_raw
  );
end;
$$;

revoke all on function public.create_creator_access_invitation(uuid, uuid, text, interval) from public;
revoke all on function public.create_creator_access_invitation(uuid, uuid, text, interval) from anon;
grant execute on function public.create_creator_access_invitation(uuid, uuid, text, interval) to authenticated;
grant execute on function public.create_creator_access_invitation(uuid, uuid, text, interval) to service_role;

-- ── 5. Validate an invitation token WITHOUT consuming it (service_role) ───────
-- Used by the public acceptance endpoint (GET) to display the invited email and
-- confirm validity before the creator commits. Distinct machine-readable codes.
create or replace function public.validate_creator_access_invitation(p_token text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_inv public.creator_invitations;
  v_rel public.creator_relationships;
begin
  if p_token is null or length(btrim(p_token)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select * into v_inv from public.creator_invitations where token_hash = digest(p_token, 'sha256');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v_inv.revoked_at is not null or v_inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.status = 'accepted' or v_inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_accepted');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  select * into v_rel from public.creator_relationships where id = v_inv.relationship_id;
  return jsonb_build_object(
    'ok', true,
    'email', v_inv.email,
    'relationship_id', v_rel.id,
    'fyv_creator_id', v_rel.fyv_creator_id,
    'fmf_creator_id', v_rel.fmf_creator_id,
    'relationship_state', v_rel.relationship_state
  );
end;
$$;

revoke all on function public.validate_creator_access_invitation(text) from public;
revoke all on function public.validate_creator_access_invitation(text) from anon;
grant execute on function public.validate_creator_access_invitation(text) to service_role;

-- ── 6. Accept an invitation (service_role; single-use) ───────────────────────
-- invited → accepted. Associates the provisioned auth user with the FYV creator
-- identity (links creator_profiles.auth_user_id) and marks the invitation used.
-- p_auth_user_id is supplied by the trusted Worker AFTER it has validated the
-- token and provisioned/looked-up the Supabase auth user for the invited email.
create or replace function public.accept_creator_access_invitation(
  p_token        text,
  p_auth_user_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_inv          public.creator_invitations;
  v_rel          public.creator_relationships;
  v_existing_uid uuid;
begin
  if p_auth_user_id is null then
    raise exception 'auth_user_id is required' using errcode = '22023';
  end if;
  if p_token is null or length(btrim(p_token)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  select * into v_inv from public.creator_invitations
    where token_hash = digest(p_token, 'sha256') for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v_inv.revoked_at is not null or v_inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.expires_at <= now() and v_inv.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  select * into v_rel from public.creator_relationships where id = v_inv.relationship_id for update;

  -- Associate the auth user with the FYV creator identity (idempotent).
  select auth_user_id into v_existing_uid from public.creator_profiles where id = v_rel.fyv_creator_id;
  if v_existing_uid is null then
    begin
      update public.creator_profiles
         set auth_user_id = p_auth_user_id, updated_at = now()
       where id = v_rel.fyv_creator_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'identity_conflict');
    end;
  elsif v_existing_uid <> p_auth_user_id then
    return jsonb_build_object('ok', false, 'code', 'identity_conflict');
  end if;

  -- Single-use: mark accepted the first time only.
  if v_inv.status <> 'accepted' then
    update public.creator_invitations
       set status = 'accepted', accepted_at = now(), updated_at = now()
     where id = v_inv.id;
  end if;

  -- draft/invited → accepted (never downgrade an already active relationship).
  if v_rel.relationship_state in ('draft', 'invited') then
    update public.creator_relationships
       set relationship_state = 'accepted', updated_at = now()
     where id = v_rel.id
    returning * into v_rel;
    perform public.fyv_emit_creator_relationship_event(
      'creator_accepted', v_rel.id, v_rel.fyv_creator_id, v_rel.fmf_creator_id, 'accepted'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'relationship_id', v_rel.id,
    'fyv_creator_id', v_rel.fyv_creator_id,
    'fmf_creator_id', v_rel.fmf_creator_id,
    'relationship_state', v_rel.relationship_state,
    'email', v_inv.email
  );
end;
$$;

revoke all on function public.accept_creator_access_invitation(text, uuid) from public;
revoke all on function public.accept_creator_access_invitation(text, uuid) from anon;
revoke all on function public.accept_creator_access_invitation(text, uuid) from authenticated;
grant execute on function public.accept_creator_access_invitation(text, uuid) to service_role;

-- ── 7. Activate the relationship (accepted → active) ─────────────────────────
-- Called once the creator has access to FYV / completed FYV onboarding. Creator
-- self-service when p_fyv_creator_id is null (resolves via own linkage); agency
-- when an explicit id is passed. Emits creator_activated. Idempotent.
create or replace function public.activate_creator_relationship(
  p_fyv_creator_id uuid default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_rel    public.creator_relationships;
begin
  if p_fyv_creator_id is not null then
    if not public.is_agency() then
      raise exception 'agency access required' using errcode = '42501';
    end if;
    v_target := p_fyv_creator_id;
  else
    v_target := public.current_creator_profile_id();
    if v_target is null then
      raise exception 'no linked creator profile' using errcode = '42501';
    end if;
  end if;

  select * into v_rel from public.creator_relationships where fyv_creator_id = v_target for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_relationship');
  end if;
  if v_rel.relationship_state = 'active' then
    return jsonb_build_object('ok', true, 'already', true,
                              'relationship_id', v_rel.id, 'relationship_state', 'active');
  end if;
  if v_rel.relationship_state <> 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'not_accepted',
                              'relationship_state', v_rel.relationship_state);
  end if;

  update public.creator_relationships
     set relationship_state = 'active', updated_at = now()
   where id = v_rel.id
  returning * into v_rel;

  perform public.fyv_emit_creator_relationship_event(
    'creator_activated', v_rel.id, v_rel.fyv_creator_id, v_rel.fmf_creator_id, 'active'
  );

  return jsonb_build_object('ok', true, 'relationship_id', v_rel.id,
                            'fmf_creator_id', v_rel.fmf_creator_id, 'relationship_state', 'active');
end;
$$;

revoke all on function public.activate_creator_relationship(uuid) from public;
revoke all on function public.activate_creator_relationship(uuid) from anon;
grant execute on function public.activate_creator_relationship(uuid) to authenticated;
grant execute on function public.activate_creator_relationship(uuid) to service_role;

commit;
