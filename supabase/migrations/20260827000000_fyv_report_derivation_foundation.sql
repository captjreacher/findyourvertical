-- ============================================================================
-- FYV Phase 1 - Scientific report derivation foundation
-- ----------------------------------------------------------------------------
-- Additive only. Template-based report generation remains disabled until an
-- assessment template explicitly points at a published report-template version.
-- Existing report_json snapshots and public rendering remain unchanged.
-- ============================================================================

begin;

-- Stable report-design identity. An assessment template may own several report
-- templates while activation remains an explicit version-level choice.
create table public.creator_report_templates (
  id uuid primary key default gen_random_uuid(),
  assessment_template_id uuid not null
    references public.creator_assessment_templates(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index creator_report_templates_assessment_idx
  on public.creator_report_templates (assessment_template_id, created_at desc);

create table public.creator_report_template_versions (
  id uuid primary key default gen_random_uuid(),
  report_template_id uuid not null
    references public.creator_report_templates(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded')),
  schema_version text not null,
  configuration_digest text,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint creator_report_template_versions_number_uniq
    unique (report_template_id, version_number),
  constraint creator_report_template_versions_publication_check check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'superseded') and published_at is not null)
  )
);

create unique index creator_report_template_versions_one_draft_idx
  on public.creator_report_template_versions (report_template_id)
  where status = 'draft';

create index creator_report_template_versions_template_idx
  on public.creator_report_template_versions (report_template_id, version_number desc);

create table public.creator_report_sections (
  id uuid primary key default gen_random_uuid(),
  report_template_version_id uuid not null
    references public.creator_report_template_versions(id) on delete restrict,
  section_key text not null check (btrim(section_key) <> ''),
  title text not null check (btrim(title) <> ''),
  internal_purpose text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_report_sections_key_uniq
    unique (report_template_version_id, section_key)
);

create index creator_report_sections_version_order_idx
  on public.creator_report_sections (report_template_version_id, sort_order, id);

create table public.creator_report_blocks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null
    references public.creator_report_sections(id) on delete restrict,
  block_key text not null check (btrim(block_key) <> ''),
  block_type text not null
    check (block_type in ('static', 'question', 'rule', 'ai', 'hybrid')),
  heading text,
  static_content text,
  content_template text,
  rule_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rule_config) = 'object'),
  ai_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(ai_config) = 'object'),
  fallback_text text,
  ai_required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_report_blocks_key_uniq unique (section_id, block_key)
);

create index creator_report_blocks_section_order_idx
  on public.creator_report_blocks (section_id, sort_order, id);

