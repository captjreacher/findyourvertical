-- Social Meta lead intake pipeline.
-- Adds the social connection/interactions layer and Meta Lead Ads fields on
-- local_business_leads for idempotent webhook ingestion.

begin;

alter table public.events
  add column if not exists correlation_id text,
  add column if not exists run_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists events_correlation_id_idx
  on public.events (correlation_id);

create index if not exists events_run_id_idx
  on public.events (run_id);

alter table public.local_business_leads
  add column if not exists platform text,
  add column if not exists campaign_name text,
  add column if not exists page_id text,
  add column if not exists form_id text,
  add column if not exists leadgen_id text,
  add column if not exists full_name text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create unique index if not exists local_business_leads_leadgen_id_key
  on public.local_business_leads (leadgen_id);

create index if not exists local_business_leads_platform_idx
  on public.local_business_leads (platform);

create index if not exists local_business_leads_page_form_idx
  on public.local_business_leads (page_id, form_id);

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  page_id text,
  page_name text,
  external_account_id text,
  connection_status text not null default 'active'
    check (connection_status in ('active', 'paused', 'revoked', 'error')),
  access_token_ref text,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.social_connections is
  'Configured social accounts/pages that can send campaign, form, and lead events into MGRNZ.';

create unique index if not exists social_connections_platform_page_id_key
  on public.social_connections (platform, page_id)
  where page_id is not null;

create index if not exists social_connections_platform_idx
  on public.social_connections (platform);

create index if not exists social_connections_status_idx
  on public.social_connections (connection_status);

create table if not exists public.social_interactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.social_connections(id) on delete set null,
  platform text not null,
  interaction_type text not null,
  external_id text,
  page_id text,
  form_id text,
  leadgen_id text,
  campaign_name text,
  lead_id uuid references public.local_business_leads(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.social_interactions is
  'Append-only social interaction log. Meta Lead Ads submissions link to public.events and local_business_leads.';

create unique index if not exists social_interactions_platform_leadgen_id_key
  on public.social_interactions (platform, leadgen_id)
  where leadgen_id is not null;

create index if not exists social_interactions_lead_id_idx
  on public.social_interactions (lead_id);

create index if not exists social_interactions_event_id_idx
  on public.social_interactions (event_id);

create index if not exists social_interactions_page_form_idx
  on public.social_interactions (page_id, form_id);

create index if not exists social_interactions_created_at_idx
  on public.social_interactions (created_at desc);

drop trigger if exists trg_social_connections_updated_at on public.social_connections;
create trigger trg_social_connections_updated_at
  before update on public.social_connections
  for each row
  execute function public.set_local_business_updated_at();

alter table public.social_connections enable row level security;
alter table public.social_interactions enable row level security;

grant select, insert, update, delete on public.social_connections to authenticated;
grant select on public.social_interactions to authenticated;

drop policy if exists "authenticated read social connections" on public.social_connections;
drop policy if exists "authenticated write social connections" on public.social_connections;
drop policy if exists "authenticated update social connections" on public.social_connections;
drop policy if exists "authenticated delete social connections" on public.social_connections;

create policy "authenticated read social connections"
  on public.social_connections for select to authenticated using (true);

create policy "authenticated write social connections"
  on public.social_connections for insert to authenticated with check (true);

create policy "authenticated update social connections"
  on public.social_connections for update to authenticated using (true) with check (true);

create policy "authenticated delete social connections"
  on public.social_connections for delete to authenticated using (true);

drop policy if exists "authenticated read social interactions" on public.social_interactions;

create policy "authenticated read social interactions"
  on public.social_interactions for select to authenticated using (true);

create table if not exists public.local_business_enrichment_queue (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null,
  lead_id uuid references public.local_business_leads(id) on delete set null,
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
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
begin
  if new.event_type <> 'local_business.discovered' then
    return new;
  end if;

  if new.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_lead_id := new.entity_id::uuid;
  end if;

  insert into public.local_business_enrichment_queue (source_event_id, lead_id)
  values (new.id, v_lead_id)
  on conflict (source_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_queue_local_business_enrichment on public.events;
create trigger trg_queue_local_business_enrichment
after insert on public.events
for each row execute function public.queue_local_business_enrichment();

drop view if exists public.local_business_lead_pipeline_view;

create view public.local_business_lead_pipeline_view
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.business_name,
  l.source,
  l.platform,
  l.campaign_name,
  l.leadgen_id,
  l.category,
  l.suburb,
  l.status,
  l.enrichment_status,
  l.enrichment_confidence,
  l.enrichment_diagnostics,
  l.enriched_at,
  l.phone,
  l.email,
  l.website_url,
  l.facebook_url,
  l.google_maps_url,
  l.trust_signal_score,
  l.trust_summary,
  l.trust_flags,
  a.demand_signal_score,
  a.trust_leakage_score,
  a.conversion_maturity_score,
  a.ai_readiness_score,
  a.opportunity_score,
  a.recommended_outreach_angle,
  a.assessment_summary,
  a.assessed_at as latest_assessment_at,
  e.event_type as latest_event_type,
  e.created_at as latest_event_at
from public.local_business_leads l
left join lateral (
  select
    demand_signal_score,
    trust_leakage_score,
    conversion_maturity_score,
    ai_readiness_score,
    opportunity_score,
    recommended_outreach_angle,
    assessment_summary,
    assessed_at,
    created_at
  from public.local_business_lead_assessments
  where lead_id = l.id
  order by assessed_at desc nulls last, created_at desc
  limit 1
) a on true
left join lateral (
  select event_type, created_at
  from public.events
  where entity_id = l.id
    and entity_type in ('local_business', 'local_business_lead', 'lead')
  order by created_at desc
  limit 1
) e on true;

comment on view public.local_business_lead_pipeline_view is
  'Cockpit-facing pipeline view: each lead with source, Meta campaign fields, contact fields, trust fields, enrichment diagnostics, latest assessment scores, and latest event.';

grant select on public.local_business_lead_pipeline_view to authenticated;

comment on column public.local_business_leads.leadgen_id is
  'Meta Lead Ads leadgen_id. Unique when present and used as webhook idempotency key.';

commit;
