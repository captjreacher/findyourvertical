-- Issue #26: Operational CRM spine
-- Scope: schema + constraints + indexes + RLS only.
-- No UI, automation, audit generation, or outreach execution.

create extension if not exists pgcrypto;

create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.local_business_leads(id) on delete cascade,
  full_name text,
  role_title text,
  email text,
  phone text,
  linkedin_url text,
  decision_maker boolean not null default false,
  primary_contact boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text,
  system_managed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_types_slug_lower_chk check (slug = lower(slug))
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.local_business_leads(id) on delete cascade,
  contact_id uuid references public.lead_contacts(id) on delete set null,
  activity_type_id uuid not null references public.activity_types(id),
  source text not null default 'manual',
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint lead_activities_source_chk check (source in ('manual', 'system', 'enrichment', 'import'))
);

create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.local_business_leads(id) on delete cascade,
  contact_id uuid references public.lead_contacts(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  assigned_to uuid,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_tasks_status_chk check (status in ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  constraint lead_tasks_priority_chk check (priority in ('low', 'normal', 'high', 'urgent'))
);

create table if not exists public.lead_outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.local_business_leads(id) on delete cascade,
  contact_id uuid references public.lead_contacts(id) on delete set null,
  channel text not null,
  direction text not null default 'outbound',
  subject text,
  body text,
  status text not null default 'draft',
  external_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_outreach_channel_chk check (channel in ('email', 'phone', 'linkedin', 'website', 'in_person', 'other')),
  constraint lead_outreach_direction_chk check (direction in ('inbound', 'outbound')),
  constraint lead_outreach_status_chk check (status in ('draft', 'queued', 'sent', 'delivered', 'replied', 'failed', 'cancelled'))
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,
  color text,
  category text,
  system_managed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_slug_lower_chk check (slug = lower(slug))
);

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  tag_id uuid not null references public.tags(id) on delete cascade,
  source text not null default 'manual',
  confidence numeric(5,2),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint entity_tags_entity_type_chk check (entity_type in ('lead', 'contact', 'task', 'outreach', 'activity')),
  constraint entity_tags_source_chk check (source in ('manual', 'system', 'enrichment', 'import')),
  constraint entity_tags_confidence_chk check (confidence is null or (confidence >= 0 and confidence <= 100)),
  constraint entity_tags_unique unique (entity_type, entity_id, tag_id)
);

create index if not exists lead_contacts_lead_id_idx on public.lead_contacts(lead_id);
create index if not exists lead_activities_lead_id_occurred_at_idx on public.lead_activities(lead_id, occurred_at desc);
create index if not exists lead_activities_activity_type_id_idx on public.lead_activities(activity_type_id);
create index if not exists lead_tasks_lead_id_status_idx on public.lead_tasks(lead_id, status);
create index if not exists lead_tasks_due_at_idx on public.lead_tasks(due_at);
create index if not exists lead_outreach_lead_id_created_at_idx on public.lead_outreach(lead_id, created_at desc);
create index if not exists tags_category_idx on public.tags(category);
create index if not exists entity_tags_entity_idx on public.entity_tags(entity_type, entity_id);
create index if not exists entity_tags_tag_id_idx on public.entity_tags(tag_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lead_contacts_updated_at on public.lead_contacts;
create trigger trg_lead_contacts_updated_at
before update on public.lead_contacts
for each row execute function public.set_updated_at();

drop trigger if exists trg_activity_types_updated_at on public.activity_types;
create trigger trg_activity_types_updated_at
before update on public.activity_types
for each row execute function public.set_updated_at();

drop trigger if exists trg_lead_tasks_updated_at on public.lead_tasks;
create trigger trg_lead_tasks_updated_at
before update on public.lead_tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at
before update on public.tags
for each row execute function public.set_updated_at();

alter table public.lead_contacts enable row level security;
alter table public.activity_types enable row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_tasks enable row level security;
alter table public.lead_outreach enable row level security;
alter table public.tags enable row level security;
alter table public.entity_tags enable row level security;

drop policy if exists "cockpit authenticated read lead_contacts" on public.lead_contacts;
create policy "cockpit authenticated read lead_contacts"
on public.lead_contacts for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write lead_contacts" on public.lead_contacts;
create policy "cockpit authenticated write lead_contacts"
on public.lead_contacts for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read activity_types" on public.activity_types;
create policy "cockpit authenticated read activity_types"
on public.activity_types for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write activity_types" on public.activity_types;
create policy "cockpit authenticated write activity_types"
on public.activity_types for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read lead_activities" on public.lead_activities;
create policy "cockpit authenticated read lead_activities"
on public.lead_activities for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write lead_activities" on public.lead_activities;
create policy "cockpit authenticated write lead_activities"
on public.lead_activities for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read lead_tasks" on public.lead_tasks;
create policy "cockpit authenticated read lead_tasks"
on public.lead_tasks for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write lead_tasks" on public.lead_tasks;
create policy "cockpit authenticated write lead_tasks"
on public.lead_tasks for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read lead_outreach" on public.lead_outreach;
create policy "cockpit authenticated read lead_outreach"
on public.lead_outreach for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write lead_outreach" on public.lead_outreach;
create policy "cockpit authenticated write lead_outreach"
on public.lead_outreach for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read tags" on public.tags;
create policy "cockpit authenticated read tags"
on public.tags for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write tags" on public.tags;
create policy "cockpit authenticated write tags"
on public.tags for all
to authenticated
using (true)
with check (true);

drop policy if exists "cockpit authenticated read entity_tags" on public.entity_tags;
create policy "cockpit authenticated read entity_tags"
on public.entity_tags for select
to authenticated
using (true);

drop policy if exists "cockpit authenticated write entity_tags" on public.entity_tags;
create policy "cockpit authenticated write entity_tags"
on public.entity_tags for all
to authenticated
using (true)
with check (true);

insert into public.activity_types (slug, label, category, system_managed)
values
  ('manual_note', 'Manual note', 'manual', true),
  ('enrichment_completed', 'Enrichment completed', 'enrichment', true),
  ('trust_reviewed', 'Trust reviewed', 'trust', true),
  ('outbound_email', 'Outbound email', 'outreach', true),
  ('followup_call', 'Follow-up call', 'outreach', true),
  ('website_misalignment_detected', 'Website misalignment detected', 'trust', true)
on conflict (slug) do nothing;

insert into public.tags (slug, label, category, system_managed)
values
  ('trust/no_website', 'No website', 'trust', true),
  ('trust/weak_reviews', 'Weak reviews', 'trust', true),
  ('industry/tradie', 'Tradie', 'industry', true),
  ('outreach/followup_required', 'Follow-up required', 'outreach', true),
  ('sales/high_value', 'High value', 'sales', true),
  ('relationship/decision_maker', 'Decision maker', 'relationship', true),
  ('workflow/manual_review', 'Manual review', 'workflow', true)
on conflict (slug) do nothing;

-- Verification queries:
-- select table_name from information_schema.tables where table_schema = 'public' and table_name in (
--   'lead_contacts','activity_types','lead_activities','lead_tasks','lead_outreach','tags','entity_tags'
-- );
-- select count(*) from public.activity_types;
-- select count(*) from public.tags;
