/**
 * Controlled admin backfill: publish Creator Intelligence snapshots for existing
 * completed creators through the same RPC the completion flow uses.
 *
 * Runs as SERVICE ROLE (bypasses RLS) — never from the browser. Idempotent: the
 * RPC reconciles the snapshot + projections and deduplicates the published event,
 * so re-running is safe (no duplicate snapshot / projections / event).
 *
 * Usage (in an environment with deps + service key):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --experimental-strip-types scripts/backfill_intelligence_snapshots.ts \
 *     --creator <creator_profiles.id | onlyfans_handle> [--date YYYY-MM-DD] [--dry-run]
 *
 * MoonSiren note: her snapshot + projections already exist (seed 2026-07-05);
 * running this for her reuses them and only ensures the published event exists.
 */
import { createClient } from '@supabase/supabase-js';
import { buildIntelligencePackageContent } from '../src/lib/intelligence-snapshot.ts';
import type { ReportData } from '../src/types/creator.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const creatorArg = arg('creator');
  if (!creatorArg) throw new Error('--creator <creator_profiles.id | onlyfans_handle> is required');
  const referenceDate = arg('date');
  const dryRun = hasFlag('dry-run');

  const db = createClient(url, key, { auth: { persistSession: false } });

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const query = db
    .from('creator_profiles')
    .select('id, onlyfans_handle, latest_report_id');
  const { data: profile, error: profileErr } = uuidRe.test(creatorArg)
    ? await query.eq('id', creatorArg).maybeSingle()
    : await query.eq('onlyfans_handle', creatorArg).maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) throw new Error(`No creator_profiles row for "${creatorArg}"`);
  if (!profile.latest_report_id) throw new Error(`Creator ${profile.id} has no latest_report_id (assessment not completed)`);

  const { data: report, error: reportErr } = await db
    .from('creator_reports')
    .select('report_json, created_at')
    .eq('id', profile.latest_report_id)
    .maybeSingle();
  if (reportErr) throw reportErr;
  if (!report?.report_json) throw new Error(`No report_json for report ${profile.latest_report_id}`);

  const content = buildIntelligencePackageContent(report.report_json as ReportData);
  const date = referenceDate ?? String(report.created_at ?? new Date().toISOString()).slice(0, 10);

  console.log(`Backfill creator=${profile.id} handle=${profile.onlyfans_handle} date=${date} dryRun=${dryRun}`);
  console.log('Derived content:', JSON.stringify(content, null, 2));
  if (dryRun) {
    console.log('[dry-run] not calling fyv_publish_intelligence_snapshot');
    return;
  }

  const { data, error } = await db.rpc('fyv_publish_intelligence_snapshot', {
    p_creator_profile_id: profile.id,
    p_content: content,
    p_reference_date: date,
    p_intelligence_version: '1.0.0',
  });
  if (error) throw error;
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
