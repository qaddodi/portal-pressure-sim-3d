#!/usr/bin/env node
// Brings src/decks/rw/copied/two-inflows.ts up to date with the hepatic artery resistive index patches of 25 Nov 2026 (scripts/source-edits.mjs HA_RI_REVIEW) without the 2D checkout: it reads the copied deck's JSON,
// applies the patches that are not in it yet, and writes it back with its content hash. A re-copy from 2D (scripts/port-decks-rw.mjs) applies the same patches, so the two agree.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sourceEdits, HA_RI_REVIEW } from './source-edits.mjs';

const file = new URL('../src/decks/rw/copied/two-inflows.ts', import.meta.url);
const text = readFileSync(file, 'utf8');
const m = /export const TWO_INFLOWS: CopiedDeck = (\{[\s\S]*?\n\});\n\nexport const TWO_INFLOWS_HASH/.exec(text);
if (!m) throw new Error('two-inflows.ts: the deck is not where it was');
// (a text patch whose result is already in the file is skipped, so the script can be run again; a field patch just sets the field again)
const esc = (t) => JSON.stringify(t).slice(1, -1);
const todo = HA_RI_REVIEW.filter((p) => !m[1].includes(esc(p.append)));
const json = sourceEdits(m[1], todo);
const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
const out = text.replace(m[1], () => json).replace(/content hash [0-9a-f]+/, `content hash ${hash}`).replace(/TWO_INFLOWS_HASH = '[0-9a-f]+'/, `TWO_INFLOWS_HASH = '${hash}'`);
writeFileSync(file, out);
console.log(`two-inflows.ts patched, hash ${hash}`);
