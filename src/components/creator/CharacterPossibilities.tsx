import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatorSession } from './CreatorGate';
import { supabase } from '@/lib/supabase';
import {
  snapshotToRankedArchetypes,
} from '@/lib/persona-archetypes';
import {
  getActiveVariationsForArchetypes,
  generateMyPersonaPortfolio,
  getMyArchetypeSnapshot,
  getMyVariationSelections,
} from '@/lib/creators-api';
import {
  MAX_WORKSET_SIZE,
  MIN_WORKSET_SIZE,
  POSITION_MINIMUMS,
  TOTAL_MINIMUM,
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
  RankLabel,
  VerticalSourceLabel,
} from '@/types/creator';
import brandLogo from '@/assets/fyv-brand-logo.png';

// ── Pure helpers (top-of-file so callbacks can close over them cleanly) ──────

/** Sort keys recursively so two structurally-equal views hash identically. */
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

// ── Display constants (pure; safe to colocate) ──────────────────────────────

const RANK_BADGE: Record<RankLabel, string> = {
  Primary: 'bg-accent/15 text-accent',
  Secondary: 'bg-warn/10 text-warn',
  Third: 'bg-success/15 text-success',
  Fourth: 'bg-accent/15 text-accent',
  Fifth: 'bg-warn/10 text-warn',
  Sixth: 'bg-success/15 text-success',
};

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
const AUTOSAVE_DEBOUNCE_MS = 900;

// ── Component ────────────────────────────────────────────────────────────────

