// ============================================================================
// Recommendation Evidence — "Why this was recommended" surface
// ----------------------------------------------------------------------------
// Renders Predicted Fit, Validation Status, supporting signals,
// content-experiment list, and the recommended next action.
//
// Heavy progressive-disclosure: collapsed "card" is the dashboard row; the
// "full" layout is the per-creator profile detail.
// ============================================================================

import { useMemo } from 'react';
import {
  STATUS_PRESENTATION,
  type ValidationStatus,
  type RecommendationEvidence,
  type RecommendationSignal,
} from '@/lib/recommendations';

export interface RecommendationEvidenceSectionProps {
  /** Title label for the recommended entity (e.g. creator name, vertical name). */
  recommendedEntityLabel: string;
  /** Optional secondary line, e.g. rank or archetype. */
  subtitle?: string | null;
  evidence: RecommendationEvidence | null;
  validationStatus: ValidationStatus;
  /** How many content experiments are linked to this recommendation. */
  contentExperimentCount: number;
  /** Next recommended action, copy-only. */
  nextAction: { label: string; reason: string };
  /** Optional renderer for the action button (kept agnostic to routing). */
  onPrimaryAction?: (() => void) | null;
  /** When true, hides supporting signals + body copy — for the dashboard row. */
  collapsed?: boolean;
}

const EMPTY_EXPLANATION = 'Recommendation evidence is not yet available for this direction.';
const LEGACY_FALLBACK_NOTES = 'No assessment evidence on file. Run an assessment to unlock Predicted Fit.';

/**
 * Canonical replacement text for a NULL predicted_fit_score / validated_fit_score.
 * Exported so tests can lock the string without source-grepping.
 */
export const LEGACY_PERCENT_EMPTY_LABEL = 'Not yet calculated' as const;

export function RecommendationEvidenceSection(props: RecommendationEvidenceSectionProps) {
  const {
    recommendedEntityLabel,
    subtitle,
    evidence,
    validationStatus,
    contentExperimentCount,
    nextAction,
    onPrimaryAction,
    collapsed,
  } = props;

  const status = STATUS_PRESENTATION[validationStatus];
  const legacy = !evidence;
  const predicted = evidence?.predicted_fit_score ?? null;
  const validated = evidence?.validated_fit_score ?? null;

  const summaryCopy = useMemo(() => {
    if (legacy) {
      return `${recommendedEntityLabel}: Predicted Fit is not yet calculated for this direction.`;
    }
    return evidence?.explanation_summary ?? EMPTY_EXPLANATION;
  }, [legacy, evidence, recommendedEntityLabel]);

  if (collapsed) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-charcoal">{recommendedEntityLabel}</p>
            {subtitle && <p className="truncate text-xs text-charcoal-2">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-surface-3 px-3 py-1 font-semibold text-charcoal-2">
              Predicted Fit: {predicted == null ? '—' : `${predicted}%`}
            </span>
            <span
              className={`rounded-full border px-3 py-1 font-semibold ${status.tone}`}
              data-testid="validation-status-chip"
              data-status={validationStatus}
            >
              {status.label}
            </span>
            <span className="rounded-full bg-surface-3 px-3 py-1 font-semibold text-charcoal-2">
              {contentExperimentCount === 1
                ? '1 experiment'
                : `${contentExperimentCount} experiments`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const signals: RecommendationSignal[] = evidence?.supporting_signals ?? [];

  return (
    <section
      className="cockpit-card-pad"
      aria-label={`Why ${recommendedEntityLabel} was recommended`}
      data-testid="recommendation-evidence-section"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Why this was recommended</p>
          <h2 className="cockpit-section-title mt-1">{recommendedEntityLabel}</h2>
          {subtitle && <p className="mt-1 text-xs text-charcoal-2">{subtitle}</p>}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.tone}`}
          data-testid="validation-status-chip"
          data-status={validationStatus}
        >
          {status.label}
        </span>
      </header>

      {/* Summary line — provenanced; never fabricates evidence. */}
      <p className="text-sm leading-6 text-charcoal-2">{summaryCopy}</p>
      {legacy && (
        <p className="mt-2 text-xs italic text-charcoal-2">{LEGACY_FALLBACK_NOTES}</p>
      )}

      {/* Predicted Fit / Validated Fit tiles — neutral, side-by-side. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <FitTile
          label="Predicted Fit"
          caption="Assessment-derived only"
          value={predicted}
          tone=""
        />
        <FitTile
          label="Validated Fit"
          caption="Usage-derived only"
          value={validated}
          tone=""
        />
      </div>

      {signals.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">
            Supporting signals
          </p>
          <p className="mt-1 text-xs text-charcoal-2">
            Based on {signals.length} assessment signal{signals.length === 1 ? '' : 's'}.
          </p>
          <ul className="mt-3 space-y-2">
            {signals.map(signal => (
              <SignalRow key={signal.source_reference} signal={signal} />
            ))}
          </ul>
          {signals.length >= 3 && (
            <p className="mt-3 text-xs italic text-charcoal-2">
              We pick the strongest evidence; not every signal is shown.
            </p>
          )}
        </div>
      )}

      {/* Recommended next action — single primary CTA. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next recommended action</p>
          <p className="mt-1 text-sm font-semibold text-charcoal">{nextAction.label}</p>
          <p className="mt-1 text-xs text-charcoal-2">{nextAction.reason}</p>
        </div>
        {onPrimaryAction && (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="btn-primary text-sm"
          >
            {nextAction.label}
          </button>
        )}
      </div>

      <ValidationStatusFooter status={validationStatus} experimentCount={contentExperimentCount} />
    </section>
  );
}

function FitTile({ label, caption, value, tone }: {
  label: string; caption: string; value: number | null; tone: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-2 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{formatPercent(value)}</p>
      <p className="mt-1 text-xs text-charcoal-2">{caption}</p>
    </div>
  );
}

function SignalRow({ signal }: { signal: RecommendationSignal }) {
  const arrow = signal.direction === 'positive'
    ? '↑'
    : signal.direction === 'negative'
      ? '↓'
      : '·';
  const arrowClass = signal.direction === 'positive'
    ? 'text-success'
    : signal.direction === 'negative'
      ? 'text-pink'
      : 'text-charcoal-2';
  return (
    <li className="flex items-start gap-3 rounded-lg bg-surface-2 px-3 py-2">
      <span className={`mt-0.5 text-base font-semibold ${arrowClass}`} aria-hidden="true">{arrow}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-charcoal">{signal.label}</p>
        {signal.description && (
          <p className="mt-0.5 text-xs text-charcoal-2">{signal.description}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-charcoal-2">
          {signal.signal_type} · weight {signal.weight}/100 · confidence {signal.confidence}/100 · from {signal.source_reference}
        </p>
      </div>
    </li>
  );
}

function ValidationStatusFooter({ status, experimentCount }: { status: ValidationStatus; experimentCount: number }) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <p className="mt-4 text-xs leading-5 text-charcoal-2">
      <span className="font-semibold text-charcoal">Validation Status:</span> {presentation.description}
      {experimentCount > 0 && ' '}
      {experimentCount > 0 && (
        <>
          ({experimentCount === 1 ? '1 experiment' : `${experimentCount} experiments`} on file.)
        </>
      )}
    </p>
  );
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return LEGACY_PERCENT_EMPTY_LABEL;
  return `${value}%`;
}
