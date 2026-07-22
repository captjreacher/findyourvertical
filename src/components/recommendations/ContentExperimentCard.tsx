// ============================================================================
// Content Experiment Card — single row with lifecycle + feedback
// ----------------------------------------------------------------------------
// Presentation for one experiment. Renders the lifecycle buttons + feedback
// form depending on status. Submitting feedback transitions the experiment to
// Completed and the server-side recalc RPC updates the validation status.
// ============================================================================

import { useState } from 'react';
import type { ContentExperiment, ExperimentStatus } from '@/lib/recommendations';

export interface ContentExperimentCardProps {
  experiment: ContentExperiment;
  hasFeedback: boolean;
  onTransition: (next: ExperimentStatus) => Promise<void> | void;
  onSubmitFeedback: (input: {
    creator_energy_score: number;
    authenticity_score: number;
    creation_friction_score: number;
    willingness_to_continue_score: number;
    audience_response_score: number | null;
    notes?: string | null;
  }) => Promise<void> | void;
  onEdit?: (patch: {
    title?: string;
    hypothesis?: string | null;
    intended_audience?: string | null;
    platform?: string | null;
    message_angle?: string | null;
  }) => Promise<void> | void;
  onMarkResetForFeedback?: () => Promise<void> | void;
  busy?: boolean;
}

const STATUS_TONE: Record<ExperimentStatus, string> = {
  'Draft':       'bg-surface-3 text-charcoal-2',
  'Planned':     'bg-surface-3 text-charcoal-2',
  'In progress': 'bg-accent/15 text-accent',
  'Completed':   'bg-success/15 text-success',
  'Abandoned':   'bg-pink/10 text-pink',
};

const NEXT_LABEL: Partial<Record<ExperimentStatus, string>> = {
  'Draft': 'Plan experiment',
  'Planned': 'Start experiment',
  'In progress': 'Mark completed',
  'Completed': 'Re-open (Abandon)',
};

const AUDIENCE_RESPONSES = [
  { value: 1, label: 'No response' },
  { value: 2, label: 'Minimal' },
  { value: 3, label: 'Mixed' },
  { value: 4, label: 'Engaged / Converted' },
  { value: 5, label: 'Strong engagement' },
];

