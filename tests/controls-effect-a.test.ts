// Every live control on the slides of these decks does something the viewer can see (tests/controls-effect-check.ts says what counts; share 1 of 9).
import { test } from 'node:test';
import { checkDecks, SHARES } from './controls-effect-check.ts';
import assert from 'node:assert/strict';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { controlsOf } from '../src/decks/controls.ts';

const decks = SHARES[0]!;
test(`share 1: every button and slider changes what the slide shows (${decks.join(', ')})`, { timeout: 600_000 }, async () => {
  await checkDecks(decks);
});

test('every deck with a live control is in one share', async () => {
  const have: string[] = [];
  for (const id of SOURCE_IDS) {
    const d = await loadSource(id);
    if (d.slides.some((s) => { const c = controlsOf(s); return !!(c?.compare || c?.whatIf); })) have.push(id);
  }
  assert.deepEqual([...SHARES.flat()].sort(), have.sort());
});
