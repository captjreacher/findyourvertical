// =============================================================================
// FYV-CHARACTERS-1 — Character Portfolio Service Layer
// -----------------------------------------------------------------------------
// Bridges `creator_personas` with the new `creator_character_profiles` table.
// Every character has one companion profile row (created lazily on first
// access). Recommendation evidence is surfaced separately via the existing
// `src/lib/recommendations/` modules.
//
// This module is the ONLY place that reads/writes `creator_character_profiles`
// from the browser. Agency/cockpit reads go through the same RLS scope
// (relationship-based access).
// =============================================================================

import { supabase } from '@/lib/supabase';
import type { CreatorPersona } from '@/types/creator';

// ── Types ────────────────────────────────────────────────────────────────────

export type CharacterLifecycleStatus = 'draft' | 'active' | 'archived';

export interface CharacterProfileSettings {
  id: string;
  persona_id: string;
  creator_profile_id: string;
  status: CharacterLifecycleStatus;
  activated_at: string | null;
  archived_at: string | null;

  // Brand Identity
  personality: string;
  positioning: string;
  audience_description: string;
  core_promise: string;
  differentiation: string;

  // Tone of Voice
  tone_of_voice: string[];
  tone_of_voice_notes: string;

  // Content Pillars
  content_pillars: string[];

  // Visual Identity
  primary_colors: string[];
  style_keywords: string[];
  photography_direction: string;
  lighting_style: string;
  editing_style: string;
  wardrobe_direction: string;
  hair_style: string;
  makeup_style: string;
  props: string[];

  version: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterVersionEntry {
  id: string;
  character_profile_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export type CharacterProfilePatch = Partial<Pick<
  CharacterProfileSettings,
  | 'personality'
  | 'positioning'
  | 'audience_description'
  | 'core_promise'
  | 'differentiation'
  | 'tone_of_voice'
  | 'tone_of_voice_notes'
  | 'content_pillars'
  | 'primary_colors'
  | 'style_keywords'
  | 'photography_direction'
  | 'lighting_style'
  | 'editing_style'
  | 'wardrobe_direction'
  | 'hair_style'
  | 'makeup_style'
  | 'props'
>>;

// ── Content Ideas (in-memory; AI-generated in a future sprint) ───────────────

export interface ContentIdeaGroup {
  label: string;
  ideas: string[];
}

const DEFAULT_CONTENT_IDEAS: ContentIdeaGroup[] = [
  {
    label: 'Post ideas',
    ideas: [
      'Behind-the-scenes of a photoshoot',
      'Q&A about your creative journey',
      'Day-in-the-life vlog',
      'React to a popular trend in your niche',
      'Share a personal milestone',
      'Tutorial or educational post about your craft',
      'POV-style storytelling post',
      'Fan appreciation shoutout post',
      'Collaboration tease with another creator',
      '"Then vs Now" transformation post',
      'Commentary on a hot topic in your vertical',
      'Post about your creative tools and setup',
      'A challenge or dare post',
      '"Three things I wish I knew" advice post',
      'Post about your favourite content you made',
      'Unpopular opinion about your niche',
      'Post that invites audience participation',
      'Reflection on a recent creative block',
      'Paid partnership / sponsorship reveal',
      'Post teasing upcoming content',
    ],
  },
  {
    label: 'Reel ideas',
    ideas: [
      'Transition reel showing different facets of your persona',
      'Quick transformation before/after',
      'Trend sound lip-sync relevant to your niche',
      'Educational tip explained in 30 seconds',
      'Text-overlay storytelling reel',
      'Outfit transition showing different styles',
      'Trending challenge reel with your twist',
      '"Day in the life" fast-montage reel',
      'Fan question answered on video',
      'Teaser of upcoming photoshoot',
    ],
  },
  {
    label: 'Livestream concepts',
    ideas: [
      'Casual chat and Q&A stream',
      'Behind-the-scenes creation stream',
      'Collaboration stream with another creator',
      'Fan appreciation / shoutout livestream',
      'Tutorial or how-to livestream',
      'Reaction watch-along stream',
    ],
  },
  {
    label: 'Series ideas',
    ideas: [
      'Weekly check-in series',
      'Style exploration series (trying different looks)',
      'Creator journey documentary series',
      '"Ask me anything" recurring series',
      'Milestone countdown series',
    ],
  },
];

// ── Monetisation suggestions (in-memory; rule-based in this sprint) ──────────

export interface MonetisationSuggestion {
  label: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  potential: 'low' | 'medium' | 'high';
}

const DEFAULT_MONETISATION_OPTIONS: MonetisationSuggestion[] = [
  { label: 'Subscriptions', description: 'Recurring monthly subscription with exclusive content tiers.', effort: 'low', potential: 'high' },
  { label: 'Custom content', description: 'Personalised content requests for individual fans.', effort: 'medium', potential: 'high' },
  { label: 'Affiliate marketing', description: 'Promote products relevant to your niche and earn commission.', effort: 'low', potential: 'medium' },
  { label: 'Merchandise', description: 'Branded merchandise — apparel, accessories, or digital products.', effort: 'high', potential: 'medium' },
  { label: 'Digital products', description: 'Photo sets, presets, guides, or ebooks for sale.', effort: 'medium', potential: 'medium' },
  { label: 'Bookings', description: 'Premium one-on-one calls, shoutouts, or appearances.', effort: 'low', potential: 'high' },
];

// ── Service functions ────────────────────────────────────────────────────────

const TABLE = 'creator_character_profiles';
const HISTORY_TABLE = 'creator_character_version_history';
const ENSURE_RPC = 'fyv_ensure_character_profile';
const UPDATE_RPC = 'fyv_update_character_profile';
const TRANSITION_RPC = 'fyv_transition_character_status';
const DELETE_RPC = 'fyv_delete_character_profile';

/**
 * Ensure a character profile row exists for the given persona.
 * Returns the existing row if one already exists; creates a new one otherwise.
 * Idempotent and safe to call on every detail-view mount.
 */
export async function ensureCharacterProfile(
  personaId: string,
  creatorProfileId: string,
): Promise<CharacterProfileSettings> {
  const { data, error } = await supabase.rpc(ENSURE_RPC, {
    p_persona_id: personaId,
    p_creator_profile_id: creatorProfileId,
  });
  if (error) throw new Error(`Failed to ensure character profile: ${error.message}`);
  return normalizeProfileRow(data as Record<string, unknown>);
}

/**
 * Update a character profile's editable settings. Increments the version
 * counter and snapshots the new state to version history atomically.
 */
export async function updateCharacterProfile(
  profileId: string,
  patches: CharacterProfilePatch,
): Promise<CharacterProfileSettings> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patches)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  const { data, error } = await supabase.rpc(UPDATE_RPC, {
    p_profile_id: profileId,
    p_patches: payload,
  });
  if (error) throw new Error(`Failed to update character profile: ${error.message}`);
  return normalizeProfileRow(data as Record<string, unknown>);
}

