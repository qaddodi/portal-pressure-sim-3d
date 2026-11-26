// The slide capture's pipeline as source text, for the tests that pin what it waits on and how it draws: the pass itself is capture-all.ts, and the settling and the picture it shares with the case pass live in
// capture-settle.ts and capture-shot.ts (one definition of "still" for both). A test that asks "does the capture wait for X" asks the three together.
import { readFileSync } from 'node:fs';

const FILES = ['capture-all.ts', 'capture-settle.ts', 'capture-shot.ts'];
export const pipeline = (): string => FILES.map((f) => readFileSync(new URL(`../src/ui/debug/audit/${f}`, import.meta.url), 'utf8')).join('\n');
