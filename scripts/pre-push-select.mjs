// Which test files the pre-push runs, and in which order (Plan 50). Pure functions, so tests/pre-push-select.test.ts pins them.
//
// A test is "about" a changed file when it IMPORTS (or reads) it: the file's path, ending in an extension and a closing quote, appears in the test's text.
// The old rule matched the path as a bare substring, so `plate.ts` also pulled in every test of `plate-worker.ts` and `plate-client.ts`. A changed test file always runs.
// The shared shader files keep the wide net (a bare substring), because their gates matter: one edit to them can break any look.

/** Files whose change runs every test that mentions them at all, however it is written. */
export const WIDE = [/(^|\/)cel-glsl\.ts$/, /(^|\/)materials\/shaders\.ts$/, /(^|\/)vessels\/shaders\.ts$/];
export const SECONDS_UNKNOWN = 5;   // (a test file with no entry in tests/timings.json)
export const SLOW_WARN_SECONDS = 30;

const stem = (f) => f.replace(/\.(tsx?|mjs|js)$/, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pattern an import of this changed file matches: `src/scene/lobule/plate` followed by an extension and a closing quote or backtick. */
export function importPattern(changedFile) {
  return new RegExp(`${escapeRe(stem(changedFile))}\\.(ts|tsx|mjs|js)['"\`]`);
}

/**
 * @param changed  repo-relative paths that differ from the base
 * @param tests    the names of the files in tests/ (`x.test.ts`)
 * @param read     (name) => the text of tests/<name>
 * @returns the sorted names of the test files to run
 */
export function selectTests(changed, tests, read) {
  const chosen = new Set(changed.filter((f) => /^tests\/.+\.test\.ts$/.test(f) && tests.includes(f.slice(6))).map((f) => f.slice(6)));
  const srcs = changed.filter((f) => /^(src|scripts)\//.test(f));
  if (!srcs.length) return [...chosen].sort();
  const narrow = srcs.filter((f) => !WIDE.some((w) => w.test(f))).map(importPattern);
  const wide = srcs.filter((f) => WIDE.some((w) => w.test(f))).map(stem);
  for (const t of tests) {
    if (chosen.has(t)) continue;
    const text = read(t);
    if (narrow.some((re) => re.test(text)) || wide.some((s) => text.includes(s))) chosen.add(t);
  }
  return [...chosen].sort();
}

/** Longest first by the recorded seconds, so the slowest file starts at once and the run ends when it does, not after it. Ties and unknowns by name. */
export function longestFirst(files, timings) {
  const sec = (f) => timings[f] ?? SECONDS_UNKNOWN;
  return [...files].sort((a, b) => sec(b) - sec(a) || (a < b ? -1 : 1));
}
