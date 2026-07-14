# Public Assessment Invite — v1 (FYV-ONBOARD-2)

**Status:** delivered as draft. Approved 2026-07-14. Not yet merged, not yet deployed.

**Migration:** `20260714010000_fyv_public_assessment_invite.sql`
**Feature branch:** `feat/fyv-onboard-2-public-assessment-invite`

---

## Purpose

Replace the dead-end pending-approval flow on the public "Get Your Assessment Invite" form (AuthGate) with an instant-issue path. Visitors submit name + email (+ optional OnlyFans handle) and immediately receive a working assessment invite URL. No approval queue. No manual step. No new invitation mechanism.

The public form becomes another **producer** of `creator_assessment_links` — the same table the agency already writes to via the Assessment Templates "New Assessment Invite" modal. Every downstream consumer (the wizard's `?ref=<code>` gate, the cockpit invite listings, the `submit_creator_assessment` RPC) treats agency-issued and self-issued invites identically.

## Boundary

```
Public assessment request           ← this sprint
  → creator_assessment_links        ← reused (System A)
  → assessment                      ← unchanged
  → assessment complete             ← unchanged
  → agency review                   ← unchanged
  → creator relationship/onboarding ← PR#17 (unchanged, runs post-review)
```

FYV-ONBOARD-2 stops at the first arrow. Everything after "assessment complete" — the FYV self-onboarding questionnaire (PR#17 `creator_onboarding_cases` + `creator_onboarding_invitations`), the FYV↔FMF relationship access (PR#21 `creator_relationships` + `creator_invitations`), the agency cockpit invitation surfaces — is untouched.

## What ships

### Migration

`20260714010000_fyv_public_assessment_invite.sql` adds two things and nothing else:

1. `public.create_public_assessment_invite(text, text, text, text) → jsonb` — SECURITY DEFINER RPC.
2. `events_assessment_invite_self_correlation_uidx` — partial unique index on `public.events(correlation_id)` scoped to `event_type = 'creator.assessment_invite.self_requested'`.

No new table. No policy change. No column added to any existing table. No new privilege on any existing table.

### RPC contract

**Signature:** `create_public_assessment_invite(p_name text, p_email text, p_onlyfans_handle text default null, p_template_slug text default null) returns jsonb`

**Security posture:**
- `SECURITY DEFINER` with fixed `SET search_path = public, pg_temp`.
- Fully qualified references to all touched objects (`public.creator_assessment_templates`, `public.creator_profiles`, `public.creator_assessment_links`, `public.events`).
- `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO anon, authenticated`.
- Anon reaches the underlying inserts only through the RPC. No new table-level anon privileges are granted. RLS on `creator_assessment_links` and `creator_profiles` is unchanged.

**Steps (in order):**

1. **Input validation.** Trim + shape-check name (required, ≤ 200 chars), email (required, ≤ 320 chars, regex-shaped), OnlyFans handle (optional, ≤ 200 chars, leading `@` stripped). Bad input raises with `SQLSTATE 22023` — no write of any kind.
2. **Template resolution.** If `p_template_slug` is provided and matches an active public template, use it. Otherwise pick the default active public template, then the earliest active public template. If none exists, raise `SQLSTATE P0001`.
3. **Creator profile upsert (by `lower(email)`).** Fresh visitors insert with `status = 'Invited'` (matches `valid_creator_workflow_status` CHECK). Existing profiles only backfill missing name/handle; nothing operator-set is overwritten.
4. **Dedupe / retake.** If a non-expired, non-terminal (`status NOT IN ('Revoked','Expired','Completed')`) link exists for the same `(creator_profile_id, template_id)` created within the last 30 minutes, that link is **reused** — no new `invite_code`. Otherwise a fresh 32-hex-char code is issued (identical shape to agency-issued codes) with a 90-day expiry and `status = 'Created'`.
5. **Event emit.** Insert a single `creator.assessment_invite.self_requested` event with `correlation_id = 'fyv/assessment-invite/self/<profile>/<template>/<yyyy-mm-dd>'`. The partial unique index guarantees at most one such event per profile+template per day; concurrent duplicates are silently deduped via `WHERE NOT EXISTS`. The plaintext `invite_code` is **never** in the payload — only the link UUID.
6. **Return.** JSON with `invite_link_id`, `invite_code`, `template_id`, `template_slug`, `creator_profile_id`, `creator_email`, `creator_name`, `expires_at`, `reused` boolean, `source: 'public'`.

### Contract module — `src/lib/public-assessment-invite.ts`

Pure isomorphic. Depends on nothing. Exports:

- `PUBLIC_ASSESSMENT_ORIGIN = 'https://findyourvertical.online'` (byte-identical to `AssessmentTemplates.PUBLIC_ASSESSMENT_ORIGIN`, so agency-issued and self-issued URLs stay in the same shape).
- `buildPublicAssessmentInviteUrl({ templateSlug, inviteCode, creatorEmail?, origin? })` — deterministic URL construction (`/a/<slug>?ref=<code>&email=<email>`).
- `validatePublicAssessmentInviteInput(input)` — pure validator, mirrors the server-side check so bad input never reaches the network.
- `successCopyForDelivery(delivery)` — selects the exact spec copy for `delivered` vs `manual`/`error` branches. Locked here so UI + tests agree.

### API helper — `src/lib/creators-api.ts`

`createPublicAssessmentInvite(input)` calls the RPC via `publicSupabase` (anon client) and returns the typed `PublicAssessmentInviteResult`. Runs the pure validator first.

The legacy `createCreatorInviteRequest` is retained (compile-time safety for any historic reference) but marked `@deprecated` inline. It no longer participates in the public path.

### Email — best-effort, never blocking

Two files matching the PR#17 pattern:

- `src/lib/email/assessmentInvitationEmail.ts` — `buildAssessmentInvitationEmail({ to, firstName, assessmentUrl })` produces subject `"Your assessment invite is ready"` and responsive HTML + plain-text bodies using the FYV brand tokens exported by `onboardingInvitationEmail.ts`. Recipient name is HTML-escaped.
- `src/lib/email/deliverAssessmentInvitation.ts` — wraps `resolveEmailProvider().send()` in try/catch, normalising provider throws into `{ delivered: false, mode: 'manual', reason: 'send_failed: <msg>' }`. Callers always get `linkGenerated: true` and can always show the URL.

The default provider is still `ManualNoopEmailProvider` — nothing sends silently, delivery is reported as `manual`, and the UI surfaces the "Email delivery is not configured. Use the secure invitation link below." fallback with the URL box.

To wire a real provider later, slot its implementation into `resolveEmailProvider()` behind a server-side configuration check (Cloudflare Worker route + secret). Never in the browser. Never hard-coded.

### UI — `src/components/cockpit/AuthGate.tsx`

The landing page layout is unchanged. Only the section under **Get Your Assessment Invite** changes:

1. **Submit** calls `createPublicAssessmentInvite`, assembles the URL via `buildPublicAssessmentInviteUrl`, then attempts email delivery (never fatal).
2. **Success state** (per spec):
   - Heading: **Your assessment invite is ready.**
   - Body when email delivered: *We've emailed your secure sign-in link. You can begin your assessment immediately.*
   - Body when manual: *Email delivery is not configured. Use the secure invitation link below.* + `Email not sent · manual delivery` badge.
   - Secure URL rendered verbatim in a monospaced box.
   - **Start Assessment** button — anchor to the URL (opens the wizard directly).
   - **Copy Invite Link** button — clipboard API with legacy `execCommand` fallback; shows `Copied ✓` for 2.5s.
   - When the RPC returns `reused: true`, an inline hint explains the dedupe.
   - "Request another invite" text button to reset the card.

Failure branch: inline `role="alert"` error message under the form; visitor can retry.

## What is explicitly NOT touched

- **AssessmentTemplates.tsx** (agency "New Assessment Invite" modal) — unchanged.
- **OnboardingInviteAction.tsx** (PR#17 cockpit onboarding invite) — unchanged.
- **CreatorAccessInviteAction.tsx / CreatorRelationships console invite** (PR#21/#22 FMF access) — unchanged.
- **CreatorGate**, magic-link auth, `INVITE_ONLY_MODE`, `getAssessmentInviteLink` — unchanged.
- **RLS** on every existing table — unchanged. No new anon policy anywhere.
- **`creator_invite_requests`** table — kept for compile-time safety; no new writes come from the public path.

## Testing

Three node `--test` suites, all pure (no DB, no runtime):

- `tests/public-assessment-invite.test.ts` — URL builder, validator, success-copy selector, RPC-result-shape lock.
- `tests/public-assessment-invite-email.test.ts` — email builder + delivery boundary + provider default + throw normalisation.
- `tests/public-assessment-invite-migration.test.ts` — static contract checks over the migration SQL, contract module, API helper, and AuthGate wiring. Locks: transaction wrapping; additive-only (no drop/alter/RLS change); SECURITY DEFINER + fixed search_path; PUBLIC revoked; anon+authenticated EXECUTE granted; no plaintext code in event payload; scoped partial unique index; UI heading + button labels + fallback copy + deprecated marker on the legacy helper.

DB-applied verification: `scripts/verify_public_assessment_invite.sql` runs a full trace in a single transaction and rolls back at the end. It confirms the RPC grants, the fresh/reused branches, the profile upsert, the events-outbox emit (single row per day, no plaintext code), and the input-validation SQLSTATE.

## Deploy gate (for Mike)

1. Registry-enabled env: `npm ci && npm run typecheck && npm run build && npm test`.
2. Apply migration `20260714010000` via the normal deployment pipeline (do NOT apply out-of-band via MCP — matches the standing project posture).
3. `psql -v ON_ERROR_STOP=1 -f scripts/verify_public_assessment_invite.sql` against a dev DB after the pipeline reports the migration live.
4. Smoke test on production: hit the landing page, submit a test row, confirm the invite URL opens the wizard and the assessment can be completed end-to-end. Confirm agency invite flows are unchanged (AssessmentTemplates, OnboardingInviteAction, CreatorAccessInviteAction, CreatorRelationships).
5. Optional (future phase): wire a real transactional email provider into `resolveEmailProvider()` behind a Worker route + secret.

## Sandbox environment limits

- `npm ci` cannot run in the authoring sandbox (`registry.npmjs.org` returns 403 by default). `tsc`/`vite` are therefore not installed; `npm run typecheck` and `npm run build` are the deploy-gate step for Mike's env. A `RequestNetworkAccess(registry.npmjs.org)` grant would unblock those locally.
- No Postgres binary is available in the sandbox; `verify_public_assessment_invite.sql` runs at Mike's dev DB, not here.
- All contract/lock tests can (and do) run locally without dependencies via `node --experimental-strip-types --test`.
