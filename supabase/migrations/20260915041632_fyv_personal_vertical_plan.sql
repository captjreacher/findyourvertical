begin;

-- Billing owns the grant. This table is a read projection, not a payment ledger.
create table public.fyv_plan_entitlements (
  creator_profile_id uuid primary key references public.creator_profiles(id),
  source_entitlement_id text not null unique,
  source_revision bigint not null check (source_revision > 0),
  state text not null check (state in ('active', 'revoked')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.fyv_plan_interests (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null unique references public.creator_profiles(id),
  assessment_id uuid references public.creator_assessments(id),
  report_id uuid not null references public.creator_reports(id),
  requested_product_code text not null default 'FYV-PERSONAL-VERTICAL-PLAN',
  catalogue_product_id text,
  catalogue_plan_id text,
  catalogue_price_version_id text,
  catalogue_status text not null check (catalogue_status in ('pending_configuration','resolved')),
  -- Pricing mode is independent of product, request identity and entitlement.
  -- A future fixed-price checkout can reuse this same request and plan journey.
  price_kind text not null default 'poa' check (price_kind in ('poa','fixed')),
  commercial_revision bigint not null default 0 check (commercial_revision >= 0),
  amount_minor bigint check (amount_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'requested' check (status in ('requested','reviewing','quoted','closed')),
  created_at timestamptz not null default now(),
  check ((amount_minor is null) = (currency is null)),
  check ((catalogue_status = 'pending_configuration' and catalogue_product_id is null and catalogue_plan_id is null and catalogue_price_version_id is null)
    or (catalogue_status = 'resolved' and catalogue_product_id is not null and catalogue_plan_id is not null and catalogue_price_version_id is not null))
);
create table public.fyv_personal_plans (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null unique references public.creator_profiles(id),
  assessment_id uuid not null references public.creator_assessments(id),
  report_id uuid not null references public.creator_reports(id),
  schema_version text not null default 'fyv/personal-plan/v1',
  status text not null default 'draft' check (status in ('draft','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.fyv_plan_stages (
  plan_id uuid not null references public.fyv_personal_plans(id),
  stage_key text not null check (stage_key in ('direction','audience','positioning','content','offers','schedule','scripts','experiments','final')),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  completed boolean not null default false,
  revision integer not null default 1,
  approved_suggestion_id uuid,
  updated_at timestamptz not null default now(),
  primary key (plan_id, stage_key)
);
create table public.fyv_plan_stage_revisions (
  plan_id uuid not null references public.fyv_personal_plans(id),
  stage_key text not null,
  revision integer not null,
  data jsonb not null,
  completed boolean not null,
  approved_suggestion_id uuid,
  approved_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(plan_id, stage_key, revision)
);
create table public.fyv_plan_suggestions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.fyv_personal_plans(id),
  stage_key text not null,
  stage_revision integer not null,
  action text not null check (action in ('refine','alternatives','first_draft','explain')),
  context_snapshot jsonb not null,
  suggestion jsonb not null check (jsonb_typeof(suggestion) = 'object'),
  prompt_version text not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);
alter table public.fyv_plan_stages add foreign key(approved_suggestion_id) references public.fyv_plan_suggestions(id);
alter table public.fyv_plan_stage_revisions add foreign key(approved_suggestion_id) references public.fyv_plan_suggestions(id);

create table public.fyv_plan_guide_requests (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.fyv_personal_plans(id),
  stage_key text not null, stage_revision integer not null, created_at timestamptz not null default now()
);
alter table public.fyv_plan_guide_requests enable row level security;
revoke all on public.fyv_plan_guide_requests from public,anon,authenticated;
grant all on public.fyv_plan_guide_requests to service_role;
create index fyv_plan_guide_requests_quota on public.fyv_plan_guide_requests(plan_id,created_at);
create index fyv_plan_suggestions_history on public.fyv_plan_suggestions(plan_id,created_at);

alter table public.fyv_plan_entitlements enable row level security;
alter table public.fyv_plan_interests enable row level security;
alter table public.fyv_personal_plans enable row level security;
alter table public.fyv_plan_stages enable row level security;
alter table public.fyv_plan_stage_revisions enable row level security;
alter table public.fyv_plan_suggestions enable row level security;
revoke all on public.fyv_plan_entitlements, public.fyv_plan_interests, public.fyv_personal_plans,
  public.fyv_plan_stages, public.fyv_plan_stage_revisions, public.fyv_plan_suggestions from public, anon, authenticated;
grant all on public.fyv_plan_entitlements, public.fyv_plan_interests, public.fyv_personal_plans,
  public.fyv_plan_stages, public.fyv_plan_stage_revisions, public.fyv_plan_suggestions to service_role;
-- No direct client table writes. RPCs enforce identity, entitlement and revisions.

create function public.fyv_has_plan_access() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists(select 1 from fyv_plan_entitlements
    where creator_profile_id = public.current_creator_profile_id()
      and state = 'active' and expires_at > now());
$$;

create function public.fyv_get_plan_access() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_creator uuid := public.current_creator_profile_id(); v_interest jsonb;
begin
  if auth.uid() is null or v_creator is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_build_object('id',id,'status',status,'catalogue_status',catalogue_status,'created_at',created_at,
    'price_kind',price_kind,'amount_minor',amount_minor,'currency',currency)
    into v_interest from fyv_plan_interests where creator_profile_id=v_creator;
  return jsonb_build_object('entitled',public.fyv_has_plan_access(),'interest',v_interest);
end; $$;

create function public.fyv_request_personal_plan(p_report_slug text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_creator uuid := public.current_creator_profile_id(); v_report public.creator_reports;
  v_interest public.fyv_plan_interests; v_product text; v_plan text; v_price text;
begin
  if auth.uid() is null or v_creator is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_creator::text, 42));
  select r.* into v_report from creator_reports r where r.creator_profile_id=v_creator
    and (p_report_slug is null or r.report_slug=p_report_slug)
    order by r.created_at desc limit 1;
  if not found then raise exception 'Complete an assessment before requesting a plan' using errcode='22023'; end if;
  -- Read the actual Billing catalogue. No FYV pricing or catalogue is invented.
  select p.product_id, pl.plan_id, pv.plan_version_id into v_product,v_plan,v_price
    from commercial_catalogue_product p join commercial_catalogue_plan pl using(product_id)
    join commercial_catalogue_plan_price_version pv using(plan_id)
    where p.code='FYV-PERSONAL-VERTICAL-PLAN' and p.lifecycle_status='published'
      and pl.is_sellable and pv.status='published' and pv.price->>'kind'='poa'
      and pv.effective_from<=now() and (pv.effective_to is null or pv.effective_to>now())
    order by pl.sort_order, pl.plan_id, pv.version desc limit 1;
  insert into fyv_plan_interests(creator_profile_id,assessment_id,report_id,catalogue_product_id,catalogue_plan_id,catalogue_price_version_id,catalogue_status)
    values(v_creator,v_report.assessment_id,v_report.id,v_product,v_plan,v_price,
      case when v_product is null then 'pending_configuration' else 'resolved' end)
    on conflict(creator_profile_id) do nothing returning * into v_interest;
  if v_interest.id is null then select * into v_interest from fyv_plan_interests where creator_profile_id=v_creator; end if;
  return jsonb_build_object('id',v_interest.id,'status',v_interest.status,'catalogue_status',v_interest.catalogue_status,'created_at',v_interest.created_at);
end; $$;

create function public.fyv_open_personal_plan() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_creator uuid := public.current_creator_profile_id(); v_plan public.fyv_personal_plans;
  v_report public.creator_reports;
begin
  if not public.fyv_has_plan_access() then raise exception 'paid plan access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_creator::text, 42));
  select * into v_plan from fyv_personal_plans where creator_profile_id=v_creator;
  if not found then
    select r.* into v_report from creator_reports r
      join creator_assessments a on a.id=r.assessment_id and a.creator_profile_id=v_creator
      where r.creator_profile_id=v_creator order by (r.id=(select report_id from fyv_plan_interests where creator_profile_id=v_creator)) desc nulls last, r.created_at desc limit 1;
    if not found then raise exception 'Your earlier report is preserved. Retake the assessment to link fresh evidence to your plan.' using errcode='22023'; end if;
    insert into fyv_personal_plans(creator_profile_id,assessment_id,report_id)
      values(v_creator,v_report.assessment_id,v_report.id) returning * into v_plan;
  end if;
  return jsonb_build_object('plan',to_jsonb(v_plan),
    'stages',coalesce((select jsonb_agg(to_jsonb(s)) from fyv_plan_stages s where plan_id=v_plan.id),'[]'::jsonb),
    'suggestions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'stage_key',s.stage_key,'stage_revision',s.stage_revision,
      'suggestion',s.suggestion,'provider',s.provider,'model',s.model,'created_at',s.created_at) order by s.created_at) from
      (select * from fyv_plan_suggestions where plan_id=v_plan.id order by created_at desc limit 30) s),'[]'::jsonb),
    'assessment',(select jsonb_build_object('id',id,'answers',answers,'responses',responses) from creator_assessments where id=v_plan.assessment_id),
    'report',(select jsonb_build_object('report_json',report_json) from creator_reports where id=v_plan.report_id));
