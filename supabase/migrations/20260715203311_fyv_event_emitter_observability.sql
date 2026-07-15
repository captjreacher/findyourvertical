import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const emitterSql = read(
  '../supabase/migrations/20260714043928_fyv_event_emitter_rpc.sql',
);

const observabilitySql = read(
  '../supabase/migrations/20260715203311_fyv_event_emitter_observability.sql',
);

const api = read('../src/lib/creators-api.ts');

const executableSql = `${emitterSql}\n${observabilitySql}`
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');

const has = (src: string, re: RegExp, msg: string) =>
  assert.ok(re.test(src), msg);

const missing = (src: string, re: RegExp, msg: string) =>
  assert.ok(!re.test(src), msg);

test('generic event emitter RPC has the required security and signature', () => {
  has(
    emitterSql,
    /create or replace function public\.fyv_emit_event\(\s*p_event_type text,\s*p_entity_type text,\s*p_entity_id uuid,\s*p_payload jsonb,\s*p_source_system text default 'findyourvertical'\s*\)/i,
    'required five-argument RPC signature',
  );

  has(emitterSql, /security definer/i, 'SECURITY DEFINER');
  has(
    emitterSql,
    /set search_path = public, pg_temp/i,
    'fixed search_path',
  );

  has(
    emitterSql,
    /revoke all on function public\.fyv_emit_event\(text, text, uuid, jsonb, text\) from public/i,
    'PUBLIC execute revoked',
  );

  has(
    emitterSql,
    /grant execute on function public\.fyv_emit_event\(text, text, uuid, jsonb, text\) to anon, authenticated, service_role/i,
    'execute granted to browser roles and service role',
  );
});

test('browser-facing emitter writes pending events with canonical entity_ref', () => {
  has(executableSql, /insert into public\.events/i, 'inserts into events inside RPC');

  has(
    executableSql,
    /current_user in \('anon', 'authenticated'\)/i,
    'browser roles are explicitly constrained',
  );

  has(
    executableSql,
    /p_event_type <> 'creator\.assessment\.completed'/i,
    'browser event_type allowlist',
  );

  has(
    executableSql,
    /p_entity_type <> 'creator_profile'/i,
    'browser entity_type allowlist',
  );

  has(
    executableSql,
    /p_entity_type \|\| ':' \|\| p_entity_id::text/i,
    'canonical entity_ref',
  );

  has(executableSql, /'pending'/i, 'status pending');

  has(
    executableSql,
    /coalesce\(p_payload, '\{\}'::jsonb\)/i,
    'payload coalesced without reshaping',
  );
});

test('assessment completion uses RPC and preserves completion payload variable', () => {
  has(api, /\.rpc\('fyv_emit_event'/, 'calls canonical RPC');

  has(
    api,
    /p_payload:\s*completionPayload/,
    'passes payload variable unchanged',
  );

  missing(
    api,
    /\.from\('events'\)\.insert/i,
    'no direct single-quoted events insert',
  );

  missing(
    api,
    /\.from\("events"\)\.insert/i,
    'no direct double-quoted events insert',
  );
});

test('existing FYV emitters route through the canonical emitter', () => {
  has(
    executableSql,
    /create or replace function public\.fyv_emit_onboarding_event[\s\S]*perform public\.fyv_emit_event/i,
    'onboarding wrapper calls canonical emitter',
  );

  has(
    executableSql,
    /create or replace function public\.fyv_emit_persona_event[\s\S]*perform public\.fyv_emit_event/i,
    'persona wrapper calls canonical emitter',
  );

  has(
    executableSql,
    /create or replace function public\.fyv_emit_creator_relationship_event[\s\S]*perform public\.fyv_emit_event/i,
    'relationship wrapper calls canonical emitter',
  );
});

test('event emitter observability records structured non-blocking failures', () => {
  has(
    observabilitySql,
    /create table(?: if not exists)? public\.fyv_event_emit_failures/i,
    'failure diagnostics table exists',
  );

  has(
    observabilitySql,
    /create or replace function public\.fyv_record_event_emit_failure/i,
    'failure recorder function exists',
  );

  has(
    observabilitySql,
    /security definer/i,
    'failure recorder uses SECURITY DEFINER',
  );

  has(
    observabilitySql,
    /set search_path = public, pg_temp/i,
    'failure recorder has fixed search_path',
  );

  has(
    observabilitySql,
    /returned_sqlstate|sqlstate/i,
    'SQLSTATE is captured',
  );

  has(
    observabilitySql,
    /message_text|error_message/i,
    'error message is captured',
  );

  has(
    observabilitySql,
    /pg_exception_detail|error_detail/i,
    'error detail is captured',
  );

  has(
    observabilitySql,
    /pg_exception_hint|error_hint/i,
    'error hint is captured',
  );

  has(
    observabilitySql,
    /pg_exception_context|exception_context/i,
    'exception context is captured',
  );

  has(
    observabilitySql,
    /raise warning/i,
    'diagnostic write failure only raises a warning',
  );

  missing(
    observabilitySql,
    /exception when others then\s+null/i,
    'silent exception swallowing has been removed',
  );
});