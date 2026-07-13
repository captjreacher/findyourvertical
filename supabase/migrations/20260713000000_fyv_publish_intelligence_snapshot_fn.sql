-- ============================================================================
-- FYV Creator Intelligence publish RPC (FYV source-of-truth side)
-- ----------------------------------------------------------------------------
-- Publishes creator intelligence snapshots owned by FYV and emits an integration
-- event consumed by FMF asynchronously.
--
-- Boundary:
--   FYV owns:
--     - creator identity
--     - assessments
--     - intelligence packages
--
--   FMF owns:
--     - operational creator records
--     - BetterFans identities
--     - journeys
--     - automations
--
-- This function does NOT query FMF tables.
-- FMF resolves fyv_creator_id ↔ fmf_creator_id through the relationship layer.
-- ============================================================================

begin;

create unique index if not exists events_cip_published_correlation_uidx
  on public.events (correlation_id)
  where event_type = 'creator.intelligence_package.published';


-- ── Diagnostic event ────────────────────────────────────────────────────────

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
      source_system,
      event_type,
      entity_type,
      entity_id,
      entity_ref,
      status,
      payload,
      correlation_id
    )
    values (
      'findyourvertical',
      'creator.intelligence_package.handoff_unresolved',
      'creator_profile',
      p_creator_profile_id,
      'fyv_creator:' || p_creator_profile_id::text,
      'unresolved',
      jsonb_build_object(
        'event_type',
        'creator.intelligence_package.handoff_unresolved',
        'source_product',
        'FYV',
        'creator_reference',
        'fyv:' || p_creator_profile_id::text,
        'onlyfans_handle',
        p_handle,
        'reason',
        p_reason
      ),
      'unresolved:' || p_creator_profile_id::text || ':' ||
        coalesce(p_reason, 'unknown')
    )
    on conflict do nothing;

  exception when others then
    null;
  end;
end;
$$;


-- ── Publish intelligence snapshot ───────────────────────────────────────────

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
  v_slug          text;
  v_pkg_ref       text;
  v_asmt_ref      text;
  v_version       text := coalesce(nullif(p_intelligence_version,''),'1.0.0');
  v_payload       jsonb;

  v_snapshot      public.creator_intelligence_snapshots;
  v_reused        boolean := false;
  v_event_emitted boolean := false;
  v_opp           jsonb;