end; $$;

create function public.fyv_validate_plan_stage(p_stage text,p_data jsonb,p_complete boolean) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
declare v_fields text[]; v_field text;
begin
  v_fields := case p_stage
    when 'direction' then array['vertical','reason','boundaries'] when 'audience' then array['audience','needs','evidenceToGather']
    when 'positioning' then array['promise','difference','bio'] when 'content' then array['pillars','channels','formats']
    when 'offers' then array['offer','sellingApproach','demandTest'] when 'schedule' then array['weeklyHours','publishingSchedule','batching']
    when 'scripts' then array['hook','outline','callToAction'] when 'experiments' then array['hypothesis','measure','reviewDate']
    when 'final' then array['milestones','nextActions','reviewDate'] else null end;
  if v_fields is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_complete is null then raise exception 'invalid stage' using errcode='22023'; end if;
  for v_field in select jsonb_object_keys(p_data) loop
    if not(v_field=any(v_fields)) or jsonb_typeof(p_data->v_field)<>'string' or length(p_data->>v_field)>6000 then raise exception 'invalid field' using errcode='22023'; end if;
  end loop;
  if p_complete then
    foreach v_field in array v_fields loop
      if coalesce(btrim(p_data->>v_field),'')='' then raise exception 'complete each field' using errcode='22023'; end if;
    end loop;
  end if;
