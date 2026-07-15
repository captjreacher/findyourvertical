create or replace function public.create_onboarding_invitation(
  p_creator_profile_id uuid,
  p_expires_in interval default '14 days'::interval
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_case public.creator_onboarding_cases;
  v_raw text;
  v_inv public.creator_onboarding_invitations;
begin
  if not public.is_agency() then
    raise exception 'agency access required'
      using errcode = '42501';
  end if;

  v_case := public.initiate_creator_onboarding(
    p_creator_profile_id,
    true
  );

  v_raw := encode(
    extensions.gen_random_bytes(32),
    'hex'
  );

  insert into public.creator_onboarding_invitations (
    creator_profile_id,
    onboarding_case_id,
    token_hash,
    expires_at,
    created_by
  )
  values (
    p_creator_profile_id,
    v_case.id,
    extensions.digest(v_raw, 'sha256'),
    now() + p_expires_in,
    auth.uid()
  )
  returning * into v_inv;

  perform public.fyv_emit_onboarding_event(
    'onboarding.invitation.created',
    p_creator_profile_id,
    v_case.id,
    jsonb_build_object(
      'creator_profile_id', p_creator_profile_id,
      'onboarding_case_id', v_case.id,
      'invitation_id', v_inv.id,
      'expires_at', v_inv.expires_at,
      'source', 'agency'
    )
  );

  return jsonb_build_object(
    'invitation_id', v_inv.id,
    'onboarding_case_id', v_case.id,
    'expires_at', v_inv.expires_at,
    'raw_token', v_raw,
    'accept_path',
    '/my/onboarding/accept?token=' || v_raw
  );
end;
$function$;

create or replace function public.redeem_onboarding_invitation(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_profile uuid := public.current_creator_profile_id();
  v_inv public.creator_onboarding_invitations;
  v_case public.creator_onboarding_cases;
begin
  if v_profile is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'authentication_required'
    );
  end if;

  if p_token is null or length(btrim(p_token)) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid'
    );
  end if;

  select *
  into v_inv
  from public.creator_onboarding_invitations
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid'
    );
  end if;

  if v_inv.revoked_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'revoked'
    );
  end if;

  if v_inv.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'expired'
    );
  end if;

  if v_inv.creator_profile_id <> v_profile then
    return jsonb_build_object(
      'ok', false,
      'code', 'creator_mismatch'
    );
  end if;

  if v_inv.accepted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_accepted',
      'onboarding_case_id', v_inv.onboarding_case_id
    );
  end if;

  update public.creator_onboarding_invitations
  set
    accepted_at = now(),
    updated_at = now()
  where id = v_inv.id;

  select *
  into v_case
  from public.creator_onboarding_cases
  where id = v_inv.onboarding_case_id;

  perform public.fyv_emit_onboarding_event(
    'onboarding.invitation.accepted',
    v_profile,
    v_inv.onboarding_case_id,
    jsonb_build_object(
      'creator_profile_id', v_profile,
      'onboarding_case_id', v_inv.onboarding_case_id,
      'invitation_id', v_inv.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'onboarding_case_id', v_inv.onboarding_case_id,
    'status', coalesce(v_case.status, 'not_started')
  );
end;
$function$;