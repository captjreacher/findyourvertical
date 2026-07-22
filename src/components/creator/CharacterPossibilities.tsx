import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { supabase } from '@/lib/supabase';
import { snapshotToRankedArchetypes } from '@/lib/persona-archetypes';
import {
  getActiveVariationsForArchetypes,
  generateMyPersonaPortfolio,
  getMyArchetypeSnapshot,
} from '@/lib/creators-api';
import {
  MAX_WORKSET_SIZE,
  MIN_WORKSET_SIZE,
  TOTAL_MINIMUM,
  creativeDirectionBadge,
  creativeDirectionLabel,
  hasEnoughVariationsForPortfolio,
  rankLabelFor,
  sourceLabelCopy,
  validateWorkset,
  type VerticalSlot,
} from '@/lib/persona-verticals';
import {
  createMyOwnedVariation,
  createMyOwnedVertical,
  archiveMyOwnedVariation,
  archiveMyOwnedVertical,
  deriveLegacyWorksetFromSnapshot,
  getMyVerticalWorkset,
  materialiseAndGeneratePortfolio,
  saveMyVerticalWorkset,
  submitMyOwnedVariationForReview,
  submitMyOwnedVerticalForReview,
  updateMyOwnedVariation,
  updateMyOwnedVertical,
} from '@/lib/creators-workset-api';
import type {
  ArchetypeVariation,
  CreatorArchetypeSnapshot,
  CreatorOwnedVariation,
  CreatorOwnedVertical,
  CreatorVerticalWorksetView,
  CreatorVerticalWorksetViewEntry,
  VerticalSourceLabel,
} from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

// Pure helpers

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

async function loadOwnedVerticals(profileId: string): Promise<CreatorOwnedVertical[]> {
  const { data, error } = await supabase
    .from('creator_owned_verticals')
    .select('*')
    .eq('creator_profile_id', profileId)
    .eq('is_archived', false) as { data: unknown[] | null; error: unknown };
  if (error) throw new Error(`Failed to load owned verticals: ${String((error as Error).message ?? error)}`);
  return (data ?? []) as CreatorOwnedVertical[];
}

async function loadOwnedVariations(profileId: string): Promise<CreatorOwnedVariation[]> {
  const { data, error } = await supabase
    .from('creator_owned_variations')
    .select('*')
    .eq('creator_profile_id', profileId)
    .eq('is_archived', false) as { data: unknown[] | null; error: unknown };
  if (error) throw new Error(`Failed to load owned variations: ${String((error as Error).message ?? error)}`);
  return (data ?? []) as CreatorOwnedVariation[];
}

// Display constants

const TILE_BASE = 'w-full rounded-xl border p-4 text-left transition-colors shadow-lg shadow-black/10';
const TILE_IDLE = 'border-white/10 bg-black/35 text-charcoal hover:border-accent/70 hover:bg-black/45';
const TILE_SELECTED = 'border-accent bg-accent/20 text-white';
const TILE_READONLY = 'border-white/5 bg-surface-2/40 text-charcoal-2 cursor-default';

interface CatalogueArchetype {
  archetype: string;
  description: string;
  variations: ArchetypeVariation[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type WizardStep = 'reveal' | 'explain' | 'choose' | 'generate';

const STEP_ORDER: readonly WizardStep[] = ['reveal', 'explain', 'choose', 'generate'];
const STEP_LABELS: Record<WizardStep, string> = {
  reveal: 'Assessment results',
  explain: 'How this works',
  choose: 'Choose your variations',
  generate: 'Build your portfolio',
};
const AUTOSAVE_DEBOUNCE_MS = 900;

function stepIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step);
}

// Main wizard component

