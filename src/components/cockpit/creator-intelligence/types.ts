// ── Creator Intelligence Cockpit ──
// Sprint FYV-3.2A: page types shared across all cockpit tabs.

import type {
  CreatorProfile,
  CreatorAssessment,
  CreatorDnaProfile,
  CreatorReport,
  CreatorNote,
  CreatorStatusEvent,
  CreatorIntelligenceResult,
  ReportTier,
} from '@/types/creator';

export type TabId =
  | 'overview'
  | 'responses'
  | 'evidence'
  | 'traits'
  | 'archetypes'
  | 'dna'
  | 'report'
  | 'agency'
  | 'timeline';

export interface TabDef {
  id: TabId;
  label: string;
}

export const COCKPIT_TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'responses', label: 'Raw Responses' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'traits', label: 'Trait Engine' },
  { id: 'archetypes', label: 'Archetype Engine' },
  { id: 'dna', label: 'Creator DNA' },
  { id: 'report', label: 'Report Preview' },
  { id: 'agency', label: 'Agency Review' },
  { id: 'timeline', label: 'Timeline' },
];

/** All raw data loaded for a specific creator. */
export interface CreatorLoadedData {
  profile: CreatorProfile;
  assessments: CreatorAssessment[];
  dnaProfiles: CreatorDnaProfile[];
  reports: CreatorReport[];
  notes: CreatorNote[];
  events: CreatorStatusEvent[];
}

/** Shape exposed via React Context. */
export interface CreatorIntelligenceContextValue {
  profile: CreatorProfile;
  assessments: CreatorAssessment[];
  dnaProfiles: CreatorDnaProfile[];
  reports: CreatorReport[];
  notes: CreatorNote[];
  events: CreatorStatusEvent[];

  /** Currently selected assessment (defaults to latest). */
  selectedAssessment: CreatorAssessment | null;
  setSelectedAssessmentId: (id: string) => void;

  /** Computed intelligence for the selected assessment. */
  intelligence: CreatorIntelligenceResult | null;

  /** The stored report for this assessment, if any. */
  storedReport: CreatorReport | null;

  /** Recompute a report at a different tier (null = no recompute). */
  previewTier: ReportTier | null;
  setPreviewTier: (tier: ReportTier | null) => void;
  tierReport: import('@/types/creator').ReportData | null;
}
