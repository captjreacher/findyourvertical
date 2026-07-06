-- FYV completion outbox wiring.
-- Reuses the existing immutable public.events ledger and adds a delivery status
-- column plus narrow FYV-specific RLS policies for completion writes.

begin;

alter table public.events
  add column if not exists delivery_status text not null default 'pending';

comment on column public.events.delivery_status is
  'Delivery state for outbox-style events. FYV completion records start as pending.';

create index if not exists events_delivery_status_idx
  on public.events (delivery_status, created_at desc);

create index if not exists events_fyv_completion_idx
  on public.events (source_system, event_type, delivery_status, created_at desc)
  where source_system = 'findyourvertical'
    and event_type = 'creator.assessment.completed';

drop policy if exists "FYV completion outbox insert" on public.events;
create policy "FYV completion outbox insert"
  on public.events for insert
  to anon
  with check (
    source_system = 'findyourvertical'
    and event_type = 'creator.assessment.completed'
    and entity_type = 'creator_profile'
    and delivery_status = 'pending'
  );

drop policy if exists "FYV completion outbox read" on public.events;
create policy "FYV completion outbox read"
  on public.events for select
  to anon, authenticated
  using (
    source_system = 'findyourvertical'
    and event_type = 'creator.assessment.completed'
    and entity_type = 'creator_profile'
  );

commit;
