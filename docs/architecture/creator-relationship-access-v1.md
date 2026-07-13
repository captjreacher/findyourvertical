# FYV Creator Relationship & Access Layer (v1)

FYV → FunkMyFans (FMF) creator identity relationship + access lifecycle.

## Boundary

| Concern | Owner |
| --- | --- |
| Assessment, creator intelligence generation, **creator identity relationship, creator access onboarding** | **FYV** |
| Creator operations, opportunities, journeys, playbooks, automation execution | **FMF** |

This layer is **purely additive**. It does not touch or depend on the intelligence-package
handoff (`fyv_publish_intelligence_snapshot`, `creator_intelligence_snapshots`,
`creator_intelligence_opportunity_projections`, `of_creators`), assessment/scoring/report/persona
generation, the onboarding-case tables, or `creator_profiles.status` (the sales-pipeline axis).
FMF opportunity/journey/automation logic is **not** duplicated here.

## Identity model — canonical ids only

The relationship maps a **FYV creator identity ↔ FMF creator id** using canonical UUIDs. BetterFans
usernames, handles, and aliases are **never** used as the mapping key.

| Side | Canonical id | Example (MoonSiren) |
| --- | --- | --- |
| FYV | `creator_profiles.id` | `16bab1fb-df50-4101-9e2c-749ab7ed3d5e` |
| FMF | `of_creators.id` (funk-my-brand) | `20fdee3c-6998-4e8a-8611-04ab88949301` |

`fmf_creator_id` is stored as an opaque UUID with **no** foreign key — it lives in a separate
database and FMF owns its resolution.

## Data model

### `public.creator_relationships`
One FYV↔FMF mapping per creator, carrying the access `relationship_state`.

`id, created_at, updated_at, fyv_creator_id (FK creator_profiles ON DELETE CASCADE), fmf_creator_id (uuid), relationship_state`

- `UNIQUE(fyv_creator_id)` and `UNIQUE(fmf_creator_id)` → strict 1:1.
- `relationship_state ∈ {draft, invited, accepted, active}` (default `draft`).
- RLS: anon/PUBLIC revoked; agency `FOR ALL` (`is_agency()`); creator read-only own row
  (`fyv_creator_id = current_creator_profile_id()`); service_role writes.

### `public.creator_invitations`
Single-use, **hashed** magic-link tokens resolving to one relationship.

`id, created_at, updated_at, relationship_id (FK ON DELETE CASCADE), token_hash (bytea, SHA-256), email, status, expires_at, accepted_at, revoked_at, created_by`

- Raw token = `encode(gen_random_bytes(32),'hex')`, **returned once** at creation, never stored.
- `status ∈ {pending, accepted, revoked, expired}`; partial unique: one `pending` per relationship.
- RLS: anon/PUBLIC revoked; agency `FOR ALL`; **no creator SELECT** (redemption is via the
  service-role RPC using the raw token); service_role writes.

## Access lifecycle

```
draft ──create_creator_access_invitation──▶ invited ──accept_creator_access_invitation──▶ accepted ──activate_creator_relationship──▶ active
```

The lifecycle is strictly linear. `creator_profiles.status` (New/Invited/.../Client) is a separate
sales-pipeline axis and is **not** modified by this layer.

## RPCs (SECURITY DEFINER, `search_path = public, pg_temp`)

| RPC | Caller | Effect |
| --- | --- | --- |
| `create_creator_access_invitation(p_fyv_creator_id, p_fmf_creator_id, p_email?, p_expires_in?)` | agency (`is_agency()`) | create/reuse relationship, `draft → invited`, issue hashed token, emit `creator_invited`. Returns raw token + `accept_path` once. |
| `validate_creator_access_invitation(p_token)` | service_role | validate token **without** consuming (returns email + state or a distinct code). |
| `accept_creator_access_invitation(p_token, p_auth_user_id)` | service_role | single-use consume, associate `creator_profiles.auth_user_id`, `invited → accepted`, emit `creator_accepted`. |
| `activate_creator_relationship(p_fyv_creator_id?)` | creator (self, null id) or agency (explicit id) | `accepted → active`, emit `creator_activated`. Idempotent. |
| `fyv_emit_creator_relationship_event(...)` | internal (service_role) | append-only, deduped event emission. |