export function CharacterPossibilities() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [snapshot, setSnapshot] = useState<CreatorArchetypeSnapshot | null>(null);
  const [view, setView] = useState<CreatorVerticalWorksetView | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [libraryByArchetype, setLibraryByArchetype] = useState<Map<string, CatalogueArchetype>>(new Map());
  const [ownedVerticals, setOwnedVerticals] = useState<CreatorOwnedVertical[]>([]);
  const [ownedVariations, setOwnedVariations] = useState<CreatorOwnedVariation[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>('reveal');
  const [wizardBootstrapped, setWizardBootstrapped] = useState(false);
  const [fastForwardedToEditor, setFastForwardedToEditor] = useState(false);

  const autosaveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');

  // Initial load: snapshot + workset (with legacy fallback).
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const snap = await getMyArchetypeSnapshot(profile.id);
        if (!snap) {
          if (mounted) setLoadError('No archetype snapshot available for this creator yet.');
          return;
        }
        if (mounted) {
          setSnapshot(snap);
          setSnapshotId(snap.id);
        }
        const ranked = snapshotToRankedArchetypes(snap);
        const archetypes = ranked.map(r => r.archetype);
        const [libRows, workset, ownedVerts, ownedVars] = await Promise.all([
          getActiveVariationsForArchetypes(archetypes),
          getMyVerticalWorkset(snap.id),
          loadOwnedVerticals(profile.id),
          loadOwnedVariations(profile.id),
        ]);
        if (!mounted) return;
        setLibraryByArchetype(buildLibraryIndex(libRows));
        setOwnedVerticals(ownedVerts);
        setOwnedVariations(ownedVars);
        if (workset) {
          setView(workset);
        } else {
          // No persisted workset yet — synthesise the 3-row legacy fallback
          // (primary/secondary/third). selectedLibraryIds stays empty because
          // the project moved per-selection state off creator_variation_selections
          // and onto the editable workset; legacy creators re-pick inside the
          // new wizard. This branch is for creators WITH NO persisted workset
          // (the `if (workset)` branch above preserves every saved selection
          // for everyone else, including legacy creators who already had a
          // workset before this refactor).
          setView(deriveLegacyWorksetFromSnapshot({
            snapshotId: snap.id,
            creatorProfileId: profile.id,
            primaryArchetype: snap.primary_archetype,
            secondaryArchetype: snap.secondary_archetype,
            thirdArchetype: snap.third_archetype,
            selectedLibraryIds: [],
            libraryVariations: libRows,
          }));
        }
      } catch (err) {
        if (mounted) setLoadError(err instanceof Error ? err.message : 'We could not load your character possibilities.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [profile.id]);

  useEffect(() => {
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, []);

  const validation = useMemo(() => {
    if (!view) return null;
    const slots: VerticalSlot[] = view.verticals.map(v => ({
      position: v.position,
      sourceLabel: v.sourceLabel,
      verticalLabel: v.verticalLabel,
      verticalKind: v.verticalKind,
      selectedVariationIds: v.selectedVariations.map(s => s.entryId),
    }));
    return validateWorkset(slots);
  }, [view]);

  const totalSelected = validation?.totalSelected ?? 0;
  const isPortfolioReady = hasEnoughVariationsForPortfolio(totalSelected);

  // Bootstrap step once the data has loaded. A user who returns mid-flow
  // (>=6 variations saved across the workset) lands on Step 3 — the editor —
  // so their saved selections stay visible and they can click Continue to
  // reach the Generate step. Landing directly on Generate would in the step
  // indicator visually invert "reached" semantics (steps 1-3 unreached while
  // step 4 active). New creators always land on the Reveal step first.
  useEffect(() => {
    if (wizardBootstrapped) return;
    if (loading || !view || !snapshot) return;
    if (isPortfolioReady) {
      setWizardStep('choose');
      setFastForwardedToEditor(true);
    }
    setWizardBootstrapped(true);
  }, [loading, view, snapshot, isPortfolioReady, wizardBootstrapped]);

  // Focus management: on every step change, move keyboard focus to the new
  // step's heading so sighted keyboard users don't lose place. Each Step
  // component renders a `<h2 tabIndex={-1}>` so it accepts programmatic focus
  // without entering the tab order. The DOM query is cheap on every step
  // change and tolerates re-renders / unmounts caused by `key={wizardStep}`.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const heading = document.querySelector(
      `[data-wizard-step="${wizardStep}"] h2`,
    ) as HTMLElement | null;
    if (heading) {
      heading.focus({ preventScroll: true });
    }
  }, [wizardStep]);

  const runSave = useCallback(async () => {
    if (!snapshotId || !view) return;
    const serialised = stableStringify(view);
    if (serialised === lastSavedRef.current) {
      setSaveStatus('saved');
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const saved = await saveMyVerticalWorkset(snapshotId, view);
      setView(saved);
      lastSavedRef.current = stableStringify(saved);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'We could not save your edits. Please try again.');
    }
  }, [snapshotId, view]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    setSaveStatus('saving');
    autosaveTimer.current = window.setTimeout(() => { void runSave(); }, AUTOSAVE_DEBOUNCE_MS);
  }, [runSave]);

  const updateView = useCallback((updater: (prev: CreatorVerticalWorksetView) => CreatorVerticalWorksetView) => {
    setView(prev => (prev ? updater(prev) : prev));
    scheduleAutosave();
  }, [scheduleAutosave]);

  const replaceVertical = useCallback(async (position: number, replacement: { archetypeKey: string; source: VerticalSourceLabel }) => {
    updateView(prev => renumberAndReplaceAt(prev, position, {
      worksetId: `tmp-${cryptoId()}`,
      position,
      verticalKind: 'system_reference',
      verticalLabel: replacement.archetypeKey,
      systemArchetype: replacement.archetypeKey,
      ownedVerticalId: null,
      sourceLabel: replacement.source,
      selectedVariations: [],
    }));
  }, [updateView]);

  const addVerticalFromCatalogue = useCallback((archetypeKey: string) => {
    updateView(prev => {
      if (prev.verticals.length >= MAX_WORKSET_SIZE) return prev;
      const newPosition = prev.verticals.length + 1;
      return {
        ...prev,
        verticals: [
          ...prev.verticals,
          {
            worksetId: `tmp-${cryptoId()}`,
            position: newPosition,
            rankLabel: rankLabelFor(newPosition),
            verticalKind: 'system_reference',
            verticalLabel: archetypeKey,
            systemArchetype: archetypeKey,
            ownedVerticalId: null,
            sourceLabel: 'catalogue',
            selectedVariations: [],
          },
        ],
      };
    });
  }, [updateView]);

  const addCreatorVertical = useCallback(async (input: { name: string; description: string }) => {
    setBusyMessage('Creating your creative direction…');
    try {
      const row = await createMyOwnedVertical({
        name: input.name,
        description: input.description,
        sourceKind: 'pure_creator',
      });
      setOwnedVerticals(prev => [...prev, row]);
      updateView(prev => {
        if (prev.verticals.length >= MAX_WORKSET_SIZE) return prev;
        const newPosition = prev.verticals.length + 1;
        return {
          ...prev,
          verticals: [
            ...prev.verticals,
            {
              worksetId: `tmp-${cryptoId()}`,
              position: newPosition,
              rankLabel: rankLabelFor(newPosition),
              verticalKind: 'creator_owned',
              verticalLabel: row.name,
              systemArchetype: null,
              ownedVerticalId: row.id,
              sourceLabel: 'created',
              selectedVariations: [],
            },
          ],
        };
      });
    } finally { setBusyMessage(null); }
  }, [updateView]);

  const removeVertical = useCallback((worksetId: string) => {
    updateView(prev => {
      const filtered = prev.verticals.filter(v => v.worksetId !== worksetId);
      if (filtered.length < MIN_WORKSET_SIZE) return prev;
      return renumber(prev, filtered);
    });
  }, [updateView]);

  const moveVertical = useCallback((worksetId: string, direction: 'up' | 'down') => {
    updateView(prev => {
      const ordered = prev.verticals.slice();
      const idx = ordered.findIndex(v => v.worksetId === worksetId);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= ordered.length) return prev;
      const next = ordered.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return renumber(prev, next);
    });
  }, [updateView]);

  const toggleLibraryVariation = useCallback((position: number, variation: ArchetypeVariation) => {
    updateView(prev => replaceVariationInVertical(prev, position, {
      entryId: `tmp-${cryptoId()}`,
      variationKind: 'system_reference',
      catalogVariationId: variation.id,
      ownedVariationId: null,
      name: variation.name,
      description: variation.description,
      sourceLabel: 'catalogue',
    }));
  }, [updateView]);

  const toggleOwnedVariation = useCallback((position: number, variation: CreatorOwnedVariation) => {
    updateView(prev => replaceVariationInVertical(prev, position, {
      entryId: `tmp-${cryptoId()}`,
      variationKind: 'creator_owned',
      catalogVariationId: null,
      ownedVariationId: variation.id,
      name: variation.name,
      description: variation.description,
      sourceLabel: 'created',
    }));
  }, [updateView]);

  const customiseLibraryVariation = useCallback(async (position: number, systemVariation: ArchetypeVariation, input: { name: string; description: string }) => {
    if (!view) return;
    const targetEntry = view.verticals.find(v => v.position === position);
    if (!targetEntry) return;
    setBusyMessage('Forking that variation…');
    try {
      const anchorToSystem = targetEntry.verticalKind === 'system_reference';
      const owned = await createMyOwnedVariation({
        name: input.name,
        description: input.description,
        ownedVerticalId: anchorToSystem ? null : (targetEntry.ownedVerticalId ?? null),
        systemArchetype: anchorToSystem ? (targetEntry.systemArchetype ?? null) : null,
        catalogVariationId: systemVariation.id,
      });
      setOwnedVariations(prev => [...prev, owned]);
      updateView(prev => {
        const list = prev.verticals.map(v => {
          if (v.position !== position) return v;
          const without = v.selectedVariations.filter(s => !(s.variationKind === 'system_reference' && s.catalogVariationId === systemVariation.id));
          return {
            ...v,
            selectedVariations: [
              ...without,
              {
                entryId: `tmp-${cryptoId()}`,
                variationKind: 'creator_owned' as const,
                catalogVariationId: null,
                ownedVariationId: owned.id,
                name: owned.name,
                description: owned.description,
                sourceLabel: 'created' as VerticalSourceLabel,
              },
            ],
          };
        });
        return { ...prev, verticals: list };
      });
    } finally { setBusyMessage(null); }
  }, [view, updateView]);

  const createOwnedVariationInVertical = useCallback(async (position: number, input: { name: string; description: string }) => {
    if (!view) return;
    const targetEntry = view.verticals.find(v => v.position === position);
    if (!targetEntry) return;
    setBusyMessage('Saving your variation…');
    try {
      const owned = await createMyOwnedVariation({
        name: input.name,
        description: input.description,
        ownedVerticalId: targetEntry.ownedVerticalId ?? null,
        systemArchetype: targetEntry.systemArchetype ?? null,
      });
      setOwnedVariations(prev => [...prev, owned]);
      updateView(prev => replaceVariationInVertical(prev, position, {
        entryId: `tmp-${cryptoId()}`,
        variationKind: 'creator_owned',
        catalogVariationId: null,
        ownedVariationId: owned.id,
        name: owned.name,
        description: owned.description,
        sourceLabel: 'created',
      }));
    } finally { setBusyMessage(null); }
  }, [view, updateView]);

  const renameOwnedVariation = useCallback(async (ownedVariationId: string, input: { name: string; description: string }) => {
    setBusyMessage('Saving your variation…');
    try {
      const updated = await updateMyOwnedVariation(ownedVariationId, input);
      setOwnedVariations(prev => prev.map(v => v.id === updated.id ? updated : v));
      updateView(prev => {
        const list = prev.verticals.map(v => ({
          ...v,
          selectedVariations: v.selectedVariations.map(s =>
            s.ownedVariationId === ownedVariationId
              ? { ...s, name: updated.name, description: updated.description }
              : s
          ),
        }));
        return { ...prev, verticals: list };
      });
    } finally { setBusyMessage(null); }
  }, [updateView]);

  const archiveVariation = useCallback(async (ownedVariationId: string, worksetId: string) => {
    setBusyMessage('Archiving…');
    try {
      await archiveMyOwnedVariation(ownedVariationId);
      setOwnedVariations(prev => prev.filter(v => v.id !== ownedVariationId));
      updateView(prev => ({
        ...prev,
        verticals: prev.verticals.map(v =>
          v.worksetId === worksetId
            ? { ...v, selectedVariations: v.selectedVariations.filter(s => s.ownedVariationId !== ownedVariationId) }
            : v
        ),
      }));
    } finally { setBusyMessage(null); }
  }, [updateView]);

  const renameOwnedVertical = useCallback(async (ownedVerticalId: string, input: { name: string; description: string }) => {
    setBusyMessage('Saving your creative direction…');
    try {
      const updated = await updateMyOwnedVertical(ownedVerticalId, input);
      setOwnedVerticals(prev => prev.map(v => v.id === updated.id ? updated : v));
      updateView(prev => ({
        ...prev,
        verticals: prev.verticals.map(v => v.ownedVerticalId === ownedVerticalId
          ? { ...v, verticalLabel: updated.name }
          : v),
      }));
    } finally { setBusyMessage(null); }
  }, [updateView]);

  const archiveOwnedVertical = useCallback(async (ownedVerticalId: string) => {
    setBusyMessage('Archiving…');
    try {
      await archiveMyOwnedVertical(ownedVerticalId);
      setOwnedVerticals(prev => prev.filter(v => v.id !== ownedVerticalId));
      updateView(prev => {
        const filtered = prev.verticals.filter(v => v.ownedVerticalId !== ownedVerticalId);
        if (filtered.length < MIN_WORKSET_SIZE) return prev;
        return renumber(prev, filtered);
      });
    } finally { setBusyMessage(null); }
  }, [updateView]);

  const submitOwnedVerticalForReview = useCallback(async (ownedVerticalId: string) => {
    setBusyMessage('Sending to the team…');
    try {
      const updated = await submitMyOwnedVerticalForReview(ownedVerticalId);
      setOwnedVerticals(prev => prev.map(v => v.id === updated.id ? updated : v));
    } finally { setBusyMessage(null); }
  }, []);

  const submitOwnedVariationForReview = useCallback(async (ownedVariationId: string) => {
    setBusyMessage('Sending to the team…');
    try {
      const updated = await submitMyOwnedVariationForReview(ownedVariationId);
      setOwnedVariations(prev => prev.map(v => v.id === updated.id ? updated : v));
    } finally { setBusyMessage(null); }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!snapshotId || !isPortfolioReady) return;
    setBusyMessage('Saving final selections…');
    try {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      await runSave();
      await materialiseAndGeneratePortfolio(snapshotId);
      await generateMyPersonaPortfolio(snapshotId).catch(() => undefined);
      navigate('/my/personas');
    } finally { setBusyMessage(null); }
  }, [snapshotId, isPortfolioReady, runSave, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <WizardHeader />
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Preparing your character possibilities…
          </div>
        </div>
      </div>
    );
  }
  if (loadError || !view || !snapshot) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <WizardHeader />
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-pink/30 bg-pink/10 p-5 text-sm text-pink" role="alert">
            {loadError || 'We could not load your character possibilities.'}
          </div>
          <a href="#/my" className="btn-secondary mt-4 inline-flex text-sm">Back to My Vertical</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 text-charcoal">
      <WizardHeader />
      <StepIndicator step={wizardStep} />
      {/* Stable live region — its textContent only mounts once data has
          loaded, so SR users do not hear a step label for a skeleton.
          role="status" implicitly sets aria-live="polite"; the explicit
          attribute is dropped to avoid the redundancy. */}
      <p
        role="status"
        className="sr-only"
      >
        {!loading ? `Step ${stepIndex(wizardStep) + 1} of ${STEP_ORDER.length}: ${STEP_LABELS[wizardStep]}` : ''}
      </p>
      <div
        key={wizardStep}
        className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 transition-opacity duration-200"
      >
        {wizardStep === 'choose' && fastForwardedToEditor && (
          <div className="mb-4 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-charcoal">
            <p className="font-semibold text-charcoal">Welcome back.</p>
            <p className="mt-1 text-charcoal-2">
              Your saved variations are below. Continue when you&rsquo;re ready, or hit Back to revisit the introduction steps.
            </p>
          </div>
        )}
        {wizardStep === 'reveal' && (
          <StepReveal snapshot={snapshot} onContinue={() => setWizardStep('explain')} />
        )}
        {wizardStep === 'explain' && (
          <StepExplain onContinue={() => setWizardStep('choose')} onBack={() => setWizardStep('reveal')} />
        )}
        {wizardStep === 'choose' && view && (
          <StepChoose
            view={view}
            libraryByArchetype={libraryByArchetype}
            ownedVariations={ownedVariations}
            ownedVerticals={ownedVerticals}
            saveStatus={saveStatus}
            saveError={saveError}
            busyMessage={busyMessage}
            totalSelected={totalSelected}
            isPortfolioReady={isPortfolioReady}
            onReplaceVertical={replaceVertical}
            onAddVerticalFromCatalogue={addVerticalFromCatalogue}
            onAddCreatorVertical={addCreatorVertical}
            onRemoveVertical={removeVertical}
            onMoveVertical={moveVertical}
            onToggleLibraryVariation={toggleLibraryVariation}
            onToggleOwnedVariation={toggleOwnedVariation}
            onCustomiseLibraryVariation={customiseLibraryVariation}
            onCreateOwnedVariation={createOwnedVariationInVertical}
            onRenameOwnedVariation={renameOwnedVariation}
            onArchiveOwnedVariation={archiveVariation}
            onRenameOwnedVertical={renameOwnedVertical}
            onArchiveOwnedVertical={archiveOwnedVertical}
            onSubmitOwnedVerticalForReview={submitOwnedVerticalForReview}
            onSubmitOwnedVariationForReview={submitOwnedVariationForReview}
            onContinue={() => setWizardStep('generate')}
            onBack={() => setWizardStep('explain')}
          />
        )}
        {wizardStep === 'generate' && view && (
          <StepGenerate
            view={view}
            totalSelected={totalSelected}
            isPortfolioReady={isPortfolioReady}
            busyMessage={busyMessage}
            onBack={() => setWizardStep('choose')}
            onGenerate={handleGenerate}
            onEdit={() => setWizardStep('choose')}
          />
        )}
      </div>
    </div>
  );
}

