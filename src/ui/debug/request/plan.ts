// Which of the repo's node test files an audit request runs, and what for. Pure: the caller lists tests/. Never the whole suite: a file is run only when a feature of the request, or the base
// feature of an asked-for check, names it (features.ts). A test file is not narrowed by slide (it replays what it replays), so a request that names slides still runs the files of its checks.
import type { CheckId } from './grammar.ts';
import { FEATURES, featureOf, testsOfFeature } from './features.ts';
import type { Scope } from './resolve.ts';

/** The feature whose tests judge a check when the request names no feature that serves it. `motion` has no node test of its own: the scene audit judges it. */
export const BASE_FEATURES: Readonly<Partial<Record<CheckId, readonly string[]>>> = Object.freeze({
  layout: ['cards', 'labels'],
  numbers: ['numbers'],
  junctions: ['junctions'],
  a11y: ['a11y'],
  perf: ['boot'],
});

export interface PlannedFile { file: string; feature: string; check: CheckId }
export interface TestPlan {
  files: PlannedFile[];
  /** the checks that have no test file here (judged by the scene audit, the typecheck or the lint, or not at all) */
  noTests: CheckId[];
  /** environment for the files: the full replays of the numbers tests, when the request has talks of that family */
  env: Record<string, string>;
}

export function nodeTestPlan(scope: Scope, all: readonly string[], families: { hp: readonly string[]; rw: readonly string[] }): TestPlan {
  const picked = new Map<string, PlannedFile>(), noTests: CheckId[] = [];
  const pool = scope.all ? FEATURES.map((f) => f.id) : scope.features;
  for (const c of scope.checks) {
    let ids = pool.filter((id) => featureOf(id)?.checks.includes(c));
    // (a request runs its features' own tests. A check they do not serve falls back to its base feature only when the request asked for that check by name, or is `app`; the one default is `numbers`
    // for a request of talks and slides, because the numbers replay is the one node check that reads slides. Everything else is global, not narrowed by slide, and would be the whole suite.)
    if (!ids.length && (scope.all || scope.explicit || (c === 'numbers' && !scope.features.length))) ids = [...(BASE_FEATURES[c] ?? [])];
    let any = false;
    for (const id of ids) {
      const f = featureOf(id);
      if (!f) continue;
      for (const file of testsOfFeature(f, all)) { any = true; if (!picked.has(file)) picked.set(file, { file, feature: id, check: c }); }
    }
    if (!any) noTests.push(c);
  }
  const has = (ids: readonly string[]) => scope.decks.some((d) => ids.includes(d));
  const env: Record<string, string> = {};
  if (picked.size && [...picked.values()].some((p) => p.check === 'numbers')) {
    if (scope.all || has(families.hp)) env.DECKS_HP_FULL = '1';
    if (scope.all || has(families.rw)) env.RW_FULL = '1';
  }
  return { files: [...picked.values()].sort((a, b) => (a.file < b.file ? -1 : 1)), noTests, env };
}
