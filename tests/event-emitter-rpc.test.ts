import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../supabase/migrations/20260714043928_fyv_event_emitter_rpc.sql');
const api = read('../src/lib/creators-api.ts');
const exec = sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');

const has = (src: string, re: RegExp, msg: string) => assert.ok(re.test(src), msg);
const missing = (src: string, re: RegExp, msg: string) => assert.ok(!re.test(src), msg);

test('generic event emitter RPC has the required security and signature', () => {
  has(sql, /create or replace function public\.fyv_emit_event\(\s*p_event_type text,\s*p_entity_type text,\s*p_entity_id uuid,\s*p_payload jsonb,\s*p_source_system text default 'findyourvertical'\s*\)/i,
    'required five-argument RPC signature');
  has(sql, /security definer/i, 'SECURITY DEFINER');
  has(sql, /set search_path = public, pg_temp/i, 'fixed search_path');
  has(sql, /revoke all on function public\.fyv_emit_event\(text, text, uuid, jsonb, text\) from public/i,
    'PUBLIC execute revoked');
  has(sql, /grant execute on function public\.fyv_emit_event\(text, text, uuid, jsonb, text\) to anon, authenticated, service_role/i,
    'execute granted to browser roles and service role');
});

test('browser-facing emitter writes pending events with canonical entity_ref', () => {
  has(exec, /insert into public\.events/i, 'inserts into events inside RPC');
  has(exec, /current_user in \('anon', 'authenticated'\)/i, 'browser roles are explicitly constrained');
  has(exec, /p_event_type <> 'creator\.assessment\.completed'/i, 'browser event_type allowlist');
  has(exec, /p_entity_type <> 'creator_profile'/i, 'browser entity_type allowlist');
  has(exec, /p_entity_type \|\| ':' \|\| p_entity_id::text/i, 'canonical entity_ref');
  has(exec, /'pending'/i, 'status pending');
  has(exec, /coalesce\(p_payload, '\{\}'::jsonb\)/i, 'payload coalesced without reshaping');
});

test('assessment completion uses RPC and preserves completion payload variable', () => {
  has(api, /\.rpc\('fyv_emit_event'/, 'calls canonical RPC');
  has(api, /p_payload:\s*completionPayload/, 'passes payload variable unchanged');
  missing(api, /\.from\('events'\)\.insert/i, 'no direct single-quoted events insert');
  missing(api, /\.from\("events"\)\.insert/i, 'no direct double-quoted events insert');
});

test('existing FYV emitters route through the canonical emitter', () => {
  has(sql, /create or replace function public\.fyv_emit_onboarding_event[\s\S]*perform public\.fyv_emit_event/i,
    'onboarding wrapper calls canonical emitter');
  has(sql, /create or replace function public\.fyv_emit_persona_event[\s\S]*perform public\.fyv_emit_event/i,
    'persona wrapper calls canonical emitter');
  has(sql, /create or replace function public\.fyv_emit_creator_relationship_event[\s\S]*perform public\.fyv_emit_event/i,
    'relationship wrapper calls canonical emitter');
});

test('non-blocking event wrappers record structured diagnostics instead of swallowing failures', () => {
  has(sql, /create table if not exists public\.fyv_event_emit_failures/i,
    'event emit failure diagnostics table exists');
  has(sql, /create or replace function public\.fyv_record_event_emit_failure/i,
    'diagnostic writer function exists');
  has(sql, /get stacked diagnostics[\s\S]*returned_sqlstate[\s\S]*message_text[\s\S]*pg_exception_context/i,
    'wrappers capture structured postgres exception diagnostics');
  has(sql, /perform public\.fyv_record_event_emit_failure\(\s*'fyv_emit_onboarding_event'/i,
    'onboarding wrapper records failures');
  has(sql, /perform public\.fyv_record_event_emit_failure\(\s*'fyv_emit_persona_event'/i,
    'persona wrapper records failures');
  missing(sql, /exception when others then\s*null\s*;/i,
    'event wrapper failures are not silently swallowed');
});
