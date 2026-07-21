// ─────────────────────────────────────────────────────────────────────────────
// FYV-PERSONA-1B/C — Shared persona-portfolio contract (pure, isomorphic)
//
// This module is the single source of truth shared by:
//   * the Cloudflare Worker generation boundary (worker/index.ts, provider.ts)
//   * the browser API layer (src/lib/creators-api.ts)
//   * the deterministic test suite (tests/*.test.ts)
//
// It is intentionally DEPENDENCY-FREE and side-effect-free (no DOM, no Node, no
// value imports) so it can be bundled into the Worker AND executed directly by
// Node's type-stripping test runner. All randomness/time is excluded so results
// are deterministic and auditable.
//
// Persona-1C changes (additive):
//   * The historical 3-2-1 contract (PORTFOLIO_WEIGHTS) is unchanged.
//   * New helpers project an EDITABLE workset (1..6 verticals) onto the
//     generator's 3-2-1 view by taking the first three workset rows in order.
//   * Legacy fallback keeps existing snapshots working when a creator has not
//     yet authored a workset (reads the snapshot's hard primary/secondary/
//     third columns).
// ─────────────────────────────────────────────────────────────────────────────

/** The three ranks of the locked archetype snapshot. */
export type PersonaRank = 'primary' | 'secondary' | 'third';

/** Draft persona lifecycle (draft/archived used now; rest are a PERSONA-1C seam). */
export type PersonaStatus =
  | 'draft'
  | 'archived'
  | 'setup_incomplete'
  | 'ready'
  | 'active'
  | 'superseded';

/** Generation lifecycle mirrored from the DB check constraint. */
export type PersonaGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed';

/** Portfolio weighting: 3 primary + 2 secondary + 1 third = 6. */
export const PORTFOLIO_WEIGHTS: Readonly<Record<PersonaRank, number>> = {
  primary: 3,
  secondary: 2,
  third: 1,
};

export const RANK_ORDER: readonly PersonaRank[] = ['primary', 'secondary', 'third'] as const;
export const PORTFOLIO_SIZE = 6;

export const RANK_LABEL: Readonly<Record<PersonaRank, string>> = {
  primary: 'Primary',
  secondary: 'Secondary',
  third: 'Third',
};

/** Versioning for auditable provenance. Bump when the prompt or schema changes. */
export const PERSONA_PROMPT_VERSION = 'fyv-persona-portfolio-v1';
export const PERSONA_SCHEMA_VERSION = '1';

/** The central creative instruction shared by prompt + fixture. */
export const PORTFOLIO_DIRECTIVE =
  'Create six personas that feel like different facets of the same creator, not six unrelated people.';

// ── Selection + source-set types ─────────────────────────────────────────────

/** A creator's active selection joined with its library variation. */
export interface SelectedVariation {
  variation_id: string;
  archetype: string;
  rank: PersonaRank;
  name: string;
  description: string;
  display_order: number;
}

/** A chosen source for one persona slot (after the 3-2-1 subset is fixed). */
export interface PortfolioSource {
  variation_id: string;
  archetype: string;
  rank: PersonaRank;
  name: string;
  description: string;
  portfolio_position: number; // 1..6
}

// ── Persona-1C: Editable-workset projection (additive) ──────────────────────

/**
 * A single vertical slot in the EDITABLE workset, projected into the persona
 * generator's vocabulary. Each slot carries an ordered list of selected
 * variations (mixed system / creator-owned). Only system_reference variations
 * contribute to the persona generator in this sprint; creator-owned variations
 * contribute to creator-context and audit but are not yet consumed by the
 * generation Worker (a known limitation; future sprint will extend the Worker
 * to consume creator_owned_variations directly).
 */
export interface WorksetVerticalSlot {
  position: number;
  verticalLabel: string;
  verticalKind: 'system_reference' | 'creator_owned';
  systemArchetype: string | null;
  ownedVerticalId: string | null;
  selectedVariations: ReadonlyArray<{
    variationKind: 'system_reference' | 'creator_owned';
    /** Set when variationKind = 'system_reference'. */
    catalogVariationId: string | null;
    /** Set when variationKind = 'creator_owned'. */
    ownedVariationId: string | null;
    name: string;
    description: string;
    displayOrder: number;
  }>;
}

