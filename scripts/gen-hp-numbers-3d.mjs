#!/usr/bin/env node
// Writes tests/fixtures/decks-hp-numbers-3d.json: the H-to-P decks' numbers where THIS app's engine has deliberately moved on from the 2D app's (so the 2D
// fixture, tests/fixtures/decks-hp-numbers.json from scripts/port-decks-hp.mjs, can no longer be the truth for them), recorded from this engine, so any
// further drift still fails tests/decks-hp-numbers.test.ts. The first two engine changes since the 2D fixture was taken (there have been more since: hales-engine ba0e3c4, 6ed0928, b95ecb5), both owner-directed and the same two
// scripts/gen-rw-numbers-3d.mjs records for the R-to-W decks:
//   ac66c99b (3e28931e): the kidney keeps holding salt and water for weeks after the pressure falls, so ascites forms and clears gradually (ASC_HOLD)
//   c92bf66b (f49dc143): a retained volume builds up over the first 20 days of a time-lapse instead of as one bolus on day 0
// With the engine of bdd6e6be (before both) every deck replays to the 2D fixture; only the decks that differ from it are written here, whole. A slide's
// {tokens} are recorded as this app prints them from these numbers and this deck's words (some lines were reworded here since the copy, for example the
// {iap} readings of scripts/instrument-edits.mjs); the script prints every token whose text differs from the 2D card's, so a reviewer sees each one.
// ONE RULE for every deck: a deck is written here when a reading differs from the 2D fixture or a {token} prints another text than the 2D card (npm run gen:departures runs this with the other families).
// Run: node scripts/gen-hp-numbers-3d.mjs   (about a minute). Re-run only when the engine pin moves.
import { readFileSync, writeFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { inPlayOrder } from './play-order.mjs';
import { chainOf, sequencer, plainText, parseToken, tokensOf, changes } from '../src/decks/hp/numbers.ts';

const two = JSON.parse(readFileSync(new URL('../tests/fixtures/decks-hp-numbers.json', import.meta.url), 'utf8'));
const close = (a, b) => Math.abs(a - b) <= 1e-9 + 2e-5 * Math.max(Math.abs(a), Math.abs(b));
const scalars = (fp) => Object.fromEntries(Object.entries(fp || {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Number(v.toPrecision(6))]));

async function replay(d) {
  const seq = sequencer(1);
  const core = createCore((m) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides), reqId: 1 });
  core.dispose();
  const out = [];
  let last = seq.results[1].fp;
  for (let i = 0; i < d.slides.length; i++) { if (changes(d.slides[i]) || i === 0) last = seq.results[i + 1].fp; out.push(last); }
  return out;
}

const out = { note: 'Recorded from this app\'s engine where it has deliberately moved on from the 2D app (scripts/gen-hp-numbers-3d.mjs: engine ac66c99b and c92bf66b); every other deck is held to decks-hp-numbers.json.', decks: {} };
for (const id of HP_IDS) {
  const d = await loadHpDeck(id), fps = await replay(d);
  // (the 2D rows are joined by slide id; a slide cut into parts by SPLIT_PAGES (`<id>-2`) has no 2D row of its own and takes its first part's readings, with no recorded words)
  const rows = new Map((inPlayOrder(id, two.decks[id]) || []).map((r) => [r.id, r]));
  const g = d.slides.map((sl) => rows.get(sl.id) || { ...rows.get(sl.id.replace(/-\d+$/, '')), id: sl.id, tokens: [] });
  const at = (sid) => { const j = d.slides.findIndex((s) => s.id === sid); return j >= 0 ? fps[j] : null; };
  // a deck departs from 2D when a reading moved, or when a {token} prints another text than the 2D card does (the words moved: {hvpg:0} prints the tile's one decimal, 26 Nov)
  const prints = (s, i) => tokensOf(`${s.line} ${s.vignette ?? ''}`).map(({ raw }) => plainText(raw, fps[i], at));
  const drift = d.slides.some((s, i) => Object.entries(g[i].fp).some(([k, v]) => !(typeof fps[i][k] === 'number' && close(fps[i][k], v))) || prints(s, i).some((x, j) => x !== g[i].tokens[j]?.[1]));
  if (!drift) continue;
  out.decks[id] = d.slides.map((s, i) => ({
    id: s.id,
    fp: Object.fromEntries(Object.keys(g[i].fp).map((k) => [k, scalars(fps[i])[k]])),
    tokens: tokensOf(`${s.line} ${s.vignette ?? ''}`).map(({ raw }, j) => {
      const t = parseToken(raw.slice(1, -1)), mine = plainText(raw, fps[i], at), old = g[i].tokens[j];
      if (old && old[1] !== mine) console.log(`${id}/${s.id}: ${raw} prints ${mine} (2D ${old[1]})${t.kind === 'value' ? '' : ' [not a reading]'}`);
      return [raw, mine];
    }),
  }));
}
writeFileSync(new URL('../tests/fixtures/decks-hp-numbers-3d.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote tests/fixtures/decks-hp-numbers-3d.json (${Object.keys(out.decks).join(', ') || 'no deck'})`);
process.exit(0);