// Wizard chrome

function WizardHeader() {
  return (
    <header className="border-b border-white/10 bg-surface px-4 py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-0 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={brandLogo} alt="Find Your Vertical" className="h-12 w-auto object-contain" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Build Your Character Possibilities</p>
            <h1 className="text-xl font-bold leading-tight text-charcoal sm:text-2xl">Your character portfolio</h1>
          </div>
        </div>
        <a href="#/my" className="btn-secondary text-xs">Back to My Vertical</a>
      </div>
    </header>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <nav
      aria-label="Wizard progress"
      className="border-b border-white/10 bg-surface px-4 py-3"
    >
      <ol className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 px-0 text-xs text-charcoal-2 sm:px-6 lg:px-8">
        {STEP_ORDER.map((s, idx) => {
          const active = step === s;
          const reached = stepIndex(step) >= idx;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  active
                    ? 'border-accent bg-accent text-white'
                    : reached
                      ? creativeDirectionBadge(idx + 1)
                      : 'border-white/10 bg-surface-2 text-charcoal-2'
                }`}
              >
                {idx + 1}
              </span>
              <span className={active ? 'font-semibold text-charcoal' : ''}>{STEP_LABELS[s]}</span>
              {idx < STEP_ORDER.length - 1 && (
                <span aria-hidden="true" className="mx-1 hidden text-charcoal-2 sm:inline">→</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SaveStatusPill({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === 'idle') return null;
  const tone =
    status === 'saving' ? 'border-white/10 bg-white/5 text-charcoal-2'
    : status === 'saved' ? 'border-success/40 bg-success/10 text-success'
    : 'border-pink/30 bg-pink/10 text-pink';
  const label =
    status === 'saving' ? 'Saving…'
    : status === 'saved' ? 'Saved'
    : error ?? 'Save failed';
  return (
    <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`} role="status">
      <span className={`h-2 w-2 rounded-full ${status === 'saving' ? 'bg-accent animate-pulse' : status === 'saved' ? 'bg-success' : 'bg-pink'}`} />
      {label}
    </div>
  );
}

// Step 1 — Reveal

interface StepRevealProps {
  snapshot: CreatorArchetypeSnapshot;
  onContinue: () => void;
}

// Static companion copy for the archetypes we see most often in assessments.
// Step 1 uses this so the heading and the description line are DIFFERENT.
// Unknown archetypes fall through to the generic fallback so the reveal
// never shows the archetype name twice.
const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  'Alternative / Tattooed': 'Authentic, expressive and creatively independent.',
  'College Girl': 'Relatable, approachable and naturally engaging.',
  'Dominatrix': 'Confident, structured and premium.',
  'MILF / Mom': 'Mature, nurturing and confidently experienced.',
  'Goth': 'Moody, artistic and introspective.',
  'Fitness': 'Energetic, disciplined and aspirational.',
  'Cosplay': 'Playful, imaginative and high-production.',
  'Brunette Beauty': 'Classic, refined and naturally magnetic.',
  'Blonde Bombshell': 'Vibrant, confident and photogenic.',
  'Petite Playful': 'Cute, approachable and energetic.',
  'Girl-Next-Door': 'Friendly, sincere and easy to connect with.',
  'Girl-Next-Door / Sweet': 'Warm, trustworthy and naturally familiar.',
  'Party Girl': 'Outgoing, spontaneous and fun-loving.',
  'E-Girl': 'Internet-native, alternative and meme-fluent.',
};
const GENERIC_ARCHETYPE_DESCRIPTION = 'A creative direction you can develop across multiple characters.';

