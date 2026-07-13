// ─────────────────────────────────────────────────────────────────────────────
// FYV Creator Relationship & Access Layer — shared contract (pure, isomorphic)
//
// Dependency-free + side-effect-free so it can be unit-tested directly by Node's
// type-stripping runner and reused by the browser UI and the Worker. This module
// is the single source of truth for:
//   * the FYV access relationship_state machine (draft → invited → accepted → active)
//   * the FYV → FMF integration event contract (creator_invited / _accepted / _activated)
//   * canonical identity references (never BetterFans usernames / handles / aliases)
//
// Boundary: FYV owns creator intelligence + identity relationship + access
// onboarding. FMF owns operations/opportunities/journeys/playbooks/automation.
// This layer maps a FYV creator identity to an FMF creator id and nothing more.
// ─────────────────────────────────────────────────────────────────────────────

// ── Relationship state machine ───────────────────────────────────────────────

export type RelationshipState = 'draft' | 'invited' | 'accepted' | 'active';

export const RELATIONSHIP_STATES: readonly RelationshipState[] = [
  'draft',
  'invited',
  'accepted',
  'active',
] as const;

/** Allowed forward transitions. The lifecycle is strictly linear (no skips, no reversals). */
export const RELATIONSHIP_TRANSITIONS: Readonly<Record<RelationshipState, RelationshipState | null>> = {
  draft: 'invited',
  invited: 'accepted',
  accepted: 'active',
  active: null,
} as const;

/** The next state in the lifecycle, or null at the terminal state. */
export function nextRelationshipState(from: RelationshipState): RelationshipState | null {
  return RELATIONSHIP_TRANSITIONS[from];
}

/** Whether `to` is the immediate, legal successor of `from`. */
export function canTransitionRelationship(from: RelationshipState, to: RelationshipState): boolean {
  return RELATIONSHIP_TRANSITIONS[from] === to;
}

// ── Integration event contract (consumed by FMF, asynchronously) ─────────────

export type RelationshipEventType = 'creator_invited' | 'creator_accepted' | 'creator_activated';

export const RELATIONSHIP_EVENT_TYPES: readonly RelationshipEventType[] = [
  'creator_invited',
  'creator_accepted',
  'creator_activated',
] as const;

/** The event a given (post-transition) state emits. */
export const STATE_EVENT: Readonly<Record<Exclude<RelationshipState, 'draft'>, RelationshipEventType>> = {
  invited: 'creator_invited',
  accepted: 'creator_accepted',
  active: 'creator_activated',
} as const;

/** The relationship_state a given event announces. */
export const EVENT_STATE: Readonly<Record<RelationshipEventType, RelationshipState>> = {
  creator_invited: 'invited',
  creator_accepted: 'accepted',
  creator_activated: 'active',
} as const;

export const SOURCE_PRODUCT = 'FYV' as const;

/** Canonical FYV creator reference — namespaced creator_profiles.id, never a username. */
export function fyvCreatorReference(fyvCreatorId: string): string {
  return `fyv:${fyvCreatorId}`;
}

/** Deterministic dedupe key for the event outbox (mirrors the SQL emitter). */
export function relationshipEventCorrelationId(relationshipId: string, state: RelationshipState): string {
  return `fyv/creator-relationship/${relationshipId}/${state}`;
}

export interface CreatorRelationshipEventInput {
  eventType: RelationshipEventType;
  /** Canonical FYV creator identity (creator_profiles.id). */
  fyvCreatorId: string;
  /** Canonical FMF creator id (funk-my-brand of_creators.id). */
  fmfCreatorId: string;
  relationshipId: string;
  relationshipState: RelationshipState;
  /** ISO-8601 timestamp; defaults to now (UTC, second precision). */
  timestamp?: string;
}

/** The flat event payload FMF consumes. Byte-aligned with the SQL emitter. */
export interface CreatorRelationshipEventPayload {
  event_type: RelationshipEventType;
  creator_id: string;
  creator_reference: string;
  fmf_creator_id: string;
  relationship_id: string;
  source_product: typeof SOURCE_PRODUCT;
  relationship_state: RelationshipState;
  timestamp: string;
}

function utcSecondIso(date: Date): string {
  // YYYY-MM-DDTHH:MM:SSZ — matches the SQL to_char(... 'Z') emission.
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function buildCreatorRelationshipEvent(
  input: CreatorRelationshipEventInput,
): CreatorRelationshipEventPayload {
  return {
    event_type: input.eventType,
    creator_id: input.fyvCreatorId,
    creator_reference: fyvCreatorReference(input.fyvCreatorId),
    fmf_creator_id: input.fmfCreatorId,
    relationship_id: input.relationshipId,
    source_product: SOURCE_PRODUCT,
    relationship_state: input.relationshipState,
    timestamp: input.timestamp ?? utcSecondIso(new Date()),
  };
}

// ── Invitation acceptance (distinct, safe failure codes) ─────────────────────

export type InvitationCode =
  | 'invalid'
  | 'revoked'
  | 'expired'
  | 'already_accepted'
  | 'identity_conflict';

export interface InvitationValidation {
  ok: boolean;
  code?: InvitationCode;
  email?: string;
  relationship_id?: string;
  fyv_creator_id?: string;
  fmf_creator_id?: string;
  relationship_state?: RelationshipState;
}

/** Distinct, human-readable messaging for every safe-failure code. */
export const INVITATION_MESSAGES: Record<InvitationCode, string> = {
  invalid: 'This invitation link is not valid. Please ask the team for a fresh link.',
  revoked: 'This invitation link has been revoked. Please ask the team for a new one.',
  expired: 'This invitation link has expired. Please ask the team for a new one.',
  already_accepted: 'This invitation has already been used — sign in to access FindYourVertical.',
  identity_conflict: 'This account is already linked to a different creator. Contact the team.',
};

export function describeInvitation(result: InvitationValidation): string {
  if (result.ok) return 'Invitation accepted.';
  return INVITATION_MESSAGES[result.code ?? 'invalid'] ?? INVITATION_MESSAGES.invalid;
}

// ── Accept path (carries the single-use raw token) ───────────────────────────

/** Public hash-route accept path. NOTE: unauthenticated — provisions access. */
export function buildAcceptInvitePath(rawToken: string): string {
  return `/accept-invite?token=${encodeURIComponent(rawToken)}`;
}

// ── Row shapes (client-side views) ───────────────────────────────────────────

export interface CreatorRelationship {
  id: string;
  created_at: string;
  updated_at: string;
  fyv_creator_id: string;
  fmf_creator_id: string;
  relationship_state: RelationshipState;
}

export interface CreatorInvitationView {
  id: string;
  relationship_id: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