/**
 * Snapshot row used by the LEGACY fallback (creator_archetype_snapshots'
 * hard columns). Kept exported so API/V1 readers without a workset continue
 * to derive the persona generator's 3-2-1 set correctly.
 */
export interface LegacySnapshotSelection extends SelectedVariation {
  /** Hard-coded rank from the snapshot's primary/secondary/third columns. */
  rank: PersonaRank;
}

// ── Structured persona shape ─────────────────────────────────────────────────

/** Variable-length / creative-detail fields stored in creator_personas.profile. */
export interface PersonaProfileDetail {
  apparent_age_or_life_stage: string;
  backstory: string;
  current_situation: string;
  personality_traits: string[];
  what_she_wants: string;
  audience_relationship: string;
  visual_world: string;
  typical_locations: string[];
  wardrobe_direction: string;
  recurring_story_hooks: string[];
  content_boundaries: string[];
  story_progression: string;
}

/** The flat object shape the model must return per persona. */
export interface RawPersona extends PersonaProfileDetail {
  source_variation_id: string;
  display_name: string;
  persona_title: string;
  one_line_premise: string;
}

/** The raw portfolio envelope the model must return. */
export interface RawPortfolio {
  personas: RawPersona[];
}

/** A validated persona, normalised to the DB insert shape (columns + profile jsonb). */
export interface NormalizedPersona {
  source_variation_id: string;
  source_archetype: string;
  archetype_rank: PersonaRank;
  portfolio_position: number;
  display_name: string;
  persona_title: string;
  one_line_premise: string;
  profile: PersonaProfileDetail;
  sort_order: number;
}

// Scalar string fields required (non-empty) on every raw persona.
const REQUIRED_SCALAR_FIELDS: readonly (keyof RawPersona)[] = [
  'source_variation_id',
  'display_name',
  'persona_title',
  'one_line_premise',
  'apparent_age_or_life_stage',
  'backstory',
  'current_situation',
  'what_she_wants',
  'audience_relationship',
  'visual_world',
  'wardrobe_direction',
  'story_progression',
];

// Array-of-string fields required (non-empty) on every raw persona.
const REQUIRED_ARRAY_FIELDS: readonly (keyof RawPersona)[] = [
  'personality_traits',
  'typical_locations',
  'recurring_story_hooks',
  'content_boundaries',
];

// ── Deterministic hashing (no crypto dependency; identical in Node + Worker) ──

/** FNV-1a 32-bit → 8-char hex. Stable across environments. */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Stable idempotency digest. Two requests with the same snapshot, the same set
 * of source variations, and the same prompt/schema versions produce the same
 * digest → the persistence boundary can safely dedupe.
 */
export function computeRequestDigest(args: {
  snapshotId: string;
  sourceVariationIds: string[];
  promptVersion: string;
  schemaVersion: string;
}): string {
  const ids = [...args.sourceVariationIds].sort();
  const canonical = [
    args.snapshotId,
    args.promptVersion,
    args.schemaVersion,
    ids.join(','),
  ].join('|');
  return stableHash(canonical);
}

// ── Deterministic 3-2-1 source selection ─────────────────────────────────────

export class PortfolioError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PortfolioError';
    this.code = code;
  }
}

/** Stable ordering within a rank: display_order, then name, then id. */
function compareSelected(a: SelectedVariation, b: SelectedVariation): number {
  return (
    a.display_order - b.display_order ||
    a.name.localeCompare(b.name) ||
    a.variation_id.localeCompare(b.variation_id)
  );
}

/** Per-rank selected counts. */
export function countByRank(selections: SelectedVariation[]): Record<PersonaRank, number> {
  return {
    primary: selections.filter(s => s.rank === 'primary').length,
    secondary: selections.filter(s => s.rank === 'secondary').length,
    third: selections.filter(s => s.rank === 'third').length,
  };
}

/** True when the 3-2-1 minimums are all met. */
export function isSelectionComplete(selections: SelectedVariation[]): boolean {
  const counts = countByRank(selections);
  return RANK_ORDER.every(rank => counts[rank] >= PORTFOLIO_WEIGHTS[rank]);
}

