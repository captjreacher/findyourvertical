import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import {
  getAssessmentsForProfile,
  getMyArchetypeSnapshot,
  createMyArchetypeSnapshot,
  getActiveVariationsForArchetypes,
  getMyVariationSelections,
  saveMyVariationSelections,
  getActivePersonaGeneration,
  generateMyPersonaPortfolio,
  type VariationSelectionInput,
} from '@/lib/creators-api';
import {
  deriveRankedArchetypes,
  snapshotToRankedArchetypes,
  RANK_MINIMUMS,
  RANK_LABEL,
  type RankedArchetype,
} from '@/lib/persona-archetypes';
import { getArchetypeKnowledge } from '@/lib/knowledge';
import type { ArchetypeRank, ArchetypeVariation, CreatorPersonaGeneration } from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

// Selectable-tile styling mirrors the assessment wizard's option cards so the
// step shares the established FYV visual language (no new design system).
const TILE_BASE = 'w-full rounded-xl border p-4 text-left transition-colors shadow-lg shadow-black/10';
const TILE_IDLE = 'border-white/10 bg-black/35 text-charcoal hover:border-accent/70 hover:bg-black/45';
const TILE_SELECTED = 'border-accent bg-accent/20 text-white';

const RANK_BADGE: Record<ArchetypeRank, string> = {
  primary: 'bg-accent/15 text-accent',
  secondary: 'bg-warn/10 text-warn',
  third: 'bg-success/15 text-success',
};

function minimumHint(rank: ArchetypeRank): string {
  const n = RANK_MINIMUMS[rank];
  return `Choose at least ${n} that you could realistically enjoy creating.`;
}

