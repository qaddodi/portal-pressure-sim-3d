#!/usr/bin/env node
// Brings the copied decks up to date with the reviewer's patches of 24 Nov 2026 (scripts/source-edits.mjs REVIEWER_24NOV) without the 2D checkout: each copied deck's JSON gets the patches
// of its own talk, and is written back with its content hash. A re-copy from 2D applies the same patches (SOURCE_PATCHES), so the two agree. Safe to run again (every patch is a set or a text swap).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sourceEdits, REVIEWER_24NOV, REVIEWER_24NOV_B, REVIEWER_24NOV_C, REVIEWER_24NOV_D } from './source-edits.mjs';

const root = new URL('../src/decks/', import.meta.url).pathname;
const files = ['ag', 'hp/data', 'rw/copied'].flatMap((d) => readdirSync(root + d).filter((f) => /\.(copied\.)?ts$/.test(f) && !['index.ts', 'all.ts', 'plate.ts'].includes(f)).map((f) => root + d + '/' + f));
const esc = (t) => JSON.stringify(t).slice(1, -1);
let n = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const m = /export const (\w+): CopiedDeck = (\{[\s\S]*?\n\});\n\nexport const (\w+) = '([0-9a-f]+)';/.exec(text);
  if (!m) continue;
  const id = JSON.parse(m[2]).id;
  const needed = (p) => ('append' in p ? !m[2].includes(esc(p.append)) : !('from' in p) || m[2].includes(esc(p.from)) || !m[2].includes(esc(p.to)));
  const todo = [...REVIEWER_24NOV, ...REVIEWER_24NOV_B, ...REVIEWER_24NOV_C, ...REVIEWER_24NOV_D].filter((p) => p.deck === id && needed(p));
  if (!todo.length) continue;
  const json = sourceEdits(m[2], todo);
  if (json === m[2]) continue;
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
  writeFileSync(file, text.replace(m[2], () => json).replace(/content hash [0-9a-f]+/, `content hash ${hash}`).replace(`${m[3]} = '${m[4]}'`, `${m[3]} = '${hash}'`));
  console.log(`${file.replace(root, '')}: patched, hash ${hash}`); n++;
}
console.log(`${n} decks patched`);
