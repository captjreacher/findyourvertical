# Personal Vertical Plan — release and external integration

## Status

**BLOCKED BY EXTERNAL DEPENDENCY — 16 September 2026.** Local implementation is
reviewable; the live paid journey requires the migration, Billing adapter and
provider gates below. Nothing was deployed. Current feature and boundary changes
are uncommitted; earlier reconstruction/report commits remain on the branch.

Implemented locally on `codex/personal-vertical-plan`. No production schema,
catalogue, secrets, accounts, payments, or application deployment changed.
Do not describe this as a live paid product until the dependencies below pass.

The first feature commit incorporates the report foundation already uncommitted
when this task began. Its historical migration file was preserved byte-for-byte.
New report blocks run through that evaluator and the full evaluation is retained
in the private generation context. Public report JSON contains only headings and
natural-language guidance. Existing published reports are not regenerated.

## Billing integration contract

Billing catalogue (already deployed to the shared database) remains pricing truth:

- Published product with code `FYV-PERSONAL-VERTICAL-PLAN`.
- A sellable catalogue plan and a published, currently effective price version
  whose `price` is `{ "kind": "poa" }`.
- FYV reads the real product, plan and price-version IDs during intake. It never
  inserts Billing catalogue rows or creates fake prices. If none resolves,
  the durable interest has `pending_configuration`, with all catalogue IDs null.
- An intake is not a paid order or grant. Operators see it at
  `/#/cockpit/plan-requests`; creators retain its reference at `/#/my/plan`.
- Historical unlinked reports can create intake. Starting a plan requires a
  provably linked assessment/report; a retake is offered when unavailable.

### Smallest missing Kernel adapter

Kernel has `GrantEntitlementIntent` / `PrepareEntitlementGrantAction` concepts but
no deployed FYV subject/grant/revoke adapter. Implement that adapter in Billing,
with an explicit mapping from canonical commercial subject to FYV profile UUID.
Product ownership/brand and the authoritative subject mapping need confirmation
in Billing; FYV must not guess either from an email, handle, report tier or quote.

The adapter calls this **service-role-only** RPC over the existing Supabase REST
boundary after an authorised commercial activation or revocation:

```json
{
  "p_creator": "<canonical FYV profile UUID from trusted subject binding>",
  "p_source_id": "<stable Billing entitlement identity>",
  "p_revision": 1,
  "p_state": "active",
  "p_expires_at": "<bounded ISO expiry>"
}
```

RPC: `fyv_project_plan_entitlement`. `revoked` is the other state. Revisions must
increase monotonically for the creator/product projection, including replacement
grant identities. Replayed or older events cannot overwrite newer state. Active
grants require future expiry; an adapter should renew its lease while Billing
still authorises access. Absent, expired and revoked projections deny all paid
RPCs. No operator UI in FYV can grant access. This is a projection of Billing
truth, not FYV-owned payment or subscription state.

## Structured domain and concurrency

- `fyv_plan_interests`: authenticated commercial intake; source report/assessment,
  POA state, real catalogue references when resolved, stable request reference.
- `fyv_plan_entitlements`: trusted expiring Billing projection.
- `fyv_personal_plans`: one evolving plan per creator, pinned source IDs, version,
  draft/complete state. A retake never silently replaces its source.
- `fyv_plan_stages`: nine keyed stages; each has three named fields, completion,
  revision and optional approved suggestion reference.
- `fyv_plan_stage_revisions`: append-only creator-approved decisions, actor,
  timestamp, revision and suggestion provenance. Fields are editable text, with
  schedule/pillar lists currently represented inside their named stage fields.
  Calendar events, multiple script records and automated publishing are future
  domain extensions; there is no opaque whole-plan document column.
- `fyv_plan_suggestions`: separate versioned, provider-labelled AI output and
  allowlisted context. It never updates assessment/scoring or approved stages.
- `fyv_plan_guide_requests`: durable reservation, capped at 20 per plan per rolling
  day, including failed provider attempts. Reservation serialises on the plan.

All new tables enable RLS and revoke public/anon/authenticated direct access.
Narrow RPCs enforce auth identity, active entitlement and plan ownership. Stage
save validates exact field names, string lengths, previous completion and expected
revision. A stale editor gets a conflict, not last-write-wins data loss. The
browser prevents stage switching while unsaved edits exist. Stage data is saved
only on explicit save; leaving the page with unsaved changes triggers a warning.

## AI configuration and limits

Reuse existing Worker-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `PERSONA_PROVIDER_BASE_URL`,
`PERSONA_PROVIDER_API_KEY`, `PERSONA_PROVIDER`, and `PERSONA_MODEL`.
Set `PLAN_AI_ENABLED=true` only after provider verification. HTTPS provider URL
and a model supporting the existing chat-completions JSON protocol are required.
Fixture mode is refused. Never expose these secrets as VITE variables.

