# Creator Intelligence Package Handoff — Merge & Deployment Readiness

**Branch:** `feat/fyv-intelligence-package-handoff` · **Commit:** `2a268f2`
**Scope:** FYV-only. Adds the Creator Intelligence Package publication boundary
(assessment → report → package → `creator.intelligence_package.published` event).
No FMF/MGRNZ/billing/onboarding/auth changes.

## Status

| Area | Status |
|---|---|
| **Code** | ✅ READY |
| **Tests** | ✅ PASSING (sandbox limitations documented below) |
| **CI** | ⏳ Pending registry/build environment (`npm ci` blocked by sandbox firewall) |
| **Migration** | ⏳ Pending normal deployment pipeline (NOT applied to production) |
| **Production validation** | ⏳ Pending migration deployment (runbook below) |

**No production writes were performed.** The live FYV database (`mgrnz-web`) was
inspected **read-only** only; no migration was applied and no data was created.

## 1. Change inventory (branch vs `main`)

New:
- `supabase/migrations/20260712000000_fyv_creator_intelligence_package.sql`
- `src/lib/intelligence-package.ts`
- `tests/creator-intelligence-package.test.ts`
- `tests/creator-intelligence-package-migration.test.ts`
- `scripts/verify_creator_intelligence_package.sql`
- `docs/architecture/creator-intelligence-package-handoff-v1.md`
- `docs/deploy/creator-intelligence-package-handoff-merge-readiness.md` (this file)

Modified:
- `src/lib/creators-api.ts` — publish wired into `submitAssessment` (after report insert, before the existing completion event; hard failure throws)
- `src/lib/contracts/creator-intelligence-package-v1.ts` — canonical snake_case handoff envelope + reference validators + event builder
- `src/lib/contracts/creator-intelligence-package-v1.fixture.ts` — legacy fixture references aligned to the canonical opaque form
- `package.json` — registered the two new test files

## 2. Environment validation (CI gate — environment-related)

`npm ci` fails in the sandbox with:

```
npm error code E403
npm error 403 Forbidden - GET https://registry.npmjs.org/youch-core/-/youch-core-0.3.3.tgz
```

This is a **sandbox network/firewall limitation**, not a repository failure — a
transitive dependency tarball cannot be fetched, so `typescript`/`vite` never
install and `npm run typecheck` / `npm run build` cannot execute here. **No
application code change is warranted** unless CI in an environment with registry
access surfaces an actual repository failure.

Type-safety notes for the reviewer (verified by inspection; `tsconfig.json`
`include: ["src"]`, `allowImportingTsExtensions: true`, untyped Supabase client):
- New/changed `src` modules use type-only cross-module imports where relevant.
- The Supabase client is not generic-typed, so `.rpc('publish_creator_intelligence_package', …)`
  typechecks without regenerating `database.types.ts`.

## 3. Test evidence (sandbox, node native runner)

Runner: `node --experimental-strip-types --test` (no npm deps required).

- **Creator Intelligence Package tests: 26/26 pass** — `tests/creator-intelligence-package.test.ts`
  (lean body projection incl. **no internal-field leakage**, opaque-reference
  validation, exact event contract, consumability, versioning/supersede, fixture
  canonical-format lock) + `tests/creator-intelligence-package-migration.test.ts`
  (static SQL contract: transaction wrapping, table/RLS/trigger, published/superseded
  CHECK, one-active-published partial unique, unique `package_reference`, events dedup
  index, SECURITY DEFINER + search_path, grants incl. anon EXECUTE, ownership validation,
  canonical event payload keys, no `report_json`/`creator_reports` coupling, and the
  completion-flow wiring assertions).
- **Full suite: 102 tests, 101 pass, 1 fail.** The single failure is **pre-existing and
  unrelated**: `tests/onboarding-ui-contract.test.ts` ("cockpit invite action…") expects
  copy "Invitation link generated" while `OnboardingInviteAction.tsx` on `main` renders
  "Invitation generated". No onboarding files are in this branch; out of scope.

## 4. Migration readiness

