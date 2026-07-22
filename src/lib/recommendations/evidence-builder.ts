// ============================================================================
// Evidence signals — PURE builder
// ----------------------------------------------------------------------------
// Lives in its own module (no `@/lib/supabase` import) so node:test can import
// `buildEvidenceSignals` without pulling the rest of the service layer.
// `evidence.ts` re-exports the helper for app code; tests should import it
// from this file directly when running under node.
// ============================================================================

import type { CreatorIntelligenceResult } from '@/types/creator.ts';
import type { RecommendationSignal } from './evidence.ts';

/**
 * Aggregate a per-creator evidence payload from CreatorIntelligence.
 * Pure: takes the intelligence shape in, returns the explanatory bundle out.
 * No DB calls. No time-dependent values. The migration RPC mirrors the
 * server-side behaviour (and the SQL `fyv_recommendation_evidence` JSONB
 * payload must round-trip through the same field names).
 */
export function buildEvidenceSignals(intelligence: CreatorIntelligenceResult): {
  top_archetype_signals: RecommendationSignal[];
  explanation_summary: string;
  source_question_keys: string[];
} {
  const top = intelligence.archetype_fits?.[0];
  const archetype = top?.archetype ?? 'identity';
  const topSignals: RecommendationSignal[] = [];

  for (const [idx, evidence] of (intelligence.evidence ?? []).entries()) {
    if (!evidence.validates_archetype) continue;
    const weight = Math.min(100, evidence.strength);
    const confidence = Math.max(0, Math.min(100, evidence.confidence ?? 60));
    topSignals.push({
      signal_type: 'experience',
      label: archetype,
      description: trimLabel(evidence.value, 64),
      weight,
      direction: evidence.polarity === 'positive'
        ? 'positive'
        : evidence.polarity === 'negative'
          ? 'negative'
          : 'neutral',
      source_reference: evidence.source_question_key ?? evidence.response_key ?? `signal:${idx}`,
      confidence,
    });
  }

  // Add contradictions as negative signals.
  for (const archetypeFit of intelligence.archetype_fits ?? []) {
    if (archetypeFit.contradicting_evidence_ids?.length) {
      topSignals.push({
        signal_type: 'contradiction',
        label: `${archetypeFit.archetype} — contradictions`,
        description: `${archetypeFit.contradicting_evidence_ids.length} contradicting signals kept this archetype off the list.`,
        weight: archetypeFit.fit_score,
        direction: 'negative',
        source_reference: 'archetype_fits',
        confidence: archetypeFit.confidence,
      });
    }
  }

  // Trim and de-dupe by source_reference.
  const dedup = new Map<string, RecommendationSignal>();
  for (const signal of topSignals) {
    if (!dedup.has(signal.source_reference)) {
      dedup.set(signal.source_reference, signal);
    }
  }

  // Stable sort by weight desc, take 5.
  const trimmed = Array.from(dedup.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const summary = top
    ? `Predicted Fit is based on ${trimmed.length} evidence signals pointing toward "${archetype}".`
    : 'No assessment-driven archetype scored above the threshold for this creator.';

  const sourceQuestionKeys = trimmed.map(signal => signal.source_reference);

  return {
    top_archetype_signals: trimmed,
    explanation_summary: summary,
    source_question_keys: sourceQuestionKeys,
  };
}

function trimLabel(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + '…' : trimmed;
}
