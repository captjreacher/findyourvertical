# Creator Intelligence Snapshot Handoff (v1)

FYV converts a completed assessment into a published intelligence snapshot that
downstream products (FunkMyFans) consume through an integration event. FYV owns
the source-of-truth; FMF consumption is a **separate** downstream task.

```
creator_assessment → creator_report → creator_intelligence_snapshot
                                            → creator_intelligence_opportunity_projections
                                            → creator.intelligence_package.published (event)
```

## Ownership boundary
**FYV owns:** generating snapshots + opportunity projections, publishing the
event, and the source-of-truth audit trail — all in the FYV database
(`mgrnz-web`). **FMF owns (future):** consuming `creator.intelligence_package.published`,
resolving the creator via `external_identity` (`platform_provider` + `platform_account_id`),
and advancing its onboarding lifecycle. FYV does **not** write FMF onboarding
fields, create FMF records, add FMF tables/functions, or couple to FMF internals.

## Existing schema (not created here)
`creator_intelligence_snapshots` (immutable except `superseded_at`; `UNIQUE(creator_id, source_package_reference)`;
`creator_id` → `of_creators`) and `creator_intelligence_opportunity_projections`
(`UNIQUE(intelligence_snapshot_id, source_opportunity_reference)`; feeds `v_opportunity_list`)
already exist in `mgrnz-web`. This change adds **no tables** and reuses them.

## Identity resolution
`creator_profiles.onlyfans_handle` → `of_creators.username`. If no shadow creator
exists, publishing **fails safely** (no creator is created) and records a
`creator.intelligence_package.handoff_unresolved` diagnostic event. Assessment
completion is never blocked.

## Write path (RLS-aware)
RLS denies anon/authenticated direct inserts on the intelligence tables, so writes
go through the `SECURITY DEFINER` RPC `fyv_publish_intelligence_snapshot`
(owner bypasses RLS). Business logic (intelligence content derived from the report)
lives in the service layer (`src/lib/intelligence-publisher.ts` +
`src/lib/intelligence-snapshot.ts`); the RPC is the narrow, privileged boundary:
validate → resolve `of_creators` → reconcile snapshot (`ON CONFLICT DO NOTHING`) →
insert projections (`ON CONFLICT DO NOTHING`) → emit event (deduped). The
completion flow calls the publisher **non-fatally** (an unresolved mapping or a
not-yet-deployed RPC logs a diagnostic and returns). The service_role backfill
(`scripts/backfill_intelligence_snapshots.ts`) uses the same RPC.

## Event contract
```json
{
  "event_type": "creator.intelligence_package.published",
  "source_product": "FYV",
  "creator_reference": "fyv:<creator_profiles.id>",
  "external_identity": {
    "platform_provider": "betterfans",
    "platform_account_id": "517509783",
    "reference": "betterfans:517509783"
  },
  "package_reference": "fyv/<slug>/intelligence-package/<version>",
  "package_id": "<snapshot.id>",
  "package_state": "published",
  "contract_version": "creator-intelligence-package-v1",
  "intelligence_version": "1.0.0"
}
```
`creator_reference` is namespaced (`fyv:`) — never a bare UUID, since multiple
systems own creator ids. FMF resolves its own creator via `external_identity`
(matches FMF's `of_creators.betterfans_account_id` unique key). Appended to the
`public.events` outbox with a deterministic dedupe key in `correlation_id` (=
`package_reference`), backed by a partial unique index — so publishing is
idempotent and rerunning a backfill never duplicates the event.

## MoonSiren (anchor creator) — reconciled, not re-provisioned
MoonSiren (`of_creators.id ba8284f7…` in FYV) already had the seed snapshot
`fyv/moonsiren/intelligence-package/2026-07-05` + 3 projections and
`onboarding_status='ready'`. The backfill **reused** them and emitted only the
previously-missing published event (verified idempotent). No new snapshot, no
projection changes, no lifecycle mutation.

## Out of scope
No FMF ingestion/consumer, no FMF writes, no onboarding-status changes, no new
tables, no coupling to FMF database internals.