/**
 * Transition a character's lifecycle status.
 * Rules enforced server-side: Draft ↔ Active → Archive → Draft.
 */
export async function transitionCharacterStatus(
  profileId: string,
  newStatus: CharacterLifecycleStatus,
): Promise<CharacterProfileSettings> {
  const { data, error } = await supabase.rpc(TRANSITION_RPC, {
    p_profile_id: profileId,
    p_new_status: newStatus,
  });
  if (error) throw new Error(`Failed to transition character status: ${error.message}`);
  return normalizeProfileRow(data as Record<string, unknown>);
}

/**
 * Delete a draft-only character profile. Only works when status = 'draft'.
 */
export async function deleteCharacterProfile(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(DELETE_RPC, {
    p_profile_id: profileId,
  });
  if (error) throw new Error(`Failed to delete character profile: ${error.message}`);
  return Boolean(data);
}

/**
 * Fetch version history for a character profile.
 */
export async function getCharacterVersionHistory(
  profileId: string,
): Promise<CharacterVersionEntry[]> {
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .eq('character_profile_id', profileId)
    .order('version', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Failed to load version history: ${error.message}`);
  return (data ?? []) as CharacterVersionEntry[];
}

/**
 * Load ALL character profiles for a creator. Used by the portfolio workspace
 * to display lifecycle status for every persona.
 */
export async function listMyCharacterProfiles(
  creatorProfileId: string,
): Promise<CharacterProfileSettings[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('creator_profile_id', creatorProfileId);
  if (error) throw new Error(`Failed to load character profiles: ${error.message}`);
  return (data ?? []).map(row => normalizeProfileRow(row as Record<string, unknown>));
}

/**
 * Load a single character profile by persona ID. Used by the detail workspace.
 */
export async function getCharacterProfileByPersonaId(
  personaId: string,
): Promise<CharacterProfileSettings | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('persona_id', personaId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load character profile: ${error.message}`);
  if (!data) return null;
  return normalizeProfileRow(data as Record<string, unknown>);
}