Machine-readable failure codes: `invalid`, `revoked`, `expired`, `already_accepted`,
`identity_conflict`, `no_relationship`, `not_accepted`.

## HTTP API (Cloudflare Worker, `/api/creators/*`)

| Method + path | Auth | Maps to |
| --- | --- | --- |
| `POST /api/creators/{creator_id}/invite` | agency JWT (forwarded) | `create_creator_access_invitation`. Body `{ fmfCreatorId, email? }`. Returns `{ acceptUrl, relationshipState, ... }`. |
| `GET  /api/creators/invite/accept?token=` | public | `validate_creator_access_invitation` (no consume). |
| `POST /api/creators/invite/accept` | public | validate → provision/resolve Supabase auth user (GoTrue admin, service role) → `accept_creator_access_invitation` → return a **magic link** that signs the creator in and lands on `/my`. Body `{ token }`. |
| `POST /api/creators/{creator_id}/activate` | creator (`me`) or agency JWT | `activate_creator_relationship`. |

Service-role and anon keys live only as Worker secrets. Agency/creator-scoped calls forward the
caller's Supabase JWT so the RPC's own `is_agency()` / `current_creator_profile_id()` gating applies.
The public accept flow is the only service-role path (it must run before the creator has a session).

## Integration event contract (consumed by FMF)

Emitted into the existing `public.events` outbox; **asynchronous, downstream** consumption by FMF
(not a synchronous call). Append-only and deduped on `correlation_id`.

**Event types:** `creator_invited`, `creator_accepted`, `creator_activated`.

**Payload (flat):**
```json
{
  "event_type": "creator_invited",
  "creator_id": "16bab1fb-df50-4101-9e2c-749ab7ed3d5e",
  "creator_reference": "fyv:16bab1fb-df50-4101-9e2c-749ab7ed3d5e",
  "fmf_creator_id": "20fdee3c-6998-4e8a-8611-04ab88949301",
  "relationship_id": "…",
  "source_product": "FYV",
  "relationship_state": "invited",
  "timestamp": "2026-07-13T01:23:45Z"
}
```

- `creator_id` = canonical FYV `creator_profiles.id`; `creator_reference` = `fyv:<id>` (matches the
  intelligence-package event convention); `fmf_creator_id` = canonical FMF `of_creators.id`.
- `relationship_state` mirrors the post-transition state (`invited`/`accepted`/`active`).
- **Dedupe:** `correlation_id = fyv/creator-relationship/<relationship_id>/<state>` via a partial
  unique index scoped to the three event types. Re-running a transition is a no-op.
- Outbox columns: `source_system='findyourvertical'`, `entity_type='creator_relationship'`,
  `entity_id=<relationship_id>`, `entity_ref='creator_profile:<fyv_creator_id>'`, `status='pending'`.

> **Event-type naming.** The `events.event_type` column and `payload.event_type` both use the literal
> contract names (`creator_invited` / `creator_accepted` / `creator_activated`) for exact FMF-contract
> fidelity, rather than the dotted house style used elsewhere. This is intentional and documented.

## MoonSiren seed

`20260714000100_seed_moonsiren_creator_relationship.sql` inserts the canonical mapping in state
`draft` (guarded: only if the FYV profile exists; `ON CONFLICT DO NOTHING`). The agency then issues an
invite, moving MoonSiren `draft → invited`, and acceptance/activation complete the lifecycle — with no
dependency on BetterFans usernames.

## Deploy / verify

Migrations are **not** applied out-of-band to production (`mgrnz-web`). Apply via the normal pipeline,
then:

1. `psql -v ON_ERROR_STOP=1 -f scripts/verify_creator_relationship_access.sql` (expect all `CHECK … PASS`).
2. Set Worker secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `APP_BASE_URL`.
3. Smoke: cockpit → creator → **FYV Access Invitation** (enter FMF id `20fdee3c-…`) → copy link →
   open `/accept-invite?token=…` → accept → sign in → `/my` → activate. Confirm three events land on
   `public.events` with the payload above and correct `correlation_id`s.
```
