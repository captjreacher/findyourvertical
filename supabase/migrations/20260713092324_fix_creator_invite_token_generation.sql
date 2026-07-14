create or replace function public.create_creator_access_invitation(
  p_fyv_creator_id uuid,
  p_fmf_creator_id uuid,
  p_email text default null,
  p_expires_in interval default interval '14 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rel public.creator_relationships;
  v_email text;
  v_raw text;
  v_inv public.creator_invitations;
begin
  if not public.is_agency() then
    raise exception 'agency access required' using errcode = '42501';
  end if;

  if p_fyv_creator_id is null or p_fmf_creator_id is null then
    raise exception 'fyv_creator_id and fmf_creator_id are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.creator_profiles
    where id = p_fyv_creator_id
  ) then
    raise exception 'creator profile not found'
      using errcode = 'P0002';
  end if;

  select coalesce(
    nullif(btrim(p_email), ''),
    nullif(btrim(email), '')
  )
  into v_email
  from public.creator_profiles
  where id = p_fyv_creator_id;

  if v_email is null or v_email = '' then
    raise exception 'no email available for this creator'
      using errcode = '22023';
  end if;

  select *
  into v_rel
  from public.creator_relationships
  where fyv_creator_id = p_fyv_creator_id;

  if not found then
    insert into public.creator_relationships (
      fyv_creator_id,
      fmf_creator_id,
      relationship_state
    )
    values (
      p_fyv_creator_id,
      p_fmf_creator_id,
      'invited'
    )
    returning * into v_rel;
  else
    if v_rel.fmf_creator_id <> p_fmf_creator_id then
      raise exception 'relationship already mapped to a different FMF creator id'
        using errcode = 'P0001';
    end if;

    if v_rel.relationship_state = 'draft' then
      update public.creator_relationships
      set
        relationship_state = 'invited',
        updated_at = now()
      where id = v_rel.id
      returning * into v_rel;
    end if;
  end if;

  update public.creator_invitations
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where relationship_id = v_rel.id
    and status = 'pending';

  v_raw := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');

  insert into public.creator_invitations (
    relationship_id,
    token_hash,
    email,
    status,
    expires_at,
    created_by
  )
  values (
    v_rel.id,
    digest(v_raw, 'sha256'),
    lower(v_email),
    'pending',
    now() + p_expires_in,
    auth.uid()
  )
  returning * into v_inv;

  perform public.fyv_emit_creator_relationship_event(
    'creator_invited',
    v_rel.id,
    v_rel.fyv_creator_id,
    v_rel.fmf_creator_id,
    'invited'
  );

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