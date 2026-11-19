import { readFileSync } from 'node:fs';
import { DECKS } from '../src/decks/rw/copied/all.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { buildDeck, type RwDeck } from '../src/decks/rw/plan.ts';

export { RW_IDS, DECKS };
export const built = (id: string): RwDeck => buildDeck(DECKS[id]!);
export const inventory = JSON.parse(readFileSync(new URL('../parity/inventory.json', import.meta.url), 'utf8')) as { rows: { id: string; area: string }[]; decks: { id: string; slides: { id: string }[]; checks: number; objectives: number }[] };
