-- ============================================================================
-- FYV-PERSONA-1C — Save Creator Vertical Workset RPC
-- ----------------------------------------------------------------------------
-- Purpose:
--   Provide a single SECURITY DEFINER RPC the editable UI autosaves through.
--   It accepts the FULL intended workset state as JSONB, validates it, and
--   atomically replaces the active workset rows + variation entries for the
--   snapshot. This avoids the round-trip storm and partial-write risk of
--   separate insert/update/delete per row.
--
-- Idempotency: a second call with the same payload yields a no-op write.
-- Creator-only (authenticated callers; ownership enforced via
-- public.current_creator_profile_id()).
--
-- Reviewer fixes baked into this revision:
--   * BLOCKER — v_keep_ids is collected INSIDE Step 1 (UPDATE AND INSERT
--     branches), so freshly inserted rows are never swept up by the Step-3
--     archive pass.
--   * HIGH — explicit ownership checks for every ownedVerticalId / owned
--     VariationId reference; SECURITY DEFINER bypasses RLS on creator_owned_*
--     tables, so we cannot rely on the table policy.
--   * HIGH — orphan variation entries on archived workset rows are explicitly
--     DELETEd (FK is ON DELETE CASCADE — but Step 3 only soft-archives, so we
--     must clean children manually).
-- ============================================================================

begin;

