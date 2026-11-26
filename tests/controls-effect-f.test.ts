// Every live control on the slides of these decks does something the viewer can see (tests/controls-effect-check.ts says what counts; share 6 of 9).
import { test } from 'node:test';
import { checkDecks, SHARES } from './controls-effect-check.ts';

const decks = SHARES[5]!;
test(`share 6: every button and slider changes what the slide shows (${decks.join(', ')})`, { timeout: 600_000 }, async () => {
  await checkDecks(decks);
});
