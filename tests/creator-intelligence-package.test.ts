// Pure contract + logic tests for the Creator Intelligence Package boundary.
// No database required — run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIntelligencePackageBody,
  applyPublication,
  activePublishedPackages,
} from '../src/lib/intelligence-package.ts';
import {
  CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT,
  CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX,
  isValidPackageReference,
  isConsumablePackageState,
  isValidCreatorIntelligencePackageState,
  assertConsumablePackage,
  buildCreatorIntelligencePackagePublishedEvent,
  buildAssessmentReference,
  CREATOR_ASSESSMENT_REFERENCE_PREFIX,
} from '../src/lib/contracts/creator-intelligence-package-v1.ts';
import { MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1 } from '../src/lib/contracts/creator-intelligence-package-v1.fixture.ts';

// A representative completed report, deliberately including internal-only fields
// the downstream package body must NEVER leak.
const REPORT = {
  archetype: 'Girl Next Door',
  archetype_description: 'Accessible, warm, and easy to connect with.',
  result_confidence: 'High',
  top_verticals: [
    { name: 'Girl Next Door', rationale: 'Approachable and authentic.' },
    { name: 'Soft Girlfriend Experience', rationale: 'Warm ongoing connection.' },
    { name: 'Cosplay', rationale: 'Playful character range.' },
    { name: 'Fitness', rationale: 'Beyond the top 3 — must be dropped.' },
  ],
  creator_archetype_summary: {
    primary_archetype: 'Girl Next Door',
    secondary_archetype: 'Soft Girlfriend Experience',
    fit_explanation: 'x',
  },
  recommended_actions: [
    { title: 'Lock in a consistent posting cadence', rationale: 'x' },
    { title: 'Introduce a soft GFE tier', rationale: 'y' },
  ],
  executive_summary: {
    strengths: [],
    growth_opportunities: [],
    likely_creator_style: '',
    likely_monetisation_style: '',
    recommended_next_step: 'Book a strategy call',
  },
  // ---- internal-only fields that MUST NOT appear in the package body ----
  scores: { creator_dna: 82, brand_clarity: 77, monetisation: 71, consistency: 66, agency_opportunity: 88 },
  internal_agency_scores: { brand_risk: 12, commercial_potential: 90, scalability: 80 },
  why_this_result: { summary: 'raw signals', strongest_assessment_responses: ['a raw answer'] },
  completion_routing: { recommended_next_action: 'onboard_to_creator_cockpit', creator_next_action: 'book_call', conflict: false },
};

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';

test('body: lean shape with exactly the five downstream sections', () => {
  const body = buildIntelligencePackageBody(REPORT as any, { creatorReference: CREATOR_ID });
  assert.equal(body.version, '1');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['creator_profile', 'opportunities', 'persona', 'recommended_next_steps', 'version'],
  );
  assert.equal(body.creator_profile.reference, CREATOR_ID);
  assert.equal(body.creator_profile.primary_archetype, 'Girl Next Door');
  assert.equal(body.persona.secondary_archetype, 'Soft Girlfriend Experience');
  assert.equal(body.persona.confidence, 'High');
});

test('body: top_verticals capped at 3 and opportunities mirror them', () => {
  const body = buildIntelligencePackageBody(REPORT as any, { creatorReference: CREATOR_ID });
  assert.equal(body.creator_profile.top_verticals.length, 3);
  assert.equal(body.opportunities.length, 3);
  assert.deepEqual(body.opportunities[0], {
    vertical: 'Girl Next Door',
    rationale: 'Approachable and authentic.',
  });
  assert.ok(!body.creator_profile.top_verticals.includes('Fitness'));
});

test('body: recommended_next_steps derived + de-duped from report guidance', () => {
  const body = buildIntelligencePackageBody(REPORT as any, { creatorReference: CREATOR_ID });
  assert.ok(body.recommended_next_steps.includes('Lock in a consistent posting cadence'));
  assert.ok(body.recommended_next_steps.includes('Book a strategy call'));
  assert.equal(new Set(body.recommended_next_steps).size, body.recommended_next_steps.length);
});