export function CharacterPossibilities() {
  const { profile } = useCreatorSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [snapshot, setSnapshot] = useState<CreatorArchetypeSnapshot | null>(null);
  const [view, setView] = useState<CreatorVerticalWorksetView | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [legacySelectionIds, setLegacySelectionIds] = useState<Set<string>>(new Set());
  const [libraryByArchetype, setLibraryByArchetype] = useState<Map<string, CatalogueArchetype>>(new Map());
  const [ownedVerticals, setOwnedVerticals] = useState<CreatorOwnedVertical[]>([]);
  const [ownedVariations, setOwnedVariations] = useState<CreatorOwnedVariation[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

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
        const [libRows, legacySelections, workset, ownedVerts, ownedVars] = await Promise.all([
          getActiveVariationsForArchetypes(archetypes),
          getMyVariationSelections(snap.id),
          getMyVerticalWorkset(snap.id),
          loadOwnedVerticals(profile.id),
          loadOwnedVariations(profile.id),
        ]);
        if (!mounted) return;
        setLibraryByArchetype(buildLibraryIndex(libRows));
        setLegacySelectionIds(new Set(legacySelections.filter(s => s.status === 'selected').map(s => s.variation_id)));
        setOwnedVerticals(ownedVerts);
        setOwnedVariations(ownedVars);
        if (workset) {
          setView(workset);
        } else {
          setView(deriveLegacyWorksetFromSnapshot({
            snapshotId: snap.id,
            creatorProfileId: profile.id,
            primaryArchetype: snap.primary_archetype,
            secondaryArchetype: snap.secondary_archetype,
            thirdArchetype: snap.third_archetype,
            selectedLibraryIds: libRows
              .filter(l => legacySelections.some(s => s.status === 'selected' && s.variation_id === l.id))
              .map(l => ({ variationId: l.id, archetype: l.archetype })),
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

  // Cleanup pending timers on unmount.
  useEffect(() => {
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, []);

  // ── Validation: derived once, drives the navigation gate. ─────────────────
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

  const canGenerate = validation?.complete ?? false;

  // ── Autosave (debounced) ────────────────────────────────────────────────
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

  // ── Mutation helpers (all flow through setView + autosave). ──────────────
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
    setBusyMessage('Creating your vertical…');
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
    setBusyMessage('Saving your vertical…');
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
    if (!snapshotId || !canGenerate) return;
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
  }, [snapshotId, canGenerate, runSave, navigate]);

  // ── Loading / error UI ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <Header title="Build your character possibilities" />
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6 text-sm text-charcoal-2">
            Loading your character possibilities…
          </div>
        </div>
      </div>
    );
  }
  if (loadError || !view) {
    return (
      <div className="min-h-screen bg-surface-2 text-charcoal">
        <Header title="Build your character possibilities" />
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
      <Header title="Build your character possibilities" />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-4 max-w-2xl text-sm leading-6 text-charcoal-2">
          Your assessment identified three creative directions. Edit the list — swap a vertical from the
          catalogue, add a fresh direction, or remove one you do not want — then pick the versions of
          each that feel authentically you. You can keep editing until you are ready to build your
          portfolio. Your original assessment recommendations are preserved as provenance.
        </p>

        <SaveStatusPill status={saveStatus} error={saveError} />
        {busyMessage && (
          <p className="mt-2 text-xs text-charcoal-2" aria-live="polite">{busyMessage}</p>
        )}

        {/* Validation banner */}
        <section className="mb-5 rounded-2xl border border-accent/30 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-charcoal">Your progress</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${canGenerate ? 'bg-success/15 text-success' : 'bg-white/5 text-charcoal-2'}`}>
              {canGenerate ? 'Ready to build portfolio' : 'Keep exploring'}
            </span>
          </div>
          {validation && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {validation.perSlot.map(s => (
                <div key={s.position} className="rounded-xl border border-white/10 bg-surface-3/60 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-charcoal-2">{s.rankLabel}</div>
                  <div className={`mt-0.5 text-sm font-medium ${s.met ? 'text-success' : 'text-charcoal-2'}`}>
                    {s.met ? '✓ ' : ''}{s.selectedCount} of {s.minimum} chosen
                  </div>
                </div>
              ))}
            </div>
          )}
          {validation?.firstIssue && (
            <p className={`mt-3 text-xs ${validation.complete ? 'text-success' : 'text-warn'}`}>
              {validation.complete
                ? `${validation.totalSelected} variations chosen across ${validation.perSlot.length} ${validation.perSlot.length === 1 ? 'vertical' : 'verticals'}.`
                : validation.firstIssue.message}
            </p>
          )}
        </section>

        {/* Per-vertical cards */}
        <div className="space-y-5">
          {view.verticals.map(entry => (
            <VerticalCard
              key={entry.worksetId}
              entry={entry}
              totalVerticals={view.verticals.length}
              libraryByArchetype={libraryByArchetype}
              ownedVariations={ownedVariations}
              ownedVerticals={ownedVerticals}
              onReplace={async archetypeKey => { await replaceVertical(entry.position, { archetypeKey, source: 'catalogue' }); }}
              onAddFromCatalogue={addVerticalFromCatalogue}
              onAddCreatorVertical={addCreatorVertical}
              onRemove={() => removeVertical(entry.worksetId)}
              onMove={dir => moveVertical(entry.worksetId, dir)}
              onToggleLibrary={variation => toggleLibraryVariation(entry.position, variation)}
              onToggleOwned={variation => toggleOwnedVariation(entry.position, variation)}
              onCustomiseLibrary={async (variation, edit) => { await customiseLibraryVariation(entry.position, variation, edit); }}
              onCreateOwnedVariation={async edit => { await createOwnedVariationInVertical(entry.position, edit); }}
              onRenameOwnedVariation={async (id, edit) => { await renameOwnedVariation(id, edit); }}
              onArchiveOwnedVariation={async id => { await archiveVariation(id, entry.worksetId); }}
              onRenameOwnedVertical={entry.ownedVerticalId ? async (id, edit) => { await renameOwnedVertical(id, edit); } : null}
              onArchiveOwnedVertical={entry.ownedVerticalId ? async () => { await archiveOwnedVertical(entry.ownedVerticalId as string); } : null}
              onSubmitOwnedVerticalForReview={entry.ownedVerticalId && ownedVerticals.find(v => v.id === entry.ownedVerticalId)?.review_status === 'none'
                ? async () => { await submitOwnedVerticalForReview(entry.ownedVerticalId as string); }
                : null}
              onSubmitOwnedVariationForReview={async id => { await submitOwnedVariationForReview(id); }}
            />
          ))}
        </div>

        {/* Add another vertical */}
        {view.verticals.length < MAX_WORKSET_SIZE && (
          <AddVerticalCard
            libraryByArchetype={libraryByArchetype}
            onPickCatalogue={addVerticalFromCatalogue}
            onCreateCreator={addCreatorVertical}
            alreadyUsedArchetypes={view.verticals.filter(v => v.systemArchetype).map(v => v.systemArchetype as string)}
          />
        )}

        {/* Final navigation gate */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-surface p-5">
          <h2 className="text-base font-semibold text-charcoal">Ready when you are</h2>
          <p className="mt-1 text-sm text-charcoal-2">
            Once your verticals meet the minimum requirements, you can turn them into six draft
            characters. We rebuild your portfolio each time you start a new generation.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => { void handleGenerate(); }}
              disabled={!canGenerate || Boolean(busyMessage)}
              className="btn-primary text-sm disabled:opacity-50"
            >
              Build my character portfolio
            </button>
            {!canGenerate && (
              <span className="text-xs text-charcoal-2">
                You need at least one vertical and the per-position variation minimums (3, 2, 1, …) with {TOTAL_MINIMUM}+ selected total.
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function Header({ title }: { title: string }) {
  return (
    <header className="border-b border-white/10 bg-surface px-4 py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-0 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={brandLogo} alt="Find Your Vertical" className="h-12 w-auto object-contain" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Build Your Character Possibilities</p>
            <h1 className="text-xl font-bold leading-tight text-charcoal sm:text-2xl">{title}</h1>
          </div>
        </div>
        <a href="#/my" className="btn-secondary text-xs">Back to My Vertical</a>
      </div>
    </header>
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

interface VerticalCardProps {
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

function VerticalCard(props: VerticalCardProps) {
  const { entry, libraryByArchetype, ownedVariations, onReplace, onRemove, onMove, onToggleLibrary, onToggleOwned, onCustomiseLibrary, onCreateOwnedVariation, onRenameOwnedVariation, onArchiveOwnedVariation, onRenameOwnedVertical, onArchiveOwnedVertical, onSubmitOwnedVerticalForReview, onSubmitOwnedVariationForReview, totalVerticals } = props;

  const catalogueArchetype = entry.systemArchetype ? libraryByArchetype.get(entry.systemArchetype) : undefined;
  const libraryVariations = catalogueArchetype?.variations ?? [];
  const ownedForThis = ownedVariations.filter(
    v => v.is_archived === false
      && (entry.ownedVerticalId ? v.owned_vertical_id === entry.ownedVerticalId : v.system_archetype === entry.systemArchetype && !v.owned_vertical_id),
  );
  const isFirst = entry.position === 1;
  const isLast = entry.position === totalVerticals;
  const slotMinimum = POSITION_MINIMUMS[entry.position - 1] ?? 1;

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RANK_BADGE[entry.rankLabel]}`}>{entry.rankLabel}</span>
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

      {/* Actions row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => onMove('up')} disabled={isFirst} aria-label="Move up">
          Move up
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => onMove('down')} disabled={isLast} aria-label="Move down">
          Move down
        </button>
        <ReplaceVerticalMenu currentArchetype={entry.systemArchetype} libraryByArchetype={libraryByArchetype} onPick={onReplace} />
        {onRenameOwnedVertical && entry.ownedVerticalId && (
          <RenameOwnedVerticalButton
            onSubmit={edit => onRenameOwnedVertical(entry.ownedVerticalId as string, edit)}
            initialName={entry.verticalLabel}
            initialDescription=""
          />
        )}
        {onArchiveOwnedVertical && (
          <button type="button" className="btn-secondary text-xs text-pink" onClick={() => { void onArchiveOwnedVertical(); }}>
            Archive vertical
          </button>
        )}
        {onSubmitOwnedVerticalForReview && (
          <button type="button" className="btn-secondary text-xs" onClick={() => { void onSubmitOwnedVerticalForReview(); }}>
            Send to the team for review
          </button>
        )}
        <button type="button" className="btn-secondary text-xs text-pink ml-auto" onClick={() => onRemove()} disabled={totalVerticals === MIN_WORKSET_SIZE}>
          Remove vertical
        </button>
      </div>

      {/* Variation selection */}
      <p className="mt-4 text-sm font-semibold text-charcoal">Which versions of this direction feel like you?</p>
      <p className="mt-1 text-xs text-charcoal-2">
        Pick at least {slotMinimum} for this slot.
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
        Rename vertical
      </button>
    );
  }
  return (
    <div className="w-full">
      <InlineEditor
        initialName={props.initialName}
        initialDescription={props.initialDescription}
        submitLabel="Save vertical"
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

function ReplaceVerticalMenu(props: {
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
        placeholder="Search catalogue verticals"
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

function AddVerticalCard(props: {
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
          submitLabel="Create vertical"
          onCancel={() => setMode(null)}
          onSubmit={async values => { await props.onCreateCreator(values); setMode(null); }}
        />
      </section>
    );
  }
  if (mode === 'catalogue') {
    return (
      <section className="mt-5 rounded-2xl border border-dashed border-accent/50 bg-surface p-5">
        <h3 className="text-base font-semibold text-charcoal">Add a vertical from the catalogue</h3>
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
        <p className="mt-1 text-sm font-semibold text-charcoal">Add another vertical</p>
        <p className="mt-1 text-xs text-charcoal-2">Pick any archetype the FYV team has already curated.</p>
      </button>
      <button type="button" className="rounded-2xl border border-dashed border-accent/40 bg-surface p-5 text-left" onClick={() => setMode('custom')}>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Created by you</span>
        <p className="mt-1 text-sm font-semibold text-charcoal">Create a new vertical</p>
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

// ── Pure helpers (module-scope; do NOT reference component state) ────────────

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
