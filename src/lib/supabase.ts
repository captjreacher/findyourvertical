import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const AUTH_REDIRECT_KEY = 'ikigai.auth.redirectPath';

export function normalizeCockpitPath(path: string | null | undefined): string {
  if (!path) return '/cockpit';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.startsWith('/cockpit') ? normalized : '/cockpit';
}

export function getRequestedCockpitPath(): string {
  const hashPath = window.location.hash.replace(/^#/, '');
  const routePath = hashPath.startsWith('/') ? hashPath : window.location.pathname;
  return normalizeCockpitPath(routePath || '/cockpit');
}

export function storeAuthRedirectPath(path: string) {
  window.sessionStorage.setItem(AUTH_REDIRECT_KEY, normalizeCockpitPath(path));
}

export function consumeAuthRedirectPath(): string | null {
  const path = window.sessionStorage.getItem(AUTH_REDIRECT_KEY);
  window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  return path ? normalizeCockpitPath(path) : null;
}

export function getStoredAuthRedirectPath(): string | null {
  const path = window.sessionStorage.getItem(AUTH_REDIRECT_KEY);
  return path ? normalizeCockpitPath(path) : null;
}

export function authCallbackUrl(path = getRequestedCockpitPath()): string {
  const destination = normalizeCockpitPath(path);
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
}

export async function signInWithOtp(email: string, redirectPath = getRequestedCockpitPath()) {
  const destination = normalizeCockpitPath(redirectPath);
  storeAuthRedirectPath(destination);

  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authCallbackUrl(destination),
      shouldCreateUser: false,
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}
