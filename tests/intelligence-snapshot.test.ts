// Pure contract + derivation tests for the Creator Intelligence snapshot handoff.
// No database required — run with node --experimental-strip-types --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIntelligencePackageContent,
  buildCreatorReference,
  buildExternalIdentity,
  buildPackageReference,
  buildAssessmentReference,
  buildPublishedEventPayload,
  slugify,
  CREATOR_INTELLIGENCE_CONTRACT_VERSION,
  CREATOR_INTELLIGENCE_VERSION,
} from '../src/lib/intelligence-snapshot.ts';

const REPORT = {
  archetype: 'Girl Next Door',
  classification_confidence: 87,
  top_verticals: [
    { name: 'Girl Next Door', rationale: 'Approachable and authentic.' },
    { name: 'Soft Girlfriend Experience', rationale: 'Warm ongoing connection.' },
    { name: 'Cosplay', rationale: 'Playful character range.' },
  ],
  creator_archetype_summary: {
    primary_archetype: 'Girl Next Door',
    secondary_archetype: 'Soft Girlfriend Experience',
    fit_explanation: 'x',
  },
  executive_summary: {
    strengths: [],
    growth_opportunities: [],
    likely_creator_style: 'warm and consistent',
    likely_monetisation_style: 'subscription + soft PPV',
    recommended_next_step: 'Book a strategy call',
  },
  // internal-only fields that must NOT leak into the package content
  scores: { creator_dna: 76, brand_clarity: 73, monetisation: 50, consistency: 75, agency_opportunity: 65 },
  internal_agency_scores: { brand_risk: 12, commercial_potential: 90 },
  why_this_result: { summary: 'raw', strongest_assessment_responses: ['raw answer'] },
  completion_routing: { recommended_next_action: 'onboard_to_creator_cockpit', creator_next_action: 'book_call' },
};

test('content: five downstream sections; primary vertical + journey derived', () => {
  const c = buildIntelligencePackageContent(REPORT as any);
  assert.deepEqual(
    Object.keys(c).sort(),
    ['archetype_journey', 'available_opportunities', 'derived_scenario', 'intelligence_summary', 'primary_vertical'],
  );
  assert.equal(c.primary_vertical, 'Girl Next Door');
  assert.equal(c.archetype_journey, 'Girl Next Door -> Soft Girlfriend Experience');
  assert.ok(c.intelligence_summary.includes('warm and consistent'));
});

test('content: opportunities mirror top_verticals with valid CHECK ranges', () => {
  const c = buildIntelligencePackageContent(REPORT as any);
  assert.equal(c.available_opportunities.length, 3);
  const first = c.available_opportunities[0];
  assert.equal(first.priority, 1);
  assert.equal(first.source_opportunity_reference, 'girl-next-door');
  assert.equal(first.source_scenario_reference, 'scenario_girl-next-door');
  for (const o of c.available_opportunities) {
    assert.ok(o.confidence >= 0 && o.confidence <= 100, 'confidence in 0..100');
    assert.ok(o.priority >= 0 && o.priority <= 100, 'priority in 0..100');
    assert.ok(o.journey_type && o.opportunity_type, 'taxonomy present');
  }
});

test('content: NEVER leaks internal scoring / raw answers / routing state', () => {
  const serialized = JSON.stringify(buildIntelligencePackageContent(REPORT as any));
  for (const forbidden of [
    'scores', 'internal_agency_scores', 'brand_risk', 'why_this_result',
    'completion_routing', 'strongest_assessment_responses', 'creator_dna',
  ]) {
    assert.ok(!serialized.includes(forbidden), `leaked internal field: ${forbidden}`);
  }
});

test('confidence is clamped to 0..100', () => {
  const c = buildIntelligencePackageContent({ ...REPORT, classification_confidence: 250 } as any);
  assert.ok(c.available_opportunities.every(o => o.confidence === 100));
});

test('reference + identity builders are namespaced/deterministic', () => {
  assert.equal(slugify('Girl Next Door'), 'girl-next-door');
  assert.equal(buildCreatorReference('16bab1fb-df50-4101-9e2c-749ab7ed3d5e'), 'fyv:16bab1fb-df50-4101-9e2c-749ab7ed3d5e');
  assert.deepEqual(buildExternalIdentity('betterfans', '517509783'), {
    platform_provider: 'betterfans',
    platform_account_id: '517509783',
    reference: 'betterfans:517509783',
  });
  assert.equal(buildPackageReference('moonsiren', '2026-07-05'), 'fyv/moonsiren/intelligence-package/2026-07-05');
  assert.equal(buildAssessmentReference('moonsiren', '2026-07-05'), 'fyv/moonsiren/assessment/2026-07-05');
});

test('published-event payload matches the approved contract', () => {
  const evt = buildPublishedEventPayload({
    creatorProfileId: '16bab1fb-df50-4101-9e2c-749ab7ed3d5e',
    externalIdentity: buildExternalIdentity('betterfans', '517509783'),
    packageReference: 'fyv/moonsiren/intelligence-package/2026-07-05',
    packageId: '9eae6bdc-0516-4bfa-8e1b-62e5a65d5c28',
  });
  assert.equal(evt.event_type, 'creator.intelligence_package.published');
  assert.equal(evt.source_product, 'FYV');
  assert.equal(evt.creator_reference, 'fyv:16bab1fb-df50-4101-9e2c-749ab7ed3d5e');
  assert.equal(evt.external_identity.reference, 'betterfans:517509783');
  assert.equal(evt.package_state, 'published');
  assert.equal(evt.contract_version, CREATOR_INTELLIGENCE_CONTRACT_VERSION);
  assert.equal(evt.intelligence_version, CREATOR_INTELLIGENCE_VERSION);
  // creator_reference must be namespaced, never a bare UUID
  assert.ok(evt.creator_reference.startsWith('fyv:'));
});
