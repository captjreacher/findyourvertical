// Pure, dependency-free internal redirect allow-listing.
//
// Post-login redirects (the `next` param and the stored redirect path) must
// only ever point at known internal destinations. This prevents open-redirect
// abuse (e.g. `//evil.com`, `https://evil.com`, `/\evil.com`) and stops a
// creator/agency link from being coerced to an unexpected surface.
//
// Kept side-effect free (no window, no Supabase client) so it is trivially
// unit-testable — see redirect.test.ts.

export const ALLOWED_REDIRECT_PREFIXES = ['/auth', '/cockpit', '/my'] as const;
export const DEFAULT_REDIRECT = '/cockpit';

export function normalizeRedirectPath(
  path: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT
): string {
  if (!path || typeof path !== 'string') return fallback;
  let candidate = path.trim();
  if (candidate.startsWith('#')) candidate = candidate.slice(1);
  // Must be a same-origin absolute path. Reject protocol-relative (`//host`),
  // any scheme (`http://`, `javascript:`), and backslash tricks.
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.includes('://')
  ) {
    return fallback;
  }
  const firstSegment = '/' + (candidate.split(/[/?#]/)[1] ?? '');
  return (ALLOWED_REDIRECT_PREFIXES as readonly string[]).includes(firstSegment)
    ? candidate
    : fallback;
}
