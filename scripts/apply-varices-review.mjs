#!/usr/bin/env node
// Brings src/decks/rw/copied/varices.ts up to date with the review patches of 24 Nov 2026 (scripts/source-edits.mjs VARICES_REVIEW) without the 2D checkout: it reads the copied deck's JSON,
// applies the patches that are not in it yet, and writes it back with its content hash. A re-copy from 2D (scripts/port-decks-rw.mjs) applies the same patches, so the two agree.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sourceEdits, VARICES_REVIEW } from './source-edits.mjs';

const file = new URL('../src/decks/rw/copied/varices.ts', import.meta.url);
const text = readFileSync(file, 'utf8');
const m = /export const VARICES: CopiedDeck = (\{[\s\S]*?\n\});\n\nexport const VARICES_HASH/.exec(text);
if (!m) throw new Error('varices.ts: the deck is not where it was');
// (a text patch whose result is already in the file is skipped, so the script can be run again; a field patch just sets the field again)
const esc = (t) => JSON.stringify(t).slice(1, -1);
const todo = VARICES_REVIEW.filter((p) => p.after ? !m[1].includes(`"id": ${JSON.stringify(p.set.id)},`) : !('from' in p) || m[1].includes(esc(p.from)) || !m[1].includes(esc(p.to)));
const json = sourceEdits(m[1], todo);
const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
const out = text.replace(m[1], () => json).replace(/content hash [0-9a-f]+/, `content hash ${hash}`).replace(/VARICES_HASH = '[0-9a-f]+'/, `VARICES_HASH = '${hash}'`);
writeFileSync(file, out);
console.log(`varices.ts patched, hash ${hash}`);
