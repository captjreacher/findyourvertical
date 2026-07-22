import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAllActiveArchetypeVariations } from '@/lib/creators-api';
import { MAX_WORKSET_SIZE } from '@/lib/persona-verticals';
import type { ArchetypeVariation } from '@/types/creator';

// ── Types ──

interface CatalogueArchetype {
  archetype: string;
  description: string;
  variations: ArchetypeVariation[];
}

type PickerMode = 'add' | 'replace';

interface CataloguePickerProps {
  /** 'add' — pick new directions to append; 'replace' — pick one replacement. */
  mode: PickerMode;
  /** The archetype being replaced (only for 'replace' mode). */
  replacingArchetype?: string | null;
  /** All system archetypes already selected in the creator's workset (stable IDs). */
  alreadyUsedArchetypes: string[];
  /** Max number of directions the creator can still add (only for 'add' mode). */
  remainingLimit: number;
  /** Called when the picker is dismissed without action. */
  onDismiss: () => void;
  /** Called with the selected archetype key(s) on confirm. */
  onConfirm: (selections: string[]) => void;
}

// ── Catalogue Picker Component ──

/**
 * Portal-rendered, mobile-friendly creative-direction catalogue picker.
 *
 * Behaviour:
 * - 'add' mode: multi-select with up to `remainingLimit` picks, confirmed via
 *   an "Add selected" button.
 * - 'replace' mode: single-select; the replacement is applied immediately on
 *   pick and the picker closes.
 *
 * Already-selected directions are shown but disabled/dimmed with a clear label.
 */
