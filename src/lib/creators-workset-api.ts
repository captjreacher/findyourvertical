// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1C — Creator Workset API (browser-side)
// ----------------------------------------------------------------------------
// Thin auth-aware Supabase client wrapper for the editable vertical/variation
// workset. Direct DB queries are kept minimal; the UI autosaves through
// public.fyv_save_vertical_workset (single RPC). Creator-owned verticals and
// variations support plain CRUD via RLS policies; archive goes through
// public.fyv_archive_owned_vertical / public.fyv_archive_owned_variation to
// add an explicit 'review_status' guard at the call site.
//
// All callers must be authenticated (RLS scopes results to
// public.current_creator_profile_id()).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type {
  CreatorOwnedVariation,
  CreatorOwnedVertical,
  CreatorVerticalVariationEntry,
  CreatorVerticalWorksetEntry,
  CreatorVerticalWorksetView,
  CreatorVerticalWorksetViewEntry,
  CreatorVerticalWorksetVariationView,
  RankLabel,
  VerticalSourceLabel,
} from '@/types/creator';
import {
  MAX_WORKSET_SIZE,
  MIN_WORKSET_SIZE,
  rankLabelFor,
} from './persona-verticals';

// ── DB row shapes (queries return these; we project to view shapes) ──────────

interface WorksetRow {
  id: string;
  created_at: string;
  updated_at: string;
  creator_profile_id: string;
  snapshot_id: string;
  position: number;
  vertical_label: string;
  vertical_kind: 'system_reference' | 'creator_owned';
  system_archetype: string | null;
  owned_vertical_id: string | null;
  source_label: VerticalSourceLabel;
  status: 'active' | 'archived' | 'removed';
}

interface VariationEntryRow {
  id: string;
  created_at: string;
  updated_at: string;
  creator_profile_id: string;
  snapshot_id: string;
  workset_id: string;
  variation_kind: 'system_reference' | 'creator_owned';
  catalog_variation_id: string | null;
  owned_variation_id: string | null;
  status: 'selected' | 'deselected' | 'removed';
}

interface OwnedVerticalRow {
  id: string;
  created_at: string;
  updated_at: string;
  creator_profile_id: string;
  name: string;
  description: string;
  source_kind: 'pure_creator' | 'forked_from_system';
  system_archetype: string | null;
  review_status: 'none' | 'pending_review' | 'approved' | 'rejected';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  is_archived: boolean;
}

interface OwnedVariationRow {
  id: string;
  created_at: string;
  updated_at: string;
  creator_profile_id: string;
  owned_vertical_id: string | null;
  system_archetype: string | null;
  catalog_variation_id: string | null;
  name: string;
  description: string;
  source_kind: 'pure_creator' | 'forked_from_system';
  review_status: 'none' | 'pending_review' | 'approved' | 'rejected';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  is_archived: boolean;
}

// ── Projection helpers (DB shape → view shape) ──────────────────────────────

function projectWorksetEntry(row: WorksetRow, entries: VariationEntryRow[]): CreatorVerticalWorksetViewEntry {
  const rankLabel: RankLabel = rankLabelFor(row.position);
  const selectedVariations: CreatorVerticalWorksetVariationView[] = [];

  for (const entry of entries) {
    if (entry.status !== 'selected') continue;
    if (entry.variation_kind === 'system_reference') {
      // System catalogue variation: name/description live on archetype_variations
      // (joined below by the caller; here we surface the id + a placeholder for
      // fields that the UI joins at consumption time).
      selectedVariations.push({
        entryId: entry.id,
        variationKind: 'system_reference',
        catalogVariationId: entry.catalog_variation_id,
        ownedVariationId: null,
        name: '', // Filled in by the consumer (joined library row).
        description: '',
        sourceLabel: 'catalogue',
      });
    } else {
      selectedVariations.push({
        entryId: entry.id,
        variationKind: 'creator_owned',
        catalogVariationId: null,
        ownedVariationId: entry.owned_variation_id,
        name: '', // Filled in by the consumer (joined owned row).
        description: '',
        sourceLabel: 'created',
      });
    }
  }

  return {
    position: row.position,
    rankLabel,
    worksetId: row.id,
    verticalKind: row.vertical_kind,
    verticalLabel: row.vertical_label,
    sourceLabel: row.source_label,
    systemArchetype: row.system_archetype,
    ownedVerticalId: row.owned_vertical_id,
    selectedVariations,
  };
}

