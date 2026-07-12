import type { CreatorIntelligencePackageV1 } from './creator-intelligence-package-v1';

export const MOONSIREN_CREATOR_INTELLIGENCE_PACKAGE_V1 = {
  // Canonical, opaque, UUID-based package reference (fyv.creator.intelligence.<uuid>).
  // Consumers must treat this as an opaque identifier — no parsable structure.
  packageReference: 'fyv.creator.intelligence.0f9c1e2a-6b47-4c31-9a5e-2d8f1b4c7e90',
  packageVersion: '1.0.0',
  identity: {
    sourceCreatorReference: 'moon-siren/leah',
    externalCorrelationReference: 'fmf:creator:leah-moonsiren',
    creatorDisplayName: 'MoonSiren',
    creatorHandle: '@leah.moonsiren',
  },
  provenance: {
    producerProduct: 'FYV',
    contractVersion: 'v1',
    intelligenceResultVersion: '2026-07-04.1',
    assessmentReference: 'fyv.creator.assessment.7c3d5f8a-1e24-4b96-8f0a-6a2b9c4d7e13',
    assessmentTemplateVersion: 'fyv-assessment-template:v2.4',
    generatedAt: '2026-07-04T09:30:00Z',
    publishedAt: '2026-07-04T09:35:00Z',
  },
  positioning: {
    primaryVertical: 'Girl Next Door',
    archetypeJourney: [
      {
        role: 'entry',
        archetype: 'Girl Next Door',
        rationale: 'Accessible, warm, and easy to meet without feeling performative.',
      },
      {
        role: 'relationship',
        archetype: 'Soft Girlfriend Experience',
        rationale: 'Adds closeness, emotional warmth, and ongoing connection.',
      },
      {
        role: 'escalation',
        archetype: 'Seductress',
        rationale: 'Creates a controlled reveal that unlocks higher-intensity attention.',
      },
    ],
    confidence: 87,
    rationale: [
      'The creator reads as approachable first, then more intimate as trust increases.',
      'The narrative ladder supports a gradual commercial climb without forcing a hard persona shift.',
    ],
    evidence: [
      'Consistent warmth and accessibility signals',
      'Strong fan-connection and trust-building indicators',
      'Commercial escalation works best through anticipation rather than abrupt reinvention',
    ],
  },
  derivedScenarios: [
    {
      stableScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      name: 'Girl Next Door -> Soft Girlfriend Experience -> Seductress',
      archetypeProgression: [
        { role: 'entry', archetype: 'Girl Next Door' },
        { role: 'relationship', archetype: 'Soft Girlfriend Experience' },
        { role: 'escalation', archetype: 'Seductress' },
      ],
      narrativeProgression: [
        { role: 'entry', beat: 'Meet me' },
        { role: 'relationship', beat: 'Get closer to me' },
        { role: 'escalation', beat: 'Unlock this side of me' },
      ],
      confidence: 90,
      rationale: [
        'The progression is coherent: approachable entry, intimate relationship layer, then stronger tease-led escalation.',
        'The scenario can support both retention and monetisation without requiring separate identity models.',
      ],
      applicableJourneyTypes: [
        'new_subscriber',
        'first_conversation',
        'first_purchase',
        'ppv_upsell',
        'renewal',
        'win_back',
      ],
      constraintsOrWarnings: [
        'Escalation should remain gradual to preserve the Girl Next Door entry point.',
        'Do not over-index on the Seductress layer before relationship trust is established.',
      ],
    },
  ],
  opportunities: [
    {
      stableOpportunityReference: 'opportunity:moon-siren:new-subscriber',
      opportunityType: 'new_subscriber',
      recommendedJourneyType: 'new_subscriber',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'Lead with a friendly, low-friction welcome that feels easy to step into.',
        'Use the entry role to make the first subscription feel personal rather than transactional.',
      ],
      confidence: 88,
      priority: 'high',
      constraints: ['Keep the first-touch promise simple and approachable.'],
      state: 'published',
    },
    {
      stableOpportunityReference: 'opportunity:moon-siren:first-conversation',
      opportunityType: 'first_conversation',
      recommendedJourneyType: 'first_conversation',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'Conversation should deepen closeness before any harder monetisation push.',
        'The relationship layer is the natural place to create rapport and response momentum.',
      ],
      confidence: 85,
      priority: 'high',
      constraints: ['Avoid jumping straight to premium asks before rapport is established.'],
      state: 'identified',
    },
    {
      stableOpportunityReference: 'opportunity:moon-siren:first-purchase',
      opportunityType: 'first_purchase',
      recommendedJourneyType: 'first_purchase',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'The first purchase should feel like a natural extension of growing closeness.',
        'A soft bridge from relationship to premium access supports a cleaner conversion path.',
      ],
      confidence: 82,
      priority: 'high',
      constraints: ['Price and framing should match the softer relationship tone.'],
      state: 'identified',
    },
    {
      stableOpportunityReference: 'opportunity:moon-siren:ppv-upsell',
      opportunityType: 'ppv_upsell',
      recommendedJourneyType: 'ppv_upsell',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'The escalation role supports a reveal-based PPV path.',
        'Tease-led framing can unlock premium attention without breaking the creator identity.',
      ],
      confidence: 86,
      priority: 'high',
      constraints: ['Use the escalation beat as the reveal, not as a blunt hard sell.'],
      state: 'published',
    },
    {
      stableOpportunityReference: 'opportunity:moon-siren:renewal',
      opportunityType: 'renewal',
      recommendedJourneyType: 'renewal',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'Renewal should remind existing fans why the relationship felt personal in the first place.',
        'The scenario supports continuity, which is key for retention.',
      ],
      confidence: 84,
      priority: 'medium',
      constraints: ['Renewal messaging should reinforce continuity, not reintroduce the whole brand.'],
      state: 'identified',
    },
    {
      stableOpportunityReference: 'opportunity:moon-siren:win-back',
      opportunityType: 'win_back',
      recommendedJourneyType: 'win_back',
      relatedDerivedScenarioReference: 'scenario:moon-siren:girl-next-door-soft-gfe-seductress',
      rationale: [
        'Win-back can reopen the approachable entry point before reintroducing intimacy.',
        'A softer return path lowers friction for lapsed fans.',
      ],
      confidence: 80,
      priority: 'medium',
      constraints: ['Do not lead with the most intense layer when reactivating lapsed fans.'],
      state: 'superseded',
    },
  ],
} satisfies CreatorIntelligencePackageV1;