end; $$;

create function public.fyv_save_plan_stage(p_plan_id uuid,p_stage text,p_data jsonb,p_revision integer,p_complete boolean default false,p_suggestion_id uuid default null)
returns public.fyv_plan_stages language plpgsql security definer set search_path = public, pg_temp as $$
declare v_saved public.fyv_plan_stages; v_revision integer;
  v_keys text[] := array['direction','audience','positioning','content','offers','schedule','scripts','experiments','final']; v_index integer;
begin
  if not public.fyv_has_plan_access() or not exists(select 1 from fyv_personal_plans where id=p_plan_id and creator_profile_id=public.current_creator_profile_id()) then
    raise exception 'paid plan access required' using errcode='42501'; end if;
  perform public.fyv_validate_plan_stage(p_stage,p_data,p_complete);
  perform 1 from fyv_personal_plans where id=p_plan_id for update;
  v_index:=array_position(v_keys,p_stage);
  if exists(select 1 from unnest(v_keys[1:v_index-1]) k where not exists(select 1 from fyv_plan_stages where plan_id=p_plan_id and stage_key=k and completed)) then
    raise exception 'Complete previous stages first' using errcode='22023'; end if;
  select revision into v_revision from fyv_plan_stages where plan_id=p_plan_id and stage_key=p_stage;
  if p_revision is distinct from coalesce(v_revision,0) then raise exception 'Plan changed. Reload before saving.' using errcode='40001'; end if;
  if p_suggestion_id is not null and not exists(select 1 from fyv_plan_suggestions where id=p_suggestion_id and plan_id=p_plan_id and stage_key=p_stage and stage_revision=p_revision) then
    raise exception 'Suggestion does not match this stage revision' using errcode='22023'; end if;
  insert into fyv_plan_stages(plan_id,stage_key,data,completed,revision,approved_suggestion_id)
    values(p_plan_id,p_stage,p_data,p_complete,p_revision+1,p_suggestion_id)
    on conflict(plan_id,stage_key) do update set data=excluded.data,completed=excluded.completed,revision=excluded.revision,
      approved_suggestion_id=excluded.approved_suggestion_id,updated_at=now() returning * into v_saved;
  insert into fyv_plan_stage_revisions(plan_id,stage_key,revision,data,completed,approved_suggestion_id,approved_by)
    values(p_plan_id,p_stage,v_saved.revision,p_data,p_complete,p_suggestion_id,auth.uid());
  update fyv_personal_plans set updated_at=now(),status=case when (select count(*) from fyv_plan_stages where plan_id=p_plan_id and completed)=9 then 'complete' else 'draft' end where id=p_plan_id;
  return v_saved;
