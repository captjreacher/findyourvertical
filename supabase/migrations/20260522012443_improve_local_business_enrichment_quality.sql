begin;

alter table public.local_business_leads
  add column if not exists enrichment_status text not null default 'not_attempted'
    check (enrichment_status in ('not_attempted', 'enriching', 'partial', 'enriched', 'assessed', 'failed')),
  add column if not exists enrichment_confidence jsonb not null default '{}'::jsonb,
  add column if not exists enrichment_diagnostics jsonb not null default '{}'::jsonb,
  add column if not exists enriched_at timestamptz;

comment on column public.local_business_leads.enrichment_status is
  'Operational enrichment lifecycle for Cockpit: not_attempted, enriching, partial, enriched, assessed, failed.';
comment on column public.local_business_leads.enrichment_confidence is
  'Per-field confidence scores and accepted/rejected candidate metadata from local-business-enrich.';
comment on column public.local_business_leads.enrichment_diagnostics is
  'Enrichment lookup diagnostics: attempted fields, candidates, found fields, and failure or partial reasons.';
comment on column public.local_business_leads.enriched_at is
  'Timestamp when meaningful enrichment was last accepted.';

drop view if exists public.local_business_lead_pipeline_view;

create view public.local_business_lead_pipeline_view
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.business_name,
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
  'Cockpit-facing pipeline view: each lead with contact fields, trust fields, enrichment diagnostics, latest assessment scores, and latest event.';

grant select on public.local_business_lead_pipeline_view to authenticated;

commit;
