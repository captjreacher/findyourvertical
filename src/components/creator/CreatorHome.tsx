import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreatorShell } from './CreatorShell';
import { PlanJourneyCta } from './PlanJourneyCta';
import { useCreatorSession } from './CreatorGate';
import {
  getAssessmentsForProfile,
  getReportsForProfile,
  createCreatorRetakeInvite,
  getMyArchetypeSnapshot,
  getMyVariationSelections,
  getActivePersonaGeneration,
} from '@/lib/creators-api';
import { snapshotToRankedArchetypes, summariseSelectionCompleteness } from '@/lib/persona-archetypes';
import { deriveOnboardingHero, deriveProgress, type ProgressState } from '@/lib/onboarding';
import { CreatorHomeValidationSummary } from '@/components/recommendations/CreatorHomeValidationSummary';
import type { CreatorAssessment, CreatorReport } from '@/types/creator';

const PROGRESS_DOT: Record<ProgressState, string> = {
  done: 'bg-success text-white',
  current: 'bg-accent text-white',
  upcoming: 'bg-white/10 text-charcoal-2',
};
const PROGRESS_LABEL: Record<ProgressState, string> = {
  done: 'text-charcoal',
  current: 'text-charcoal',
  upcoming: 'text-charcoal-2',
};

export function CreatorHome() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();

  const [assessments, setAssessments] = useState<CreatorAssessment[]>([]);
  const [reports, setReports] = useState<CreatorReport[]>([]);
  const [retaking, setRetaking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [characterLoading, setCharacterLoading] = useState(true);
  const [characterState, setCharacterState] = useState<{
    started: boolean;
    complete: boolean;
    portfolio: 'none' | 'pending' | 'generating' | 'completed' | 'failed';
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getAssessmentsForProfile(profile.id), getReportsForProfile(profile.id)])
      .then(([a, r]) => {
        if (!mounted) return;
        setAssessments(a);
        setReports(r);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  // Persona / character progress (derived from the locked snapshot + selections).
  useEffect(() => {
    let mounted = true;
    setCharacterLoading(true);
    (async () => {
      try {
        const snapshot = await getMyArchetypeSnapshot(profile.id);
        if (!mounted) return;
        if (!snapshot) {
          setCharacterState({ started: false, complete: false, portfolio: 'none' });
          return;
        }
        const selections = await getMyVariationSelections(snapshot.id);
        if (!mounted) return;
        const { complete } = summariseSelectionCompleteness(snapshotToRankedArchetypes(snapshot), selections);
        let portfolio: 'none' | 'pending' | 'generating' | 'completed' | 'failed' = 'none';
        if (complete) {
          const gen = await getActivePersonaGeneration(profile.id);
          if (!mounted) return;
          portfolio = (gen?.status as typeof portfolio) ?? 'none';
        }
        setCharacterState({ started: true, complete, portfolio });
      } catch {
        if (mounted) setCharacterState(null);
      } finally {
        if (mounted) setCharacterLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile.id]);

  const latestReport = reports[0] ?? null;
  const latestAssessment = assessments[0] ?? null;
  const hasAssessment = Boolean(latestAssessment);
  const hasCompletedPortfolio = characterState?.portfolio === 'completed';

  const displayName = profile.model_name || profile.first_name || profile.full_name || 'there';
  const reportSlug = latestReport?.report_slug ?? '';

  const hero = characterState ? deriveOnboardingHero({
    characterComplete: characterState.complete,
    portfolio: characterState.portfolio,
  }) : null;
  const progress = deriveProgress({
    hasAssessment,
    onboardingComplete: characterState?.complete ?? false,
    hasCompletedPortfolio,
  });

  const handleRetake = async () => {
    setRetaking(true);
    setActionError(null);
    try {
      const { invite_code, template_slug } = await createCreatorRetakeInvite();
      const email = encodeURIComponent(profile.email ?? '');
      navigate(`/a/${encodeURIComponent(template_slug)}?ref=${encodeURIComponent(invite_code)}&email=${email}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not start a new assessment. Please try again.');
      setRetaking(false);
    }
  };


  return (
    <CreatorShell>
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">My Vertical</p>
          <h1 className="text-2xl font-bold leading-tight text-charcoal">Welcome back, {displayName}</h1>
        </header>

        {hasAssessment && <div className="mb-6"><PlanJourneyCta reportSlug={reportSlug} /></div>}
        {/* Existing persona onboarding remains available. */}
        {!hasAssessment ? (
          <section className="mb-6 rounded-2xl border border-accent/40 bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Get started</p>
            <h2 className="mt-1 text-2xl font-bold text-charcoal">Take your creator assessment</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-2">
              Your assessment is the starting point — it unlocks your report, onboarding, and Persona Portfolio.
            </p>
            <button onClick={handleRetake} disabled={retaking} className="btn-primary mt-4 text-sm">
              {retaking ? 'Starting…' : 'Start assessment'}
            </button>
          </section>
        ) : characterLoading ? (
          <section className="mb-6 rounded-2xl border border-white/10 bg-surface p-6" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your next step</p>
            <p className="mt-2 text-sm text-charcoal-2">Loading your onboarding progress…</p>
          </section>
        ) : hero ? (
          <section
            className="mb-6 rounded-2xl border border-accent/40 bg-surface p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your next step</p>
            <h2 className="mt-1 text-2xl font-bold text-charcoal">{hero.heading}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-2">{hero.body}</p>
            {hero.supportingMessage && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-charcoal-2">{hero.supportingMessage}</p>
            )}

            {hero.actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {hero.actions.map(action => (
                  <Link
                    key={action.label}
                    to={action.to}
                    className={`${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} text-sm`}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="mb-6 rounded-2xl border border-pink/30 bg-pink/10 p-6" role="alert">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your next step</p>
            <p className="mt-2 text-sm text-charcoal">We could not load your onboarding progress. Please refresh.</p>
          </section>
        )}

        {/* Progress strip: Assessment complete → Onboarding → Persona Portfolio → Services ready. */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-surface p-5">
          <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
            {progress.map((step, i) => (
              <li key={step.key} className="flex flex-1 items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${PROGRESS_DOT[step.state]}`}>
                  {step.state === 'done' ? '✓' : i + 1}
                </span>
                <span className={`text-sm font-medium ${PROGRESS_LABEL[step.state]}`}>{step.label}</span>
                {i < progress.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-white/10 sm:block" />}
              </li>
            ))}
          </ol>
        </section>

        {actionError && (
          <p className="mb-4 rounded-lg border border-pink/30 bg-pink/10 p-3 text-sm text-pink" role="alert">{actionError}</p>
        )}

        {/* Phase 1 — Recommendation validation summary.
            Visible only AFTER the portfolio has been generated (cohort that has
            real recommendation evidence to validate). */}
        {hasCompletedPortfolio && (
          <div className="mb-5">
            <CreatorHomeValidationSummary
              creatorId={profile.id}
              detailHref={`/cockpit/creators/${profile.id}`}
            />
          </div>
        )}


      </div>
    </CreatorShell>
  );
}
