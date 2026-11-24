#!/usr/bin/env node
// Writes tests/fixtures/rw-numbers-3d.json: the numbers of the R-to-W decks where THIS app's engine has deliberately moved on from the 2D app's (so the 2D fixture, tests/fixtures/rw-numbers.json,
// can no longer be the truth for them), recorded from this engine, so any further drift still fails the test:
//   two-lesions  from slide 4 (the retained fluid and the pericardial constriction): the ascites model of the engine (ac66c99b, 3e28931e: the fluid forms and clears gradually) and the closed vein that carries no flow (42e27ef)
//   varices      four slides of its own (gastric varices, red wale, primary and secondary prophylaxis) that the 2D deck does not have; the 2D rows of the other slides are kept, in this deck's order
// Run: node --experimental-strip-types scripts/gen-rw-numbers-3d.mjs   (a few seconds). Re-run only when the engine pin moves or one of these decks' model fields change.
import { readFileSync, writeFileSync } from 'node:fs';
import { runStepsNode } from '../src/decks/rw/numbers-node.ts';
import { deckFingerprints } from '../src/decks/rw/numbers.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { DECKS } from '../tests/decks-rw-helpers.ts';

const two = JSON.parse(readFileSync(new URL('../tests/fixtures/rw-numbers.json', import.meta.url), 'utf8')).decks;
const keys = [...Object.keys(TILE), 'sbp', 'dbp'];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const row = (fp) => Object.fromEntries(keys.filter((k) => Number.isFinite(fp[k])).map((k) => [k, r4(fp[k])]));
const OWN = { varices: ['gastric', 'redwale', 'primary', 'secondary'] };
const FROM = { 'two-lesions': 4 };
const out = { note: 'Recorded from this app\'s engine where it has deliberately moved on from the 2D app (scripts/gen-rw-numbers-3d.mjs); every other deck is held to rw-numbers.json.', decks: {} };
for (const id of ['two-lesions', 'varices']) {
  const deck = DECKS[id], mine = (await deckFingerprints(deck, runStepsNode)).map(row), old = two[id];
  if (OWN[id]) {
    const keep = deck.slides.filter((s) => !OWN[id].includes(s.id)).map((s) => s.id);
    out.decks[id] = [old[0], ...deck.slides.map((s, i) => (OWN[id].includes(s.id) ? mine[i + 1] : old[keep.indexOf(s.id) + 1])), old.at(-1)];
  } else out.decks[id] = [...old.slice(0, FROM[id]), ...mine.slice(FROM[id])];
}
writeFileSync(new URL('../tests/fixtures/rw-numbers-3d.json', import.meta.url), JSON.stringify(out) + '\n');
console.log('wrote tests/fixtures/rw-numbers-3d.json');