function descriptionForArchetype(name: string): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return GENERIC_ARCHETYPE_DESCRIPTION;
  return ARCHETYPE_DESCRIPTIONS[trimmed] ?? GENERIC_ARCHETYPE_DESCRIPTION;
}

function StepReveal({ snapshot, onContinue }: StepRevealProps) {
  const ranked = snapshotToRankedArchetypes(snapshot);
  const archetypes = ranked.map((r, idx) => ({
    rankIdx: idx,
    archetype: r.archetype,
    description: descriptionForArchetype(r.archetype),
  }));
  return (
    <section data-wizard-step="reveal" className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your Assessment Results</p>
        <h2 className="mt-2 text-3xl font-bold text-charcoal" tabIndex={-1}>Three creative directions that fit you best</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-charcoal-2">
          We&rsquo;ve analysed your assessment and identified the creative directions that best
          match your personality, interests and long-term creator potential.
          {' '}
          These aren&rsquo;t characters. They&rsquo;re the creative directions our AI believes
          you&rsquo;ll enjoy creating and sustaining over time.
        </p>
      </header>
      <ol className="grid gap-4 sm:grid-cols-3">
        {archetypes.map(({ rankIdx, archetype, description }) => (
          <li
            key={archetype}
            className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <span aria-hidden="true" className="text-2xl">
                {rankIdx === 0 ? '🥇' : rankIdx === 1 ? '🥈' : '🥉'}
              </span>
              <span className="rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                {rankIdx === 0 ? 'Top match' : rankIdx === 1 ? 'Strong match' : 'Worth exploring'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-charcoal">{archetype}</h3>
            <p className="text-sm leading-6 text-charcoal-2">{description}</p>
            <p className="mt-auto text-[11px] uppercase tracking-wide text-charcoal-2">Recommended from your assessment</p>
          </li>
        ))}
      </ol>
      <WizardFooter
        primaryLabel="Continue \u2192"
        onPrimary={onContinue}
        secondary={null}
      />
    </section>
  );
}

// Step 2 — Explain

interface StepExplainProps {
  onContinue: () => void;
  onBack: () => void;
}

