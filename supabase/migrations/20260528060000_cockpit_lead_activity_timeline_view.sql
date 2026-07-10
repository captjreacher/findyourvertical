-- Issue #28: Cockpit lead activity timeline read model.
-- Normalizes operational_crm lead.* / tag.* events and local_business.* events
-- into a lead-scoped, newest-first view for the lead detail modal.

begin;

create or replace view public.cockpit_lead_activity_timeline_view as
select
  e.id as event_id,
  lead_ref.lead_id_text::uuid as lead_id,
  e.event_type,
  case
    when e.event_type = 'lead.contact_added' then 'Contact added'
    when e.event_type = 'lead.activity_logged' then 'Activity logged'
    when e.event_type = 'lead.task_created' then 'Task created'
    when e.event_type = 'lead.task_completed' then 'Task completed'
    when e.event_type = 'lead.outreach_started' then 'Outreach started'
    when e.event_type = 'lead.status_changed' then 'Status changed'
    when e.event_type = 'tag.applied' then 'Tag applied'
    when e.event_type = 'tag.removed' then 'Tag removed'
    when e.event_type = 'local_business.enrich.requested' then 'Enrichment requested'
    when e.event_type = 'local_business.enrichment.started' then 'Enrichment started'
    when e.event_type = 'local_business.enrichment.completed' then 'Enrichment completed'
    when e.event_type = 'local_business.enrichment_partial' then 'Partial enrichment'
    when e.event_type in ('local_business.enrichment.failed', 'local_business.enrichment_failed') then 'Enrichment failed'
    when e.event_type = 'local_business.enriched' then 'Lead enriched'
    when e.event_type = 'local_business.assessed' then 'Lead assessed'
    when e.event_type = 'local_business.scored' then 'Lead scored'
    when e.event_type = 'local_business.outreach_drafted' then 'Outreach drafted'
    when e.event_type = 'local_business.outreach_approved' then 'Outreach approved'
    when e.event_type = 'local_business.outreach_sent' then 'Outreach sent'
    when e.event_type = 'local_business.responded' then 'Lead responded'
    else initcap(replace(e.event_type, '.', ' '))
  end as event_label,
  e.entity_type,
  e.entity_id,
  e.status,
  e.source_system,
  e.correlation_id,
  coalesce(e.payload->'actor', e.metadata->'actor', '{}'::jsonb) as actor,
  coalesce(
    nullif(e.payload->>'title', ''),
    nullif(e.payload->>'subject', ''),
    nullif(e.payload->>'tag_label', ''),
    nullif(e.payload->>'business_name', ''),
    nullif(e.entity_ref, '')
  ) as summary,
  e.payload,
  e.created_at
from public.events e
cross join lateral (
  select coalesce(
    nullif(e.payload->>'lead_id', ''),
    case
      when e.entity_type in ('lead', 'local_business', 'local_business_lead')
       and e.entity_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then e.entity_id::text
      else null
    end
  ) as lead_id_text
) lead_ref
where lead_ref.lead_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    e.source_system = 'operational_crm'
    or e.event_type like 'local_business.%'
    or e.event_type in (
      'lead.contact_added',
      'lead.activity_logged',
      'lead.task_created',
      'lead.task_completed',
      'lead.outreach_started',
      'lead.status_changed',
      'tag.applied',
      'tag.removed'
    )
  );

grant select on public.cockpit_lead_activity_timeline_view to authenticated;

comment on view public.cockpit_lead_activity_timeline_view is
  'Cockpit lead detail activity timeline. Normalizes issue #27 operational CRM events and local_business enrichment/outreach events by lead_id.';

commit;
