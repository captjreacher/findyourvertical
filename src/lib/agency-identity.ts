// ─────────────────────────────────────────────────────────────────────────────
// FYV identity roles — DERIVED from the existing allowlist model (pure helpers).
//
// FYV does NOT use a role column. Identity is the existing allowlist:
//   * agency admin  = membership in public.agency_users  (public.is_agency())
//   * creator       = a linked public.creator_profiles row (current_creator_profile_id())
//
// This module only *derives* a role label + guard intent from those signals so
// the UI/tests have a single, deterministic source of truth. It replaces nothing
// in the security model — RLS + is_agency() remain authoritative on the server.
// ─────────────────────────────────────────────────────────────────────────────

export type IdentityRole = 'agency_admin' | 'creator' | 'guest';

export interface IdentitySignals {
  authenticated: boolean;
  /** Server truth: public.is_agency() (agency_users membership). */
  isAgency: boolean;
  /** Server truth: current_creator_profile_id() resolved to a linked profile. */
  hasCreatorProfile: boolean;
}

/**
 * Resolve the identity role. Agency membership WINS over a creator profile so an
 * operator is never treated as a creator (matching CreatorGate's server behaviour).
 */
export function resolveIdentityRole(signals: IdentitySignals): IdentityRole {
  if (!signals.authenticated) return 'guest';
  if (signals.isAgency) return 'agency_admin';
  if (signals.hasCreatorProfile) return 'creator';
  return 'guest';
}

export function isAgencyAdminRole(role: IdentityRole): boolean {
  return role === 'agency_admin';
}

export function isCreatorRole(role: IdentityRole): boolean {
  return role === 'creator';
}

// ── Guard intent (mirrors AuthGate / CreatorGate enforcement) ────────────────

/** Only agency admins may see the agency console + creator management. */
export function canAccessAgencyConsole(role: IdentityRole): boolean {
  return role === 'agency_admin';
}

/** Agency admins must never be routed through creator onboarding/assessment. */
export function shouldEnterCreatorOnboarding(role: IdentityRole): boolean {
  return role === 'creator';
}