/**
 * Choose the exact deterministic 3-2-1 source set from the creator's selections.
 *
 * If the creator selected exactly the minimum, all are used. If they selected
 * more, a balanced, DETERMINISTIC subset is taken (stable order per rank) — never
 * random. Positions are assigned 1..6 in rank order (primary 1-3, secondary 4-5,
 * third 6). Throws PortfolioError('incomplete_selection') if minimums are unmet.
 */
export function choosePortfolioSources(selections: SelectedVariation[]): PortfolioSource[] {
  if (!isSelectionComplete(selections)) {
    throw new PortfolioError(
      'incomplete_selection',
      'Variation selection is incomplete for a 3-2-1 portfolio.',
    );
  }

  const sources: PortfolioSource[] = [];
  let position = 1;
  for (const rank of RANK_ORDER) {
    const ranked = selections
      .filter(s => s.rank === rank)
      .sort(compareSelected)
      .slice(0, PORTFOLIO_WEIGHTS[rank]);
    for (const s of ranked) {
      sources.push({
        variation_id: s.variation_id,
        archetype: s.archetype,
        rank: s.rank,
        name: s.name,
        description: s.description,
        portfolio_position: position,
      });
      position += 1;
    }
  }

  if (sources.length !== PORTFOLIO_SIZE) {
    throw new PortfolioError(
      'source_set_invalid',
      `Expected ${PORTFOLIO_SIZE} sources, built ${sources.length}.`,
    );
  }
  return sources;
}

/** Per-position minimum for the editable workset (mirrors POSITION_MINIMUMS in
 * src/lib/persona-verticals.ts). Kept inline so this module stays standalone. */
const EDITABLE_POSITION_MINIMUMS: readonly number[] = [3, 2, 1, 1, 1, 1];

/**
 * Persona-1C: project an EDITABLE workset (1..6 verticals) onto the persona
 * generator's 3-2-1 view. Only the first THREE workset rows contribute to the
 * source set; remaining verticals are returned as `extraSources` for audit /
 * UI preview but do not change the generator contract.
 *
 * Verticals 4..6 keep their source metadata but never enter the persona
 * generator in this sprint (creator-owned variations are not yet consumed by
 * the Worker). Filter out entries with no selected system_reference variations
 * to keep the deterministic 3-2-1 minimums satisfiable.
 */
export function projectWorksetToPortfolioSources(slots: ReadonlyArray<WorksetVerticalSlot>): {
  primary: SelectedVariation[];
  secondary: SelectedVariation[];
  third: SelectedVariation[];
  extras: { position: number; archetype: string; variationCount: number }[];
} {
  const sorted = slots.slice().sort((a, b) => a.position - b.position);
  const primary: SelectedVariation[] = [];
  const secondary: SelectedVariation[] = [];
  const third: SelectedVariation[] = [];
  const extras: { position: number; archetype: string; variationCount: number }[] = [];

  sorted.forEach((slot, index) => {
    // Only system_reference variations feed the persona generator in this sprint.
    const systemPicks = slot.selectedVariations
      .filter(v => v.variationKind === 'system_reference' && v.catalogVariationId)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    // If the slot is creator_owned with no system_archetype anchor (or has no
    // system_reference picks at all), it contributes ZERO to the 3-2-1 set.
    // Surface it in `extras` for UI / audit so callers can detect it.
    const hasSystemAnchor = Boolean(slot.systemArchetype) && systemPicks.length > 0;
    if (index === 0) {
      if (hasSystemAnchor) {
        for (const v of systemPicks.slice(0, EDITABLE_POSITION_MINIMUMS[0])) {
          primary.push({
            variation_id: v.catalogVariationId as string,
            archetype: slot.systemArchetype as string,
            rank: 'primary',
            name: v.name,
            description: v.description,
            display_order: v.displayOrder,
          });
        }
      } else {
        extras.push({ position: slot.position, archetype: slot.verticalLabel, variationCount: slot.selectedVariations.length });
      }
    } else if (index === 1) {
      if (hasSystemAnchor) {
        for (const v of systemPicks.slice(0, EDITABLE_POSITION_MINIMUMS[1])) {
          secondary.push({
            variation_id: v.catalogVariationId as string,
            archetype: slot.systemArchetype as string,
            rank: 'secondary',
            name: v.name,
            description: v.description,
            display_order: v.displayOrder,
          });
        }
      } else {
        extras.push({ position: slot.position, archetype: slot.verticalLabel, variationCount: slot.selectedVariations.length });
      }
    } else if (index === 2) {
      if (hasSystemAnchor) {
        for (const v of systemPicks.slice(0, EDITABLE_POSITION_MINIMUMS[2])) {
          third.push({
            variation_id: v.catalogVariationId as string,
            archetype: slot.systemArchetype as string,
            rank: 'third',
            name: v.name,
            description: v.description,
            display_order: v.displayOrder,
          });
        }
      } else {
        extras.push({ position: slot.position, archetype: slot.verticalLabel, variationCount: slot.selectedVariations.length });
      }
    } else {
      // 4..6: track for audit / preview only; do not affect persona output.
      extras.push({
        position: slot.position,
        archetype: slot.verticalLabel,
        variationCount: slot.selectedVariations.length,
      });
    }
  });

  return { primary, secondary, third, extras };
}

