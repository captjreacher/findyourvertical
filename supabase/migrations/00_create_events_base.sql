-- Restore the canonical event-store foundation expected by legacy FYV/MGRNZ migrations.
-- Downstream migrations add risk metadata, taxonomy fields, projections, views, and triggers.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source_system text not null,
  entity_type text not null,
  entity_id uuid,
  entity_ref text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  run_id text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
