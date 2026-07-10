# FYV-ONBOARDING-FIRST — Creator dashboard + onboarding cases & invitations

Makes **Creator Onboarding the dominant next action** on the authenticated
`/#/my` dashboard until onboarding is complete, adds a standard creator sidebar,
and introduces a genuine, resumable onboarding-case + secure-invitation
architecture (there was none — the old `/creator-services/onboarding` page was a
static public placeholder that trusted a `?profileId=` query param).

Base: `main` (Persona 1B merged). Branch: `feat/fyv-onboarding-first-dashboard`.
No changes to assessment scoring, report generation, auth, billing, or existing
RLS policies.

## Data model (migration `20260711000000_fyv_creator_onboarding.sql`)

### `public.creator_onboarding_cases`
`id`, timestamps, `creator_profile_id` (ownership anchor, FK cascade), `status`
∈ `not_started | in_progress | submitted | review_required | complete`,
`responses` jsonb (resumable), `review_notes`, `source` (`agency|creator`),
`started_at` / `submitted_at` / `completed_at`.
**One active case per creator:** partial unique `(creator_profile_id) WHERE
status <> 'complete'` → duplicate initiation resumes; completed cases are kept as
history.

### `public.creator_onboarding_invitations`
`id`, timestamps, `creator_profile_id` (FK), `onboarding_case_id` (FK → exactly
one case), **`token_hash bytea unique`** (SHA-256; the raw token is returned once
at creation and never stored), `expires_at`, `accepted_at` (single-use),
`revoked_at`, `created_by`.

## RPC boundary (SECURITY DEFINER, ownership enforced server-side)

**Creator** (`grant authenticated`, resolved via `current_creator_profile_id()`):
`start_my_onboarding`, `get_my_onboarding_case`, `save_my_onboarding_progress`,
`submit_my_onboarding`, `redeem_onboarding_invitation`.

**Agency** (`grant authenticated`, self-check `is_agency()`):
`initiate_creator_onboarding(creator_profile_id, force_new boolean default false)`,
`create_onboarding_invitation`, `revoke_onboarding_invitation`,
`set_onboarding_review_required`, `complete_creator_onboarding`.

### Approved adjustments (implemented)
1. **Single-use redemption.** `redeem_onboarding_invitation` sets `accepted_at`
   and returns `{ ok, code?, onboarding_case_id?, status? }`. Distinct safe codes:
   `invalid`, `revoked`, `expired`, `creator_mismatch`, `already_accepted`
   (mismatch is checked before accepted). After acceptance the creator resumes via
   authenticated ownership at `/my/onboarding` — the token is never reused.
2. **`initiate_creator_onboarding(force_new)`** (agency-only): active non-complete
   case → resume; only completed cases + `force_new=false` → return latest
   completed; only completed + `force_new=true` (or none) → new `not_started`.
3. **Minimal event payload.** `onboarding.invitation.created` carries only
   `creator_profile_id`, `onboarding_case_id`, `invitation_id`, `expires_at`,
   `source` — never the raw token, URL, or hash.

## Email-first journey & routing

```
Agency (cockpit) → create_onboarding_invitation → copy secure link
  → creator opens  <origin>/#/my/onboarding/accept?token=RAW
  → CreatorGate authenticates (magic link) preserving the /my destination
  → redeem_onboarding_invitation (single-use) → /my/onboarding (resumable)
  → /my thereafter shows onboarding status + Start/Continue/Status
```

- Accept + onboarding routes live under `/my/*` (behind `CreatorGate`), so an
  unauthenticated click is sent through login and returns to the same
  destination (the redirect allow-list already permits `/my`). Identity is always
  the authenticated creator — **never** a query-string `profileId`.
- Legacy public `/creator-services/onboarding` now redirects to `/my/onboarding`;
  Creator Services' "Start Creator Onboarding" points at `/my/onboarding`.

## Email boundary

No transactional email provider exists in the repo. This phase:
- generates the secure invitation URL and provides a cockpit **Create / Copy
  onboarding link** action on the creator profile;
- emits `onboarding.invitation.created` to the existing `public.events` outbox
  (safe payload only);
- leaves a provider-neutral send seam (unimplemented) and **never claims an email
  was sent** — the UI states delivery is not configured.

**Missing delivery dependency:** a transactional email provider (and a send
implementation for the seam) must be added in a later phase to actually email the
link. No paid provider was introduced and no credentials were hard-coded.

## Dashboard

- **Sidebar** (`CreatorShell`): Home · Onboarding · My Report · Assessments ·
  Creator Services · Persona Portfolio · Account · Sign out. Desktop = persistent
  left sidebar; mobile = collapsible drawer. Existing dark Tailwind styling; no
  new UI framework.
- **Onboarding-first hero** by status: `not_started`→Start, `in_progress`→Continue,
  `submitted`→Onboarding submitted + review messaging, `review_required`→Action
  required + notes (routes back into onboarding), `complete`→"Your creator
  workspace is ready" (Persona Portfolio / Creator Services / Latest Report).
- **Progress strip:** Assessment complete → Onboarding → Persona Portfolio →
  Services ready (reflects real signals).
- Latest assessment/report summary + assessment history kept beneath the hero.
  The duplicate "Explore Creator Services" button was removed from the report
  card; report access is retained.

## Security & RLS

Both tables: RLS on; `anon` + `PUBLIC` revoked; `authenticated` = **SELECT only**
(own-row via `current_creator_profile_id()`), agency = `FOR ALL` via `is_agency()`;
`service_role` writes; all mutations go through the definer RPCs. Generation RPCs
are revoked from `anon`; `record`/creator RPCs are granted to `authenticated`
only. `scripts/verify_onboarding.sql` asserts effective privileges, RLS, policies,
the one-active constraint, the unique token hash, and FKs.

## Environment variables
None added. (Onboarding uses Supabase RPCs via the existing client; no email
provider is configured.)

## Testing (deterministic, no DB, no network, no new deps)
`npm test` (Node built-in runner, type stripping) covers: onboarding hero/progress
derivation, distinct redemption codes + redirect, accept-path, nav; the migration
security/idempotency/event-safety/`force_new` contract; and the UI/route contract.
DB-applied `verify_onboarding.sql` and live email are pre-merge steps.

## Validation matrix
new invitation · existing active case resumes · duplicate initiation resumes ·
raw token never stored · invalid/expired/revoked fail distinctly · ownership not
bypassable (creator_mismatch) · unauthenticated link preserves destination through
login · save & resume · submitted / review_required / complete render · `/my/personas`
works (merged Persona 1B) · logged-out users blocked by CreatorGate.

## Pre-merge checklist (Mike's environment)
1. `npm ci && npm run typecheck && npm run build && npm test`
2. Apply migration `20260711000000` to a **dev** Supabase project first.
3. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify_onboarding.sql`.
4. Manual smoke: cockpit → create/copy onboarding link → open as the invited
   creator → redeem → `/my/onboarding` → save/resume → submit; confirm `/my`
   hero states and mobile nav; confirm latest report remains accessible.
5. Draft PR only — no merge, no deploy, no remote DB apply.