/**
 * Legacy fallback for snapshots created BEFORE the editable workset migration.
 * Reads the snapshot's hard primary/secondary/third archetype columns and
 * returns the same shape choosePortfolioSources accepts.
 */
export function choosePortfolioSourcesFromSnapshot(input: {
  snapshotId: string;
  primaryArchetype: string;
  secondaryArchetype: string;
  thirdArchetype: string;
  /** All ACTIVE variations for the three archetypes, joined with library. */
  libraryVariations: SelectedVariation[];
  /** Pre-existing SelectedVariation rows (creator picks). */
  selectedLibraryIds: ReadonlyArray<string>;
}): PortfolioSource[] {
  const selectedByArchetype = new Map<string, SelectedVariation[]>();
  for (const lib of input.libraryVariations) {
    if (!input.selectedLibraryIds.includes(lib.variation_id)) continue;
    const list = selectedByArchetype.get(lib.archetype) ?? [];
    list.push(lib);
    selectedByArchetype.set(lib.archetype, list);
  }
  const selections: SelectedVariation[] = [];
  for (const archetype of [input.primaryArchetype, input.secondaryArchetype, input.thirdArchetype]) {
    const picks = (selectedByArchetype.get(archetype) ?? []).slice().sort(compareSelected);
    for (const pick of picks) {
      selections.push({ ...pick, rank: archetype === input.primaryArchetype ? 'primary' : archetype === input.secondaryArchetype ? 'secondary' : 'third' });
    }
  }

  // Take the first three per rank (also matches the legacy default if more
  // than the minimum was selected).
  const sources: PortfolioSource[] = [];
  let position = 1;
  for (const rank of RANK_ORDER) {
    const ranked = selections
      .filter(s => s.rank === rank)
      .sort(compareSelected)
      .slice(0, PORTFOLIO_WEIGHTS[rank]);
    for (const s of ranked) {
      sources.push({
        variation_id: s.variation_id,
        archetype: s.archetype,
        rank: s.rank,
        name: s.name,
        description: s.description,
        portfolio_position: position,
      });
      position += 1;
    }
  }
  if (sources.length !== PORTFOLIO_SIZE) {
    throw new PortfolioError(
      'source_set_invalid',
      `Legacy projection yielded ${sources.length} sources, expected ${PORTFOLIO_SIZE}.`,
    );
  }
  if (!sources.length) return sources;
  // Source set carries no snapshot link in the persona contract; keep rank
  // mapping deterministic. The Worker reads source_variation_id back via
  // creator_variation_selections; the snapshot's id is reused by callers.
  void input.snapshotId;
  return sources;
}