function dbError(message: string, err: unknown): Error {
  const inner = err instanceof Error ? err.message : String(err);
  return new Error(`${message}: ${inner}`);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the canonical view shape from raw DB rows. Exposed so consumers can
 * transform optimisation results without a separate round-trip.
 */
export function hydrateView(args: {
  snapshotId: string;
  creatorProfileId: string;
  worksetRows: WorksetRow[];
  variationEntryRows: VariationEntryRow[];
  libraryVariations: { id: string; archetype: string; name: string; description: string; display_order: number }[];
  ownedVariations: OwnedVariationRow[];
}): CreatorVerticalWorksetView {
  const libraryById = new Map(args.libraryVariations.map(v => [v.id, v]));
  const ownedById = new Map(args.ownedVariations.map(v => [v.id, v]));

  const entriesById = new Map<string, VariationEntryRow[]>();
  for (const v of args.variationEntryRows) {
    const list = entriesById.get(v.workset_id) ?? [];
    list.push(v);
    entriesById.set(v.workset_id, list);
  }

  const sorted = args.worksetRows.slice().sort((a, b) => a.position - b.position);
  const verticals = sorted.map(row => {
    const entry = projectWorksetEntry(row, entriesById.get(row.id) ?? []);
    for (const v of entry.selectedVariations) {
      if (v.variationKind === 'system_reference' && v.catalogVariationId) {
        const lib = libraryById.get(v.catalogVariationId);
        if (lib) {
          v.name = lib.name;
          v.description = lib.description;
        }
      } else if (v.variationKind === 'creator_owned' && v.ownedVariationId) {
        const own = ownedById.get(v.ownedVariationId);
        if (own) {
          v.name = own.name;
          v.description = own.description;
        }
      }
    }
    return entry;
  });

  return {
    snapshotId: args.snapshotId,
    creatorProfileId: args.creatorProfileId,
    verticals,
  };
}

/**
 * Read the active workset for a snapshot. Returns null if the creator has not
 * yet authored a workset (legacy creators keep working without one — the UI
 * uses `deriveLegacyWorksetFromSnapshot` for that).
 */
export async function getMyVerticalWorkset(snapshotId: string): Promise<CreatorVerticalWorksetView | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  // Resolve the caller's profile id explicitly so we can scope the query
  // (avoids relying on RLS alone — belt-and-braces against future policy
  // changes and keeps the workset row invisible if it happens to belong to
  // a different creator with the same UUID prefix).
  const { data: profile } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle() as { data: { id: string } | null; error: unknown };
  if (!profile) return null;
  const profileId = profile.id;

  // 1. Workset rows
  const { data: worksetRows, error: wsErr } = await supabase
    .from('creator_vertical_workset')
    .select('*')
    .eq('creator_profile_id', profileId)
    .eq('snapshot_id', snapshotId)
    .eq('status', 'active')
    .order('position', { ascending: true }) as { data: WorksetRow[] | null; error: unknown };
  if (wsErr) throw dbError('Failed to load workset', wsErr);

  if (!worksetRows || worksetRows.length === 0) return null;

  // profileId is already resolved from `creator_profiles` above; we do not
  // re-declare it here (RLS guarantees the row belongs to the same caller).
  const worksetIds = worksetRows.map(r => r.id);

  // 2. Variation entries (joined with library + owned)
  const { data: entryRows, error: entryErr } = await supabase
    .from('creator_vertical_variation_entries')
    .select('*')
    .in('workset_id', worksetIds)
    .eq('status', 'selected') as { data: VariationEntryRow[] | null; error: unknown };
  if (entryErr) throw dbError('Failed to load variation entries', entryErr);

  // 3. Library system-vertical references (for name/description hydration).
  const systemArchetypeSet = new Set<string>(worksetRows.filter(r => r.system_archetype).map(r => r.system_archetype as string));
  let libraryVariations: { id: string; archetype: string; name: string; description: string; display_order: number }[] = [];
  if (systemArchetypeSet.size > 0) {
    const { data: libRows, error: libErr } = await supabase
      .from('archetype_variations')
      .select('id, archetype, name, description, display_order')
      .in('archetype', [...systemArchetypeSet])
      .eq('is_active', true) as { data: typeof libraryVariations | null; error: unknown };
    if (libErr) throw dbError('Failed to load archetype variations', libErr);
    libraryVariations = (libRows ?? []) as typeof libraryVariations;
  }

  // 4. Owned variations (for hydration of selected creator-owned entries).
  const ownedIds = (entryRows ?? []).map(e => e.owned_variation_id).filter((id): id is string => Boolean(id));
  let ownedVariations: OwnedVariationRow[] = [];
  if (ownedIds.length > 0) {
    const { data: ovRows, error: ovErr } = await supabase
      .from('creator_owned_variations')
      .select('*')
      .in('id', ownedIds)
      .eq('is_archived', false) as { data: OwnedVariationRow[] | null; error: unknown };
    if (ovErr) throw dbError('Failed to load owned variations', ovErr);
    ownedVariations = (ovRows ?? []) as OwnedVariationRow[];
  }

  return hydrateView({
    snapshotId,
    creatorProfileId: profileId,
    worksetRows: worksetRows as WorksetRow[],
    variationEntryRows: (entryRows ?? []) as VariationEntryRow[],
    libraryVariations,
    ownedVariations,
  });
}

