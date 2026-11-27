#!/usr/bin/env node
// One command for every family: re-records where this app's engine departs from the 2D app's numbers (see tests/engine-departures.ts). Run it when the engine pin moves (npm run sync:engine)
// and a parity test (tests/decks-hp-numbers, decks-rw-numbers, decks-ag, tiles-2d) fails on a small shift; then read the printed tokens and the diff before committing.
// A big shift is not a recording job: tests/engine-departures.test.ts bounds every departure, and one over the bound is a model change to look at, not to record.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
for (const s of ['gen-ag-numbers-3d.mjs', 'gen-hp-numbers-3d.mjs', 'gen-rw-numbers-3d.mjs']) {
  execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', here(s)], { stdio: 'inherit' });
}

// Stamp the engine pin the departures were recorded at: tests/engine-departures.test.ts fails when the pin moves and this was not run, so a model change never lands with stale parity records.
const { readFileSync, writeFileSync } = await import('node:fs');
const pinned = JSON.parse(readFileSync(here('../src/engine/PINNED.json'), 'utf8')).engine.commit;
writeFileSync(here('../tests/fixtures/departures-pin.json'), `${JSON.stringify({ note: 'Written by scripts/gen-engine-departures.mjs: the engine commit the *-3d.json departure records were taken from.', engine: pinned }, null, 2)}\n`);
console.log(`departures recorded at engine ${pinned.slice(0, 8)}`);
