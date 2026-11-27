// A test that reads the decks' baked chart data (public/baked/charts-*.json: the readings behind a table's cells, a chart's first frame) makes sure it is there first, the way `npm test` does
// (scripts/ensure-baked.mjs, pretest). Without it a test run on its own in a fresh container (the pre-push, `node --test tests/x.test.ts`) read no readings at all and failed as "0 compared cells"
// or passed vacuously. scripts/bake-charts.mjs leaves a deck whose file is current alone, so this costs nothing once baked (about 3 minutes cold, on every core).
// tests/baked-decks.test.ts holds every test that reads baked data to calling it.
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/bake-charts.mjs', import.meta.url).pathname;

/** Bakes the decks whose chart data is missing or for other numbers; returns at once when all are current. Call it at the top of a test file, before the decks' rows are read. */
export function ensureChartsBaked(): void {
  if (spawnSync(process.execPath, [script, '--check'], { stdio: 'ignore' }).status === 0) return;
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('the decks\' chart data could not be baked (node scripts/bake-charts.mjs), so a test that reads it has nothing to read');
}
