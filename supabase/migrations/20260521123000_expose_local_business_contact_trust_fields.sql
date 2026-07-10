begin;

alter table public.local_business_leads
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists trust_signal_score integer,
  add column if not exists trust_summary text,
  add column if not exists trust_flags jsonb not null default '[]'::jsonb;

comment on column public.local_business_leads.trust_signal_score is
  'Canonical trust signal score for Cockpit local business lead triage.';
comment on column public.local_business_leads.trust_summary is
  'Short human-readable trust summary surfaced in Cockpit.';
comment on column public.local_business_leads.trust_flags is
  'Structured trust flags surfaced in Cockpit; defaults to an empty JSON array.';

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
  'Cockpit-facing pipeline view: each lead with contact fields, trust fields, latest assessment scores, and latest event.';

grant select on public.local_business_lead_pipeline_view to authenticated;

commit;
