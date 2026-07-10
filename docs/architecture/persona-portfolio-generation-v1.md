# FYV-PERSONA-1B — 3-2-1 Persona Portfolio Generation

Turns a creator's **locked PERSONA-1A archetype snapshot + variation selections**
into a balanced **six-persona draft portfolio** (3 primary / 2 secondary / 1 third),
displayed read-only in a persona workspace. This sprint stops at generated drafts.

> Non-goals (later sprints): editing, name/age confirmation, recalibration,
> per-persona regeneration, photo upload, image generation, activation, public
> pages, platform deployments (OnlyFans/Instagram/TikTok/X), content planning.

## Flow

```
Assessment → Locked Top-3 Snapshot → Variation Selections
        → POST /api/personas/generate (Worker)
        → request RPC → provider adapter → validate → complete/fail RPC
        → /my/personas workspace (six draft cards) → /my/personas/:id detail
```

## Entity separation

`Creator → ArchetypeSnapshot → VariationSelection → PortfolioGeneration → Persona`.
A **persona is the canonical creative identity**; deployments (where/how it is
presented) are a *future* entity and are deliberately not modelled here. No
persona field references any social platform, username, or channel.

## Data model (migration `20260710010000`)

### `public.creator_persona_generations`
One generation event per active snapshot. Columns: `id`, `created_at`,
`updated_at`, `creator_profile_id` (FK→creator_profiles, cascade), `snapshot_id`
(FK→creator_archetype_snapshots, cascade), `status`
(`pending|generating|completed|failed`), `lifecycle_status` (`active|superseded`),
`generation_method` (`ai_provider|fixture`), `provider`, `model`,
`prompt_version`, `schema_version`, `request_digest`, `input_snapshot` (jsonb,
immutable provenance), `output_snapshot` (jsonb, raw validated model output),
`attempts`, `failure_code`, `failure_reason`, `completed_at`.

**Idempotency:** partial unique index `creator_persona_generations_one_active`
on `(snapshot_id) WHERE lifecycle_status = 'active'` → at most one active
generation per snapshot. A stable `request_digest` (snapshot + sorted source
variation ids + prompt/schema version) makes repeated requests safe. Failed
generations are **retried in place** (reset to `generating`).

**`input_snapshot` preserves** locked primary/secondary/third archetypes, the
selected variation ids + names + descriptions, the chosen 3-2-1 `source_set`,
the (non-sensitive) creator context used, the generation rules + directive, and
prompt/schema versions — enough to audit/reproduce without live joins.

### `public.creator_personas`
Six structured draft personas. Columns: `id`, timestamps,
`creator_profile_id`, `generation_id` (FK, cascade), `snapshot_id`,
`source_variation_id` (FK→archetype_variations, **RESTRICT** — creative lineage
survives), `source_archetype`, `archetype_rank`, `portfolio_position` (1..6),
explicit display columns `display_name` / `persona_title` / `one_line_premise`,
`profile` (jsonb — variable-length creative detail), `status`
(`draft|archived|…` seam), `sort_order`. Unique `(generation_id,
source_variation_id)` = one persona per selected source; unique
`(generation_id, portfolio_position)`.

`profile` jsonb fields: `apparent_age_or_life_stage`, `backstory`,
`current_situation`, `personality_traits[]`, `what_she_wants`,
`audience_relationship`, `visual_world`, `typical_locations[]`,
`wardrobe_direction`, `recurring_story_hooks[]`, `content_boundaries[]`,
`story_progression`.

## Transaction-safe boundary (service-role RPCs, SECURITY DEFINER)

- **`request_creator_persona_generation(...)`** — validates ownership + active
  snapshot + 3-2-1 completeness; creates or reuses the single active generation
  (idempotent); returns `{ generation_id, status, started, already_completed }`.
- **`complete_creator_persona_generation(...)`** — inserts **all six** personas
  and marks the generation `completed` **in one transaction**; rejects unless
  currently `generating` (guards double-runs).
- **`fail_creator_persona_generation(...)`** — records a sanitised
  `failure_code`/`failure_reason`, **deletes any persona rows** for the run
  (guarantees zero on failure), keeps the row retryable.
- **`record_persona_portfolio_viewed(uuid)`** — the only persona RPC a creator's
  own JWT may call; emits a `viewed` audit event for their own generation.

Audit events reuse the existing `public.events` ledger via a best-effort
emitter (`fyv_emit_persona_event`) wrapped in an exception-swallowing block, so
ledger drift can never roll back a successful generation. Events carry
identifiers + summaries only (`persona.generation.requested|completed|failed`,
`persona.portfolio.viewed`) — never the persona payload.

## Worker boundary (`worker/index.ts`)

