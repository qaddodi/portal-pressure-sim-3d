// Capture 4fb2f869 (iPhone, portrait and sideways): a summary table or chart on a phone on its side was one card taller than the column (clipped, the © line on the table), a table's "Misses"
// word ran over its neighbours' arrows, and a long case name ran under the next column. Roots: phone-panel.ts, TableCard.tsx (missWords, longestWord), deck-ui.css (--dk-wn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phoneView } from '../src/ui/cards/phone-panel.ts';
import { missWords, longestWord } from '../src/ui/cards/table-words.ts';
import type { View } from '../src/ui/deck/presenter-machine.ts';

const v = (words: View['words'], data: View['data'] = null) => ({ words, data, slide: null, shot: 'x', scene: null, cath: null, number: 1, of: 1 }) as unknown as View;

test('a visual slide on a phone on its side is the words card and the table or chart under it; elsewhere it stays the one panel', () => {
  assert.deepEqual([phoneView(v('visual'), true, 'table').words, phoneView(v('visual'), true, 'table').data], ['teach', 'table']);
  assert.equal(phoneView(v('visual'), false, 'table').words, 'visual');
  assert.equal(phoneView(v('title'), true, 'table').words, 'title');
  assert.equal(phoneView(v('teach', 'ladder'), true, 'table').data, 'ladder');
  assert.equal(phoneView(v('visual'), true, null).words, 'visual');
});

test('"Misses" is said in the row\'s grey line, not in a one-arrow cell', () => {
  const cols = [{ k: 'hvpg', label: 'HVPG' }, { k: 'eus', label: 'EUS-PPG' }, { k: 'ppg', label: 'PPG' }];
  const cell = (k: string, miss: string) => ({ k, miss }) as never;
  assert.equal(missWords([cell('hvpg', 'Misses'), cell('eus', ''), cell('ppg', '')], cols), 'HVPG misses it');
  assert.equal(missWords([cell('hvpg', 'Misses part'), cell('eus', 'Misses part'), cell('ppg', '')], cols), 'HVPG and EUS-PPG misses part of it');
  assert.equal(missWords([cell('hvpg', '')], cols), '');
  assert.ok(!/pz-miss/.test(readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').replace(/className="vs dk-tfind pz-missnote"/, '')), 'no cell prints the word');
});

test('the name column is never narrower than the longest word a name holds', () => {
  assert.equal(longestWord(['Healthy', 'Schistosomiasis', 'Portal vein thrombosis']), 15);
  assert.equal(longestWord([]), 0);
  assert.match(readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8'), /--dk-name: max\([^;]*var\(--dk-wn/);
});

test('Ascites 13 prints the litres the model holds before the tap, not a fixed 6 L; the belly is as tall as it is wide', async () => {
  const { AMEND } = await import('../src/decks/ag/ascites-amend.ts');
  assert.match(AMEND.lvpLine.to, /\{asc@tense\}/);
  assert.ok(!/6 L/.test(AMEND.lvpLine.to));
  const pane = readFileSync(new URL('../src/ui/tests/abdomen/AbdomenPane.tsx', import.meta.url), 'utf8');
  assert.match(pane, /width: square, height: square, maxHeight: 'none'/, "2D's 22 pzh height cap squashed the ring to 86 px high on a phone on its side");
});
