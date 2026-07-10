create table if not exists public.content_packages (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  body_markdown text,
  source_system text,
  status text default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_outputs (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.content_packages(id) on delete cascade,
  output_type text,
  title text,
  body text,
  status text default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
