-- ============================================================================
-- FYV Creator Intelligence publish RPC (FYV → FMF handoff, source-of-truth side)
-- ----------------------------------------------------------------------------
-- Adds the SECURITY DEFINER function that the FYV completion flow (role `anon`)
-- and the service_role backfill call to publish a creator intelligence snapshot
-- into the EXISTING schema (creator_intelligence_snapshots + _opportunity_
-- projections, keyed to of_creators) and emit a `creator.intelligence_package.
-- published` integration event. Business logic (payload content) lives in the
-- application service; this function is the narrow, privileged write boundary:
--   validate → resolve of_creators (via onlyfans_handle == username) → reconcile
--   snapshot (idempotent) → insert projections (idempotent) → emit event (deduped).
--
-- Ownership/security: RLS denies anon/authenticated direct inserts on these
-- FMF-boundary tables, so writes MUST go through this definer function (owner
-- bypasses RLS). No new tables, no FMF-database coupling (all objects are FYV/
-- mgrnz-web local). Snapshots stay immutable; superseded_at is not touched here.
-- An unresolved mapping is a NON-FATAL diagnostic event, never an exception.
-- ============================================================================

begin;

-- Deterministic dedupe key for the append-only published event: at most one
-- published event per package_reference (stored in correlation_id).
create unique index if not exists events_cip_published_correlation_uidx
  on public.events (correlation_id)
  where event_type = 'creator.intelligence_package.published';

-- ── Non-fatal diagnostic: record an unresolved FYV→FMF handoff ───────────────
create or replace function public.fyv_emit_intelligence_unresolved(
  p_creator_profile_id uuid,
  p_handle             text,
  p_reason             text
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload, correlation_id
    ) values (
      'findyourvertical',
      'creator.intelligence_package.handoff_unresolved',
      'creator_profile',
      p_creator_profile_id,
      'creator_profile:' || p_creator_profile_id::text,
      'unresolved',
      jsonb_build_object(
        'event_type', 'creator.intelligence_package.handoff_unresolved',
        'source_product', 'FYV',
        'creator_reference', 'fyv:' || p_creator_profile_id::text,
        'onlyfans_handle', p_handle,
        'reason', p_reason
      ),
      'unresolved:' || p_creator_profile_id::text || ':' || coalesce(p_reason, 'unknown')
    )
    on conflict do nothing;
  exception when others then
    null; -- diagnostics must never break the caller
  end;
end;
$$;

