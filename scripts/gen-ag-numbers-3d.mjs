#!/usr/bin/env node
// Writes tests/fixtures/deck-numbers-ag-3d.json: the first model step of the A-to-G decks that tests/decks-ag.test.ts replays live, where THIS app's engine has moved on from the 2D app's numbers
// (tests/fixtures/deck-numbers-ag.json), recorded from this engine. Same rule as scripts/gen-rw-numbers-3d.mjs: a deck is written when a reading differs by more than the test's tolerance (1e-6 relative);
// every other deck stays the 2D app's. Run: node --experimental-strip-types scripts/gen-ag-numbers-3d.mjs   (seconds). Re-run only when the engine pin moves.
import { readFileSync, writeFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import { chainOf } from '../src/decks/hp/numbers.ts';
import { AG_FIRST_STEP_DECKS } from '../tests/engine-departures.ts';
import { close } from '../tests/close.ts';

const two = JSON.parse(readFileSync(new URL('../tests/fixtures/deck-numbers-ag.json', import.meta.url), 'utf8')).decks;
const out = { note: 'Recorded from this app\'s engine where its first model step has moved on from the 2D app (scripts/gen-ag-numbers-3d.mjs); every other deck is held to deck-numbers-ag.json.', decks: {} };
for (const id of AG_FIRST_STEP_DECKS) {
  const d = await loadAgDeck(id);
  const fps = [];
  const core = createCore((m) => { if (m.type === 'seqStep') fps[m.i] = m.fp; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides).slice(0, 1), reqId: 1 });
  core.dispose();
  const want = two[id].slides[0].fp;
  if (Object.entries(want).some(([k, v]) => !(typeof fps[0][k] === 'number' && close(fps[0][k], v)))) out.decks[id] = { fp: Object.fromEntries(Object.keys(want).map((k) => [k, fps[0][k]])) };
}
writeFileSync(new URL('../tests/fixtures/deck-numbers-ag-3d.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote tests/fixtures/deck-numbers-ag-3d.json (${Object.keys(out.decks).join(', ') || 'no deck'})`);
process.exit(0);