**File:** `supabase/migrations/20260712000000_fyv_creator_intelligence_package.sql`
Additive, transaction-wrapped (`begin;`/`commit;`), idempotent guards
(`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `create or replace function`). No
`ALTER`/`DROP`/column change on any existing table; the sole existing-table touch
is one **additive partial index** on `public.events`.

**Prerequisites verified on `mgrnz-web` (read-only, `jqfodlzcsgfocyuawzyx`):**

Query run:
```sql
select
  to_regclass('public.creator_intelligence_packages')                                            as cip_table,
  to_regprocedure('public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text)')  as publish_rpc,
  to_regclass('public.events')            as events_table,
  to_regclass('public.creator_assessments') as assessments_table,
  to_regclass('public.creator_reports')   as reports_table,
  to_regprocedure('public.is_agency()')                    as is_agency_fn,
  to_regprocedure('public.current_creator_profile_id()')   as current_creator_fn,
  to_regprocedure('public.set_updated_at()')               as set_updated_at_fn,
  (select count(*) from pg_indexes where schemaname='public'
     and indexname='events_intelligence_package_published_ref') as dedup_index_count,
  (select count(*) from public.events
     where event_type='creator.intelligence_package.published') as published_event_rows;
```

Result:

| check | value | meaning |
|---|---|---|
| `cip_table` | `null` | package table **not yet created** |
| `publish_rpc` | `null` | publish RPC **not yet created** |
| `events_table` | `events` | ✅ prerequisite present |
| `assessments_table` | `creator_assessments` | ✅ prerequisite present |
| `reports_table` | `creator_reports` | ✅ prerequisite present |
| `is_agency_fn` | `is_agency()` | ✅ prerequisite present |
| `current_creator_fn` | `current_creator_profile_id()` | ✅ prerequisite present |
| `set_updated_at_fn` | `set_updated_at()` | ✅ prerequisite present |
| `dedup_index_count` | `0` | index not present (created by this migration) |
| `published_event_rows` | `0` | no published events yet |

**Migration NOT applied** — confirmed absent from the applied migration list on
`mgrnz-web` (latest applied: `20260711000000_fyv_creator_onboarding`, plus the
team's `20260712051614/18 opportunity_console_*`).

### Migration ordering caveat
`mgrnz-web` already has `20260712051614_opportunity_console_view` and
`20260712051618_opportunity_console_audit_log` applied (they are **not** in this
branch), i.e. the team applies migrations through a live pipeline. This migration
(`20260712000000…`) must be applied through that **normal pipeline** so ordering
is recorded consistently — do **not** apply it out-of-band.

## 5. Post-deployment production validation runbook

Run **after** the pipeline applies `20260712000000` to `mgrnz-web`.

**Step 1 — Confirm migration applied**
```sql
select to_regclass('public.creator_intelligence_packages') as tbl,
       to_regprocedure('public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text)') as rpc,
       (select count(*) from pg_indexes
          where indexname='creator_intelligence_packages_one_published') as one_active_idx,
       (select count(*) from pg_indexes
          where indexname='events_intelligence_package_published_ref') as dedup_idx;
-- expect: tbl + rpc non-null; both index counts = 1
```

**Step 2 — Structural + rollback-safe functional verification**
```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_creator_intelligence_package.sql
```
Expect every `CHECK … PASS` notice and `ALL CREATOR INTELLIGENCE PACKAGE CHECKS PASSED`.
(The functional block creates throwaway rows inside a transaction that **rolls back**,
so it leaves no data.)

**Step 3 — One controlled assessment completion**
Complete a single real assessment via the app (public wizard → submit). This exercises
`submitAssessment` end-to-end: persist assessment → generate report → publish package →
completion event.

**Step 4 — Verify the package row → event**
```sql
-- package row
select id, creator_profile_id, package_state, source_product, package_reference,
       assessment_reference, version, created_at, published_at
from public.creator_intelligence_packages
order by created_at desc limit 1;
-- expect: package_state='published', source_product='FYV',
--         package_reference like 'fyv.creator.intelligence.%'

-- package_json carries ONLY contract fields (no internal leakage)
select jsonb_object_keys(package_json) as keys
from public.creator_intelligence_packages
order by created_at desc limit 1;
-- expect keys ⊆ {version, creator_profile, persona, opportunities, recommended_next_steps}
-- and NONE of: scores, internal_agency_scores, why_this_result, completion_routing

-- matching published event
select entity_id as creator_reference,
       payload->>'package_reference' as package_reference,
       payload->>'package_id'        as package_id,
       payload->>'source_product'    as source_product,
       payload->>'package_state'     as package_state,
       payload->>'assessment_reference' as assessment_reference,
       created_at
from public.events
where event_type='creator.intelligence_package.published'
order by created_at desc limit 1;
-- expect: source_product='FYV', package_state='published',
--         package_reference + package_id MATCH the package row above
```

**Step 5 — Replay / idempotency**
Re-run publication for the same creator (retake / resubmit). Confirm:
```sql
select package_state, count(*)
from public.creator_intelligence_packages
where creator_profile_id = '<creator_id>'
group by package_state;
-- expect: published=1 (latest), superseded=N (prior) — never >1 published

select count(*) as published_events
from public.events
where event_type='creator.intelligence_package.published'
  and entity_id = '<creator_id>';
-- expect: one event per published package; the one-active-published index +
--         the events dedup index prevent duplicate active packages / duplicate
--         events for the same package_reference
```

**Step 6 — Capture handoff evidence** (for the FMF handoff; do not modify FMF)
From the published event + package row, record:
`creator_reference`, `package_reference`, `package_id`, `event_type`
(`creator.intelligence_package.published`), and the event `created_at` timestamp.

## 6. Rollback

No down-migration (repo convention). If a rollback is required:
`drop table public.creator_intelligence_packages;`
`drop function public.publish_creator_intelligence_package(uuid, uuid, text, jsonb, text);`
`drop index if exists public.events_intelligence_package_published_ref;`
(The migration is additive; dropping these restores the prior state. `public.events`
rows already emitted, if any, would remain — expected for an append-only ledger.)

## 7. Merge recommendation

**Code is merge-ready.** Recommended gate before/at merge:
1. CI `npm ci && npm run typecheck && npm run build` green in an environment with
   registry access (expected — the only sandbox failure is the registry E403).
2. Migration applied via the **normal deployment pipeline** to `mgrnz-web`.
3. Post-deployment runbook (§5) executed; handoff evidence captured.

No blocking issues were found in implementation, hardening, or read-only
environment validation.