export function CharacterPossibilities() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [needsAssessment, setNeedsAssessment] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const [ranked, setRanked] = useState<RankedArchetype[]>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [variations, setVariations] = useState<ArchetypeVariation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState<'progress' | 'finish' | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Persona portfolio (FYV-PERSONA-1B): once selection is complete, the creator
  // can turn their chosen directions into six draft characters.
  const [portfolio, setPortfolio] = useState<CreatorPersonaGeneration | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError('');
    setNeedsAssessment(false);
    setBlocked(false);

    (async () => {
      try {
        // 1. The latest assessment provides the responses we derive from.
        const assessments = await getAssessmentsForProfile(profile.id);
        const latest = assessments[0] ?? null;
        if (!latest) {
          if (mounted) setNeedsAssessment(true);
          return;
        }

        // 2. Reuse the locked snapshot if it exists; otherwise derive the
        //    ranked top three once and lock it in. We never silently replace an
        //    existing snapshot, so the creative basis stays stable.
        let snapshot = await getMyArchetypeSnapshot(profile.id);
        if (!snapshot) {
          const derived = deriveRankedArchetypes({ creatorProfileId: profile.id, assessment: latest });
          if (derived.length < 3) {
            if (mounted) setBlocked(true);
            return;
          }
          snapshot = await createMyArchetypeSnapshot({
            creatorProfileId: profile.id,
            sourceAssessmentId: latest.id,
            primaryArchetype: derived[0].archetype,
            secondaryArchetype: derived[1].archetype,
            thirdArchetype: derived[2].archetype,
          });
        }

        const rankedFromSnapshot = snapshotToRankedArchetypes(snapshot);

        // 3. Library variations for the three archetypes + any existing picks.
        const [libraryVariations, existingSelections] = await Promise.all([
          getActiveVariationsForArchetypes(rankedFromSnapshot.map(entry => entry.archetype)),
          getMyVariationSelections(snapshot.id),
        ]);

        if (!mounted) return;
        setRanked(rankedFromSnapshot);
        setSnapshotId(snapshot.id);
        setVariations(libraryVariations);
        setSelectedIds(
          new Set(
            existingSelections
              .filter(selection => selection.status === 'selected')
              .map(selection => selection.variation_id),
          ),
        );
      } catch (error) {
        if (mounted) {
          setLoadError(
            error instanceof Error ? error.message : 'We could not load your character possibilities.',
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [profile.id]);

  // Load any existing active portfolio generation once the snapshot is known,
  // so the CTA can reflect ready / generating / completed state.
  useEffect(() => {
    if (!snapshotId) return;
    let mounted = true;
    (async () => {
      try {
        const gen = await getActivePersonaGeneration(profile.id);
        if (mounted) setPortfolio(gen);
      } catch {
        if (mounted) setPortfolio(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [snapshotId, profile.id]);

  const variationsByArchetype = useMemo(() => {
    const map = new Map<string, ArchetypeVariation[]>();
    for (const variation of variations) {
      const list = map.get(variation.archetype) ?? [];
      list.push(variation);
      map.set(variation.archetype, list);
    }
    return map;
  }, [variations]);

  const variationById = useMemo(() => {
    const map = new Map<string, ArchetypeVariation>();
    for (const variation of variations) map.set(variation.id, variation);
    return map;
  }, [variations]);

  const archetypeToRank = useMemo(() => {
    const map = new Map<string, ArchetypeRank>();
    for (const entry of ranked) map.set(entry.archetype, entry.rank);
    return map;
  }, [ranked]);

  const progress = useMemo(() => {
    const perRank = ranked.map(({ rank, archetype }) => {
      let selectedCount = 0;
      for (const id of selectedIds) {
        if (variationById.get(id)?.archetype === archetype) selectedCount += 1;
      }
      const minimum = RANK_MINIMUMS[rank];
      return { rank, archetype, selectedCount, minimum, met: selectedCount >= minimum };
    });
    const complete = perRank.length === 3 && perRank.every(entry => entry.met);
    return { perRank, complete };
  }, [ranked, selectedIds, variationById]);

  const toggle = (variationId: string) => {
    setSavedMessage(null);
    setSaveError(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(variationId)) next.delete(variationId);
      else next.add(variationId);
      return next;
    });
  };

  const buildSelectionInputs = (): VariationSelectionInput[] => {
    const inputs: VariationSelectionInput[] = [];
    for (const id of selectedIds) {
      const variation = variationById.get(id);
      if (!variation) continue;
      const rank = archetypeToRank.get(variation.archetype);
      if (!rank) continue;
      inputs.push({ variationId: id, archetype: variation.archetype, rank });
    }
    return inputs;
  };

  const persist = async (mode: 'progress' | 'finish') => {
    if (!snapshotId) return;
    setSaving(mode);
    setSavedMessage(null);
    setSaveError(null);
    try {
      await saveMyVariationSelections({
        creatorProfileId: profile.id,
        snapshotId,
        selections: buildSelectionInputs(),
      });
      if (mode === 'finish') {
        navigate('/my');
        return;
      }
      setSavedMessage('Progress saved. You can come back and change these any time before you finish.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'We could not save your selections. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!snapshotId) return;
    setGenBusy(true);
    setGenError(null);
    try {
      // Persist the current selections first so the Worker reads the exact set.
      await saveMyVariationSelections({
        creatorProfileId: profile.id,
        snapshotId,
        selections: buildSelectionInputs(),
      });
      await generateMyPersonaPortfolio(snapshotId);
      navigate('/my/personas');
    } catch (error) {
      setGenError(
        error instanceof Error ? error.message : 'We could not build your character portfolio. Please try again.',
      );
      setGenBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="Find Your Vertical" className="h-14 w-auto object-contain" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Build Your Character Possibilities</p>
              <h1 className="text-2xl font-bold leading-tight text-charcoal">Which versions feel like you?</h1>
            </div>
          </div>
          <a href="#/my" className="btn-secondary text-xs">Back to My Vertical</a>
        </header>

        <p className="mb-6 max-w-2xl text-sm leading-6 text-charcoal-2">
          Your assessment identified three strong creative directions. Choose the versions of each that you could
          genuinely see yourself enjoying and portraying. You are not locking in final characters — you are mapping the
          space of what feels authentic to you.
        </p>

        {loading && (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Loading your character possibilities…
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            {loadError}
          </div>
        )}

        {!loading && needsAssessment && (
          <div className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="text-lg font-bold text-charcoal">Complete your assessment first</h2>
            <p className="mt-2 text-sm text-charcoal-2">
              This step unlocks once you have assessment results, so we know your three strongest creative directions.
            </p>
            <a href="#/my" className="btn-primary mt-4 text-sm">Back to My Vertical</a>
          </div>
        )}

        {!loading && blocked && (
          <div className="rounded-2xl border border-warn/30 bg-warn/10 p-6">
            <h2 className="text-lg font-bold text-charcoal">We need a little more to work with</h2>
            <p className="mt-2 text-sm text-charcoal-2">
              We could not confidently identify three creative directions from your latest results yet. Retaking your
              assessment or reaching out to the team will get this unblocked.
            </p>
            <a href="#/my" className="btn-primary mt-4 text-sm">Back to My Vertical</a>
          </div>
        )}

        {!loading && !loadError && !needsAssessment && !blocked && (
          <>
            {/* Progress summary */}
            <section className="mb-6 rounded-2xl border border-accent/30 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-charcoal">Your progress</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${progress.complete ? 'bg-success/15 text-success' : 'bg-white/5 text-charcoal-2'}`}>
                  {progress.complete ? 'Ready to finish' : 'Keep exploring'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {progress.perRank.map(entry => (
                  <div key={entry.rank} className="rounded-xl border border-white/10 bg-surface-3/60 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-charcoal-2">{RANK_LABEL[entry.rank]}</div>
                    <div className="mt-0.5 text-sm font-semibold text-charcoal">{entry.archetype}</div>
                    <div className={`mt-1 text-xs font-medium ${entry.met ? 'text-success' : 'text-charcoal-2'}`}>
                      {entry.met ? '✓ ' : ''}{entry.selectedCount} of {entry.minimum} chosen
                    </div>
                  </div>
                ))}
              </div>
              {!progress.complete && (
                <p className="mt-3 text-xs text-charcoal-2">
                  Choose at least {RANK_MINIMUMS.primary} versions for your primary direction, {RANK_MINIMUMS.secondary}{' '}
                  for your secondary, and {RANK_MINIMUMS.third} for your third. That gives us enough range to build from
                  next.
                </p>
              )}
            </section>

            {/* Create My Character Portfolio — appears once 3-2-1 minimums are met (FYV-PERSONA-1B). */}
            {progress.complete && (
              <section className="mb-6 rounded-2xl border border-accent/40 bg-surface p-5">
                {portfolio?.status === 'completed' ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-charcoal">Your character portfolio is ready</h2>
                      <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">Created</span>
                    </div>
                    <p className="mt-1 text-sm text-charcoal-2">
                      We turned your chosen directions into six draft characters built around you.
                    </p>
                    <a href="#/my/personas" className="btn-primary mt-4 text-sm">View Your Character Portfolio</a>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</p>
                    <h2 className="mt-1 text-lg font-bold text-charcoal">Create My Character Portfolio</h2>
                    <p className="mt-1 text-sm text-charcoal-2">
                      We'll turn your chosen creative directions into six distinct character concepts built around you.
                    </p>
                    {genError && <p className="mt-3 text-sm text-pink" role="alert">{genError}</p>}
                    <button
                      type="button"
                      onClick={() => void handleCreatePortfolio()}
                      disabled={genBusy || portfolio?.status === 'generating' || portfolio?.status === 'pending'}
                      className="btn-primary mt-4 text-sm"
                    >
                      {genBusy || portfolio?.status === 'generating' || portfolio?.status === 'pending'
                        ? 'Building your characters…'
                        : 'Create My Character Portfolio'}
                    </button>
                  </>
                )}
              </section>
            )}

            {/* Archetype panels */}
            <div className="space-y-5">
              {ranked.map(entry => {
                const knowledge = getArchetypeKnowledge(entry.archetype);
                const options = variationsByArchetype.get(entry.archetype) ?? [];
                const selectedCount = progress.perRank.find(p => p.rank === entry.rank)?.selectedCount ?? 0;
                return (
                  <section key={entry.rank} className="rounded-2xl border border-white/10 bg-surface p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RANK_BADGE[entry.rank]}`}>
                        {RANK_LABEL[entry.rank]}
                      </span>
                      <h3 className="text-xl font-bold text-charcoal">{entry.archetype}</h3>
                    </div>
                    {knowledge?.identity && (
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal-2">{knowledge.identity}</p>
                    )}
                    <p className="mt-4 text-sm font-semibold text-charcoal">Which versions of this character feel like you?</p>
                    <p className="mt-1 text-xs text-charcoal-2">{minimumHint(entry.rank)}</p>

                    {options.length === 0 ? (
                      <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
                        No variations are available for this direction yet. Please let the team know so we can add some.
                      </p>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {options.map(option => {
                          const selected = selectedIds.has(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggle(option.id)}
                              className={`${TILE_BASE} ${selected ? TILE_SELECTED : TILE_IDLE}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-base font-semibold">{option.name}</span>
                                <span className={`mt-0.5 shrink-0 text-xs font-semibold ${selected ? 'text-white' : 'text-charcoal-2'}`}>
                                  {selected ? 'Selected' : 'Tap to add'}
                                </span>
                              </div>
                              {option.description && (
                                <p className={`mt-2 text-sm leading-6 ${selected ? 'text-white/90' : 'text-charcoal-2'}`}>
                                  {option.description}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-3 text-xs text-charcoal-2">
                      {selectedCount} selected{selectedCount < RANK_MINIMUMS[entry.rank] ? ` · choose at least ${RANK_MINIMUMS[entry.rank]}` : ''}
                    </p>
                  </section>
                );
              })}
            </div>

            {/* Action bar */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-surface p-5">
              {saveError && <p className="mb-3 text-sm text-pink" role="alert">{saveError}</p>}
              {savedMessage && <p className="mb-3 text-sm text-success" role="status">{savedMessage}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void persist('finish')}
                  disabled={!progress.complete || saving !== null}
                  className="btn-primary text-sm"
                >
                  {saving === 'finish' ? 'Saving…' : 'Save & finish'}
                </button>
                <button
                  type="button"
                  onClick={() => void persist('progress')}
                  disabled={saving !== null}
                  className="btn-secondary text-sm"
                >
                  {saving === 'progress' ? 'Saving…' : 'Save progress'}
                </button>
                {!progress.complete && (
                  <span className="text-xs text-charcoal-2">
                    Finish unlocks once you have enough versions chosen across all three directions.
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
