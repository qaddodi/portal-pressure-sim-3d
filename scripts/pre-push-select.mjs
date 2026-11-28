// Which test files the pre-push runs, and in which order (Plan 50). Pure functions, so tests/pre-push-select.test.ts pins them.
//
// A test is "about" a changed file when it IMPORTS (or reads) it, at ANY depth (C1, 27 Nov review): `scripts/import-graph.mjs` reads every file's paths and the test runs when anything it names,
// or anything those name in turn, changed. (Before, only a test that named the changed file ITSELF ran: a change to `whole-pieces.ts` skipped the tests of `placed-network.ts`, which imports it.)
// The path match below, which needs an extension and a closing quote so `plate.ts` is not `plate-worker.ts`, stays as well, for a file the graph cannot see (one just deleted). A changed test file always runs.
// The shared shader files keep the wide net (a bare substring), because their gates matter: one edit to them can break any look.

import { affectedBy } from './import-graph.mjs';

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

/** Tests at this graph distance or nearer always run (1 = the test names the changed file itself, which is all the old rule ran). */
export const ALWAYS_DEPTH = 1;
/** The estimated seconds of wall time the deeper tests may add before the rest are left to the daily run (`--deep` lifts it). */
export const DEEP_BUDGET_SECONDS = 150;

/**
 * Every test about what changed, with its distance: 0 for a test that changed itself, 1 for one that names a changed file, 2 and more for one that reaches it through other files.
 * @param changed  repo-relative paths that differ from the base
 * @param tests    the names of the files in tests/ (`x.test.ts`)
 * @param read     (name) => the text of tests/<name>
 * @param {Map<string, Set<string>> | null} [graph]  optional: the import graph (`buildGraph`)
 * @returns Map<test file name, distance>
 */
export function selectWithDepth(changed, tests, read, graph = null) {
  const chosen = new Map(changed.filter((f) => /^tests\/.+\.test\.ts$/.test(f) && tests.includes(f.slice(6))).map((f) => [f.slice(6), 0]));
  if (graph) for (const [f, d] of affectedBy(graph, changed)) if (/^tests\/[^/]+\.test\.ts$/.test(f) && tests.includes(f.slice(6)) && !chosen.has(f.slice(6))) chosen.set(f.slice(6), d);
  const srcs = changed.filter((f) => /^(src|scripts)\//.test(f));
  if (!srcs.length) return chosen;
  const narrow = srcs.filter((f) => !WIDE.some((w) => w.test(f))).map(importPattern);
  const wide = srcs.filter((f) => WIDE.some((w) => w.test(f))).map(stem);
  for (const t of tests) {
    if (chosen.has(t)) continue;
    const text = read(t);
    if (narrow.some((re) => re.test(text)) || wide.some((s) => text.includes(s))) chosen.set(t, 1);
  }
  return chosen;
}

/**
 * The sorted names of the test files about what changed, at any depth (see `selectWithDepth`).
 * @param {Map<string, Set<string>> | null} [graph]
 */
export function selectTests(changed, tests, read, graph = null) {
  return [...selectWithDepth(changed, tests, read, graph).keys()].sort();
}

/**
 * Which of the selected tests run now. The near ones (ALWAYS_DEPTH or closer) always run; the deeper ones run nearest first while their own estimated wall time
 * (sum of seconds over the cores) stays inside `budget`; the rest are returned as `left` so the push can say so out loud, never silently.
 * @param depths  Map<test name, distance> from selectWithDepth
 */
export function withinBudget(depths, timings, lanes, budget = DEEP_BUDGET_SECONDS) {
  const sec = (f) => timings[f] ?? SECONDS_UNKNOWN;
  const order = [...depths].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const run = [], left = [];
  let deep = 0, total = 0;   // (the near tests are not counted against the budget: they run whatever they cost)
  for (const [f, d] of order) {
    if (d <= ALWAYS_DEPTH) { run.push(f); total += sec(f); continue; }
    if ((deep + sec(f)) / Math.max(1, lanes) <= budget) { run.push(f); deep += sec(f); total += sec(f); } else left.push(f);
  }
  return { run, left, estimateSeconds: Math.round(total / Math.max(1, lanes)) };
}

/** Longest first by the recorded seconds, so the slowest file starts at once and the run ends when it does, not after it. Ties and unknowns by name. */
export function longestFirst(files, timings) {
  const sec = (f) => timings[f] ?? SECONDS_UNKNOWN;
  return [...files].sort((a, b) => sec(b) - sec(a) || (a < b ? -1 : 1));
}