/**
 * Replace the entire workset + variation selections in ONE server round-trip.
 * The server-side RPC validates ownership, position count, and uniqueness.
 * This is the autosave path — designed to be idempotent.
 */
export async function saveMyVerticalWorkset(
  snapshotId: string,
  view: CreatorVerticalWorksetView,
): Promise<CreatorVerticalWorksetView> {
  const payload = serialiseViewForRpc(view);
  const { data, error } = await supabase.rpc('fyv_save_vertical_workset', {
    p_snapshot_id: snapshotId,
    p_state: payload,
  }) as { data: unknown; error: unknown };
  if (error) throw dbError('Failed to save workset', error);
  // Re-read so the consumer sees server-confirmed ids/timestamps.
  const updated = await getMyVerticalWorkset(snapshotId);
  if (!updated) throw new Error('Workset vanished after save.');
  void data;
  return updated;
}

function serialiseViewForRpc(view: CreatorVerticalWorksetView): Record<string, unknown> {
  return {
    verticals: view.verticals.map(v => ({
      worksetId: v.worksetId,
      position: v.position,
      verticalLabel: v.verticalLabel,
      verticalKind: v.verticalKind,
      systemArchetype: v.systemArchetype,
      ownedVerticalId: v.ownedVerticalId,
      sourceLabel: v.sourceLabel,
      selectedVariations: v.selectedVariations.map(s => ({
        entryId: s.entryId,
        variationKind: s.variationKind,
        catalogVariationId: s.catalogVariationId,
        ownedVariationId: s.ownedVariationId,
      })),
    })),
  };
}

/**
 * Legacy fallback: synthesise a view from the snapshot's hard-coded
 * primary/secondary/third columns. Used when getMyVerticalWorkset returns
 * null (creator hasn't authored a workset yet). The first three positions
 * become system_reference verticals sourced as 'recommended'.
 */
