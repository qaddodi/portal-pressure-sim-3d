// Which chart looks are done, as a few lines with no chart code behind them. The decks' hook tables ask this at start-up (which slides are wired); the registry
// (registry.ts) holds the same kinds with their specimens and every chart family's code, and is only read by the charts gallery (?charts) and the tests.
// tests/boot-entry.test.ts fails when the two lists differ, so a chart that lands is marked in both in the same push.
export type ChartStatus = 'done' | 'todo';

export const CHART_KINDS: Readonly<Record<string, ChartStatus>> = Object.freeze({
  criteria: 'done', ladder: 'done', flowtime: 'done', profile: 'done', path: 'done', curve: 'done', trial: 'done', flows: 'done', lumen: 'done', evgraph: 'done', forest: 'done',
  plane: 'done', fluid: 'done', saag: 'done', shift: 'done', stiffness: 'done', stent: 'done', timeline: 'done', small: 'done', trace: 'done', vitals: 'done', menu: 'done', walls: 'done',
});

/** True when this chart look is done (its model, its card, its tests and a gallery specimen are in). */
export const chartDone = (kind: string): boolean => CHART_KINDS[kind] === 'done';