-- ── Publish (resolve → reconcile snapshot → projections → event), idempotent ─
create or replace function public.fyv_publish_intelligence_snapshot(
  p_creator_profile_id   uuid,
  p_content              jsonb,
  p_reference_date       text,
  p_intelligence_version text default '1.0.0'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_handle        text;
  v_of            public.of_creators;
  v_slug          text;
  v_pkg_ref       text;
  v_asmt_ref      text;
  v_version       text := coalesce(nullif(p_intelligence_version, ''), '1.0.0');
  v_payload       jsonb;
  v_snapshot      public.creator_intelligence_snapshots;
  v_reused        boolean := false;
  v_event_emitted boolean := false;
  v_opp           jsonb;
begin
  if p_creator_profile_id is null then
    raise exception 'creator_profile_id is required' using errcode = '22023';
  end if;
  if p_reference_date is null or p_reference_date = '' then
    raise exception 'reference_date is required' using errcode = '22023';
  end if;

  -- Resolve the FMF shadow creator via onlyfans_handle == of_creators.username.
  select onlyfans_handle into v_handle from public.creator_profiles where id = p_creator_profile_id;
  if v_handle is null or v_handle = '' then
    perform public.fyv_emit_intelligence_unresolved(p_creator_profile_id, null, 'no_onlyfans_handle');
    return jsonb_build_object('resolved', false, 'reason', 'no_onlyfans_handle');
  end if;

  select * into v_of from public.of_creators where lower(username) = lower(v_handle) limit 1;
  if not found then
    perform public.fyv_emit_intelligence_unresolved(p_creator_profile_id, v_handle, 'no_of_creator');
    return jsonb_build_object('resolved', false, 'reason', 'no_of_creator', 'onlyfans_handle', v_handle);
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(coalesce(nullif(v_of.display_name, ''), v_of.username)), '[^a-z0-9]+', '-', 'g'));
  v_pkg_ref  := 'fyv/' || v_slug || '/intelligence-package/' || p_reference_date;
  v_asmt_ref := 'fyv/' || v_slug || '/assessment/' || p_reference_date;

  -- Canonical flat payload = envelope + derived content + references.
  v_payload := coalesce(p_content, '{}'::jsonb) || jsonb_build_object(
    'package_state', 'published',
    'source_product', 'FYV',
    'contract_version', 'creator-intelligence-package-v1',
    'intelligence_version', v_version,
    'source_package_reference', v_pkg_ref,
    'source_assessment_reference', v_asmt_ref
  );

  -- Reconcile snapshot (immutable; reuse if this (creator, reference) already exists).
  insert into public.creator_intelligence_snapshots (
    creator_id, source_product, contract_version, intelligence_version,
    source_package_reference, source_assessment_reference, package_payload
  ) values (
    v_of.id, 'FYV', 'creator-intelligence-package-v1', v_version,
    v_pkg_ref, v_asmt_ref, v_payload
  )
  on conflict (creator_id, source_package_reference) do nothing
  returning * into v_snapshot;

  if v_snapshot.id is null then
    select * into v_snapshot
    from public.creator_intelligence_snapshots
    where creator_id = v_of.id and source_package_reference = v_pkg_ref;
    v_reused := true;
  end if;

  -- Opportunity projections derived 1:1 from available_opportunities (idempotent).
  for v_opp in
    select value from jsonb_array_elements(coalesce(p_content -> 'available_opportunities', '[]'::jsonb))
  loop
    insert into public.creator_intelligence_opportunity_projections (
      creator_id, intelligence_snapshot_id, source_opportunity_reference, source_scenario_reference,
      journey_type, opportunity_type, title, rationale, confidence, priority, projection_state
    ) values (
      v_of.id, v_snapshot.id,
      v_opp ->> 'source_opportunity_reference', v_opp ->> 'source_scenario_reference',
      coalesce(v_opp ->> 'journey_type', 'general'), coalesce(v_opp ->> 'opportunity_type', 'growth'),
      coalesce(v_opp ->> 'title', 'Opportunity'), coalesce(v_opp ->> 'rationale', ''),
      greatest(0, least(100, coalesce((v_opp ->> 'confidence')::int, 0))),
      greatest(0, least(100, coalesce((v_opp ->> 'priority')::int, 0))),
      'available'
    )
    on conflict (intelligence_snapshot_id, source_opportunity_reference) do nothing;
  end loop;

  -- Emit the published integration event (append-only; deterministic dedupe).
  begin
    insert into public.events (
      source_system, event_type, entity_type, entity_id, entity_ref, status, payload, correlation_id
    )
    select
      'findyourvertical', 'creator.intelligence_package.published', 'creator_intelligence_snapshot',
      v_snapshot.id, 'of_creator:' || v_of.id::text, 'pending',
      jsonb_build_object(
        'event_type', 'creator.intelligence_package.published',
        'source_product', 'FYV',
        'creator_reference', 'fyv:' || p_creator_profile_id::text,
        'external_identity', jsonb_build_object(
          'platform_provider', v_of.platform_provider,
          'platform_account_id', v_of.betterfans_account_id,
          'reference', v_of.platform_provider || ':' || v_of.betterfans_account_id
        ),
        'package_reference', v_pkg_ref,
        'package_id', v_snapshot.id::text,
        'package_state', 'published',
        'contract_version', 'creator-intelligence-package-v1',
        'intelligence_version', v_version
      ),
      v_pkg_ref
    where not exists (
      select 1 from public.events
      where event_type = 'creator.intelligence_package.published' and correlation_id = v_pkg_ref
    );
    v_event_emitted := found;
  exception when unique_violation then
    v_event_emitted := false; -- concurrent publish already emitted it
  end;

  return jsonb_build_object(
    'resolved', true,
    'reused', v_reused,
    'snapshot_id', v_snapshot.id,
    'package_reference', v_pkg_ref,
    'of_creator_id', v_of.id,
    'event_emitted', v_event_emitted
  );
end;
$$;

revoke all on function public.fyv_publish_intelligence_snapshot(uuid, jsonb, text, text) from public;
grant execute on function public.fyv_publish_intelligence_snapshot(uuid, jsonb, text, text) to anon;
grant execute on function public.fyv_publish_intelligence_snapshot(uuid, jsonb, text, text) to authenticated;
grant execute on function public.fyv_publish_intelligence_snapshot(uuid, jsonb, text, text) to service_role;

revoke all on function public.fyv_emit_intelligence_unresolved(uuid, text, text) from public;
grant execute on function public.fyv_emit_intelligence_unresolved(uuid, text, text) to anon;
grant execute on function public.fyv_emit_intelligence_unresolved(uuid, text, text) to authenticated;
grant execute on function public.fyv_emit_intelligence_unresolved(uuid, text, text) to service_role;

commit;
