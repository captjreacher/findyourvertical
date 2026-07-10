import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorShell } from './CreatorShell';
import { useCreatorSession } from './CreatorGate';
import {
  startMyOnboarding,
  saveMyOnboardingProgress,
  submitMyOnboarding,
} from '@/lib/creators-api';
import type { CreatorOnboardingCase } from '@/lib/onboarding';

interface FormState {
  primary_goal: string;
  current_platforms: string;
  audience_description: string;
  support_needed: string;
  weekly_hours: string;
  notes: string;
}

const EMPTY: FormState = {
  primary_goal: '',
  current_platforms: '',
  audience_description: '',
  support_needed: '',
  weekly_hours: '',
  notes: '',
};

const FIELDS: { key: keyof FormState; label: string; type: 'text' | 'textarea' }[] = [
  { key: 'primary_goal', label: 'What is your main goal right now?', type: 'text' },
  { key: 'current_platforms', label: 'Which platforms are you active on today?', type: 'text' },
  { key: 'audience_description', label: 'Describe your audience in a sentence or two.', type: 'textarea' },
  { key: 'support_needed', label: 'Where do you most want our support?', type: 'textarea' },
  { key: 'weekly_hours', label: 'Roughly how many hours a week can you invest?', type: 'text' },
  { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
];

function toForm(responses: Record<string, unknown> | undefined | null): FormState {
  const r = responses ?? {};
  const g = (k: keyof FormState) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  return {
    primary_goal: g('primary_goal'),
    current_platforms: g('current_platforms'),
    audience_description: g('audience_description'),
    support_needed: g('support_needed'),
    weekly_hours: g('weekly_hours'),
    notes: g('notes'),
  };
}

export function OnboardingFlow() {
  const { profile } = useCreatorSession();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [onboardingCase, setOnboardingCase] = useState<CreatorOnboardingCase | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        // Create-or-resume: landing here (incl. from an accepted invite) opens
        // the creator's own active case.
        const row = await startMyOnboarding();
        if (!mounted) return;
        setOnboardingCase(row);
        setForm(toForm(row.responses));
      } catch (error) {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'We could not open your onboarding.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  const status = onboardingCase?.status ?? 'not_started';
  const editable = status === 'not_started' || status === 'in_progress' || status === 'review_required';

  const update = (key: keyof FormState, value: string) => {
    setSavedMessage(null);
    setActionError(null);
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!onboardingCase) return;
    setBusy('save');
    setSavedMessage(null);
    setActionError(null);
    try {
      const row = await saveMyOnboardingProgress(onboardingCase.id, { ...form });
      setOnboardingCase(row);
      setSavedMessage('Progress saved. You can leave and return any time.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'We could not save your progress. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async () => {
    if (!onboardingCase) return;
    setBusy('submit');
    setSavedMessage(null);
    setActionError(null);
    try {
      await saveMyOnboardingProgress(onboardingCase.id, { ...form });
      const row = await submitMyOnboarding(onboardingCase.id);
      setOnboardingCase(row);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'We could not submit your onboarding. Please try again.');
      setBusy(null);
    }
  };

  return (
    <CreatorShell>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Creator Onboarding</p>
          <h1 className="mt-1 text-2xl font-bold text-charcoal">Complete your creator setup</h1>
          <p className="mt-2 text-sm leading-6 text-charcoal-2">
            Tell us a little about you and the support you need. Your progress is saved, so you can leave and come back
            any time.
          </p>
        </header>

        {loading && (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Opening your onboarding…
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            {loadError}
            <div className="mt-4"><Link to="/my" className="btn-secondary text-sm">Back to Home</Link></div>
          </div>
        )}

        {!loading && !loadError && onboardingCase && (
          <>
            {status === 'complete' ? (
              <section className="rounded-2xl border border-white/10 bg-surface p-6">
                <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">Complete</span>
                <h2 className="mt-3 text-lg font-bold text-charcoal">Your onboarding is complete</h2>
                <p className="mt-2 text-sm text-charcoal-2">
                  Thanks — there's nothing more to do here. Your creator workspace is ready.
                </p>
                <Link to="/my" className="btn-primary mt-4 inline-flex text-sm">Go to your workspace</Link>
              </section>
            ) : status === 'submitted' ? (
              <section className="rounded-2xl border border-white/10 bg-surface p-6">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-charcoal-2">Submitted</span>
                <h2 className="mt-3 text-lg font-bold text-charcoal">Onboarding submitted</h2>
                <p className="mt-2 text-sm text-charcoal-2">
                  Your onboarding is in with our team for review. We'll let you know if we need anything else — there's
                  nothing you need to do right now.
                </p>
                <Link to="/my" className="btn-secondary mt-4 inline-flex text-sm">Back to Home</Link>
              </section>
            ) : (
              <>
                {status === 'review_required' && (
                  <div className="mb-5 rounded-2xl border border-warn/40 bg-warn/10 p-5">
                    <h2 className="text-base font-bold text-charcoal">Action required</h2>
                    <p className="mt-1 text-sm text-charcoal-2">
                      {onboardingCase.review_notes?.trim()
                        ? onboardingCase.review_notes
                        : 'We need a few updates before we continue. Please review and resubmit.'}
                    </p>
                  </div>
                )}

                <section className="space-y-5 rounded-2xl border border-white/10 bg-surface p-6">
                  {FIELDS.map(field => (
                    <div key={field.key}>
                      <label className="mb-1 block text-sm font-semibold text-charcoal">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={form[field.key]}
                          onChange={e => update(field.key, e.target.value)}
                          disabled={!editable || busy !== null}
                          rows={3}
                          className="field-control w-full"
                        />
                      ) : (
                        <input
                          type="text"
                          value={form[field.key]}
                          onChange={e => update(field.key, e.target.value)}
                          disabled={!editable || busy !== null}
                          className="field-control w-full"
                        />
                      )}
                    </div>
                  ))}

                  {actionError && <p className="text-sm text-pink" role="alert">{actionError}</p>}
                  {savedMessage && <p className="text-sm text-success" role="status">{savedMessage}</p>}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={busy !== null}
                      className="btn-primary text-sm"
                    >
                      {busy === 'submit' ? 'Submitting…' : status === 'review_required' ? 'Resubmit onboarding' : 'Submit onboarding'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={busy !== null}
                      className="btn-secondary text-sm"
                    >
                      {busy === 'save' ? 'Saving…' : 'Save progress'}
                    </button>
                    <Link to="/my" className="btn-secondary text-sm">Save &amp; exit</Link>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </CreatorShell>
  );
}
