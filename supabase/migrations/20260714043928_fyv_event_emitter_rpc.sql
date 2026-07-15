begin;

create or replace function public.fyv_emit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_source_system text default 'findyourvertical'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    p_source_system <> 'findyourvertical'
    or p_event_type <> 'creator.assessment.completed'
    or p_entity_type <> 'creator_profile'
  ) then
    raise exception 'Event type is not allowed' using errcode = '42501';
  end if;

  insert into public.events (
    source_system,
    event_type,
    entity_type,
    entity_id,
    entity_ref,
    status,
    payload
  ) values (
    p_source_system,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_entity_type || ':' || p_entity_id::text,
    'pending',
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.fyv_emit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_source_system text,
  p_status text,
  p_entity_ref text,
  p_correlation_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  ) values (
    p_source_system,
    p_event_type,
    p_entity_type,
    p_entity_id,
    coalesce(p_entity_ref, p_entity_type || ':' || p_entity_id::text),
    coalesce(p_status, 'pending'),
    coalesce(p_payload, '{}'::jsonb),
    p_correlation_id
  );
end;
$$;

revoke all on function public.fyv_emit_event(text, text, uuid, jsonb, text) from public;
revoke all on function public.fyv_emit_event(text, text, uuid, jsonb, text, text, text, text) from public;
grant execute on function public.fyv_emit_event(text, text, uuid, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.fyv_emit_event(text, text, uuid, jsonb, text, text, text, text) to service_role;

revoke insert on public.events from anon;

drop policy if exists "FYV completion outbox insert" on public.events;

create or replace function public.fyv_emit_onboarding_event(
  p_event_type text,
  p_creator_profile_id uuid,
  p_case_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.fyv_emit_event(
      p_event_type,
      'creator_onboarding_case',
      p_case_id,
      p_payload,
      'findyourvertical',
      null,
      'creator_profile:' || p_creator_profile_id::text,
      null
    );
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.fyv_emit_onboarding_event(text, uuid, uuid, jsonb) from public;
grant execute on function public.fyv_emit_onboarding_event(text, uuid, uuid, jsonb) to service_role;

create or replace function public.fyv_emit_persona_event(
  p_event_type text,
  p_creator_profile_id uuid,
  p_generation_id uuid,
  p_status text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.fyv_emit_event(
      p_event_type,
      'creator_persona_generation',
      p_generation_id,
      p_payload,
      'findyourvertical',
      p_status,
      'creator_profile:' || p_creator_profile_id::text,
      null
    );
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.fyv_emit_persona_event(text, uuid, uuid, text, jsonb) from public;
grant execute on function public.fyv_emit_persona_event(text, uuid, uuid, text, jsonb) to service_role;

create or replace function public.fyv_emit_creator_relationship_event(
  p_event_type text,
  p_relationship_id uuid,
  p_fyv_creator_id uuid,
  p_fmf_creator_id uuid,
  p_relationship_state text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_corr text := 'fyv/creator-relationship/' || p_relationship_id::text || '/' || p_relationship_state;
  v_emitted boolean := false;
begin
  begin
    if not exists (
      select 1
      from public.events
      where event_type = p_event_type
        and correlation_id = v_corr
    ) then
      perform public.fyv_emit_event(
        p_event_type,
        'creator_relationship',
        p_relationship_id,
        jsonb_build_object(
          'event_type', p_event_type,
          'creator_id', p_fyv_creator_id::text,
          'creator_reference', 'fyv:' || p_fyv_creator_id::text,
          'fmf_creator_id', p_fmf_creator_id::text,
          'relationship_id', p_relationship_id::text,
          'source_product', 'FYV',
          'relationship_state', p_relationship_state,
          'timestamp', to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        'findyourvertical',
        'pending',
        'creator_profile:' || p_fyv_creator_id::text,
        v_corr
      );
      v_emitted := true;
    end if;
  exception when unique_violation then
    v_emitted := false;
  end;

  return v_emitted;
end;
$$;

revoke all on function public.fyv_emit_creator_relationship_event(text, uuid, uuid, uuid, text) from public;
grant execute on function public.fyv_emit_creator_relationship_event(text, uuid, uuid, uuid, text) to service_role;

commit;