export function ContentExperimentCard(props: ContentExperimentCardProps) {
  const { experiment, hasFeedback, onTransition, onSubmitFeedback, onEdit, onMarkResetForFeedback, busy } = props;
  const editable = experiment.status === 'Draft' || experiment.status === 'Planned';
  const showFeedback = experiment.status === 'Completed' && !hasFeedback;

  return (
    <article
      className="rounded-2xl border border-white/10 bg-surface-2 p-5"
      data-testid="content-experiment-card"
      data-status={experiment.status}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Content experiment</p>
          <h3 className="mt-1 text-base font-bold text-charcoal">{experiment.title}</h3>
          {experiment.hypothesis && (
            <p className="mt-1 text-xs text-charcoal-2">Hypothesis: {experiment.hypothesis}</p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[experiment.status]}`}>
          {experiment.status}
        </span>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Intended audience" value={experiment.intended_audience} />
        <Field label="Platform" value={experiment.platform} />
        <Field label="Format" value={experiment.content_format} />
        <Field label="Message angle" value={experiment.message_angle} />
      </dl>

      {/* Edit + lifecycle buttons row */}
      <div className="mt-4 flex flex-wrap gap-2">
        {editable && onEdit && (
          <button
            type="button"
            onClick={() => onEdit({})}
            className="btn-secondary text-xs"
            disabled={busy}
          >
            Edit plan
          </button>
        )}
        {experiment.status !== 'Abandoned' && NEXT_LABEL[experiment.status] && (
          <button
            type="button"
            onClick={() => onTransition(nextStatusFor(experiment.status))}
            className="btn-primary text-xs"
            disabled={busy}
          >
            {NEXT_LABEL[experiment.status]}
          </button>
        )}
        {experiment.status !== 'Abandoned' && experiment.status !== 'Completed' && (
          <button
            type="button"
            onClick={() => onTransition('Abandoned')}
            className="btn-secondary text-xs text-pink"
            disabled={busy}
          >
            Abandon
          </button>
        )}
        {experiment.status === 'Completed' && hasFeedback && onMarkResetForFeedback && (
          <button
            type="button"
            onClick={() => onMarkResetForFeedback()}
            className="btn-secondary text-xs text-warn"
            disabled={busy}
          >
            Re-flag for feedback
          </button>
        )}
      </div>

      {showFeedback && (
        <FeedbackForm
          onSubmit={onSubmitFeedback}
          busy={busy}
        />
      )}
      {experiment.status === 'Completed' && hasFeedback && (
        <p className="mt-3 text-xs text-charcoal-2">
          Feedback submitted. Validated Fit has been recalculated.
        </p>
      )}
      {experiment.status === 'Abandoned' && (
        <p className="mt-3 text-xs italic text-charcoal-2">
          This experiment was abandoned. It will not contribute to Validated Fit.
        </p>
      )}
    </article>
  );
}

function nextStatusFor(current: ExperimentStatus): ExperimentStatus {
  switch (current) {
    case 'Draft': return 'Planned';
    case 'Planned': return 'In progress';
    case 'In progress': return 'Completed';
    case 'Completed': return 'Abandoned';
    case 'Abandoned': return 'Abandoned';
  }
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-3 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-charcoal-2">{label}</p>
      <p className="mt-0.5 text-sm text-charcoal">{value ?? '—'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback form (embedded; lives in the card when status=Completed and no
// feedback has been recorded yet). 5 dimensions on a 1-5 scale.
// ---------------------------------------------------------------------------

interface FeedbackFormProps {
  onSubmit: (input: {
    creator_energy_score: number;
    authenticity_score: number;
    creation_friction_score: number;
    willingness_to_continue_score: number;
    audience_response_score: number | null;
    notes?: string | null;
  }) => Promise<void> | void;
  busy?: boolean;
}

function FeedbackForm({ onSubmit, busy }: FeedbackFormProps) {
  const [energy, setEnergy] = useState<number>(3);
  const [authenticity, setAuthenticity] = useState<number>(3);
  const [friction, setFriction] = useState<number>(3);
  const [willingness, setWillingness] = useState<number>(3);
  const [audience, setAudience] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');

  return (
    <form
      data-testid="experiment-feedback-form"
      className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4"
      onSubmit={async e => {
        e.preventDefault();
        await onSubmit({
          creator_energy_score: energy,
          authenticity_score: authenticity,
          creation_friction_score: friction,
          willingness_to_continue_score: willingness,
          audience_response_score: audience,
          notes: notes.trim() || null,
        });
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Creator feedback</p>
      <p className="mt-1 text-xs text-charcoal-2">
        Audience response is only one part of validation; rate how this direction felt to <em>you</em>.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ScaleField
          label="Creator Energy"
          hint="Did you enjoy creating this content?"
          value={energy}
          onChange={setEnergy}
        />
        <ScaleField
          label="Authenticity"
          hint="Did this direction feel natural and credible?"
          value={authenticity}
          onChange={setAuthenticity}
        />
        <ScaleField
          label="Creation Friction"
          hint="How difficult was it to produce consistently?"
          value={friction}
          onChange={setFriction}
          inverseNote="Lower = harder; higher = easier"
        />
        <ScaleField
          label="Willingness to Continue"
          hint="Would you willingly create more in this direction?"
          value={willingness}
          onChange={setWillingness}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">
          Audience Response
        </legend>
        <p className="mt-1 text-xs text-charcoal-2">
          Did people engage, respond, follow, enquire, or convert?
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${
              audience == null ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-charcoal-2 hover:bg-accent/10'
            }`}
            onClick={() => setAudience(null)}
          >
            Skip / Unknown
          </button>
          {AUDIENCE_RESPONSES.map(response => (
            <button
              key={response.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${
                audience === response.value ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-charcoal-2 hover:bg-accent/10'
              }`}
              onClick={() => setAudience(response.value)}
            >
              {response.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] italic text-charcoal-2">
          Audience response is recorded as one part of validation; the combined 5-dimension score still drives Validated Fit.
        </p>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal"
          placeholder="Anything that would help interpret this experiment…"
        />
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={busy}
          data-testid="submit-experiment-feedback"
        >
          {busy ? 'Saving…' : 'Submit feedback'}
        </button>
      </div>
    </form>
  );
}

function ScaleField({
  label, hint, value, onChange, inverseNote,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  inverseNote?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">{label}</p>
      <p className="text-xs text-charcoal-2">{hint}</p>
      {inverseNote && <p className="text-[10px] italic text-charcoal-2">{inverseNote}</p>}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map(score => (
          <button
            key={score}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${
              value === score ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-charcoal-2 hover:bg-accent/10'
            }`}
            onClick={() => onChange(score)}
            aria-label={`${label}: ${score}`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}