// ── Output validation ────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; personas: NormalizedPersona[] }
  | { ok: false; code: string; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/**
 * Validate raw model output against the fixed source set. Enforces:
 *   * exactly six personas
 *   * one persona per selected source variation (no missing, no duplicate, no
 *     unknown source_variation_id)
 *   * the 3-2-1 weighting implied by the sources
 *   * all required scalar + array fields present and non-empty
 * On success, returns personas normalised to the DB insert shape, with rank /
 * archetype / position taken authoritatively from the SOURCE (never the model).
 */
export function validatePersonaPortfolio(
  raw: unknown,
  sources: PortfolioSource[],
): ValidationResult {
  const envelope = raw as { personas?: unknown } | null | undefined;
  const personas = envelope?.personas;
  if (!Array.isArray(personas)) {
    return { ok: false, code: 'malformed_output', reason: 'Output has no personas array.' };
  }
  if (personas.length !== PORTFOLIO_SIZE) {
    return {
      ok: false,
      code: 'wrong_persona_count',
      reason: `Expected ${PORTFOLIO_SIZE} personas, received ${personas.length}.`,
    };
  }

  const sourceById = new Map(sources.map(s => [s.variation_id, s]));
  const seen = new Set<string>();
  const normalized: NormalizedPersona[] = [];

  for (const entry of personas) {
    const persona = entry as Record<string, unknown>;
    const sourceId = persona.source_variation_id;
    if (!isNonEmptyString(sourceId)) {
      return { ok: false, code: 'missing_source', reason: 'A persona is missing source_variation_id.' };
    }
    const source = sourceById.get(sourceId);
    if (!source) {
      return {
        ok: false,
        code: 'source_mismatch',
        reason: `Persona references unknown source_variation_id ${sourceId}.`,
      };
    }
    if (seen.has(sourceId)) {
      return {
        ok: false,
        code: 'duplicate_source',
        reason: `Duplicate persona for source_variation_id ${sourceId}.`,
      };
    }
    seen.add(sourceId);

    for (const field of REQUIRED_SCALAR_FIELDS) {
      if (!isNonEmptyString(persona[field])) {
        return { ok: false, code: 'missing_field', reason: `Persona field "${field}" is missing or empty.` };
      }
    }
    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!isNonEmptyStringArray(persona[field])) {
        return { ok: false, code: 'missing_field', reason: `Persona field "${field}" must be a non-empty string array.` };
      }
    }

    normalized.push({
      source_variation_id: source.variation_id,
      source_archetype: source.archetype,
      archetype_rank: source.rank,
      portfolio_position: source.portfolio_position,
      display_name: (persona.display_name as string).trim(),
      persona_title: (persona.persona_title as string).trim(),
      one_line_premise: (persona.one_line_premise as string).trim(),
      sort_order: source.portfolio_position,
      profile: {
        apparent_age_or_life_stage: (persona.apparent_age_or_life_stage as string).trim(),
        backstory: (persona.backstory as string).trim(),
        current_situation: (persona.current_situation as string).trim(),
        personality_traits: (persona.personality_traits as string[]).map(s => s.trim()),
        what_she_wants: (persona.what_she_wants as string).trim(),
        audience_relationship: (persona.audience_relationship as string).trim(),
        visual_world: (persona.visual_world as string).trim(),
        typical_locations: (persona.typical_locations as string[]).map(s => s.trim()),
        wardrobe_direction: (persona.wardrobe_direction as string).trim(),
        recurring_story_hooks: (persona.recurring_story_hooks as string[]).map(s => s.trim()),
        content_boundaries: (persona.content_boundaries as string[]).map(s => s.trim()),
        story_progression: (persona.story_progression as string).trim(),
      },
    });
  }

  // Every source must be represented (count already 6 + no dupes ⇒ full cover,
  // but assert explicitly for weighting clarity).
  if (seen.size !== sources.length) {
    return { ok: false, code: 'source_coverage', reason: 'Not every source variation is represented exactly once.' };
  }
  const weightOk = RANK_ORDER.every(
    rank =>
      normalized.filter(p => p.archetype_rank === rank).length === PORTFOLIO_WEIGHTS[rank],
  );
  if (!weightOk) {
    return { ok: false, code: 'wrong_weighting', reason: 'Portfolio does not satisfy the 3-2-1 weighting.' };
  }

  return { ok: true, personas: normalized };
}

// ── Provenance input snapshot ────────────────────────────────────────────────

export interface CreatorGenerationContext {
  display_name?: string | null;
  model_name?: string | null;
}

export interface PersonaGenerationInputSnapshot {
  snapshot_id: string;
  locked_archetypes: { primary: string; secondary: string; third: string };
  selected_variations: SelectedVariation[];
  source_set: PortfolioSource[];
  creator_context: CreatorGenerationContext;
  rules: { directive: string; weights: Record<PersonaRank, number>; size: number };
  prompt_version: string;
  schema_version: string;
}

