create table if not exists public.local_business_lead_assessments (
  lead_id uuid primary key references public.local_business_leads(id) on delete cascade,
  demand_signal_score int,
  trust_leakage_score int,
  conversion_maturity_score int,
  ai_readiness_score int,
  opportunity_score int,
  recommended_outreach_angle text,
  assessment_summary text,
  model_version text,
  raw_payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.local_business_enrichment_queue (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null,
  lead_id uuid,
  status text not null default 'queued',
  attempts int not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (source_event_id)
);

create or replace function public.queue_local_business_enrichment()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.event_type <> 'local_business.discovered' then
    return new;
  end if;

  insert into public.local_business_enrichment_queue (source_event_id, lead_id)
  values (new.id, new.entity_id)
  on conflict (source_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_queue_local_business_enrichment on public.events;
create trigger trg_queue_local_business_enrichment
after insert on public.events
for each row execute function public.queue_local_business_enrichment();

drop view if exists public.local_business_lead_pipeline_view;

create or replace view public.local_business_lead_pipeline_view as
select
  l.id as lead_id,
  l.business_name,
  l.category,
  l.suburb,
  l.status,
  l.website_url,
  l.facebook_url,
  l.google_maps_url,
  a.demand_signal_score,
  a.trust_leakage_score,
  a.conversion_maturity_score,
  a.ai_readiness_score,
  a.opportunity_score,
  a.recommended_outreach_angle,
  a.assessment_summary,
  coalesce(a.assessed_at, a.created_at) as latest_assessment_at,
  e.event_type as latest_event_type,
  e.created_at as latest_event_at
from public.local_business_leads l
left join public.local_business_lead_assessments a on a.lead_id = l.id
left join lateral (
  select event_type, created_at
  from public.events
  where entity_id = l.id
    and entity_type in ('local_business', 'lead')
  order by created_at desc
  limit 1
) e on true;