create table public.creator_report_block_sources (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null
    references public.creator_report_blocks(id) on delete restrict,
  source_type text not null
    check (source_type in ('question', 'score', 'signal', 'report_field')),
  question_id uuid references public.creator_question_bank(id) on delete restrict,
  source_key text not null check (btrim(source_key) <> ''),
  purpose text not null
    check (purpose in ('input', 'evidence', 'condition', 'display')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint creator_report_block_sources_question_check check (
    (source_type = 'question' and question_id is not null)
    or (source_type <> 'question' and question_id is null)
  ),
  constraint creator_report_block_sources_uniq
    unique (block_id, source_type, source_key, purpose)
);

create index creator_report_block_sources_block_order_idx
  on public.creator_report_block_sources (block_id, sort_order, id);

-- One row records one deterministic derivation attempt. Context and digests are
-- internal research material and are deliberately not copied into report_json.
create table public.creator_report_generation_runs (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null
    references public.creator_profiles(id) on delete restrict,
  assessment_id uuid not null
    references public.creator_assessments(id) on delete restrict,
  creator_dna_profile_id uuid
    references public.creator_dna_profiles(id) on delete restrict,
  report_template_version_id uuid
    references public.creator_report_template_versions(id) on delete restrict,
  generation_mode text not null
    check (generation_mode in ('legacy', 'template', 'preview')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  scoring_version text,
  intelligence_version text,
  creator_dna_version text,
  schema_version text,
  digest_algorithm text,
  generation_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(generation_context) = 'object'),
  input_digest text,
  output_digest text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  failure_detail text,
  constraint creator_report_generation_runs_completion_check check (
    (status in ('pending', 'running') and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create index creator_report_generation_runs_creator_idx
  on public.creator_report_generation_runs (creator_profile_id, started_at desc);
create index creator_report_generation_runs_assessment_idx
  on public.creator_report_generation_runs (assessment_id, started_at desc);
create unique index creator_report_generation_runs_legacy_assessment_uniq
  on public.creator_report_generation_runs (assessment_id)
  where generation_mode = 'legacy';

create table public.creator_report_block_results (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null
    references public.creator_report_generation_runs(id) on delete cascade,
  section_id uuid references public.creator_report_sections(id) on delete set null,
  block_id uuid references public.creator_report_blocks(id) on delete set null,
  status text not null check (status in (
    'included',
    'skipped',
    'rule_matched',
    'rule_not_matched',
    'missing_evidence',
    'fallback',
    'ai_not_enabled',
    'failed'
  )),
  rule_evaluation jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  rendered_output jsonb,
  trace_snapshot jsonb not null default '{}'::jsonb,
  fallback_used boolean not null default false,
  prompt_snapshot text,
  prompt_version text,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  constraint creator_report_block_results_rule_object_check
    check (jsonb_typeof(rule_evaluation) = 'object'),
  constraint creator_report_block_results_trace_object_check
    check (jsonb_typeof(trace_snapshot) = 'object'),
  constraint creator_report_block_results_evidence_array_check
    check (jsonb_typeof(evidence_snapshot) = 'array'),
  constraint creator_report_block_results_missing_array_check
    check (jsonb_typeof(missing_evidence) = 'array'),
  constraint creator_report_block_results_definition_check check (
    (section_id is null and block_id is null)
    or (section_id is not null and block_id is not null)
  )
);

create index creator_report_block_results_run_idx
  on public.creator_report_block_results (generation_run_id, created_at, id);
create unique index creator_report_block_results_run_block_uniq
  on public.creator_report_block_results (generation_run_id, block_id)
  where block_id is not null;

-- Historical rows remain valid because every new relationship is nullable.
alter table public.creator_reports
  add column assessment_id uuid
    references public.creator_assessments(id) on delete set null,
  add column creator_dna_profile_id uuid
    references public.creator_dna_profiles(id) on delete set null,
  add column report_template_version_id uuid
    references public.creator_report_template_versions(id) on delete restrict,
  add column generation_run_id uuid
    references public.creator_report_generation_runs(id) on delete set null;

create unique index creator_reports_generation_run_uniq
  on public.creator_reports (generation_run_id)
  where generation_run_id is not null;
create index creator_reports_assessment_idx
  on public.creator_reports (assessment_id, created_at desc)
  where assessment_id is not null;

alter table public.creator_assessment_templates
  add column active_report_template_version_id uuid
    references public.creator_report_template_versions(id) on delete restrict;

-- Existing updated_at convention.
create trigger trg_creator_report_templates_updated_at
  before update on public.creator_report_templates
  for each row execute function public.set_updated_at();
create trigger trg_creator_report_sections_updated_at
  before update on public.creator_report_sections
  for each row execute function public.set_updated_at();
create trigger trg_creator_report_blocks_updated_at
  before update on public.creator_report_blocks
  for each row execute function public.set_updated_at();

-- Published definitions are immutable. The only allowed terminal transition is
-- published -> superseded; its content and publication metadata cannot change.
create function public.fyv_guard_report_template_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published report template versions are immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  if old.status in ('published', 'superseded') then
    if old.status = 'published'
       and new.status = 'superseded'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      if exists (
        select 1 from public.creator_assessment_templates
        where active_report_template_version_id = old.id
        for update
      ) then
        raise exception 'An active report template version cannot be superseded'
          using errcode = '55000';
      end if;
      return new;
    end if;
    raise exception 'Published report template versions are immutable' using errcode = '55000';
  end if;

  if new.status = 'superseded' then
    raise exception 'A draft cannot be superseded before publication' using errcode = '23514';
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_template_version_mutation
  before update or delete on public.creator_report_template_versions
  for each row execute function public.fyv_guard_report_template_version_mutation();

create function public.fyv_assert_report_version_is_draft(p_version_id uuid)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.creator_report_template_versions
    where id = p_version_id and status = 'draft'
  ) then
    raise exception 'Report template content can only change on a draft version' using errcode = '55000';
  end if;
end;
$$;

create function public.fyv_guard_report_section_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fyv_assert_report_version_is_draft(old.report_template_version_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fyv_assert_report_version_is_draft(new.report_template_version_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_section_mutation
  before insert or update or delete on public.creator_report_sections
  for each row execute function public.fyv_guard_report_section_mutation();

create function public.fyv_guard_report_block_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select report_template_version_id into v_version_id
    from public.creator_report_sections where id = old.section_id;
    perform public.fyv_assert_report_version_is_draft(v_version_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select report_template_version_id into v_version_id
    from public.creator_report_sections where id = new.section_id;
    perform public.fyv_assert_report_version_is_draft(v_version_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_block_mutation
  before insert or update or delete on public.creator_report_blocks
  for each row execute function public.fyv_guard_report_block_mutation();

create function public.fyv_guard_report_block_source_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select s.report_template_version_id into v_version_id
    from public.creator_report_blocks b
    join public.creator_report_sections s on s.id = b.section_id
    where b.id = old.block_id;
    perform public.fyv_assert_report_version_is_draft(v_version_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select s.report_template_version_id into v_version_id
    from public.creator_report_blocks b
    join public.creator_report_sections s on s.id = b.section_id
    where b.id = new.block_id;
    perform public.fyv_assert_report_version_is_draft(v_version_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_block_source_mutation
  before insert or update or delete on public.creator_report_block_sources
  for each row execute function public.fyv_guard_report_block_source_mutation();

create function public.fyv_guard_report_question_source_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_type = 'question' and not exists (
    select 1 from public.creator_question_bank q
    where q.id = new.question_id and q.question_key = new.source_key
  ) then
    raise exception 'Question source key must match its Question Bank record' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_question_source_identity
  before insert or update on public.creator_report_block_sources
  for each row execute function public.fyv_guard_report_question_source_identity();

-- An activation pointer must reference an active report template owned by the
-- same assessment template and a genuinely published immutable version.
create function public.fyv_guard_active_report_template_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_valid boolean := false;
begin
  if new.active_report_template_version_id is not null then
    select true into v_valid
    from public.creator_report_template_versions v
    join public.creator_report_templates t on t.id = v.report_template_id
    where v.id = new.active_report_template_version_id
      and v.status = 'published'
      and t.assessment_template_id = new.id
      and t.is_active = true
    for share of v, t;
    if not coalesce(v_valid, false) then
      raise exception 'Active report version must be published and belong to this assessment template'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_active_report_template_version
  before insert or update of active_report_template_version_id
  on public.creator_assessment_templates
  for each row execute function public.fyv_guard_active_report_template_version();

create function public.fyv_guard_active_report_template_definition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.assessment_template_id is distinct from old.assessment_template_id or new.is_active = false)
     and exists (
       select 1
       from public.creator_assessment_templates a
       join public.creator_report_template_versions v
         on v.id = a.active_report_template_version_id
       where v.report_template_id = old.id
     ) then
    raise exception 'An active report template must be deactivated at the assessment template first'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_active_report_template_definition
  before update of assessment_template_id, is_active on public.creator_report_templates
  for each row execute function public.fyv_guard_active_report_template_definition();

create function public.fyv_guard_report_generation_run_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.status in ('completed', 'failed') then
    raise exception 'Terminal report generation runs are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if old.status in ('completed', 'failed') then
    raise exception 'Terminal report generation runs are immutable' using errcode = '55000';
  end if;
  if new.creator_profile_id is distinct from old.creator_profile_id
     or new.assessment_id is distinct from old.assessment_id
     or new.creator_dna_profile_id is distinct from old.creator_dna_profile_id
     or new.report_template_version_id is distinct from old.report_template_version_id
     or new.generation_mode is distinct from old.generation_mode
     or new.scoring_version is distinct from old.scoring_version
     or new.intelligence_version is distinct from old.intelligence_version
     or new.creator_dna_version is distinct from old.creator_dna_version
     or new.schema_version is distinct from old.schema_version
     or new.digest_algorithm is distinct from old.digest_algorithm
     or new.generation_context is distinct from old.generation_context
     or new.input_digest is distinct from old.input_digest
     or new.started_at is distinct from old.started_at then
    raise exception 'Report generation inputs and identity are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_generation_run_mutation
  before update or delete on public.creator_report_generation_runs
  for each row execute function public.fyv_guard_report_generation_run_mutation();

create function public.fyv_guard_report_block_result_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_run_version_id uuid;
begin
  select report_template_version_id into v_run_version_id
  from public.creator_report_generation_runs
  where id = new.generation_run_id and status = 'running'
  for update;

  if not found then
    raise exception 'Report block results can only be appended to a running generation'
      using errcode = '55000';
  end if;

  if new.block_id is not null and not exists (
    select 1
    from public.creator_report_blocks b
    join public.creator_report_sections s on s.id = b.section_id
    where b.id = new.block_id
      and s.id = new.section_id
      and s.report_template_version_id = v_run_version_id
  ) then
    raise exception 'Report block result does not belong to the generation template version'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger trg_fyv_guard_report_block_result_insert
  before insert on public.creator_report_block_results
  for each row execute function public.fyv_guard_report_block_result_insert();

-- Internal-only RLS. Authenticated creators receive no policy; agency operators
-- are resolved through the existing allowlist helper. No anonymous table grant.
alter table public.creator_report_templates enable row level security;
alter table public.creator_report_template_versions enable row level security;
alter table public.creator_report_sections enable row level security;
alter table public.creator_report_blocks enable row level security;
alter table public.creator_report_block_sources enable row level security;
alter table public.creator_report_generation_runs enable row level security;
alter table public.creator_report_block_results enable row level security;

revoke all on public.creator_report_templates from public, anon;
revoke all on public.creator_report_template_versions from public, anon;
revoke all on public.creator_report_sections from public, anon;
revoke all on public.creator_report_blocks from public, anon;
revoke all on public.creator_report_block_sources from public, anon;
revoke all on public.creator_report_generation_runs from public, anon;
revoke all on public.creator_report_block_results from public, anon;

grant select, insert, update, delete on public.creator_report_templates to authenticated, service_role;
grant select, insert, update, delete on public.creator_report_template_versions to authenticated, service_role;
grant select, insert, update, delete on public.creator_report_sections to authenticated, service_role;
grant select, insert, update, delete on public.creator_report_blocks to authenticated, service_role;
grant select, insert, update, delete on public.creator_report_block_sources to authenticated, service_role;
grant select, insert, update on public.creator_report_generation_runs to authenticated;
grant select, insert, update, delete on public.creator_report_generation_runs to service_role;
grant select, insert on public.creator_report_block_results to authenticated;
grant select, insert, update, delete on public.creator_report_block_results to service_role;

create policy "Agency full access report templates"
  on public.creator_report_templates for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency full access report template versions"
  on public.creator_report_template_versions for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency full access report sections"
  on public.creator_report_sections for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency full access report blocks"
  on public.creator_report_blocks for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency full access report block sources"
  on public.creator_report_block_sources for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency full access report generation runs"
  on public.creator_report_generation_runs for all to authenticated
  using (public.is_agency()) with check (public.is_agency());
create policy "Agency insert and read report block results"
  on public.creator_report_block_results for select to authenticated
  using (public.is_agency());
create policy "Agency insert report block results"
  on public.creator_report_block_results for insert to authenticated
  with check (public.is_agency());

-- The public assessment flow must persist the report and its provenance without
-- receiving direct access to internal generation tables. This boundary validates
-- all entity relationships and atomically inserts both rows.
create function public.fyv_persist_legacy_creator_report(
  p_creator_profile_id uuid,
  p_assessment_id uuid,
  p_invite_code text,
  p_creator_dna_profile_id uuid,
  p_report_slug text,
  p_report_json jsonb,
  p_generation_context jsonb
)
returns public.creator_reports
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_run_id uuid;
  v_report public.creator_reports;
  v_report_tier text;
begin
  if jsonb_typeof(p_report_json) <> 'object'
     or jsonb_typeof(p_generation_context) <> 'object' then
    raise exception 'Report output and generation context must be JSON objects'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.creator_assessments a
    where a.id = p_assessment_id
      and a.creator_profile_id = p_creator_profile_id
      and a.invite_code = p_invite_code
  ) then
    raise exception 'Assessment does not belong to creator profile' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assessment_id::text, 0));

  select r.* into v_report
  from public.creator_reports r
  join public.creator_report_generation_runs g on g.id = r.generation_run_id
  where r.assessment_id = p_assessment_id and g.generation_mode = 'legacy'
  limit 1;
  if found then return v_report; end if;

  select l.report_tier into v_report_tier
  from public.creator_assessments a
  join public.creator_assessment_links l on l.id = a.invite_link_id
  where a.id = p_assessment_id
    and a.invite_code = p_invite_code;

  if v_report_tier is null
     or p_report_json ->> 'report_tier' is distinct from v_report_tier then
    raise exception 'Report tier does not match the assessment invitation' using errcode = '23514';
  end if;
  if (p_report_json ->> 'premium_report_available')::boolean is distinct from (v_report_tier = 'free')
     or (p_report_json ->> 'premium_report_generated')::boolean is distinct from (v_report_tier = 'premium') then
    raise exception 'Premium report state does not match the assessment invitation' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.creator_dna_profiles d
    where d.id = p_creator_dna_profile_id
      and d.assessment_id = p_assessment_id
      and d.creator_profile_id = p_creator_profile_id
  ) then
    raise exception 'Creator DNA profile does not belong to assessment' using errcode = '23503';
  end if;

  insert into public.creator_report_generation_runs (
    creator_profile_id,
    assessment_id,
    creator_dna_profile_id,
    report_template_version_id,
    generation_mode,
    status,
    scoring_version,
    intelligence_version,
    creator_dna_version,
    schema_version,
    digest_algorithm,
    generation_context,
    input_digest,
    output_digest,
    completed_at
  ) values (
    p_creator_profile_id,
    p_assessment_id,
    p_creator_dna_profile_id,
    null,
    'legacy',
    'completed',
    'fyv/scoring/legacy-rules-v1',
    'fyv/creator-intelligence/deterministic-v1',
    'fyv/creator-dna/deterministic-v1',
    'fyv/report-generation/context-v1',
    'postgres-jsonb-text-sha256-v1',
    p_generation_context,
    'sha256:' || encode(digest(convert_to(p_generation_context::text, 'UTF8'), 'sha256'), 'hex'),
    'sha256:' || encode(digest(convert_to(p_report_json::text, 'UTF8'), 'sha256'), 'hex'),
    now()
  ) returning id into v_run_id;

  insert into public.creator_reports (
    creator_profile_id,
    report_slug,
    report_json,
    report_tier,
    premium_report_available,
    premium_report_generated,
    version,
    assessment_id,
    creator_dna_profile_id,
    report_template_version_id,
    generation_run_id
  ) values (
    p_creator_profile_id,
    p_report_slug,
    p_report_json,
    v_report_tier,
    v_report_tier = 'free',
    v_report_tier = 'premium',
    '1.0',
    p_assessment_id,
    p_creator_dna_profile_id,
    null,
    v_run_id
  ) returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.fyv_persist_legacy_creator_report(
  uuid, uuid, text, uuid, text, jsonb, jsonb
) from public;
grant execute on function public.fyv_persist_legacy_creator_report(
  uuid, uuid, text, uuid, text, jsonb, jsonb
) to anon, service_role;

commit;