test('body: NEVER leaks internal scoring / raw answers / workflow state', () => {
  const body = buildIntelligencePackageBody(REPORT as any, { creatorReference: CREATOR_ID });
  const serialised = JSON.stringify(body);
  for (const forbidden of [
    'internal_agency_scores', 'brand_risk', 'creator_dna', 'why_this_result',
    'completion_routing', 'strongest_assessment_responses', 'scores',
  ]) {
    assert.ok(!serialised.includes(forbidden), `package body leaked internal field: ${forbidden}`);
  }
});

test('reference: opaque UUID form accepted; parsable / date / handle forms rejected', () => {
  const good = `${CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX}550e8400-e29b-41d4-a716-446655440000`;
  assert.ok(isValidPackageReference(good));
  assert.ok(!isValidPackageReference('fyv/creator/intelligence-package/2026-07-12'));
  assert.ok(!isValidPackageReference(`${CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX}moonsiren-2026-07-12`));
  assert.ok(!isValidPackageReference('cip:moon-siren:leah:0001'));
});

test('assessment reference builder is opaque + stable', () => {
  assert.equal(
    buildAssessmentReference('22222222-2222-4222-8222-222222222222'),
    'fyv.creator.assessment.22222222-2222-4222-8222-222222222222',
  );
});

test('event: exact canonical published-event contract', () => {
  const evt = buildCreatorIntelligencePackagePublishedEvent({
    creatorReference: CREATOR_ID,
    packageReference: `${CREATOR_INTELLIGENCE_PACKAGE_REFERENCE_PREFIX}550e8400-e29b-41d4-a716-446655440000`,
    packageId: '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(evt.event_type, 'creator.intelligence_package.published');
  assert.equal(evt.event_type, CREATOR_INTELLIGENCE_PACKAGE_PUBLISHED_EVENT);
  assert.equal(evt.source_product, 'FYV');
  assert.equal(evt.creator_reference, CREATOR_ID);
  assert.equal(evt.package_id, '33333333-3333-4333-8333-333333333333');
  assert.equal(evt.package_state, 'published');
  assert.ok(isValidPackageReference(evt.package_reference));
});

test('state: only published is consumable; superseded / unknown rejected', () => {
  assert.ok(isConsumablePackageState('published'));
  assert.ok(!isConsumablePackageState('superseded'));
  assert.ok(isValidCreatorIntelligencePackageState('published'));
  assert.ok(isValidCreatorIntelligencePackageState('superseded'));
  assert.ok(!isValidCreatorIntelligencePackageState('draft'));
  assert.doesNotThrow(() => assertConsumablePackage('published'));
  assert.throws(() => assertConsumablePackage('superseded'), /not consumable/);
  assert.throws(() => assertConsumablePackage('nonsense'), /Unknown/);
});

test('versioning: first publish active; second supersedes; only latest active; history kept', () => {
  const p1 = { id: 'p1', package_state: 'published' as const, created_at: '2026-07-01T00:00:00Z' };
  let records = applyPublication([], p1);
  assert.equal(activePublishedPackages(records).length, 1);
  assert.equal(activePublishedPackages(records)[0].id, 'p1');

  const p2 = { id: 'p2', package_state: 'published' as const, created_at: '2026-07-05T00:00:00Z' };
  records = applyPublication(records, p2);
  const active = activePublishedPackages(records);
  assert.equal(active.length, 1, 'exactly one active published package');
  assert.equal(active[0].id, 'p2', 'the latest package is active');
  assert.equal(records.length, 2, 'history retained + traceable');
  assert.equal(records.find(r => r.id === 'p1')?.package_state, 'superseded');
});

test('fixture: MoonSiren scaffold uses the canonical reference format (no legacy styles)', () => {
  const pkg = MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1;
  // Package reference is the canonical opaque fyv.creator.intelligence.<uuid> form.
  assert.ok(
    isValidPackageReference(pkg.packageReference),
    `fixture packageReference must be canonical, got: ${pkg.packageReference}`,
  );
  // Assessment reference is the canonical opaque form.
  assert.ok(pkg.provenance.assessmentReference.startsWith(CREATOR_ASSESSMENT_REFERENCE_PREFIX));
  // No legacy reference prefixes remain on the package/assessment references.
  assert.ok(!pkg.packageReference.startsWith('cip:'), 'legacy cip: prefix removed');
  assert.ok(!pkg.provenance.assessmentReference.startsWith('fyv-assessment:'), 'legacy fyv-assessment: prefix removed');
});
