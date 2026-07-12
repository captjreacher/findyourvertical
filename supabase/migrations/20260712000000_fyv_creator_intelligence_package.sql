-- ============================================================================
-- FYV Creator Intelligence Package — publication boundary (FYV → downstream)
-- ----------------------------------------------------------------------------
-- Purpose:
--   Convert a completed creator assessment (already persisted as a report) into
--   a versioned, publishable Creator Intelligence Package that downstream
--   products (e.g. FunkMyFans) consume THROUGH THE EXISTING EVENTS OUTBOX — with
--   no direct coupling to FYV internals and NO changes to report_json.
--
--     assessment → report_json → creator_intelligence_packages → events outbox
--
--   1. public.creator_intelligence_packages — the downstream product contract.
--        * Lifecycle: published → superseded (schema retains full history).
--        * Exactly one ACTIVE published package per creator (partial unique idx).
--        * Opaque, UUID-based package_reference (NO dates / parsable strings).
--        * Lean package_json body (NOT a copy of the internal report).
--
--   2. public.publish_creator_intelligence_package(...) — the single atomic
--        publish operation. In ONE transaction it (1) supersedes the creator's
--        current active package, (2) inserts the new published package, and
--        (3) emits exactly one `creator.intelligence_package.published` record
--        into public.events. No partial state: any failure rolls it all back.
--
-- Security model:
--   * SECURITY DEFINER RPC (runs as owner) so the public assessment-completion
--     path (role `anon`) can publish through this narrow, validated surface
--     WITHOUT widening the intentionally narrow anon events policy and WITHOUT
--     any direct table write. EXECUTE is granted to anon/authenticated/service.
--   * Direct table writes are definer-only; creators get READ-ONLY own-row via
--     RLS; agency gets full access; anon + PUBLIC are explicitly revoked.
--
-- Conventions reused (Creator-Home PR #11 / PERSONA-1A/1B):
--   public.is_agency(), public.current_creator_profile_id(), public.set_updated_at()
--   gen_random_uuid(); guarded CREATE ... IF NOT EXISTS; DROP POLICY IF EXISTS;
--   the existing public.events ledger (no second event system / transport).
-- ============================================================================

begin;

-- ── 1. Package table (downstream product contract) ───────────────────────────
create table if not exists public.creator_intelligence_packages (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  published_at          timestamptz,
  superseded_at         timestamptz,
  creator_profile_id    uuid not null references public.creator_profiles(id) on delete cascade,
  -- Concrete link to the source assessment (integrity + provenance). The report
  -- is referenced LOOSELY by string (a presentation artifact the package is
  -- derived from) to avoid coupling the downstream contract to report internals.
  assessment_id         uuid references public.creator_assessments(id) on delete set null,
  report_reference      text,
  -- Opaque, stable, UUID-based external identifier. No business meaning, no
  -- dates, no parsable structure: `fyv.creator.intelligence.<uuid>`.
  package_reference     text not null,
  -- Stable reference to the originating assessment (opaque; not a date string).
  assessment_reference  text,
  source_product        text not null default 'FYV',
  -- Lifecycle. This pass emits only `published`; publishing supersedes the prior
  -- active package. History is retained as `superseded` rows.
  package_state         text not null default 'published'
                          check (package_state in ('published', 'superseded')),
  version               text not null default '1',
  -- Lean, downstream-facing intelligence body. NEVER a copy of the internal
  -- report_json: no raw answers, no internal scoring, no workflow/routing state,
  -- no FMF/MGRNZ-specific fields.
  package_json          jsonb not null default '{}'::jsonb,
  constraint creator_intelligence_packages_reference_key unique (package_reference)
);

-- Exactly one ACTIVE published package per creator (active-published invariant).
create unique index if not exists creator_intelligence_packages_one_published
  on public.creator_intelligence_packages (creator_profile_id)
  where package_state = 'published';

-- Creator lookup / history, newest first.
create index if not exists idx_creator_intelligence_packages_profile
  on public.creator_intelligence_packages (creator_profile_id, created_at desc);

-- Active-published lookup convenience.
create index if not exists idx_creator_intelligence_packages_state
  on public.creator_intelligence_packages (creator_profile_id, package_state);

alter table public.creator_intelligence_packages enable row level security;

-- Deny anon + PUBLIC. Creators get READ-ONLY own-row via RLS below; all writes
-- flow through the SECURITY DEFINER publish RPC (which runs as owner).
revoke all on public.creator_intelligence_packages from public;
revoke all on public.creator_intelligence_packages from anon;
grant select on public.creator_intelligence_packages to authenticated;
grant select, insert, update, delete on public.creator_intelligence_packages to service_role;

drop policy if exists "Agency full access intelligence packages" on public.creator_intelligence_packages;
create policy "Agency full access intelligence packages"
  on public.creator_intelligence_packages for all
  to authenticated
  using (public.is_agency())
  with check (public.is_agency());

drop policy if exists "Creator can read own intelligence packages" on public.creator_intelligence_packages;
create policy "Creator can read own intelligence packages"
  on public.creator_intelligence_packages for select
  to authenticated
  using (creator_profile_id = public.current_creator_profile_id());

drop trigger if exists trg_creator_intelligence_packages_updated_at on public.creator_intelligence_packages;
create trigger trg_creator_intelligence_packages_updated_at
  before update on public.creator_intelligence_packages
  for each row execute function public.set_updated_at();

-- ── 2. Outbox dedup backstop ─────────────────────────────────────────────────
-- package_reference is server-generated and unique, so at most one published
-- event can ever exist per package. This partial unique index on the payload
-- reference makes "duplicate publication events" impossible at the ledger level.
create unique index if not exists events_intelligence_package_published_ref
  on public.events ((payload ->> 'package_reference'))
  where event_type = 'creator.intelligence_package.published';

-- ── 3. Atomic publish operation ──────────────────────────────────────────────
-- ONE transaction: validate → supersede prior active → insert published →
-- emit outbox event. The event emit is CORE (not best-effort audit): if it
-- fails, the whole publish rolls back so there is never an orphaned package or
-- a missing handoff event. SECURITY DEFINER so the anon completion path can
-- publish through this validated surface. Returns a small jsonb result.
create or replace function public.publish_creator_intelligence_package(
  p_creator_profile_id uuid,
  p_assessment_id      uuid,
  p_report_reference   text,
  p_package_json       jsonb,
  p_version            text default '1'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_assessment      public.creator_assessments;
  v_reference        text := 'fyv.creator.intelligence.' || gen_random_uuid();
  v_assessment_ref   text;
  v_pkg              public.creator_intelligence_packages;
begin
  -- Validation: only a valid assessment completion may publish.
  if p_creator_profile_id is null then
    raise exception 'creator_profile_id is required' using errcode = '22023';
  end if;
  if p_assessment_id is null then
    raise exception 'assessment_id is required to publish an intelligence package'
      using errcode = '22023';
  end if;

  select * into v_assessment
  from public.creator_assessments
  where id = p_assessment_id;

  if not found then
    raise exception 'assessment % not found', p_assessment_id using errcode = 'P0002';
  end if;
  if v_assessment.creator_profile_id <> p_creator_profile_id then
    raise exception 'assessment does not belong to creator' using errcode = '42501';
  end if;

  v_assessment_ref := 'fyv.creator.assessment.' || p_assessment_id::text;

  -- (1) Supersede the creator's current active published package (history kept).
  update public.creator_intelligence_packages
     set package_state = 'superseded',
         superseded_at  = now(),
         updated_at     = now()
   where creator_profile_id = p_creator_profile_id
     and package_state = 'published';

  -- (2) Insert the new published package.
  insert into public.creator_intelligence_packages (
    creator_profile_id, assessment_id, report_reference,
    package_reference, assessment_reference, source_product,
    package_state, version, package_json, published_at
  ) values (
    p_creator_profile_id, p_assessment_id, p_report_reference,
    v_reference, v_assessment_ref, 'FYV',
    'published', coalesce(nullif(p_version, ''), '1'),
    coalesce(p_package_json, '{}'::jsonb), now()
  )
  returning * into v_pkg;

  -- (3) Emit exactly one published event into the existing outbox.
  insert into public.events (
    source_system, event_type, entity_type, entity_id, entity_ref, status, payload
  ) values (
    'findyourvertical',
    'creator.intelligence_package.published',
    'creator_profile',
    p_creator_profile_id,
    'creator_profile:' || p_creator_profile_id::text,
    'pending',
    jsonb_build_object(
      'event_type',           'creator.intelligence_package.published',
      'source_product',       'FYV',
      'creator_reference',    p_creator_profile_id::text,
      'package_reference',    v_pkg.package_reference,
      'package_id',           v_pkg.id::text,
      'package_state',        'published',
      'assessment_reference', v_pkg.assessment_reference,
      'version',              v_pkg.version,
      'published_at',         to_char(v_pkg.published_at at time zone 'utc',
                                      'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );

  return jsonb_build_object(
    'package_id',           v_pkg.id,
    'package_reference',    v_pkg.package_reference,
    'package_state',        v_pkg.package_state,
    'creator_reference',    p_creator_profile_id,
    'assessment_reference', v_pkg.assessment_reference,
    'version',              v_pkg.version,
    'published_at',         v_pkg.published_at,
    'created_at',           v_pkg.created_at
  );
end;
$$;

revoke all on function public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text) from public;
grant execute on function public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text) to anon;
grant execute on function public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text) to service_role;

commit;