Single endpoint **`POST /api/personas/generate`** (wrangler `run_worker_first`
scopes the Worker to `/api/*`; all other paths serve the SPA via the `ASSETS`
binding). Steps: validate the Supabase bearer token server-side (`/auth/v1/user`)
→ resolve the linked creator (service role) → load the active locked snapshot +
selected variations (never recompute from mutable assessment state) → enforce
the exact deterministic 3-2-1 source set → `request` RPC → provider adapter →
**validate output before any persistence** → `complete` (atomic) or `fail`
(sanitised, zero rows). Request body: `{ "snapshotId": "<uuid>" }`.
Responses: `200 completed`, `200 reused`, `202 in-progress`, `400/401/403/404/409`,
`422 invalid`, `502 provider`. Service-role + provider keys are Worker secrets
only — never in the browser bundle.

## Provider adapter (`worker/provider.ts`)

Model provider is behind an interface. `PERSONA_PROVIDER=openai` calls any
OpenAI-compatible `/chat/completions` endpoint (JSON object response) with a
professional, non-explicit, "six facets of the same creator" prompt.
`PERSONA_PROVIDER=fixture` produces a deterministic offline portfolio for
dev/tests and **fails closed when `PERSONA_APP_ENV=production`**. Output is
strictly validated (`src/lib/persona-portfolio.ts#validatePersonaPortfolio`):
exactly six, one per source variation, 3-2-1 weighting, all required fields —
before completion runs.

### Prompt / schema versioning
`PERSONA_PROMPT_VERSION = "fyv-persona-portfolio-v1"`,
`PERSONA_SCHEMA_VERSION = "1"` (both persisted on every generation). Bump when
the prompt or output schema changes; the digest incorporates them so a version
change starts a fresh generation.

## Security & RLS summary

- Both tables: RLS enabled; **`anon` and `PUBLIC` explicitly revoked**.
- `authenticated`: **SELECT only**, constrained by own-row RLS
  (`creator_profile_id = current_creator_profile_id()`). No direct writes.
- Agency: full access via `is_agency()`.
- `service_role`: table writes + `EXECUTE` on the three generation RPCs
  (revoked from `anon` + `authenticated`). `record_persona_portfolio_viewed` is
  granted to `authenticated` only.
- Generation is initiated only through the Worker; creators cannot insert
  persona/generation rows directly.
- `scripts/verify_persona_1b.sql` asserts **effective** privileges
  (`has_table_privilege` / `has_function_privilege`), RLS, policies, idempotency
  constraints, and FKs — closing the PERSONA-1A grant-ambiguity gap.

## Environment variables (Worker secrets — never `VITE_`)

| Name | Purpose |
|------|---------|
| `SUPABASE_URL` | Supabase project URL (server copy of the `VITE_` value) |
| `SUPABASE_ANON_KEY` | Validate the caller's bearer token via `/auth/v1/user` |
| `SUPABASE_SERVICE_ROLE_KEY` | Call the SECURITY DEFINER generation RPCs (secret) |
| `PERSONA_PROVIDER` | `openai` (default) or `fixture` |
| `PERSONA_PROVIDER_BASE_URL` | OpenAI-compatible base URL (e.g. `https://api.openai.com/v1`) |
| `PERSONA_PROVIDER_API_KEY` | Provider key (secret) |
| `PERSONA_MODEL` | Model id |
| `PERSONA_APP_ENV` | `production` makes fixture mode fail closed |

Set via `wrangler secret put <NAME>` (prod) or a git-ignored `.dev.vars`
(local `wrangler dev`). See `.env.example`.

## Testing (deterministic, no live AI, no new deps)

`npm test` runs Node's built-in runner over `tests/*.test.ts` via type
stripping (Node ≥ 22.6). Coverage: 3-2-1 selection (exact + over-selected +
incomplete-blocked + deterministic), output validation (count / weighting /
duplicate / source-mismatch / missing-field / malformed), idempotency digest,
workspace grouping + field completeness, the Worker boundary end-to-end with a
fake `fetch` (happy / 401 / 403 / 404 / 409 / 422 / 202 / reused / invalid-output→fail
/ provider-failure→fail / race), the migration security contract, and the
UI/route contract. A deterministic fixture provider stands in for the model.

## Compatibility notes

- `supabase` client is untyped → new tables need no `database.types.ts` regen.
- Worker relative imports use explicit `.ts` extensions
  (`allowImportingTsExtensions`), which vite/wrangler/esbuild and Node all accept.
- `tsconfig` `include` stays `["src"]`; the Worker is bundled by wrangler.
- Local `vite dev` does not serve `/api/*`; use `wrangler dev` to exercise the
  endpoint locally. Production serves both from the same Worker.

## Pre-merge checklist (Mike's environment)

1. `npm ci && npm run typecheck && npm run build && npm test`
2. Apply migration `20260710010000` to a **dev** Supabase project first.
3. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_persona_1b.sql`
   (expect all `CHECK … PASS`).
4. Set Worker secrets; smoke-test `POST /api/personas/generate` with a real
   creator token and a live provider (`PERSONA_PROVIDER=openai`).
5. Manual UI smoke: complete `/my/characters` → **Create My Character
   Portfolio** → `/my/personas` shows six draft cards (3-2-1) → open a card.
6. Draft PR only — do not merge, deploy, or apply migrations to remote.
