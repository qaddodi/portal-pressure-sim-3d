import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Audit f9a5d2e0: tips-complete 10 and two-lesions 9 showed "—" in every tile under words that already had the numbers. The words card reads the baked states where the live chain has not reached a slide
// (mergeStates); the tiles read only the live chain, which on a phone takes seconds. Root cause: two readers of one state. Every card that reads a deck's states goes through mergeStates.
test('the tiles read a slide\'s state through mergeStates, as the words and the instrument do', () => {
  const src = readFileSync(new URL('../src/ui/cards/TilesCard.tsx', import.meta.url), 'utf8');
  assert.match(src, /import \{ mergeStates \} from '..\/charts\/baked\/view\.ts'/);
  assert.match(src, /const merged = useMemo\(\(\) => mergeStates\(deckId, /);
  // (and a pressed control's state over the slide's own, as every reader of the slide on show: shown-state.ts, 26 Nov)
  assert.match(src, /const results = useShown\(deckId, merged\)/);
});