export function deriveLegacyWorksetFromSnapshot(args: {
  snapshotId: string;
  creatorProfileId: string;
  primaryArchetype: string;
  secondaryArchetype: string;
  thirdArchetype: string;
  selectedLibraryIds: ReadonlyArray<{ variationId: string; archetype: string }>;
  libraryVariations: { id: string; archetype: string; name: string; description: string; display_order: number }[];
}): CreatorVerticalWorksetView {
  const libraryById = new Map(args.libraryVariations.map(v => [v.id, v]));
  const ranks = [
    { position: 1, rankLabel: 'Primary' as RankLabel, archetype: args.primaryArchetype },
    { position: 2, rankLabel: 'Secondary' as RankLabel, archetype: args.secondaryArchetype },
    { position: 3, rankLabel: 'Third' as RankLabel, archetype: args.thirdArchetype },
  ];
  const verticals: CreatorVerticalWorksetViewEntry[] = ranks.map((entry, index) => {
    const picks = args.selectedLibraryIds.filter(p => p.archetype === entry.archetype);
    const selectedVariations: CreatorVerticalWorksetVariationView[] = picks.map(p => {
      const lib = libraryById.get(p.variationId);
      return {
        entryId: `legacy-${entry.position}-${p.variationId}`,
        variationKind: 'system_reference',
        catalogVariationId: p.variationId,
        ownedVariationId: null,
        name: lib?.name ?? '',
        description: lib?.description ?? '',
        sourceLabel: 'recommended',
      };
    });
    return {
      position: entry.position,
      rankLabel: entry.rankLabel,
      worksetId: `legacy-${entry.position}`,
      verticalKind: 'system_reference',
      verticalLabel: entry.archetype,
      sourceLabel: index === 0 ? 'recommended' : 'recommended',
      systemArchetype: entry.archetype,
      ownedVerticalId: null,
      selectedVariations,
    };
  });
  return {
    snapshotId: args.snapshotId,
    creatorProfileId: args.creatorProfileId,
    verticals,
  };
}

/**
 * Create a new creator-owned vertical. Pure_creator when the creator wants
 * an entirely new direction; forked_from_system when the creator is renaming
 * an existing catalogue archetype.
 */
export async function createMyOwnedVertical(input: {
  name: string;
  description?: string;
  sourceKind: 'pure_creator' | 'forked_from_system';
  systemArchetype?: string;
}): Promise<CreatorOwnedVertical> {
  if (!input.name.trim()) throw new Error('Vertical name is required.');
  if (input.sourceKind === 'forked_from_system' && !input.systemArchetype) {
    throw new Error('forked_from_system requires a system_archetype.');
  }
  const { data, error } = await supabase
    .from('creator_owned_verticals')
    .insert({
      name: input.name.trim(),
      description: (input.description ?? '').trim(),
      source_kind: input.sourceKind,
      system_archetype: input.sourceKind === 'forked_from_system' ? input.systemArchetype : null,
      review_status: 'none',
    })
    .select()
    .single() as { data: OwnedVerticalRow | null; error: unknown };
  if (error) throw dbError('Failed to create owned vertical', error);
  return data as CreatorOwnedVertical;
}

export async function updateMyOwnedVertical(
  id: string,
  input: { name?: string; description?: string },
): Promise<CreatorOwnedVertical> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === 'string') {
    if (!input.name.trim()) throw new Error('Vertical name cannot be empty.');
    patch.name = input.name.trim();
  }
  if (typeof input.description === 'string') patch.description = input.description.trim();

  const { data, error } = await supabase
    .from('creator_owned_verticals')
    .update(patch)
    .eq('id', id)
    .select()
    .single() as { data: OwnedVerticalRow | null; error: unknown };
  if (error) throw dbError('Failed to update owned vertical', error);
  return data as CreatorOwnedVertical;
}

export async function archiveMyOwnedVertical(id: string): Promise<void> {
  const { error } = await supabase.rpc('fyv_archive_owned_vertical', { p_id: id }) as { error: unknown };
  if (error) throw dbError('Failed to archive owned vertical', error);
}

/**
 * Create a new creator-owned variation. Two anchor modes:
 *   1. Owned vertical    → variation lives under a creator-owned vertical.
 *   2. System archetype  → variation is a FORK of a catalogue
 *      archetype_variation; the catalogue row remains immutable.
 */