begin

  if p_creator_profile_id is null then
    raise exception 'creator_profile_id is required'
      using errcode = '22023';
  end if;


  if p_reference_date is null or p_reference_date = '' then
    raise exception 'reference_date is required'
      using errcode = '22023';
  end if;


  -- FYV canonical identity only.
  select onlyfans_handle
  into v_handle
  from public.creator_profiles
  where id = p_creator_profile_id;


  if not found then
    perform public.fyv_emit_intelligence_unresolved(
      p_creator_profile_id,
      null,
      'creator_profile_missing'
    );

    return jsonb_build_object(
      'resolved',
      false,
      'reason',
      'creator_profile_missing'
    );
  end if;


  v_handle := coalesce(nullif(v_handle,''), p_creator_profile_id::text);


  v_slug :=
    trim(
      both '-'
      from regexp_replace(
        lower(v_handle),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    );


  v_pkg_ref :=
    'fyv/' ||
    v_slug ||
    '/intelligence-package/' ||
    p_reference_date;


  v_asmt_ref :=
    'fyv/' ||
    v_slug ||
    '/assessment/' ||
    p_reference_date;



  v_payload :=
    coalesce(p_content,'{}'::jsonb)
    ||
    jsonb_build_object(
      'package_state',
      'published',
      'source_product',
      'FYV',
      'contract_version',
      'creator-intelligence-package-v1',
      'intelligence_version',
      v_version,
      'source_package_reference',
      v_pkg_ref,
      'source_assessment_reference',
      v_asmt_ref
    );


  insert into public.creator_intelligence_snapshots (
    creator_id,
    source_product,
    contract_version,
    intelligence_version,
    source_package_reference,
    source_assessment_reference,
    package_payload
  )
  values (
    p_creator_profile_id,
    'FYV',
    'creator-intelligence-package-v1',
    v_version,
    v_pkg_ref,
    v_asmt_ref,
    v_payload
  )

  on conflict (
    creator_id,
    source_package_reference
  )
  do nothing

  returning *
  into v_snapshot;



  if v_snapshot.id is null then

    select *
    into v_snapshot

    from public.creator_intelligence_snapshots

    where creator_id = p_creator_profile_id
      and source_package_reference = v_pkg_ref;

    v_reused := true;

  end if;



  for v_opp in
    select value
    from jsonb_array_elements(
      coalesce(
        p_content -> 'available_opportunities',
        '[]'::jsonb
      )
    )

  loop

    insert into public.creator_intelligence_opportunity_projections (

      creator_id,
      intelligence_snapshot_id,
      source_opportunity_reference,
      source_scenario_reference,
      journey_type,
      opportunity_type,
      title,
      rationale,
      confidence,
      priority,
      projection_state

    )

    values (

      p_creator_profile_id,
      v_snapshot.id,

      v_opp ->>
        'source_opportunity_reference',

      v_opp ->>
        'source_scenario_reference',

      coalesce(
        v_opp ->> 'journey_type',
        'general'
      ),

      coalesce(
        v_opp ->> 'opportunity_type',
        'growth'
      ),

      coalesce(
        v_opp ->> 'title',
        'Opportunity'
      ),

      coalesce(
        v_opp ->> 'rationale',
        ''
      ),

      greatest(
        0,
        least(
          100,
          coalesce(
            (v_opp ->> 'confidence')::int,
            0
          )
        )
      ),

      greatest(
        0,
        least(
          100,
          coalesce(
            (v_opp ->> 'priority')::int,
            0
          )
        )
      ),

      'available'

    )

    on conflict (
      intelligence_snapshot_id,
      source_opportunity_reference
    )

    do nothing;

  end loop;



  begin

    insert into public.events (

      source_system,
      event_type,
      entity_type,
      entity_id,
      entity_ref,
      status,
      payload,
      correlation_id

    )

    values (

      'findyourvertical',

      'creator.intelligence_package.published',

      'creator_intelligence_snapshot',

      v_snapshot.id,

      'fyv_creator:' ||
        p_creator_profile_id::text,

      'pending',

      jsonb_build_object(

        'event_type',
        'creator.intelligence_package.published',

        'source_product',
        'FYV',

        'creator_reference',
        'fyv:' ||
          p_creator_profile_id::text,

        'package_reference',
        v_pkg_ref,

        'package_id',
        v_snapshot.id::text,

        'package_state',
        'published',

        'contract_version',
        'creator-intelligence-package-v1',

        'intelligence_version',
        v_version

      ),

      v_pkg_ref

    )

    on conflict do nothing;


    v_event_emitted := found;


  exception

    when unique_violation then

      v_event_emitted := false;

  end;



  return jsonb_build_object(

    'resolved',
    true,

    'reused',
    v_reused,

    'snapshot_id',
    v_snapshot.id,

    'package_reference',
    v_pkg_ref,

    'fyv_creator_id',
    p_creator_profile_id,

    'event_emitted',
    v_event_emitted

  );

end;

$$;


revoke all on function public.fyv_publish_intelligence_snapshot(uuid,jsonb,text,text)
from public;

grant execute on function public.fyv_publish_intelligence_snapshot(uuid,jsonb,text,text)
to anon, authenticated, service_role;


revoke all on function public.fyv_emit_intelligence_unresolved(uuid,text,text)
from public;

grant execute on function public.fyv_emit_intelligence_unresolved(uuid,text,text)
to anon, authenticated, service_role;


commit;