`POST /api/plans/guide` accepts only planId, stage and one of four guide actions.
It loads context under the caller's Supabase token; clients cannot supply evidence.
Context includes relevant answer keys, selected public recommendations, a small
DNA projection and saved stage decisions. Identity, contact fields, agency notes
and internal scores are excluded. Inputs are treated as untrusted data. Output
is validated against stage fields and stored before being shown. Completion
rechecks entitlement. Creator acceptance creates an editable draft; save retains
the suggestion ID and the creator's final edited content.

Guidance is for non-explicit creator planning. Unsupported requests, provider
failure, invalid output, quota exhaustion or missing config leave saved decisions
unchanged. A real provider invocation has not been performed in this task.

Protocol reference: [OpenAI chat API](https://developers.openai.com/api/reference/resources/chat).
Access-control reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Migration and deployment order

1. Review and apply the existing report foundation
   `20260827000000_fyv_report_derivation_foundation.sql` through the approved
   migration process. Live inspection found its tables/RPC absent.
2. Review and apply the new forward migration
   `20260915041632_fyv_personal_vertical_plan.sql`.
3. Provision the actual Billing catalogue offer and trusted commercial-status and entitlement adapters.
   Until then intake is available but paid features remain closed.
4. Configure the Worker provider and explicit AI opt-in. Inspect the candidate
   Worker's secret bindings before moving traffic; the related Billing task
   documented prior deployment secret-loss issues.
5. Build/typecheck/test and deploy a candidate preview. Test a dedicated creator
   through assessment → report → intake → trusted grant → all nine stages → export.
6. Confirm another creator and anon cannot read or mutate the plan, then exercise
   grant expiry/revocation before production cutover.

No `db pull`, migration repair, historical migration edits or report rewrites.
The repository's npm deploy uploads a Worker version; it is not proof of traffic
cutover. The local database test uses PGlite/PostgreSQL and minimal prerequisite
fixtures, not a clone of production's complete schema or Supabase gateway. Run
the deployment smoke against the actual API before calling it production-ready.

## Future FMF handoff

The final plan exports source IDs, schema version, stage revisions and approved
decisions, with agency handoff state `coming_soon`. It includes no AI drafts or
private generation traces. FMF is passive Coming Soon text with no link or button.
No new FMF provisioning, billing, account creation or cross-system write exists.

## Hard commercial boundary

FYV and its Personal Vertical Plan are self-service digital products. The normal
journey requires no customer contact:

Assessment → Personal Report → Build My Personal Vertical Plan → digital POA
request and status → Billing entitlement → guided plan workspace and AI →
completed plan → Funk My Fans — Coming Soon.

| Found creator-facing path | Files / routes | Replacement |
| --- | --- | --- |
| Discuss My Full Report, Book Strategy Call, creator-services CTA, discussion popup intercepting report sharing/download | `src/components/report/ReportPage.tsx`; `/report/:slug`, both free and premium | Plan product CTA, retake, direct report actions; evidence guidance in both tiers |
| Coaching Suitability, management support and strategy discussion in report/PDF | `ReportPage.tsx`, `src/lib/scoring.ts` | Removed human-support section; digital next steps in new scoring copy; display-only historical projection also feeds PDF |
| Work with us, Book a Strategy Call, Express Interest, “will be in touch” | `src/components/creator/CreatorHome.tsx`; `/my` | Product CTA with source report context; no discussion/calendar event writes |
| Service catalogue and call-based onboarding, including duplicate legacy components | `src/components/report/CreatorServicesPage.tsx`, `CreatorOnboardingPage.tsx`, duplicate `src/pages` files, `src/components/creator/OnboardingFlow.tsx` | Redirect to `/my/plan`; legacy service/onboarding routes remain safe digital entry points |
| Explore FunkMyFans services, service activation and creator-services navigation | `src/lib/onboarding.ts`; creator sidebar/dashboard | Plan action; FMF stays upcoming; service nav removed |
| Live FMF About link and disabled agency-onboarding button | `src/components/creator/PlanJourneyCta.tsx` | Passive Funk My Fans / Coming Soon text only |
| POA request implying staff scope discussion | `PersonalVerticalPlan.tsx`, `PlanJourneyCta.tsx` | Digital request reference, current commercial state, recorded price when supplied, refreshable access state |
| Default Calendly/configurable service destinations | `src/lib/fyv-completion.ts`, `.env.example` | All public historical routing values map to plan and retake; no public config override to calls |
| Creator contact/management opportunity assessment copy; service claims in homepage/about/terms | `AssessmentWizard.tsx`, `PublicHomePage.tsx`, `AboutPage.tsx`, `TermsPage.tsx`, `index.html` | Assessment/report/self-service planning descriptions |
| Team-contact recovery and character review wording | `OnboardingAccept.tsx`, `onboarding.ts`, `CharacterPossibilities.tsx` | Digital dashboard recovery and saved internal-review state |

`src/lib/self-service-report.ts` creates a presentation-only copy for historical
report service language. It does not alter raw answers, saved reports, scoring,
or creator-authored plan decisions. Unrelated AI agents, technical management,
internal qualification fields and historical event enums are retained. The
public plan also projects report recommendations through this boundary. The AI
directive forbids human-service offers, and detected service suggestions are
rejected before persistence. Pattern checks are regression protection, not proof
that a generative model can never paraphrase an unsupported offer.

The privacy page retains a narrowly labelled **privacy-rights request address**.
It is outside the purchase/planning journey and offers no coaching, sales,
representation or product assistance. Generic terms contact was removed.
Historical agency relationships remain disclosed for existing retained data;
internal cockpit records are not advertised as FYV services.

## Digital commercial state and later fixed pricing

`fyv_plan_interests` separates request identity, source evidence, catalogue
references, `price_kind` (`poa` or `fixed`), request state, commercial revision,
optional amount in minor units/currency, and entitlement. Intake currently
resolves published POA offers only; fixed-price checkout is a future Billing
integration, not a fictitious checkout shipped in FYV.

`fyv_project_plan_commercial(request UUID, revision, status, price kind, amount,
currency)` is service-role-only. It projects `requested`, `reviewing`, `quoted`
or `closed` into the existing creator status screen. Lower/replayed revisions
cannot replace a newer update. No arbitrary operator note, staff message or
contact URL is returned. It cannot grant entitlement. A fixed-price workflow can
reuse the same request, product, status, entitlement and wizard; only catalogue
resolution and Billing checkout integration need extending.

The missing Billing adapter must bind the canonical subject, update this
commercial projection and grant/revoke access after authoritative commercial
processing. Quote acceptance/payment orchestration is not implemented here.
Do not substitute manual creator contact for that integration.

## Release verification

- Frontend and Worker typecheck: pass (`npm run typecheck`).
- Production build: pass (`npm run build`).
- Worker packaging: pass (`npx wrangler deploy --dry-run`); no deployment.
- Focused domain/database/worker/boundary/onboarding checks: **30 passed**.
- Full Node suite: **307 tests, 299 passed, 8 pre-existing failures**.
- Vitest: **38 passed**, including locked intake, edited/resumed stage content,
  progression, separate AI adoption/save and both historical report tiers.
- Browser: isolated local Edge, 1440px and 390px; free/premium report product CTA,
  report context through auth, passive FMF, legacy routes and no horizontal
  overflow/runtime errors passed. The same browser run covers email sign-in,
  POA request, simulated grant, wizard save/reload, AI draft adoption, creator
  editing and stage progression at both widths. All database and AI traffic was
  intercepted with fixtures. Screenshot inspection caught and corrected inherited black text on
  the dark product card. No authenticated live paid/agency browser run or real
  AI provider call was performed. These remain preview release checks.
- Database tests execute the actual new migration against PGlite PostgreSQL:
  ownership, anon/creator grants, digital pricing without entitlement, stale
  commercial revision, paid gating, save conflict, nine-stage completion,
  suggestion separation, quota, revocation, expiry and agency-only intake queue.

The unchanged baseline failures are two assertions in
`creator-relationship-migration.test.ts` (bytea token storage and pinned
SECURITY DEFINER declarations) and six in
`intelligence-snapshot-migration.test.ts` (old FMF handle resolution, reconcile,
event dedupe, identity payload, unresolved diagnostics and grants). Historical
migrations and those tests were not rewritten to make the suite green. The
release gate must explicitly resolve or accept this known baseline separately.

Questionnaire compatibility maps current niche option IDs and the current
passion question key without modifying original answers. Evidence rules use
only captured questions, exclude administrative answers, preserve exact report
associations, and qualify uncertain audience/content recommendations.

The nine plan stages are Direction, Audience, Positioning, Content Strategy,
Offers, Schedule, Scripts, Experiments and Final Plan. Structured fields save
with revisions, explicit completion and separate editable AI suggestions.
Final JSON export preserves source IDs and approved decisions. Cockpit adds a
read-only, agency-gated POA request queue.

Recommended release sequence: review the diff and baseline disposition; apply
the report foundation followed by the new plan migration in preview; provision
the real catalogue and trusted commercial/entitlement adapter; configure and
verify the provider; run real account purchase/status/grant/wizard/export and
revocation smoke tests; verify secret bindings; then obtain the production
release decision. No database pull, migration repair or production write was used.