function StepExplain({ onContinue, onBack }: StepExplainProps) {
  const examples = [
    { direction: 'Alternative / Tattooed', variation: 'Goth Girlfriend', character: 'Your Style Guide' },
    { direction: 'College Girl', variation: 'Sorority Sweetheart', character: 'The Relatable Best Friend' },
    { direction: 'Dominatrix', variation: 'Confident Power Player', character: 'The Premium Experience' },
  ];
  return (
    <section data-wizard-step="explain" className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">How This Works</p>
        <h2 className="mt-2 text-3xl font-bold text-charcoal" tabIndex={-1}>Build your character portfolio</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-charcoal-2">
          Successful creators rarely rely on a single character. Instead, they create multiple
          authentic variations of themselves that appeal to different audiences while staying
          true to who they are.
          {' '}
          We&rsquo;ll now help you build your first creator portfolio.
        </p>
      </header>
      <div className="rounded-2xl border border-white/10 bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">From direction to character</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {examples.map(example => (
            <li key={example.direction} className="rounded-xl border border-white/10 bg-surface-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Creative Direction</p>
              <p className="mt-1 text-base font-semibold text-charcoal">{example.direction}</p>
              <div className="my-3 flex flex-col items-center text-charcoal-2">
                <span aria-hidden="true">↓</span>
                <span aria-hidden="true">↓</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Variation</p>
              <p className="mt-1 text-base font-semibold text-charcoal">{example.variation}</p>
              <div className="my-3 flex flex-col items-center text-charcoal-2">
                <span aria-hidden="true">↓</span>
                <span aria-hidden="true">↓</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Character</p>
              <p className="mt-1 text-base font-semibold text-charcoal">{example.character}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-2xl border border-accent/30 bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your selection rules</p>
        <p className="mt-2 text-base leading-7 text-charcoal-2">
          Choose at least six variations that genuinely feel like something you&rsquo;d enjoy
          creating. You can:
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <PermittedAction text="Keep the suggested creative directions" />
          <PermittedAction text="Replace a direction with another from the catalogue" />
          <PermittedAction text="Add new directions from the catalogue" />
          <PermittedAction text="Create your own directions entirely" />
        </ul>
      </div>
      <WizardFooter
        primaryLabel="Start Building →"
        onPrimary={onContinue}
        secondary={{ label: '← Back', onClick: onBack }}
      />
    </section>
  );
}

function PermittedAction({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm text-charcoal-2">
      <span aria-hidden="true" className="mt-0.5 text-accent">✓</span>
      <span>{text}</span>
    </li>
  );
}

// Step 3 — Choose

interface StepChooseProps {
  view: CreatorVerticalWorksetView;
  libraryByArchetype: Map<string, CatalogueArchetype>;
  ownedVariations: CreatorOwnedVariation[];
  ownedVerticals: CreatorOwnedVertical[];
  saveStatus: SaveStatus;
  saveError: string | null;
  busyMessage: string | null;
  totalSelected: number;
  isPortfolioReady: boolean;
  onReplaceVertical: (position: number, replacement: { archetypeKey: string; source: VerticalSourceLabel }) => Promise<void>;
  onAddVerticalFromCatalogue: (archetype: string) => void;
  onAddCreatorVertical: (input: { name: string; description: string }) => Promise<void>;
  onRemoveVertical: (worksetId: string) => void;
  onMoveVertical: (worksetId: string, direction: 'up' | 'down') => void;
  onToggleLibraryVariation: (position: number, variation: ArchetypeVariation) => void;
  onToggleOwnedVariation: (position: number, variation: CreatorOwnedVariation) => void;
  onCustomiseLibraryVariation: (position: number, variation: ArchetypeVariation, edit: { name: string; description: string }) => Promise<void>;
  onCreateOwnedVariation: (position: number, edit: { name: string; description: string }) => Promise<void>;
  onRenameOwnedVariation: (ownedVariationId: string, edit: { name: string; description: string }) => Promise<void>;
  onArchiveOwnedVariation: (ownedVariationId: string, worksetId: string) => Promise<void>;
  onRenameOwnedVertical: (ownedVerticalId: string, edit: { name: string; description: string }) => Promise<void>;
  onArchiveOwnedVertical: (ownedVerticalId: string) => Promise<void>;
  onSubmitOwnedVerticalForReview: (ownedVerticalId: string) => Promise<void>;
  onSubmitOwnedVariationForReview: (ownedVariationId: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}

function StepChoose(props: StepChooseProps) {
  const {
    view, libraryByArchetype, ownedVariations, ownedVerticals,
    saveStatus, saveError, busyMessage, totalSelected, isPortfolioReady,
    onReplaceVertical, onAddVerticalFromCatalogue, onAddCreatorVertical,
    onRemoveVertical, onMoveVertical,
    onToggleLibraryVariation, onToggleOwnedVariation,
    onCustomiseLibraryVariation, onCreateOwnedVariation,
    onRenameOwnedVariation, onArchiveOwnedVariation,
    onRenameOwnedVertical, onArchiveOwnedVertical,
    onSubmitOwnedVerticalForReview, onSubmitOwnedVariationForReview,
    onContinue, onBack,
  } = props;
  return (
    <section data-wizard-step="choose" className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Choose Your Variations</p>
        <h2 className="mt-2 text-2xl font-bold text-charcoal" tabIndex={-1}>Edit the directions, pick the variations</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal-2">
          Keep the suggested directions, swap any of them for a different one, add new ones, or
          create your own. Tap the variations that feel like something you&rsquo;d enjoy creating
          {' '}— at least six in total. You can keep editing until you&rsquo;re ready to build.
        </p>
      </header>

      <SaveStatusPill status={saveStatus} error={saveError} />
      {busyMessage && (
        <p className="text-xs text-charcoal-2" aria-live="polite">{busyMessage}</p>
      )}

      <ProgressCard totalSelected={totalSelected} ready={isPortfolioReady} />

      <div className="space-y-5">
        {view.verticals.map(entry => (
          <DirectionCard
            key={entry.worksetId}
            entry={entry}
            totalVerticals={view.verticals.length}
            libraryByArchetype={libraryByArchetype}
            ownedVariations={ownedVariations}
            ownedVerticals={ownedVerticals}
            onReplace={async archetypeKey => { await onReplaceVertical(entry.position, { archetypeKey, source: 'catalogue' }); }}
            onAddFromCatalogue={onAddVerticalFromCatalogue}
            onAddCreatorVertical={onAddCreatorVertical}
            onRemove={() => onRemoveVertical(entry.worksetId)}
            onMove={dir => onMoveVertical(entry.worksetId, dir)}
            onToggleLibrary={variation => onToggleLibraryVariation(entry.position, variation)}
            onToggleOwned={variation => onToggleOwnedVariation(entry.position, variation)}
            onCustomiseLibrary={async (variation, edit) => { await onCustomiseLibraryVariation(entry.position, variation, edit); }}
            onCreateOwnedVariation={async edit => { await onCreateOwnedVariation(entry.position, edit); }}
            onRenameOwnedVariation={async (id, edit) => { await onRenameOwnedVariation(id, edit); }}
            onArchiveOwnedVariation={async id => { await onArchiveOwnedVariation(id, entry.worksetId); }}
            onRenameOwnedVertical={entry.ownedVerticalId ? async (id, edit) => { await onRenameOwnedVertical(id, edit); } : null}
            onArchiveOwnedVertical={entry.ownedVerticalId ? async () => { await onArchiveOwnedVertical(entry.ownedVerticalId as string); } : null}
            onSubmitOwnedVerticalForReview={entry.ownedVerticalId && ownedVerticals.find(v => v.id === entry.ownedVerticalId)?.review_status === 'none'
              ? async () => { await onSubmitOwnedVerticalForReview(entry.ownedVerticalId as string); }
              : null}
            onSubmitOwnedVariationForReview={async id => { await onSubmitOwnedVariationForReview(id); }}
          />
        ))}
      </div>

      {view.verticals.length < MAX_WORKSET_SIZE && (
        <AddDirectionCard
          libraryByArchetype={libraryByArchetype}
          onPickCatalogue={onAddVerticalFromCatalogue}
          onCreateCreator={onAddCreatorVertical}
          alreadyUsedArchetypes={view.verticals.filter(v => v.systemArchetype).map(v => v.systemArchetype as string)}
        />
      )}

      <FooterCopy totalSelected={totalSelected} ready={isPortfolioReady} />

      <WizardFooter
        primaryLabel="Continue →"
        primaryDisabled={!isPortfolioReady}
        onPrimary={onContinue}
        secondary={{ label: '← Back', onClick: onBack }}
      />
    </section>
  );
}

function ProgressCard({ totalSelected, ready }: { totalSelected: number; ready: boolean }) {
  const needed = Math.max(0, TOTAL_MINIMUM - totalSelected);
  return (
    <section
      aria-label="Progress"
      className="rounded-2xl border border-accent/30 bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">Your progress</p>
          <p className="mt-1 text-lg font-bold text-charcoal">
            <span data-testid="total-selected">{totalSelected}</span> of {TOTAL_MINIMUM} variations selected
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-success/15 text-success' : 'bg-white/5 text-charcoal-2'}`}>
          {ready ? '✓ Ready to build your portfolio' : 'Keep exploring'}
        </span>
      </div>
      <ProgressBar value={Math.min(totalSelected, TOTAL_MINIMUM)} max={TOTAL_MINIMUM} />
      <p className={`mt-3 text-sm ${ready ? 'text-success' : 'text-charcoal-2'}`}>
        {ready
          ? 'You\u2019ve selected enough variations. Head to the next step to build your portfolio.'
          : needed === 1
            ? 'Choose 1 more variation to continue.'
            : `Choose ${needed} more variations to continue.`}
      </p>
    </section>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
      <div
        className={`h-full ${pct >= 100 ? 'bg-success' : 'bg-accent'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FooterCopy({ totalSelected, ready }: { totalSelected: number; ready: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-3 px-4 py-3 text-sm text-charcoal-2">
      <p>
        Select at least six variations from any combination of your creative directions.{' '}
        You can continue editing your directions at any time.
      </p>
      {!ready && (
        <p className="mt-1 text-xs text-charcoal-2">
          You&rsquo;ve chosen {totalSelected} so far.
        </p>
      )}
    </div>
  );
}

// Step 4 — Generate

interface StepGenerateProps {
  view: CreatorVerticalWorksetView;
  totalSelected: number;
  isPortfolioReady: boolean;
  busyMessage: string | null;
  onBack: () => void;
  onGenerate: () => Promise<void>;
  onEdit: () => void;
}

function StepGenerate({ view, totalSelected, isPortfolioReady, busyMessage, onBack, onGenerate, onEdit }: StepGenerateProps) {
  // Step 4 is reachable only via Step 3's `primaryDisabled={!isPortfolioReady}`
  // gate, so `isPortfolioReady` is always true here and we always generate six
  // characters. `totalSelected` is consumed by the SummaryCard below.
  return (
    <section data-wizard-step="generate" className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Generate Portfolio</p>
        <h2 className="mt-2 text-3xl font-bold text-charcoal" tabIndex={-1}>Ready to build your character portfolio</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-charcoal-2">
          We&rsquo;ll now generate six draft creator characters. Each character will
          include:
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2">
        <PortfolioItem text="Positioning" />
        <PortfolioItem text="Personality" />
        <PortfolioItem text="Audience" />
        <PortfolioItem text="Tone of voice" />
        <PortfolioItem text="Content themes" />
        <PortfolioItem text="Visual direction" />
        <PortfolioItem text="Monetisation opportunities" />
        <PortfolioItem text="AI profile" />
      </ul>
      <SummaryCard view={view} totalSelected={totalSelected} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { void onGenerate(); }}
          disabled={!isPortfolioReady || Boolean(busyMessage)}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {busyMessage ?? 'Generate My Character Portfolio'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="btn-secondary text-sm"
        >
          Edit variations
        </button>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary text-sm"
        >
          ← Back
        </button>
      </div>
    </section>
  );
}

function PortfolioItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal">
      <span aria-hidden="true" className="text-accent">✓</span>
      <span>{text}</span>
    </li>
  );
}

function SummaryCard({ view, totalSelected }: { view: CreatorVerticalWorksetView; totalSelected: number }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-2">Your selection summary</p>
      <p className="mt-1 text-base text-charcoal">
        You&rsquo;ve chosen {totalSelected} variations across {view.verticals.length}{' '}
        {view.verticals.length === 1 ? 'creative direction' : 'creative directions'}.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-charcoal-2">
        {view.verticals.map(v => (
          <li key={v.worksetId} className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-charcoal">{v.verticalLabel}</span>
            <span className="text-charcoal-2">{v.selectedVariations.length} variation{v.selectedVariations.length === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Wizard footer

interface WizardFooterProps {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondary: { label: string; onClick: () => void } | null;
}

function WizardFooter({ primaryLabel, onPrimary, primaryDisabled, secondary }: WizardFooterProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        {secondary && (
          <button type="button" className="btn-secondary text-sm" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="btn-primary text-base disabled:opacity-50"
      >
        {primaryLabel}
      </button>
    </div>
  );
}

// Direction card (Step 3)

interface DirectionCardProps {
  entry: CreatorVerticalWorksetViewEntry;
  totalVerticals: number;
  libraryByArchetype: Map<string, CatalogueArchetype>;
  ownedVariations: CreatorOwnedVariation[];
  ownedVerticals: CreatorOwnedVertical[];
  onReplace: (archetype: string) => void;
  onAddFromCatalogue: (archetype: string) => void;
  onAddCreatorVertical: (input: { name: string; description: string }) => Promise<void>;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onToggleLibrary: (variation: ArchetypeVariation) => void;
  onToggleOwned: (variation: CreatorOwnedVariation) => void;
  onCustomiseLibrary: (variation: ArchetypeVariation, edit: { name: string; description: string }) => Promise<void>;
  onCreateOwnedVariation: (edit: { name: string; description: string }) => Promise<void>;
  onRenameOwnedVariation: (id: string, edit: { name: string; description: string }) => Promise<void>;
  onArchiveOwnedVariation: (id: string) => Promise<void>;
  onRenameOwnedVertical: ((id: string, edit: { name: string; description: string }) => Promise<void>) | null;
  onArchiveOwnedVertical: (() => Promise<void>) | null;
  onSubmitOwnedVerticalForReview: (() => Promise<void>) | null;
  onSubmitOwnedVariationForReview: (id: string) => Promise<void>;
}

function DirectionCard(props: DirectionCardProps) {
  const { entry, libraryByArchetype, ownedVariations, onReplace, onRemove, onMove, onToggleLibrary, onToggleOwned, onCustomiseLibrary, onCreateOwnedVariation, onRenameOwnedVariation, onArchiveOwnedVariation, onRenameOwnedVertical, onArchiveOwnedVertical, onSubmitOwnedVerticalForReview, onSubmitOwnedVariationForReview, totalVerticals } = props;

  const catalogueArchetype = entry.systemArchetype ? libraryByArchetype.get(entry.systemArchetype) : undefined;
  const libraryVariations = catalogueArchetype?.variations ?? [];
  const ownedForThis = ownedVariations.filter(
    v => v.is_archived === false
      && (entry.ownedVerticalId ? v.owned_vertical_id === entry.ownedVerticalId : v.system_archetype === entry.systemArchetype && !v.owned_vertical_id),
  );
  const isFirst = entry.position === 1;
  const isLast = entry.position === totalVerticals;

  return (
    <section
      className="rounded-2xl border border-white/10 bg-surface p-5"
      aria-label={creativeDirectionLabel(entry.position)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-bold text-charcoal">{entry.verticalLabel}</h3>
        <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">
          {sourceLabelCopy(entry.sourceLabel)}
        </span>
        {entry.sourceLabel === 'recommended' && isFirst && (
          <span className="ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            From your assessment
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => onMove('up')} disabled={isFirst} aria-label="Move up">
          Move up
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => onMove('down')} disabled={isLast} aria-label="Move down">
          Move down
        </button>
        <ReplaceDirectionMenu currentArchetype={entry.systemArchetype} libraryByArchetype={libraryByArchetype} onPick={onReplace} />
        {onRenameOwnedVertical && entry.ownedVerticalId && (
          <RenameOwnedVerticalButton
            onSubmit={edit => onRenameOwnedVertical(entry.ownedVerticalId as string, edit)}
            initialName={entry.verticalLabel}
            initialDescription=""
          />
        )}
        {onArchiveOwnedVertical && (
          <button type="button" className="btn-secondary text-xs text-pink" onClick={() => { void onArchiveOwnedVertical(); }}>
            Archive direction
          </button>
        )}
        {onSubmitOwnedVerticalForReview && (
          <button type="button" className="btn-secondary text-xs" onClick={() => { void onSubmitOwnedVerticalForReview(); }}>
            Send to the team for review
          </button>
        )}
        <button type="button" className="btn-secondary text-xs text-pink ml-auto" onClick={() => onRemove()} disabled={totalVerticals === MIN_WORKSET_SIZE}>
          Remove direction
        </button>
      </div>

      <p className="mt-4 text-sm font-semibold text-charcoal">Which versions of this direction feel like you?</p>
      <p className="mt-1 text-xs text-charcoal-2">
        Tap any variation you&rsquo;d enjoy creating &mdash; there&rsquo;s no per-direction quota.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {libraryVariations.map(lib => {
          const selected = entry.selectedVariations.some(
            s => s.variationKind === 'system_reference' && s.catalogVariationId === lib.id,
          );
          const customisedId = entry.selectedVariations.find(
            s => s.variationKind === 'creator_owned'
              && ownedForThis.some(o => o.catalog_variation_id === lib.id && o.id === s.ownedVariationId),
          )?.ownedVariationId;
          return (
            <VariationTile
              key={`lib:${lib.id}`}
              name={lib.name}
              description={lib.description}
              sourceLabel="catalogue"
              selected={selected}
              isCustomisedFork={Boolean(customisedId)}
              onToggle={() => onToggleLibrary(lib)}
              onCustomise={async edit => { await onCustomiseLibrary(lib, edit); }}
            />
          );
        })}
        {ownedForThis.map(ov => {
          const selected = entry.selectedVariations.some(s => s.ownedVariationId === ov.id);
          return (
            <VariationTile
              key={`own:${ov.id}`}
              name={ov.name}
              description={ov.description}
              sourceLabel="created"
              selected={selected}
              isOwned={!ov.owned_vertical_id}
              ownedReviewStatus={ov.review_status}
              onToggle={() => onToggleOwned(ov)}
              onRename={async edit => { await onRenameOwnedVariation(ov.id, edit); }}
              onArchive={() => { void onArchiveOwnedVariation(ov.id); }}
              onSubmitForReview={ov.review_status === 'none' ? () => { void onSubmitOwnedVariationForReview(ov.id); } : null}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <CreateVariationButton onSubmit={onCreateOwnedVariation} />
      </div>
    </section>
  );
}

function VariationTile(props: {
  name: string;
  description: string;
  sourceLabel: VerticalSourceLabel;
  selected: boolean;
  isCustomisedFork?: boolean;
  isOwned?: boolean;
  ownedReviewStatus?: 'none' | 'pending_review' | 'approved' | 'rejected';
  onToggle: () => void;
  onCustomise?: (edit: { name: string; description: string }) => Promise<void>;
  onRename?: (edit: { name: string; description: string }) => Promise<void>;
  onArchive?: () => void;
  onSubmitForReview?: (() => void) | null;
}) {
  const [mode, setMode] = useState<'view' | 'customise'>('view');
  if (mode === 'customise' && props.onCustomise) {
    return (
      <InlineEditor
        initialName={props.name}
        initialDescription={props.description}
        submitLabel="Save variation"
        onCancel={() => setMode('view')}
        onSubmit={async values => { await props.onCustomise!(values); setMode('view'); }}
      />
    );
  }
  const tileClass = props.selected ? TILE_SELECTED : (props.isOwned ? TILE_READONLY : TILE_IDLE);
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      onClick={props.onToggle}
      className={`${TILE_BASE} ${tileClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold">{props.name}</span>
        <span className={`mt-0.5 shrink-0 text-xs font-semibold ${props.selected ? 'text-white' : 'text-charcoal-2'}`}>
          {props.selected ? 'Selected' : 'Tap to add'}
        </span>
      </div>
      {props.description && (
        <p className={`mt-2 text-sm leading-6 ${props.selected ? 'text-white/90' : 'text-charcoal-2'}`}>{props.description}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-charcoal-2">{sourceLabelCopy(props.sourceLabel)}</span>
        {props.isCustomisedFork && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">Customised fork</span>}
        {props.isOwned && props.ownedReviewStatus === 'pending_review' && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">Pending review</span>}
        {props.isOwned && props.ownedReviewStatus === 'approved' && <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">Approved</span>}
        {props.isOwned && props.ownedReviewStatus === 'rejected' && <span className="rounded-full bg-pink/15 px-2 py-0.5 text-pink">Needs changes</span>}
      </div>
      {(props.onCustomise || props.onRename || props.onArchive || props.onSubmitForReview) && (
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
          {props.onCustomise && (
            <button type="button" className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-charcoal-2 hover:bg-accent/15 hover:text-accent" onClick={() => setMode('customise')}>
              Customise
            </button>
          )}
          {props.onRename && (
            <RenameOwnedVariationButton onSubmit={props.onRename} initialName={props.name} initialDescription={props.description} />
          )}
          {props.onArchive && (
            <button type="button" className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-pink hover:bg-pink/15" onClick={() => { props.onArchive?.(); }}>
              Archive
            </button>
          )}
          {props.onSubmitForReview && (
            <button type="button" className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-charcoal-2 hover:bg-accent/15 hover:text-accent" onClick={() => { props.onSubmitForReview?.(); }}>
              Submit for review
            </button>
          )}
        </div>
      )}
    </button>
  );
}

function RenameOwnedVariationButton(props: {
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
  initialName: string;
  initialDescription: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-charcoal-2 hover:bg-accent/15 hover:text-accent" onClick={e => { e.stopPropagation(); setOpen(true); }}>
        Edit
      </button>
    );
  }
  return (
    <InlineEditor
      initialName={props.initialName}
      initialDescription={props.initialDescription}
      submitLabel="Save"
      onCancel={() => setOpen(false)}
      onSubmit={async values => { await props.onSubmit(values); setOpen(false); }}
    />
  );
}

function RenameOwnedVerticalButton(props: {
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
  initialName: string;
  initialDescription: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        Rename direction
      </button>
    );
  }
  return (
    <div className="w-full">
      <InlineEditor
        initialName={props.initialName}
        initialDescription={props.initialDescription}
        submitLabel="Save direction"
        onCancel={() => setOpen(false)}
        onSubmit={async values => { await props.onSubmit(values); setOpen(false); }}
      />
    </div>
  );
}

function CreateVariationButton(props: {
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>
        + Create variation
      </button>
    );
  }
  return (
    <InlineEditor
      initialName=""
      initialDescription=""
      submitLabel="Create variation"
      onCancel={() => setOpen(false)}
      onSubmit={async values => { await props.onSubmit(values); setOpen(false); }}
    />
  );
}

function ReplaceDirectionMenu(props: {
  currentArchetype: string | null;
  libraryByArchetype: Map<string, CatalogueArchetype>;
  onPick: (archetypeKey: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(true)}>Replace from catalogue</button>;
  }
  const archetypes = [...props.libraryByArchetype.keys()];
  const filtered = archetypes.filter(a => a.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="w-full max-w-xs rounded-xl border border-white/10 bg-surface-2 p-3">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search catalogue directions"
        className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal"
      />
      <ul className="mt-2 max-h-48 overflow-auto text-sm">
        {filtered.map(a => (
          <li key={a}>
            <button
              type="button"
              className={`w-full rounded-md px-2 py-1 text-left hover:bg-accent/15 ${props.currentArchetype === a ? 'font-semibold text-accent' : 'text-charcoal'}`}
              onClick={() => { props.onPick(a); setOpen(false); setQuery(''); }}
            >
              {a}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-2 py-1 text-xs text-charcoal-2">No match — try a different keyword.</li>
        )}
      </ul>
      <button type="button" className="btn-secondary mt-2 w-full text-xs" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function AddDirectionCard(props: {
  libraryByArchetype: Map<string, CatalogueArchetype>;
  onPickCatalogue: (archetype: string) => void;
  onCreateCreator: (input: { name: string; description: string }) => Promise<void>;
  alreadyUsedArchetypes: string[];
}) {
  const [mode, setMode] = useState<'catalogue' | 'custom' | null>(null);
  if (mode === 'custom') {
    return (
      <section className="mt-5 rounded-2xl border border-dashed border-accent/50 bg-surface p-5">
        <InlineEditor
          initialName=""
          initialDescription=""
          submitLabel="Create direction"
          onCancel={() => setMode(null)}
          onSubmit={async values => { await props.onCreateCreator(values); setMode(null); }}
        />
      </section>
    );
  }
  if (mode === 'catalogue') {
    return (
      <section className="mt-5 rounded-2xl border border-dashed border-accent/50 bg-surface p-5">
        <h3 className="text-base font-semibold text-charcoal">Add a direction from the catalogue</h3>
        <p className="mt-1 text-xs text-charcoal-2">Pick up to {MAX_WORKSET_SIZE - props.alreadyUsedArchetypes.length} more. Already-selected ones are dimmed.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...props.libraryByArchetype.keys()].map(a => {
            const already = props.alreadyUsedArchetypes.includes(a);
            return (
              <button
                key={a}
                type="button"
                disabled={already}
                className={`rounded-xl border p-3 text-left text-sm ${already ? 'border-white/5 bg-surface-2 text-charcoal-2' : 'border-white/10 bg-surface-2 hover:border-accent/70 hover:bg-accent/10'}`}
                onClick={() => { props.onPickCatalogue(a); setMode(null); }}
              >
                <div className="font-semibold text-charcoal">{a}</div>
                <div className="text-xs text-charcoal-2">{already ? 'Already in your list' : 'Add to your list'}</div>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn-secondary mt-3 text-xs" onClick={() => setMode(null)}>Cancel</button>
      </section>
    );
  }
  return (
    <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button type="button" className="rounded-2xl border border-dashed border-accent/40 bg-surface p-5 text-left" onClick={() => setMode('catalogue')}>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">From the catalogue</span>
        <p className="mt-1 text-sm font-semibold text-charcoal">Add another direction</p>
        <p className="mt-1 text-xs text-charcoal-2">Pick any archetype the FYV team has already curated.</p>
      </button>
      <button type="button" className="rounded-2xl border border-dashed border-accent/40 bg-surface p-5 text-left" onClick={() => setMode('custom')}>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Created by you</span>
        <p className="mt-1 text-sm font-semibold text-charcoal">Create a new direction</p>
        <p className="mt-1 text-xs text-charcoal-2">Name and describe a direction that is entirely yours.</p>
      </button>
    </section>
  );
}

function InlineEditor(props: {
  initialName: string;
  initialDescription: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(props.initialName);
  const [description, setDescription] = useState(props.initialDescription);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="w-full rounded-xl border border-white/10 bg-surface-2 p-3"
      onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try { await props.onSubmit({ name: name.trim(), description: description.trim() }); }
        finally { setBusy(false); }
      }}
    >
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name"
        required
        className="w-full rounded-md border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="mt-2 w-full rounded-md border border-white/10 bg-surface px-3 py-2 text-sm text-charcoal"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? 'Saving…' : props.submitLabel}</button>
        <button type="button" className="btn-secondary text-xs" onClick={props.onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// Pure helpers (module-scope)

function replaceVariationInVertical(prev: CreatorVerticalWorksetView, position: number, next: {
  entryId: string;
  variationKind: 'system_reference' | 'creator_owned';
  catalogVariationId: string | null;
  ownedVariationId: string | null;
  name: string;
  description: string;
  sourceLabel: VerticalSourceLabel;
}): CreatorVerticalWorksetView {
  const list = prev.verticals.map(v => {
    if (v.position !== position) return v;
    const matchKey = next.variationKind === 'system_reference'
      ? `sys:${next.catalogVariationId}`
      : `own:${next.ownedVariationId}`;
    const already = v.selectedVariations.some(s => {
      const key = s.variationKind === 'system_reference' ? `sys:${s.catalogVariationId}` : `own:${s.ownedVariationId}`;
      return key === matchKey;
    });
    const filtered = v.selectedVariations.filter(s => {
      const key = s.variationKind === 'system_reference' ? `sys:${s.catalogVariationId}` : `own:${s.ownedVariationId}`;
      return key !== matchKey;
    });
    const selectedVariations = already ? filtered : [...filtered, next];
    return { ...v, selectedVariations };
  });
  return { ...prev, verticals: list };
}

function renumber(prev: CreatorVerticalWorksetView, ordered: CreatorVerticalWorksetViewEntry[]): CreatorVerticalWorksetView {
  const renamed = ordered.map((entry, idx) => ({
    ...entry,
    position: idx + 1,
    rankLabel: rankLabelFor(idx + 1),
  }));
  return { ...prev, verticals: renamed };
}

function renumberAndReplaceAt(prev: CreatorVerticalWorksetView, position: number, replacement: Omit<CreatorVerticalWorksetViewEntry, 'rankLabel' | 'selectedVariations'> & { selectedVariations?: CreatorVerticalWorksetViewEntry['selectedVariations'] }): CreatorVerticalWorksetView {
  const list = prev.verticals.slice();
  const existingIdx = list.findIndex(v => v.position === position);
  if (existingIdx === -1) return prev;
  const existing = list[existingIdx];
  list[existingIdx] = {
    ...replacement,
    rankLabel: rankLabelFor(replacement.position),
    selectedVariations: replacement.selectedVariations ?? existing.selectedVariations,
  };
  return { ...prev, verticals: list };
}

function buildLibraryIndex(rows: ArchetypeVariation[]): Map<string, CatalogueArchetype> {
  const map = new Map<string, CatalogueArchetype>();
  for (const v of rows) {
    const entry = map.get(v.archetype) ?? { archetype: v.archetype, description: '', variations: [] };
    entry.variations.push(v);
    map.set(v.archetype, entry);
  }
  for (const [, entry] of map) {
    entry.variations.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    entry.description = entry.variations[0]?.description ?? '';
  }
  return map;
}
