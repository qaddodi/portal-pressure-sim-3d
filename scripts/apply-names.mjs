#!/usr/bin/env node
// Brings the copied decks and the two profile charts up to date with the name table (src/decks/names.ts) without the 2D checkout: each copied deck's words go through namesEdits() and
// are written back with their content hash; the profile charts' zone strip goes through zoneEdit(). A re-copy from 2D applies the same edits (bavenoEdits, copy-chart-profile, copy-chart-small),
// so the two agree. Safe to run again. `--check` writes nothing and exits 1 when a file would change.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { namesEdits, zoneEdit } from './names-edits.mjs';

const check = process.argv.includes('--check');
const root = new URL('../src/', import.meta.url).pathname;
const decks = ['decks/ag', 'decks/hp/data', 'decks/rw/copied'].flatMap((d) => readdirSync(root + d).filter((f) => /\.(copied\.)?ts$/.test(f) && !['index.ts', 'all.ts', 'plate.ts'].includes(f)).map((f) => root + d + '/' + f));
let n = 0;
for (const file of decks) {
  const text = readFileSync(file, 'utf8');
  const m = /export const (\w+): CopiedDeck = (\{[\s\S]*?\n\});\n\nexport const (\w+) = '([0-9a-f]+)';/.exec(text);
  if (!m) continue;
  const json = namesEdits(m[2]);
  if (json === m[2]) continue;
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
  if (!check) writeFileSync(file, text.replace(m[2], () => json).replace(/content hash [0-9a-f]+/, `content hash ${hash}`).replace(`${m[3]} = '${m[4]}'`, `${m[3]} = '${hash}'`));
  console.log(`${file.replace(root, '')}: ${check ? 'would change' : 'patched'}, hash ${hash}`); n++;
}
for (const f of ['ui/charts/profile/layout.generated.js']) {
  const text = readFileSync(root + f, 'utf8'), out = zoneEdit(text);
  if (out === text) continue;
  if (!check) writeFileSync(root + f, out);
  console.log(`${f}: ${check ? 'would change' : 'zone words'}`); n++;
}
console.log(`${n} files ${check ? 'differ' : 'patched'}`);
process.exit(check && n ? 1 : 0);