create or replace function public.fyv_save_vertical_workset(
  p_snapshot_id uuid,
  p_state        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile_id     uuid := public.current_creator_profile_id();
  v_snapshot       public.creator_archetype_snapshots;
  v_vertical       jsonb;
  v_position       integer;
  v_kind           text;
  v_system         text;
  v_owned          uuid;
  v_label          text;
  v_source_label   text;
  v_workset_id     uuid;
  v_keep_ids       uuid[] := '{}';
  v_variation      jsonb;
  v_variation_id   uuid;
  v_var_kind       text;
  v_catalog        uuid;
  v_owned_var      uuid;
  v_workset_count  integer := 0;
begin
  if v_profile_id is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;
  if p_snapshot_id is null then
    raise exception 'snapshot_id is required' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or not (p_state ? 'verticals') then
    raise exception 'state payload must be an object with a "verticals" array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_state -> 'verticals') <> 'array' then
    raise exception 'state.verticals must be an array' using errcode = '22023';
  end if;

  select * into v_snapshot
  from public.creator_archetype_snapshots
  where id = p_snapshot_id
    and creator_profile_id = v_profile_id;
  if not found then
    raise exception 'snapshot not found for this creator' using errcode = 'P0002';
  end if;

  v_workset_count := jsonb_array_length(p_state -> 'verticals');
  if v_workset_count < 1 or v_workset_count > 6 then
    raise exception 'workset must contain between 1 and 6 verticals (got %)', v_workset_count
      using errcode = 'P0001';
  end if;

  -- Step 1: UPSERT each vertical in the payload.
  for v_vertical in select * from jsonb_array_elements(p_state -> 'verticals')
  loop
    v_position := (v_vertical ->> 'position')::integer;
    v_kind := v_vertical ->> 'verticalKind';
    v_system := v_vertical ->> 'systemArchetype';
    v_owned := nullif(v_vertical ->> 'ownedVerticalId', '');
    v_label := v_vertical ->> 'verticalLabel';
    v_source_label := v_vertical ->> 'sourceLabel';

    if v_position is null or v_position < 1 or v_position > 6 then
      raise exception 'invalid position % (must be 1..6)', v_position using errcode = '22023';
    end if;
    if v_kind is null or v_kind not in ('system_reference', 'creator_owned') then
      raise exception 'invalid verticalKind %', v_kind using errcode = '22023';
    end if;

    -- HIGH severity: ownership check on every owned_vertical_id reference.
    -- SECURITY DEFINER bypasses RLS on creator_owned_verticals, so the table
    -- policy is NOT a sufficient guard. Real check inline.
    if v_owned is not null then
      perform 1 from public.creator_owned_verticals
        where id = v_owned and creator_profile_id = v_profile_id;
      if not found then
        raise exception 'owned_vertical_id % does not belong to this creator', v_owned
          using errcode = '42501';
      end if;
    end if;

    if v_kind = 'system_reference' then
      if v_system is null then
        raise exception 'system_reference vertical missing systemArchetype' using errcode = '22023';
      end if;
      if v_owned is not null then
        raise exception 'system_reference vertical must not set ownedVerticalId' using errcode = '22023';
      end if;
    else
      if v_owned is null then
        raise exception 'creator_owned vertical missing ownedVerticalId' using errcode = '22023';
      end if;
      if v_system is not null then
        raise exception 'creator_owned vertical must not set systemArchetype' using errcode = '22023';
      end if;
    end if;
    if v_label is null or length(v_label) = 0 then
      raise exception 'verticalLabel is required' using errcode = '22023';
    end if;
    if v_source_label is null or v_source_label not in ('recommended', 'catalogue', 'created') then
      raise exception 'invalid sourceLabel %', v_source_label using errcode = '22023';
    end if;

    if (v_vertical ? 'worksetId')
       and (v_vertical ->> 'worksetId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_workset_id := (v_vertical ->> 'worksetId')::uuid;
      update public.creator_vertical_workset
         set position = v_position,
             vertical_label = v_label,
             vertical_kind = v_kind,
             system_archetype = v_system,
             owned_vertical_id = v_owned,
             source_label = v_source_label,
             updated_at = now()
       where id = v_workset_id
         and creator_profile_id = v_profile_id
         and snapshot_id = p_snapshot_id;
      if not found then
        raise exception 'workset row % not found for this creator', v_workset_id
          using errcode = 'P0002';
      end if;
    else
      insert into public.creator_vertical_workset
        (creator_profile_id, snapshot_id, position, vertical_label,
         vertical_kind, system_archetype, owned_vertical_id, source_label,
         status)
      values
        (v_profile_id, p_snapshot_id, v_position, v_label,
         v_kind, v_system, v_owned, v_source_label, 'active')
      returning id into v_workset_id;
    end if;

    -- BLOCKER fix: collect the surviving workset id regardless of branch.
    -- Without this, the Step-3 sweep would archive freshly inserted rows.
    v_keep_ids := array_append(v_keep_ids, v_workset_id);

    -- Step 2: replace the variation entries for this workset row.
    delete from public.creator_vertical_variation_entries
    where workset_id = v_workset_id
      and creator_profile_id = v_profile_id
      and id not in (
        select ((e ->> 'entryId')::uuid)
        from jsonb_array_elements(coalesce(v_vertical -> 'selectedVariations', '[]'::jsonb)) e
        where (e ->> 'entryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      );

    for v_variation in
      select * from jsonb_array_elements(coalesce(v_vertical -> 'selectedVariations', '[]'::jsonb))
    loop
      v_var_kind := v_variation ->> 'variationKind';
      v_catalog := nullif(v_variation ->> 'catalogVariationId', '');
      v_owned_var := nullif(v_variation ->> 'ownedVariationId', '');

      if v_var_kind = 'system_reference' then
        if v_catalog is null then
          raise exception 'system_reference variation missing catalogVariationId' using errcode = '22023';
        end if;
      elsif v_var_kind = 'creator_owned' then
        if v_owned_var is null then
          raise exception 'creator_owned variation missing ownedVariationId' using errcode = '22023';
        end if;
        -- HIGH severity: ownership check on every owned_variation_id reference.
        perform 1 from public.creator_owned_variations
          where id = v_owned_var and creator_profile_id = v_profile_id;
        if not found then
          raise exception 'owned_variation_id % does not belong to this creator', v_owned_var
            using errcode = '42501';
        end if;
      else
        raise exception 'invalid variationKind %', v_var_kind using errcode = '22023';
      end if;

      if (v_variation ? 'entryId')
         and (v_variation ->> 'entryId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_variation_id := (v_variation ->> 'entryId')::uuid;
        update public.creator_vertical_variation_entries
           set variation_kind = v_var_kind,
               catalog_variation_id = v_catalog,
               owned_variation_id = v_owned_var,
               status = 'selected',
               updated_at = now()
         where id = v_variation_id
           and creator_profile_id = v_profile_id
           and workset_id = v_workset_id;
        if not found then
          raise exception 'variation entry % not found for this creator', v_variation_id
            using errcode = 'P0002';
        end if;
      else
        insert into public.creator_vertical_variation_entries
          (creator_profile_id, snapshot_id, workset_id, variation_kind,
           catalog_variation_id, owned_variation_id, status)
        values
          (v_profile_id, p_snapshot_id, v_workset_id, v_var_kind,
           v_catalog, v_owned_var, 'selected')
        returning id into v_variation_id;
      end if;
    end loop;
  end loop;

  -- HIGH severity fix: clean orphan variation entries for workset rows that
  -- are leaving the active set. FK is ON DELETE CASCADE, but Step 3 only
  -- soft-archives (no DELETE), so children pile up. Delete them explicitly.
  delete from public.creator_vertical_variation_entries
    where creator_profile_id = v_profile_id
      and snapshot_id = p_snapshot_id
      and workset_id in (
        select id from public.creator_vertical_workset
        where creator_profile_id = v_profile_id
          and snapshot_id = p_snapshot_id
          and status = 'active'
          and (cardinality(v_keep_ids) = 0 or not (id = any(v_keep_ids)))
      );

  -- Step 3: archive any workset rows that were NOT retained in the payload.
  update public.creator_vertical_workset
    set status = 'archived',
        updated_at = now()
  where snapshot_id = p_snapshot_id
    and creator_profile_id = v_profile_id
    and status = 'active'
    and (cardinality(v_keep_ids) = 0 or not (id = any(v_keep_ids)));

  return jsonb_build_object('snapshot_id', p_snapshot_id, 'kept_ids', to_jsonb(v_keep_ids));
end;
$$;

revoke all on function public.fyv_save_vertical_workset(uuid, jsonb) from public;
revoke all on function public.fyv_save_vertical_workset(uuid, jsonb) from anon;
grant execute on function public.fyv_save_vertical_workset(uuid, jsonb) to authenticated;

-- Owned vertical/variation CRUD rails: simple RLS-protected wrappers used by
-- the creators-workset-api.ts UI layer. The meat of the validation lives in
-- the table constraints (CHECK + UNIQUE indexes); these RPCs just enforce
-- ownership and shape.
create or replace function public.fyv_archive_owned_vertical(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_creator_profile_id();
begin
  if v_profile_id is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;

  update public.creator_owned_verticals
    set is_archived = true,
        updated_at = now()
  where id = p_id
    and creator_profile_id = v_profile_id;

  if not found then
    raise exception 'owned vertical % not found for this creator', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fyv_archive_owned_vertical(uuid) from public;
revoke all on function public.fyv_archive_owned_vertical(uuid) from anon;
grant execute on function public.fyv_archive_owned_vertical(uuid) to authenticated;

create or replace function public.fyv_archive_owned_variation(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_creator_profile_id();
begin
  if v_profile_id is null then
    raise exception 'no linked creator profile' using errcode = '42501';
  end if;

  update public.creator_owned_variations
    set is_archived = true,
        updated_at = now()
  where id = p_id
    and creator_profile_id = v_profile_id;

  if not found then
    raise exception 'owned variation % not found for this creator', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fyv_archive_owned_variation(uuid) from public;
revoke all on function public.fyv_archive_owned_variation(uuid) from anon;
grant execute on function public.fyv_archive_owned_variation(uuid) to authenticated;

commit;
