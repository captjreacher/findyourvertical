import { createClient } from '@supabase/supabase-js';
import type { AuthOtpResponse } from '@supabase/supabase-js';
import { normalizeRedirectPath, DEFAULT_REDIRECT } from './redirect';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

/**
 * Primary client. Persists the session, so once a user is authenticated its JWT
 * rides on every request (role `authenticated`). Used by the cockpit (agency)
 * and by authenticated creator-own reads on /my.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Session-less anonymous client (role `anon`).
 *
 * The public assessment wizard + public report page + creator engagement
 * tracking MUST run as `anon` regardless of whether a creator happens to be
 * logged in — the assessment-completion write path is anon-only by RLS (the
 * `public.events` completion-outbox insert policy is granted to `anon`), and
 * template/invite reads used by those flows are anon policies. Routing those
 * flows through this client makes a logged-in creator's retake behave exactly
 * like a normal public assessment, and keeps the public flows regression-free.
 *
 * It never reads or writes the authenticated session (separate storageKey +
 * persistSession disabled), so it can never accidentally carry a creator JWT.
 */
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: 'findyourvertical.public.anon',
  },
});

// ── Safe internal redirect handling ─────────────────────────────────────────
// Allow-listing lives in ./redirect (pure + independently testable). Re-exported
// so existing call sites keep importing it from '@/lib/supabase'.
export { normalizeRedirectPath };
const AUTH_REDIRECT_KEY = 'findyourvertical.auth.redirectPath';

/** @deprecated use normalizeRedirectPath. Kept for call-site compatibility. */
export function normalizeCockpitPath(path: string | null | undefined): string {
  return normalizeRedirectPath(path, '/cockpit');
}

/** The path the user is currently on (hash route), validated to an allowed destination. */
export function getRequestedRedirectPath(fallback: string = DEFAULT_REDIRECT): string {
  const hashPath = window.location.hash.replace(/^#/, '');
  const routePath = hashPath.startsWith('/') ? hashPath : window.location.pathname;
  return normalizeRedirectPath(routePath || fallback, fallback);
}

export function storeAuthRedirectPath(path: string) {
  window.sessionStorage.setItem(AUTH_REDIRECT_KEY, normalizeRedirectPath(path));
}

export function consumeAuthRedirectPath(): string | null {
  const path = window.sessionStorage.getItem(AUTH_REDIRECT_KEY);
  window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  return path ? normalizeRedirectPath(path) : null;
}

export function getStoredAuthRedirectPath(): string | null {
  const path = window.sessionStorage.getItem(AUTH_REDIRECT_KEY);
  return path ? normalizeRedirectPath(path) : null;
}

export function authCallbackUrl(path = getRequestedRedirectPath()): string {
  const destination = normalizeRedirectPath(path);
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
}

/**
 * Send a magic link. `shouldCreateUser: false` is intentional — accounts are
 * pre-provisioned (agency operators, and creators such as Emma). We never open
 * self-signup here. Works for both cockpit (`/cockpit`) and creator (`/my`)
 * destinations via the validated redirect path.
 */
export async function signInWithOtp(
  email: string,
  redirectPath = getRequestedRedirectPath()
): Promise<AuthOtpResponse> {
  const destination = normalizeRedirectPath(redirectPath);
  storeAuthRedirectPath(destination);

  const response = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authCallbackUrl(destination),
      shouldCreateUser: false,
    },
  });

  return response;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

/** Whether the current authenticated user is an agency/cockpit operator. */
export async function checkIsAgency(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_agency');
  if (error) throw error;
  return data === true;
}