// ── Content Ideas (pure helpers) ─────────────────────────────────────────────

/**
 * Get content idea groups. In this sprint, returns a deterministic set of
 * starter ideas. A future sprint will generate persona-specific ideas via AI.
 */
export function getContentIdeas(): ContentIdeaGroup[] {
  return DEFAULT_CONTENT_IDEAS.map(group => ({
    label: group.label,
    ideas: [...group.ideas],
  }));
}

/** Regenerate a single idea group independently. */
export function regenerateIdeaGroup(label: string): string[] {
  const group = DEFAULT_CONTENT_IDEAS.find(g => g.label === label);
  if (!group) return [];
  // Deterministic shuffle based on label for reproducibility.
  const shuffled = [...group.ideas].sort((a, b) => {
    const ha = hashString(label + a);
    const hb = hashString(label + b);
    return ha - hb;
  });
  return shuffled;
}

// ── Monetisation (pure helper) ───────────────────────────────────────────────

export function getMonetisationSuggestions(): MonetisationSuggestion[] {
  return DEFAULT_MONETISATION_OPTIONS.map(o => ({ ...o }));
}

// ── Growth opportunities (from recommendation engine; pure) ──────────────────

export interface GrowthOpportunity {
  category: 'audience' | 'positioning' | 'content' | 'cross_profile';
  message: string;
}

/**
 * Derive growth opportunities from a character's data. In this sprint, returns
 * general-purpose suggestions. A future sprint will power this from the
 * recommendation validation engine.
 */
export function deriveGrowthOpportunities(
  persona: Pick<CreatorPersona, 'source_archetype' | 'display_name'>,
  profileSettings: CharacterProfileSettings | null,
): GrowthOpportunity[] {
  const opportunities: GrowthOpportunity[] = [];

  // Archetype-based suggestion.
  opportunities.push({
    category: 'audience',
    message: `Your ${persona.source_archetype} direction may appeal to audiences who enjoy authentic, personality-driven content. Focus on building familiarity before broadening your reach.`,
  });

  // Positioning gap.
  if (!profileSettings?.positioning || profileSettings.positioning.length < 10) {
    opportunities.push({
      category: 'positioning',
      message: `Consider clarifying "${persona.display_name}'s" unique positioning. What makes this character distinct from similar creators in the same vertical?`,
    });
  }

  // Cross-profile suggestion.
  opportunities.push({
    category: 'cross_profile',
    message: `Compare "${persona.display_name}" with your other characters to ensure each occupies a distinct creative space. Overlapping characters can confuse your audience.`,
  });

  // Content diversification.
  opportunities.push({
    category: 'content',
    message: 'Experiment with content formats your audience has not seen from you yet — reels, livestreams, or collaborative content can reveal new engagement patterns.',
  });

  return opportunities;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function normalizeProfileRow(row: Record<string, unknown>): CharacterProfileSettings {
  return {
    id: String(row.id ?? ''),
    persona_id: String(row.persona_id ?? ''),
    creator_profile_id: String(row.creator_profile_id ?? ''),
    status: (String(row.status ?? 'draft')) as CharacterLifecycleStatus,
    activated_at: row.activated_at ? String(row.activated_at) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    personality: String(row.personality ?? ''),
    positioning: String(row.positioning ?? ''),
    audience_description: String(row.audience_description ?? ''),
    core_promise: String(row.core_promise ?? ''),
    differentiation: String(row.differentiation ?? ''),
    tone_of_voice: Array.isArray(row.tone_of_voice) ? row.tone_of_voice.map(String) : [],
    tone_of_voice_notes: String(row.tone_of_voice_notes ?? ''),
    content_pillars: Array.isArray(row.content_pillars) ? row.content_pillars.map(String) : [],
    primary_colors: Array.isArray(row.primary_colors) ? row.primary_colors.map(String) : [],
    style_keywords: Array.isArray(row.style_keywords) ? row.style_keywords.map(String) : [],
    photography_direction: String(row.photography_direction ?? ''),
    lighting_style: String(row.lighting_style ?? ''),
    editing_style: String(row.editing_style ?? ''),
    wardrobe_direction: String(row.wardrobe_direction ?? ''),
    hair_style: String(row.hair_style ?? ''),
    makeup_style: String(row.makeup_style ?? ''),
    props: Array.isArray(row.props) ? row.props.map(String) : [],
    version: Number(row.version ?? 1),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
