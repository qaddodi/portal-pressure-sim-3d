#!/usr/bin/env node
// Writes tests/fixtures/rw-numbers.json: what the 2D app's own model reads on every slide of the R-to-W decks (the tiles' keys, engine units, 4 decimals), from the 2D app's
// presenter step chain (tests/deck-states.js), so the 3D tests can hold the 3D engine's numbers to the 2D app's and read every {token} of every line without running the model.
//
//   node scripts/gen-rw-numbers.mjs --from <2D checkout> [--deck <id> ...]     (about 6 s a deck; all sixteen about two minutes, one process)
//
// Re-run only when sync:engine moves the pin or a 2D deck's model fields change. Index 0 is the outline, i + 1 deck slide i, the last the quick check.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RW_DECK_IDS } from './port-decks-rw.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--from');
const from = at >= 0 ? resolve(args[at + 1]) : process.env.PPS_2D_REPO;
if (!from || !existsSync(`${from}/src/ui/decks.js`)) { console.error('usage: node scripts/gen-rw-numbers.mjs --from <2D checkout> [--deck <id> ...]'); process.exit(2); }
const only = args.flatMap((a, i) => (args[i - 1] === '--deck' ? [a] : []));
await import(pathToFileURL(`${from}/tests/dom-shim.js`).href);
const { DECKS, withOverview } = await import(pathToFileURL(`${from}/src/ui/decks.js`).href);
const { TILE } = await import(pathToFileURL(`${from}/src/ui/table-marks.js`).href);
const { deckStates } = await import(pathToFileURL(`${from}/tests/deck-states.js`).href);
const out = new URL('../tests/fixtures/rw-numbers.json', import.meta.url);
const file = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { decks: {} };
const keys = [...Object.keys(TILE), 'sbp', 'dbp'];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
for (const id of only.length ? only : RW_DECK_IDS) {
  const deck = DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`the 2D app has no deck "${id}"`);
  const fps = await deckStates(withOverview(deck));
  const rows = fps.map((fp) => Object.fromEntries(keys.filter((k) => Number.isFinite(fp[k])).map((k) => [k, r4(fp[k])])));
  // (withOverview already ends with the quick check, which keeps the last slide's state)
  file.decks[id] = rows;
  console.log(`${id}: ${rows.length} states`);
}
file.note = 'Written by scripts/gen-rw-numbers.mjs from the 2D app (its presenter step chain, tests/deck-states.js). Index 0 is the outline, i + 1 deck slide i, the last the quick check.';
mkdirSync(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
writeFileSync(out, `${JSON.stringify(file)}\n`);