export function buildInputSnapshot(args: {
  snapshotId: string;
  lockedArchetypes: { primary: string; secondary: string; third: string };
  selections: SelectedVariation[];
  sources: PortfolioSource[];
  creatorContext: CreatorGenerationContext;
}): PersonaGenerationInputSnapshot {
  return {
    snapshot_id: args.snapshotId,
    locked_archetypes: args.lockedArchetypes,
    selected_variations: args.selections,
    source_set: args.sources,
    creator_context: {
      display_name: args.creatorContext.display_name ?? null,
      model_name: args.creatorContext.model_name ?? null,
    },
    rules: { directive: PORTFOLIO_DIRECTIVE, weights: PORTFOLIO_WEIGHTS, size: PORTFOLIO_SIZE },
    prompt_version: PERSONA_PROMPT_VERSION,
    schema_version: PERSONA_SCHEMA_VERSION,
  };
}

// ── Deterministic fixture portfolio (shared by fixture provider + tests) ──────

function creatorFirstName(ctx: CreatorGenerationContext): string {
  const raw = (ctx.display_name || ctx.model_name || '').trim();
  const first = raw.split(/\s+/).filter(Boolean)[0];
  return first || 'the creator';
}

/**
 * Build a deterministic, professional, NON-EXPLICIT six-persona portfolio from a
 * fixed source set. Used by the Worker's fixture provider (dev/test) and by the
 * automated tests. Deterministic: no randomness, no time — identical output for
 * identical inputs. This is a scaffold, not marketing copy the model would write.
 */
export function buildDeterministicPortfolio(
  sources: PortfolioSource[],
  ctx: CreatorGenerationContext,
): RawPortfolio {
  const name = creatorFirstName(ctx);
  const personas: RawPersona[] = sources.map(source => {
    const facet = source.name;
    const rankWord = RANK_LABEL[source.rank].toLowerCase();
    return {
      source_variation_id: source.variation_id,
      display_name: `${name} — ${facet}`,
      persona_title: `${facet} (${source.archetype})`,
      one_line_premise: `A ${rankWord}-rank facet of ${name} expressed through the "${facet}" direction of the ${source.archetype} archetype.`,
      apparent_age_or_life_stage: 'Adult (25–34), established and self-assured',
      backstory: `Grounded in ${name}'s ${source.archetype} identity, this "${facet}" facet builds on ${source.description || 'the selected creative direction'} while staying recognisably the same person across the portfolio.`,
      current_situation: `Actively developing the "${facet}" storyline as one of six coordinated facets of a single creator brand.`,
      personality_traits: ['Authentic', 'Confident', `${source.archetype}-aligned`, 'Consistent voice'],
      what_she_wants: `To deepen audience connection through the distinct "${facet}" angle without fragmenting ${name}'s core identity.`,
      audience_relationship: 'Warm, direct and trust-building; speaks to a specific audience proposition for this facet.',
      visual_world: `A visual world consistent with the ${source.archetype} archetype and the "${facet}" direction.`,
      typical_locations: ['Home studio', 'On-location shoots', 'Everyday real-world settings'],
      wardrobe_direction: `Wardrobe that signals the "${facet}" direction while remaining coherent with the overall brand.`,
      recurring_story_hooks: [`The "${facet}" ritual`, 'Behind-the-scenes moments', 'Audience Q&A'],
      content_boundaries: ['Professional and brand-safe', 'No explicit content in strategy copy', 'Consistent with creator values'],
      story_progression: `Introduce the "${facet}" facet, build familiarity, then develop a distinct arc that complements the other five facets.`,
    };
  });
  return { personas };
}

// ── Workspace grouping (pure; used by PersonaWorkspace + tested) ──────────────

export interface RankGroup<T> {
  rank: PersonaRank;
  label: string;
  expected: number;
  items: T[];
}

/**
 * Group personas by rank in fixed rank order for the workspace's 3-2-1 layout.
 * Generic over any object carrying archetype_rank + portfolio_position.
 */
export function groupPersonasByRank<T extends { archetype_rank: PersonaRank; portfolio_position: number }>(
  personas: T[],
): RankGroup<T>[] {
  return RANK_ORDER.map(rank => ({
    rank,
    label: RANK_LABEL[rank],
    expected: PORTFOLIO_WEIGHTS[rank],
    items: personas
      .filter(p => p.archetype_rank === rank)
      .sort((a, b) => a.portfolio_position - b.portfolio_position),
  }));
}