end; $$;

-- Trusted Billing adapter only. Revision prevents delayed grants undoing revocation.
create function public.fyv_project_plan_entitlement(p_creator uuid,p_source_id text,p_revision bigint,p_state text,p_expires_at timestamptz) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into fyv_plan_entitlements(creator_profile_id,source_entitlement_id,source_revision,state,expires_at)
    values(p_creator,p_source_id,p_revision,p_state,p_expires_at)
    on conflict(creator_profile_id) do update set source_entitlement_id=excluded.source_entitlement_id,
      source_revision=excluded.source_revision,state=excluded.state,expires_at=excluded.expires_at,updated_at=now()
    where fyv_plan_entitlements.source_revision<excluded.source_revision;
$$;

-- Reserve before any provider call; failed calls also count towards the daily cap.
create function public.fyv_reserve_plan_guidance(p_plan_id uuid,p_stage text,p_revision integer) returns uuid
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_id uuid; v_keys text[]:=array['direction','audience','positioning','content','offers','schedule','scripts','experiments','final']; v_index integer;
begin
  if not public.fyv_has_plan_access() or not exists(select 1 from fyv_personal_plans where id=p_plan_id and creator_profile_id=public.current_creator_profile_id()) then raise exception 'paid plan access required' using errcode='42501'; end if;
  perform public.fyv_validate_plan_stage(p_stage,'{}',false);
  perform 1 from fyv_personal_plans where id=p_plan_id for update;
  v_index:=array_position(v_keys,p_stage);
  if exists(select 1 from unnest(v_keys[1:v_index-1]) k where not exists(select 1 from fyv_plan_stages where plan_id=p_plan_id and stage_key=k and completed)) then raise exception 'Complete previous stages first' using errcode='22023'; end if;
  if p_revision is distinct from coalesce((select revision from fyv_plan_stages where plan_id=p_plan_id and stage_key=p_stage),0) then raise exception 'stale stage' using errcode='40001'; end if;
  if (select count(*) from fyv_plan_guide_requests where plan_id=p_plan_id and created_at>now()-interval '1 day')>=20 then raise exception 'Daily guidance limit reached' using errcode='P0001'; end if;
  insert into fyv_plan_guide_requests(plan_id,stage_key,stage_revision) values(p_plan_id,p_stage,p_revision) returning id into v_id;
  return v_id;
