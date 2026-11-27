// Where this app's engine departs from the 2D app's, in one place. The 2D app's numbers are recorded once (tests/fixtures/rw-numbers.json, decks-hp-numbers.json, deck-numbers-ag.json); the engine
// of this app is allowed to move on from them (the pinned hales-engine is the owner's model, not a copy of the 2D app's), and each move is recorded from the engine by one command, never by hand:
//   npm run gen:departures      (scripts/gen-engine-departures.mjs: one script per family, every deck, every slide)
// A row is a departure when the engine differs from the 2D row by more than the family's tolerance; every other row stays the 2D app's. tests/engine-departures.test.ts holds all of it to its rules.
import { readFileSync } from 'node:fs';

const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')) as { decks: Record<string, unknown> };

/** The A-to-G decks whose first model step is replayed live against the 2D numbers (tests/decks-ag.test.ts). */
export const AG_FIRST_STEP_DECKS = ['circulation', 'circuit', 'day', 'endoscopy', 'gradients'] as const;

/** The 2D fixture overlaid by this engine's recorded departures, deck by deck, whole (a departed deck is recorded in full). */
export function withDepartures<T>(twoD: string, threeD: string): Record<string, T> {
  return { ...read(twoD).decks, ...read(threeD).decks } as Record<string, T>;
}
export const departures = (threeD: string): Record<string, unknown> => read(threeD).decks;

/** The H-to-P decks' numbers the way tests/decks-hp-numbers.test.ts reads them: 2D's, with the departed decks' rows from this engine. */
export type HpRow = { id: string; fp: Record<string, number>; tokens: [string, string][] };
export const hpNumbers = (): Record<string, HpRow[]> => withDepartures('decks-hp-numbers.json', 'decks-hp-numbers-3d.json');
