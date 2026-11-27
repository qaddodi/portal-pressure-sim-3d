#!/usr/bin/env node
// Writes tests/fixtures/rw-numbers-3d.json: the numbers of the R-to-W decks where THIS app's engine has deliberately moved on from the 2D app's (so the 2D fixture,
// tests/fixtures/rw-numbers.json, can no longer be the truth for those rows), recorded from this engine, so any further drift still fails tests/decks-rw-numbers.test.ts.
//
// ONE RULE for every deck and every slide (no hand-kept list of decks): a row is written here when this engine's reading differs from the 2D app's by more than the test's tolerance,
// and every other row stays the 2D app's. So when the engine pin moves and a model change shifts the settled states (the ascites refill of hales-engine ba0e3c4 and 6ed0928 shifted
// every patient with a belly), this one command re-records exactly the rows that moved, in every deck, and nothing else; tests/engine-departures.test.ts holds the result to its rules.
//   two-lesions  the ascites model (ac66c99b, 3e28931e: the fluid forms and clears gradually), the retained volume (c92bf66b) and the closed vein that carries no flow (42e27ef)
//   varices      four slides of its own (gastric varices, red wale, primary and secondary prophylaxis) that the 2D deck does not have; always recorded; the 2D rows of the other slides are kept, in this deck's order
// Run: node --experimental-strip-types scripts/gen-rw-numbers-3d.mjs   (about two minutes: every deck). Re-run only when the engine pin moves or a deck's model fields change.
import { readFileSync, writeFileSync } from 'node:fs';
import { runStepsNode } from '../src/decks/rw/numbers-node.ts';
import { deckFingerprints } from '../src/decks/rw/numbers.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { DECKS, RW_IDS } from '../tests/decks-rw-helpers.ts';

const two = JSON.parse(readFileSync(new URL('../tests/fixtures/rw-numbers.json', import.meta.url), 'utf8')).decks;
const keys = [...Object.keys(TILE), 'sbp', 'dbp'];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const row = (fp) => Object.fromEntries(keys.filter((k) => Number.isFinite(fp[k])).map((k) => [k, r4(fp[k])]));
// the tolerance tests/decks-rw-numbers.test.ts holds a reading to
const moved = (mine, old) => Object.entries(old).some(([k, v]) => typeof mine[k] !== 'number' || Math.abs(r4(mine[k]) - v) > 1.5e-4);
const OWN = { varices: ['gastric', 'redwale', 'primary', 'secondary'] };
const out = { note: 'Recorded from this app\'s engine where it has deliberately moved on from the 2D app (scripts/gen-rw-numbers-3d.mjs); every other row is held to rw-numbers.json.', decks: {} };
for (const id of RW_IDS) {
  const deck = DECKS[id], mine = (await deckFingerprints(deck, runStepsNode)).map(row), old = two[id];
  const own = OWN[id] ?? [];
  const keep = deck.slides.filter((s) => !own.includes(s.id)).map((s) => s.id);
  // the 2D row that stands at row i of this deck (the outline, a slide, the quick check); a slide the 2D deck lacks has none
  const twoAt = (i) => (i === 0 ? old[0] : i === mine.length - 1 ? old.at(-1) : own.includes(deck.slides[i - 1].id) ? null : old[keep.indexOf(deck.slides[i - 1].id) + 1]);
  const rows = mine.map((m, i) => { const o = twoAt(i); return o && !moved(m, o) ? o : m; });
  if (rows.some((r, i) => r !== twoAt(i))) out.decks[id] = rows;
}
writeFileSync(new URL('../tests/fixtures/rw-numbers-3d.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote tests/fixtures/rw-numbers-3d.json (${Object.keys(out.decks).join(', ') || 'no deck'})`);
process.exit(0);
