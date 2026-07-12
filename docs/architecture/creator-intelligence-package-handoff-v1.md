# Creator Intelligence Package Handoff (v1)

FYV owns the creator boundary through **assessment → interpretation → published package**.
Downstream products (e.g. FunkMyFans) consume a **published package reference via the events
outbox**, with no direct coupling to FYV internals.

```
assessment  →  report_json  →  creator_intelligence_packages  →  events outbox
(scoring)      (FYV report)     (downstream product contract)     (creator.intelligence_package.published)
```

## What FYV owns (and what it does not)

FYV owns assessment, report generation, the Creator Intelligence Package, and the published
handoff event. It does **not** own onboarding acceptance, persona operations, or anything FMF/MGRNZ.
The package is a **downstream contract**, not a replacement for the assessment report —
`report_json` is unchanged and no lifecycle/integration state is embedded in it.

## Package table — `public.creator_intelligence_packages`

A dedicated persistence layer (migration `20260712000000`). Key columns: `id`,
`creator_profile_id` (FK), `assessment_id` (FK), `report_reference` (loose string ref),
`package_reference` (unique), `assessment_reference`, `source_product` (`FYV`), `package_state`,
`version`, `package_json`, `created_at` / `published_at` / `superseded_at` / `updated_at`.

- **Lifecycle:** `published → superseded`. Publishing a new package supersedes the creator's
  current active package; superseded rows are retained (history is traceable). A partial unique
  index enforces **exactly one active published package per creator**.
- **Reference:** opaque + UUID-based, `fyv.creator.intelligence.<uuid>`, generated server-side.
  No dates or parsable business meaning in the identifier — dates live in columns.
- **Body (`package_json`):** a lean, downstream-facing projection
  (`version`, `creator_profile`, `persona`, `opportunities`, `recommended_next_steps`).
  It never carries raw assessment answers, internal scoring, workflow/routing state, or
  FMF/MGRNZ fields (enforced by `buildIntelligencePackageBody` + tests).
- **Access:** anon + PUBLIC revoked; creators read their own rows (RLS); agency has full access;
  all writes flow through the definer RPC.

## Atomic publish — `public.publish_creator_intelligence_package(...)`

A single `SECURITY DEFINER` RPC that, in one transaction:

1. validates a real assessment completion (assessment exists and belongs to the creator);
2. supersedes the creator's current active package;
3. inserts the new `published` package;
4. emits exactly one `creator.intelligence_package.published` event into `public.events`.

The event emit is **core, not best-effort**: any failure rolls the whole publish back — there is
never an orphaned package or a missing handoff event. Because it runs as owner, the public
(anon) completion path publishes through this narrow, validated surface without direct table
access and without widening the intentionally-narrow anon events policy. A partial unique index on
`payload->>'package_reference'` makes duplicate published events impossible at the ledger level.

## Event contract

```json
{
  "event_type": "creator.intelligence_package.published",
  "source_product": "FYV",
  "creator_reference": "<creator_profile_id>",
  "package_reference": "fyv.creator.intelligence.<uuid>",
  "package_id": "<package_uuid>",
  "package_state": "published"
}
```

Emitted as a `public.events` outbox row (`source_system='findyourvertical'`,
`entity_type='creator_profile'`, `delivery_status='pending'`). Downstream products consume the
event + reference only. No separate event transport is introduced.

## Completion integration

`submitAssessment()` (`src/lib/creators-api.ts`) publishes the package **after** the report is
persisted and **before** the existing `creator.assessment.completed` event:

```
submit → persist assessment → generate report → publish intelligence package → completion event
```

The existing completion event is unchanged. A hard publish failure **throws**, so a creator
assessment cannot report successful completion without its package being published. Publication is
**not** gated on consent, conflict routing, onboarding, or FMF — only a valid assessment
completion is required.

## Out of scope

No FMF/MGRNZ changes, no downstream integration/consumer, no events drain/delivery worker
(`delivery_status` is left `pending`), no cockpit/billing/auth changes, no manual approval
workflow, and no exposure of the internal report schema as the API contract.
