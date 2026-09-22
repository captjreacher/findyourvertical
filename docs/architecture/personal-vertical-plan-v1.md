# Personal Vertical Plan v1

## Reconstruction — 15 September 2026, before implementation

React 19/Vite/HashRouter SPA; Cloudflare Worker fronts `/api/*`; Supabase project
`jqfodlzcsgfocyuawzyx` shares ecosystem tables. README's BrowserRouter description
is stale. Canonical FYV origin is https://findyourvertical.online (source constant,
legal pages, and live HTTP/browser inspection). FMF uses funkmyfans.com; its
creator cockpit is https://cockpit.funkmyfans.com.

Public assessment requires an invitation, email check and dynamic template.
The production default is `junev1`, not the older `default` seed. Questions have
stable IDs, question keys, response keys, options/config, template items and branch
rules. Browser session storage retains progress per invite. Completion inserts a
new assessment with raw answers and a question snapshot, computes legacy scores,
extracts evidence/traits/archetype fits, creates DNA, projects a report, updates
latest pointers and publishes completion/intelligence events. Reports are public
by slug. Existing report tiers are presentation tiers, not paid entitlements.

Local uncommitted report work adds template/version/section/block/source tables,
deterministic evaluation, traces and digest-bearing runs. Public completion uses
`fyv_persist_legacy_creator_report`; internal editors use template previews. Live
database inspection confirms that this foundation migration is NOT applied and
live reports have no assessment FK yet. Release the prerequisite before its code.

CreatorGate resolves auth identity to an owned profile. CreatorShell already
contains home/history/account/onboarding/persona workspaces. Existing onboarding
is service/persona intake, not a paid plan. Retake RPC derives identity from auth,
creates a fresh invitation and preserves prior assessments. History currently
guesses report associations by nearest date, which can mislabel a report.

Billing Kernel is available at `C:/DEV_LOCAL/BILLING-KERNEL`. Its catalogue owns
products, sellable plans and immutable published price versions (`{kind:'poa'}`).
Live catalogue has no FYV/creator/vertical product. Kernel execution has entitlement
intents, but no deployed creator entitlement read/grant contract. POA cannot be
invoiced as a numeric price. No FYV checkout exists. Existing FMF relationship,
intelligence publication and persona functionality must remain compatible.

Baseline: typecheck passes; npm test has pre-existing intelligence snapshot
migration failures. Docker Linux daemon is unavailable. No production writes made.

## Evidence map

| Existing question / response | Current effect | Claim quality / next use |
|---|---|---|
| comfort_level | DNA, monetisation, charisma | Self-reported camera comfort; useful for format experiments, not sales ability |
| persona_occupation | archetype and fallback verticals | Stated preference, not validated performance |
| niche_interests | fitness/roleplay/fashion verticals | Strong direction evidence; current snake_case values miss legacy labels |
| strengths | keyword-derived traits/scores | Self-report; length is not proof of competence |
| audience_target | pricing and monetisation | Desired audience, not evidence of purchasing demand |
| content_comfort → nudity_level | boundaries/DNA | Current values differ from historical enums; retain exact boundary evidence |
| full_nude_expansion / existing nudity | current/future boundaries | Related but distinct; do not merge or infer consent |
| desired_fantasy_image / perceived image | authenticity/positioning | Aspirational vs current identity; retain distinction |
| fantasy_keywords | archetype/text heuristics | Weak evidence of commercial strategy |
| creator_motivation / satisfaction | DNA | Motivation, not demonstrated consistency |
| creator_weaknesses / format gaps | growth constraints | Useful creator-described obstacles, no measured performance |
| passion question | generic evidence only under current key | Alias to existing passion_topic for scoring |
| active channels / social platforms | generic evidence | Direct planning context for channel selection |
| financial satisfaction scale | generic evidence | Satisfaction is not revenue or conversion data |
| gamer / kink detail | generic evidence | Optional context, avoid unsupported automatic recommendations |
| alternatives / aspirations / desired improvements | text heuristics | Planning prompts; not proof of future outcomes |
| questionnaire goals / situation | generic evidence | Intent and stage context, no outcome guarantees |
| name/email/consent | generic evidence could boost confidence | Exclude administrative data from intelligence confidence |

Missing: measured audience response, sustainable time capacity, selling preference.
Collect capacity and selling preference in the paid workspace initially; do not
inflate the assessment. Do not assert regular production or sales comfort from
camera confidence. Keep raw answers and question IDs unchanged. No new questions.

## Implementation slices

1. Preserve this reconstruction and evidence map.
2. Normalize known current answer aliases for scoring only; exclude admin evidence;
   add conservative report blocks using the existing evaluator and persist traces.
3. Offer Personal Vertical Plan / POA; reuse authenticated retake; preserve auth
   destination and exact report-attempt associations.
4. Add forward-only structured plan, stage revision, suggestion, commercial-intake
   and trusted entitlement projection tables. All paid operations enforce ownership
   and active entitlement in the database and Worker.
5. Extend CreatorShell with nine editable, saved stages and final plan export.
6. Add bounded server-side AI actions, allowlisted evidence, versioned context,
   editable suggestions and explicit creator acceptance. Never write assessments.
7. Show FMF agency onboarding Coming Soon; export structured handoff without
   provisioning, billing, or account creation.

## External Billing contract

Provision a published FYV Personal Vertical Plan product, sellable POA catalogue
plan and published `{kind:'poa'}` price. Configure their real IDs in FYV; do not
fabricate a catalogue entry or claim a quote request purchased access. FYV owns
intake workflow only. A trusted Billing adapter must project grant/revoke state,
subject/profile identity, source entitlement ID, revision and expiry. Only a
service role may write that projection; absent, expired or revoked grants deny
paid access. Intake remains durable while catalogue configuration is pending.

Rollout must review the existing report foundation separately, then apply new
forward migrations, configure catalogue IDs and AI provider, and verify access
with a dedicated test creator before production cutover. No migration repair,
db pull, historical report rewrite or migration edit is permitted.