export function CataloguePicker(props: CataloguePickerProps) {
  const { mode, replacingArchetype, alreadyUsedArchetypes, remainingLimit, onDismiss, onConfirm } = props;

  // Data
  const [fullCatalogue, setFullCatalogue] = useState<Map<string, CatalogueArchetype>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Interaction state
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs for focus management
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Load full catalogue on mount
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const rows = await getAllActiveArchetypeVariations();
        if (!mounted) return;
        setFullCatalogue(buildLibraryIndex(rows));
      } catch (err) {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : 'Could not load the catalogue.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Store the active element before opening so we can return focus on close
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    // Focus the dialog on mount
    requestAnimationFrame(() => {
      if (searchRef.current) {
        searchRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    });
    // Prevent background scrolling
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      // Return focus to the trigger
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  // Derive eligible archetypes: all catalogue entries minus those already selected
  // (minus the one being replaced, if in replace mode).
  const allArchetypeKeys = useMemo(() => [...fullCatalogue.keys()], [fullCatalogue]);

  const eligibleArchetypes = useMemo(() => {
    return allArchetypeKeys.filter(key => {
      if (mode === 'replace' && key === replacingArchetype) return false;
      if (alreadyUsedArchetypes.includes(key)) return false;
      return true;
    });
  }, [allArchetypeKeys, mode, replacingArchetype, alreadyUsedArchetypes]);

  const isAlreadySelected = useCallback(
    (key: string) => alreadyUsedArchetypes.includes(key),
    [alreadyUsedArchetypes],
  );

  // Search filter — case-insensitive, applies to the full eligible catalogue
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return eligibleArchetypes;
    return eligibleArchetypes.filter(a => a.toLowerCase().includes(trimmed));
  }, [eligibleArchetypes, query]);

  // Add-mode: the already-used set (shown dimmed but visible)
  const alreadyUsedVisible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return alreadyUsedArchetypes;
    return alreadyUsedArchetypes.filter(a => a.toLowerCase().includes(trimmed));
  }, [alreadyUsedArchetypes, query]);

  // Toggle selection (add mode only)
  const toggleSelection = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < remainingLimit) {
        next.add(key);
      }
      return next;
    });
  }, [remainingLimit]);

  // Confirm add-mode selections
  const handleConfirm = useCallback(() => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      onConfirm([...selected]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not add directions.');
      setSubmitting(false);
    }
  }, [selected, submitting, onConfirm]);

  // Replace-mode: confirm on single pick
  const handlePick = useCallback((key: string) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      onConfirm([key]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not replace direction.');
      setSubmitting(false);
    }
  }, [submitting, onConfirm]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'add' ? 'Add creative directions from catalogue' : 'Replace creative direction'}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-white/10 bg-surface shadow-2xl shadow-black/60 sm:mx-4 sm:mb-4 sm:max-h-[80dvh] sm:rounded-2xl"
        style={{ maxHeight: 'min(85dvh, 680px)' }}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-white/10 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-charcoal">
              {mode === 'add' ? 'Add from catalogue' : 'Replace direction'}
            </h2>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-8 w-8 items-center justify-center rounded-full text-charcoal-2 hover:bg-white/10 hover:text-charcoal"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-xs text-charcoal-2">
            {mode === 'add'
              ? `Pick up to ${remainingLimit} more direction${remainingLimit === 1 ? '' : 's'} to add.`
              : 'Choose a direction to replace the current one.'}
          </p>
          {/* Search */}
          <div className="relative mt-3">
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search directions…"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 pl-9 text-sm text-charcoal placeholder-charcoal-2 focus:border-accent/50 focus:outline-none"
              aria-label="Search creative directions"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-charcoal-2" aria-hidden="true">
              🔍
            </span>
          </div>
        </div>

        {/* ── Error banner ── */}
        {loadError && (
          <div className="shrink-0 border-b border-pink/20 bg-pink/10 px-5 py-3 text-sm text-pink" role="alert">
            {loadError}
          </div>
        )}
        {submitError && (
          <div className="shrink-0 border-b border-pink/20 bg-pink/10 px-5 py-3 text-sm text-pink" role="alert">
            {submitError}
          </div>
        )}

        {/* ── Results list (independently scrollable) ── */}
        <div
          className="flex-1 overflow-y-auto overscroll-behavior-contain px-5 py-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-surface-2 p-4">
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-white/5" />
                </div>
              ))}
            </div>
          )}

          {!loading && loadError && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-pink">Failed to load the catalogue.</p>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && alreadyUsedVisible.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="text-2xl" aria-hidden="true">🔍</span>
              <p className="text-sm text-charcoal-2">
                {query.trim() ? `No directions matching "${query.trim()}"` : 'No directions available.'}
              </p>
            </div>
          )}

          {!loading && !loadError && (
            <div className="space-y-2">
              {/* Eligible (available) directions */}
              {filtered.map(key => {
                const entry = fullCatalogue.get(key);
                const isSelected = mode === 'add' && selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={submitting}
                    onClick={() => {
                      if (mode === 'replace') {
                        handlePick(key);
                      } else {
                        toggleSelection(key);
                      }
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${isSelected
                      ? 'border-accent bg-accent/20 text-white'
                      : 'border-white/10 bg-surface-2 text-charcoal hover:border-accent/70 hover:bg-accent/10'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold">{key}</span>
                          {isSelected && (
                            <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                              Selected
                            </span>
                          )}
                        </div>
                        {entry && entry.description && (
                          <p className="mt-1 text-sm leading-5 text-charcoal-2 line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      {/* Checkmark indicator */}
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${isSelected
                          ? 'border-accent bg-accent text-white'
                          : 'border-white/10 text-transparent'
                        }`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-charcoal-2">
                      {entry ? `${entry.variations.length} variation${entry.variations.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </button>
                );
              })}

              {/* Already-selected directions (dimmed, disabled) */}
              {(mode === 'add' && alreadyUsedVisible.length > 0) && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-2">
                      Already in your list
                    </span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  {alreadyUsedVisible.map(key => {
                    const entry = fullCatalogue.get(key);
                    return (
                      <div
                        key={key}
                        className="w-full rounded-xl border border-white/5 bg-surface-2/40 p-4 text-left opacity-50"
                        aria-disabled="true"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-base font-semibold text-charcoal-2">{key}</span>
                            <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-charcoal-2">
                              Added
                            </span>
                          </div>
                        </div>
                        {entry && entry.description && (
                          <p className="mt-1 text-sm leading-5 text-charcoal-2 line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions (add mode only — replace mode picks directly) ── */}
        {mode === 'add' && (
          <div className="shrink-0 border-t border-white/10 px-5 py-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="btn-secondary w-full text-sm sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0 || submitting}
                className="btn-primary w-full text-sm disabled:opacity-50 sm:w-auto"
              >
                {submitting
                  ? 'Adding…'
                  : selected.size === 0
                    ? 'Add selected'
                    : `Add selected (${selected.size})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Hook for using the catalogue picker ──

interface UseCataloguePickerInput {
  alreadyUsedArchetypes: string[];
}

interface UseCataloguePickerReturn {
  /** Open the picker in 'add' mode. */
  openAddPicker: () => void;
  /** Open the picker in 'replace' mode for a specific archetype. */
  openReplacePicker: (archetype: string) => void;
  /** Whether the picker is currently open. */
  isOpen: boolean;
  /** Current picker mode (only meaningful when isOpen is true). */
  mode: PickerMode | null;
  /** Archetype being replaced (only meaningful in 'replace' mode). */
  replacingArchetype: string | null | undefined;
  /** Render this inside the component tree (places the picker at the portal root). */
  renderPicker: (
    onConfirm: (selections: string[]) => void,
    onDismiss?: () => void,
  ) => React.ReactNode;
}

/**
 * Convenience hook that manages the picker's open/close state and mode.
 * Call `renderPicker(onConfirm)` where you want the portal to attach.
 */
export function useCataloguePicker(input: UseCataloguePickerInput): UseCataloguePickerReturn {
  const [pickerState, setPickerState] = useState<{
    mode: PickerMode;
    replacingArchetype?: string | null;
  } | null>(null);

  const openAddPicker = useCallback(() => {
    setPickerState({ mode: 'add' });
  }, []);

  const openReplacePicker = useCallback((archetype: string) => {
    setPickerState({ mode: 'replace', replacingArchetype: archetype });
  }, []);

  const closePicker = useCallback(() => {
    setPickerState(null);
  }, []);

  const remainingLimit = Math.max(0, MAX_WORKSET_SIZE - input.alreadyUsedArchetypes.length);

  const renderPicker = useCallback(
    (onConfirm: (selections: string[]) => void, onDismiss?: () => void) => {
      if (!pickerState) return null;
      const handleDismiss = () => {
        closePicker();
        onDismiss?.();
      };
      const handleConfirm = (selections: string[]) => {
        onConfirm(selections);
        // In replace mode, the picker closes automatically after confirm.
        // In add mode, we close after the callback.
        closePicker();
      };
      return (
        <CataloguePicker
          mode={pickerState.mode}
          replacingArchetype={pickerState.replacingArchetype}
          alreadyUsedArchetypes={input.alreadyUsedArchetypes}
          remainingLimit={remainingLimit}
          onDismiss={handleDismiss}
          onConfirm={handleConfirm}
        />
      );
    },
    [pickerState, input.alreadyUsedArchetypes, remainingLimit, closePicker],
  );

  return {
    openAddPicker,
    openReplacePicker,
    isOpen: pickerState !== null,
    mode: pickerState?.mode ?? null,
    replacingArchetype: pickerState?.replacingArchetype ?? null,
    renderPicker,
  };
}

// ── Re-export the library builder so CharacterPossibilities can use it ──

/**
 * Build a Map<string, CatalogueArchetype> from a flat array of ArchetypeVariation rows.
 * This is the same logic that CharacterPossibilities.tsx uses locally; we re-export
 * it here so the CataloguePicker can share it without an import cycle.
 */
export function buildLibraryIndex(rows: ArchetypeVariation[]): Map<string, CatalogueArchetype> {
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
