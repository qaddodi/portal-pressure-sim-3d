#!/usr/bin/env node
// Prints what the R-to-W decks still wait on: each feature (hook), its owning batch, and how many slides need it; with --slides, the slides of one deck and what each lacks.
//   node scripts/rw-deps.mjs [--slides <deck id>]
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { DECKS } from '../src/decks/rw/copied/all.ts';
import { buildDeck, dependencies } from '../src/decks/rw/plan.ts';
import { registerBuiltinHooks } from '../src/decks/rw/hooks-builtin.ts';
registerBuiltinHooks();
const at = process.argv.indexOf('--slides');
if (at > 0) {
  const d = buildDeck(DECKS[process.argv[at + 1]]);
  for (const x of dependencies(d)) console.log(`${x.slide.padEnd(14)} ${x.missing.map((h) => h.id).join(', ') || 'whole'}`);
} else {
  const need = new Map();
  let slides = 0, whole = 0;
  for (const id of RW_IDS) for (const x of dependencies(buildDeck(DECKS[id]))) { slides++; if (!x.missing.length) whole++; for (const h of x.missing) { const n = need.get(h.id) ?? { owner: h.owner, what: h.what, n: 0 }; n.n++; need.set(h.id, n); } }
  console.log(`${slides} slides, ${whole} can play whole\n`);
  for (const [id, v] of [...need].sort((a, b) => b[1].n - a[1].n)) console.log(`${String(v.n).padStart(4)}  ${v.owner.padEnd(4)} ${id.padEnd(26)} ${v.what}`);
}
