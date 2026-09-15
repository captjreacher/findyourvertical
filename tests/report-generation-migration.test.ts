import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = new URL(
  '../supabase/migrations/20260827000000_fyv_report_derivation_foundation.sql',
  import.meta.url,
);
const sql = readFileSync(migrationPath, 'utf8');

for (const table of [
  'creator_report_templates',
  'creator_report_template_versions',
  'creator_report_sections',
  'creator_report_blocks',
  'creator_report_block_sources',
  'creator_report_generation_runs',
  'creator_report_block_results',
]) {
  test(`migration creates ${table}`, () => {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, 'i'));
  });
}

test('migration adds nullable direct report provenance and activation pointer', () => {
  assert.match(sql, /alter table public\.creator_reports[\s\S]*add column assessment_id uuid/i);
  assert.match(sql, /add column creator_dna_profile_id uuid/i);
  assert.match(sql, /add column report_template_version_id uuid/i);
  assert.match(sql, /add column generation_run_id uuid/i);
  assert.match(sql, /active_report_template_version_id uuid/i);
  assert.doesNotMatch(sql, /add column assessment_id uuid\s+not null/i);
});

test('migration guards published versions and validates activation ownership', () => {
  assert.match(sql, /Published report template versions are immutable/);
  assert.match(sql, /Report template content can only change on a draft version/);
  assert.match(sql, /v\.status = 'published'/);
  assert.match(sql, /t\.assessment_template_id = new\.id/);
  assert.match(sql, /Question source key must match its Question Bank record/);
  assert.match(sql, /An active report template version cannot be superseded/);
  assert.match(sql, /Report block results can only be appended to a running generation/);
  assert.match(sql, /creator_report_block_results_run_block_uniq/);
});

test('provenance tables have RLS and no anonymous table grants', () => {
  assert.match(sql, /alter table public\.creator_report_generation_runs enable row level security/i);
  assert.match(sql, /alter table public\.creator_report_block_results enable row level security/i);
  assert.match(sql, /revoke all on public\.creator_report_generation_runs from public, anon/i);
  assert.match(sql, /revoke all on public\.creator_report_block_results from public, anon/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[^;]*creator_report_generation_runs[^;]*\bto anon\b/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[^;]*creator_report_block_results[^;]*\bto anon\b/i);
});

test('legacy persistence RPC atomically links report, assessment, DNA, and run', () => {
  assert.match(sql, /create function public\.fyv_persist_legacy_creator_report/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /insert into public\.creator_report_generation_runs/i);
  assert.match(sql, /insert into public\.creator_reports/i);
  assert.match(sql, /generation_run_id[\s\S]*v_run_id/i);
  assert.match(sql, /a\.invite_code = p_invite_code/i);
  assert.match(sql, /creator_report_generation_runs_legacy_assessment_uniq/i);
  assert.match(sql, /Report tier does not match the assessment invitation/i);
  assert.match(sql, /postgres-jsonb-text-sha256-v1/i);
  assert.match(sql, /encode\(digest\(convert_to\(p_generation_context::text/i);
  assert.match(sql, /grant execute on function public\.fyv_persist_legacy_creator_report[\s\S]*to anon, service_role/i);
});
