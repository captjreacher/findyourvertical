-- Schema Reconciliation Baseline
-- Locks current canonical contracts after Content Cell / local-business migration drift.

begin;

-- 1. Canonical content_outputs contract
alter table public.content_outputs
  add column if not exists updated_at timestamptz default now(),
  add column if not exists parent_output_id uuid references public.content_outputs(id) on delete set null,
  add column if not exists generation_reason text,
  add column if not exists review_state text not null default 'draft_generated';

-- 2. Canonical review_state constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_outputs_review_state_check'
      and conrelid = 'public.content_outputs'::regclass
  ) then
    alter table public.content_outputs
      add constraint content_outputs_review_state_check
      check (
        review_state in (
          'draft_generated',
          'strong',
          'needs_rewrite',
          'off_voice',
          'ceo_review',
          'approved',
          'published',
          'archived'
        )
      );
  end if;
end $$;

-- 3. Canonical indexes
create index if not exists content_outputs_review_state_idx
  on public.content_outputs (review_state);

create index if not exists content_outputs_parent_output_id_idx
  on public.content_outputs (parent_output_id)
  where parent_output_id is not null;

create index if not exists content_outputs_created_at_idx
  on public.content_outputs (created_at desc);

-- 4. Canonical Cockpit review queue view
create or replace view public.content_review_queue_view as
select
  o.id               as id,
  o.package_id       as package_id,
  p.title            as package_title,
  p.body_markdown    as package_brief,
  p.source_system    as package_source,
  o.output_type      as title,
  o.body             as body,
  o.status           as status,
  o.review_state     as review_state,
  o.parent_output_id as parent_output_id,
  o.created_at       as created_at,
  o.updated_at       as updated_at,
  case
    when o.review_state = 'ceo_review'                    then 'ceo_review'
    when o.review_state in ('needs_rewrite', 'off_voice') then 'rewrite'
    when o.review_state = 'strong'                        then 'strong'
    when o.review_state = 'approved'                      then 'approved'
    when o.review_state = 'published'                     then 'published'
    when o.review_state = 'archived'                      then 'archived'
    when o.review_state = 'draft_generated'
         and o.status = 'draft_requested'                 then 'pending_generation'
    when o.review_state = 'draft_generated'               then 'needs_review'
    else                                                       'needs_review'
  end                as queue_bucket
from public.content_outputs o
left join public.content_packages p on p.id = o.package_id;

grant select on public.content_review_queue_view to anon, authenticated;

-- 5. Documentation comments
comment on table public.content_outputs is
  'Canonical Content Cell output table. Review state, lineage, and Cockpit queue state are normalized here. Deprecated historical draft columns are intentionally not reintroduced.';

comment on view public.content_review_queue_view is
  'Canonical Cockpit read model for Content Cell review queue. Must only reference columns guaranteed by current schema contract.';

commit;
