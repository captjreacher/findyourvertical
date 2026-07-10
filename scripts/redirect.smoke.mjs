// Dependency-free smoke test for the redirect allow-list logic.
// Mirrors src/lib/redirect.ts (keep in sync). Run: `node scripts/redirect.smoke.mjs`
// (A vitest unit test of the real module can be added once a test runner is in
//  the project; this exists so the truth-table can be validated with plain node.)

const ALLOWED_REDIRECT_PREFIXES = ['/cockpit', '/my'];
const DEFAULT_REDIRECT = '/cockpit';

function normalizeRedirectPath(path, fallback = DEFAULT_REDIRECT) {
  if (!path || typeof path !== 'string') return fallback;
  let candidate = path.trim();
  if (candidate.startsWith('#')) candidate = candidate.slice(1);
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.includes('://')
  ) {
    return fallback;
  }
  const firstSegment = '/' + (candidate.split(/[/?#]/)[1] ?? '');
  return ALLOWED_REDIRECT_PREFIXES.includes(firstSegment) ? candidate : fallback;
}

const cases = [
  ['/cockpit', undefined, '/cockpit'],
  ['/cockpit/creators/abc', undefined, '/cockpit/creators/abc'],
  ['/my', undefined, '/my'],
  ['/my?foo=bar', undefined, '/my?foo=bar'],
  ['#/my', undefined, '/my'],
  ['/settings', undefined, '/cockpit'],
  ['/mystuff', undefined, '/cockpit'],
  ['/cockpitx', undefined, '/cockpit'],
  ['//evil.com', undefined, '/cockpit'],
  ['https://evil.com', undefined, '/cockpit'],
  ['http://evil.com/my', undefined, '/cockpit'],
  ['javascript:alert(1)', undefined, '/cockpit'],
  ['/\\evil.com', undefined, '/cockpit'],
  ['\\\\evil.com', undefined, '/cockpit'],
  ['', undefined, '/cockpit'],
  [null, undefined, '/cockpit'],
  [undefined, undefined, '/cockpit'],
  [undefined, '/my', '/my'],
  ['/settings', '/my', '/my'],
];

let failures = 0;
for (const [input, fallback, expected] of cases) {
  const actual = fallback === undefined ? normalizeRedirectPath(input) : normalizeRedirectPath(input, fallback);
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  normalizeRedirectPath(${JSON.stringify(input)}${fallback === undefined ? '' : ', ' + JSON.stringify(fallback)}) => ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}
console.log(`\n${cases.length - failures}/${cases.length} passed`);
process.exit(failures === 0 ? 0 : 1);