export async function createMyOwnedVariation(input: {
  name: string;
  description?: string;
  ownedVerticalId?: string | null;
  systemArchetype?: string | null;
  catalogVariationId?: string | null;
}): Promise<CreatorOwnedVariation> {
  if (!input.name.trim()) throw new Error('Variation name is required.');
  const ownsVertical = Boolean(input.ownedVerticalId);
  const forksFromSystem = Boolean(input.catalogVariationId) && Boolean(input.systemArchetype);
  if (!ownsVertical && !forksFromSystem) {
    throw new Error('A variation needs either an ownedVerticalId or a system_archetype + catalog_variation_id.');
  }
  if (ownsVertical && forksFromSystem) {
    throw new Error('A variation cannot be both owned-vertical-anchored and system-anchored.');
  }

  const { data, error } = await supabase
    .from('creator_owned_variations')
    .insert({
      name: input.name.trim(),
      description: (input.description ?? '').trim(),
      owned_vertical_id: ownsVertical ? input.ownedVerticalId : null,
      system_archetype: forksFromSystem ? input.systemArchetype : null,
      catalog_variation_id: forksFromSystem ? input.catalogVariationId : null,
      source_kind: forksFromSystem ? 'forked_from_system' : 'pure_creator',
      review_status: 'none',
    })
    .select()
    .single() as { data: OwnedVariationRow | null; error: unknown };
  if (error) throw dbError('Failed to create owned variation', error);
  return data as CreatorOwnedVariation;
}

export async function updateMyOwnedVariation(
  id: string,
  input: { name?: string; description?: string },
): Promise<CreatorOwnedVariation> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === 'string') {
    if (!input.name.trim()) throw new Error('Variation name cannot be empty.');
    patch.name = input.name.trim();
  }
  if (typeof input.description === 'string') patch.description = input.description.trim();

  const { data, error } = await supabase
    .from('creator_owned_variations')
    .update(patch)
    .eq('id', id)
    .select()
    .single() as { data: OwnedVariationRow | null; error: unknown };
  if (error) throw dbError('Failed to update owned variation', error);
  return data as CreatorOwnedVariation;
}

export async function archiveMyOwnedVariation(id: string): Promise<void> {
  const { error } = await supabase.rpc('fyv_archive_owned_variation', { p_id: id }) as { error: unknown };
  if (error) throw dbError('Failed to archive owned variation', error);
}

/**
 * Mark an owned vertical/variation as pending review. Submitting is private;
 * the review queue is exposed to the agency via dedicated RLS policies on a
 * future sprint. Until an agency operator runs the catalogue-merge RPC (also
 * a future sprint) the public assessment question bank is unaffected.
 */
export async function submitMyOwnedVerticalForReview(id: string): Promise<CreatorOwnedVertical> {
  const { data, error } = await supabase
    .from('creator_owned_verticals')
    .update({ review_status: 'pending_review', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single() as { data: OwnedVerticalRow | null; error: unknown };
  if (error) throw dbError('Failed to submit vertical for review', error);
  return data as CreatorOwnedVertical;
}

export async function submitMyOwnedVariationForReview(id: string): Promise<CreatorOwnedVariation> {
  const { data, error } = await supabase
    .from('creator_owned_variations')
    .update({ review_status: 'pending_review', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single() as { data: OwnedVariationRow | null; error: unknown };
  if (error) throw dbError('Failed to submit variation for review', error);
  return data as CreatorOwnedVariation;
}

/**
 * Materialise the current workset into creator_variation_selections then
 * trigger persona generation. The UI calls this right before navigating into
 * the persona workspace when the validation gate passes.
 */
export async function materialiseAndGeneratePortfolio(
  snapshotId: string,
): Promise<{ materialised: boolean; generationStatus: string | null }> {
  const { error: matErr } = await supabase.rpc('materialise_vertical_workset_for_generation', {
    p_snapshot_id: snapshotId,
  }) as { error: unknown };
  if (matErr) throw dbError('Failed to materialise workset for generation', matErr);

  // Re-use the existing generation trigger (Worker hit). Importing here keeps
  // lazy-load cost off the main bundle when the page never needs it.
  const { generateMyPersonaPortfolio } = await import('./creators-api');
  const result = await generateMyPersonaPortfolio(snapshotId);
  return { materialised: true, generationStatus: result?.status ?? null };
}

/**
 * Re-exported helpers for the UI to share constants without reaching across
 * module boundaries.
 */
export { MIN_WORKSET_SIZE, MAX_WORKSET_SIZE };