end; $$;

create function public.fyv_complete_plan_guidance(p_request_id uuid,p_action text,p_context jsonb,p_suggestion jsonb,p_provider text,p_model text)
returns public.fyv_plan_suggestions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.fyv_plan_guide_requests; v_result public.fyv_plan_suggestions;
begin
  select * into v_request from fyv_plan_guide_requests where id=p_request_id for update;
  if not found or not exists(select 1 from fyv_personal_plans p join fyv_plan_entitlements e on e.creator_profile_id=p.creator_profile_id
      where p.id=v_request.plan_id and e.state='active' and e.expires_at>now()) then raise exception 'paid plan access required' using errcode='42501'; end if;
  perform public.fyv_validate_plan_stage(v_request.stage_key,p_suggestion,false);
  if not exists(select 1 from jsonb_each(p_suggestion)) then raise exception 'Empty suggestion' using errcode='22023'; end if;
  insert into fyv_plan_suggestions(id,plan_id,stage_key,stage_revision,action,context_snapshot,suggestion,prompt_version,provider,model)
    values(p_request_id,v_request.plan_id,v_request.stage_key,v_request.stage_revision,p_action,p_context,p_suggestion,'fyv/plan-guide/v1',p_provider,p_model)
    on conflict(id) do nothing;
  select * into v_result from fyv_plan_suggestions where id=p_request_id;
  return v_result;
end; $$;
revoke all on function public.fyv_reserve_plan_guidance(uuid,text,integer),public.fyv_complete_plan_guidance(uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.fyv_reserve_plan_guidance(uuid,text,integer) to authenticated;
grant execute on function public.fyv_complete_plan_guidance(uuid,text,jsonb,jsonb,text,text) to service_role;

revoke all on function public.fyv_has_plan_access(),public.fyv_get_plan_access(),public.fyv_request_personal_plan(text),
  public.fyv_open_personal_plan(),public.fyv_validate_plan_stage(text,jsonb,boolean),
  public.fyv_save_plan_stage(uuid,text,jsonb,integer,boolean,uuid),public.fyv_project_plan_entitlement(uuid,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.fyv_has_plan_access(),public.fyv_get_plan_access(),public.fyv_request_personal_plan(text),
  public.fyv_open_personal_plan(),public.fyv_save_plan_stage(uuid,text,jsonb,integer,boolean,uuid) to authenticated;
grant execute on function public.fyv_project_plan_entitlement(uuid,text,bigint,text,timestamptz) to service_role;

create function public.fyv_list_plan_requests() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_agency() then raise exception 'agency access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select i.*,p.full_name,p.email from fyv_plan_interests i join creator_profiles p on p.id=i.creator_profile_id
    order by i.created_at desc limit 200) r),'[]'::jsonb);
end; $$;
revoke all on function public.fyv_list_plan_requests() from public,anon,authenticated;
grant execute on function public.fyv_list_plan_requests() to authenticated;

-- Internal commercial updates are visible in-product, never creator messages.
-- This projection cannot grant paid access; Billing remains the entitlement owner.
create function public.fyv_project_plan_commercial(p_request uuid,p_revision bigint,p_status text,p_price_kind text,p_amount_minor bigint default null,p_currency text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_revision is null or p_revision<=0 then raise exception 'invalid revision' using errcode='22023'; end if;
  if not exists(select 1 from fyv_plan_interests where id=p_request) then raise exception 'unknown request' using errcode='22023'; end if;
  update fyv_plan_interests set commercial_revision=p_revision,status=p_status,price_kind=p_price_kind,
    amount_minor=p_amount_minor,currency=p_currency
    where id=p_request and commercial_revision<p_revision;
end; $$;
revoke all on function public.fyv_project_plan_commercial(uuid,bigint,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.fyv_project_plan_commercial(uuid,bigint,text,text,bigint,text) to service_role;

commit;
