// Prehepatic review (23 Nov 2026, capture 58722f12): the table's one-line layout at every width, a finding under every case, "No flow" on a flat trace, the PPG curve on the slide's own patient
// (it ended at 26 while the words said 27.3), and no word that says the HVPG is "unchanged" over numbers that move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECK } from '../src/decks/hp/data/prehepatic.copied.ts';
import { waveWords } from '../src/ui/talk/table-wave.ts';

const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
const slide = (id: string) => (DECK.slides as readonly Record<string, any>[]).find((s) => s.id === id)!;

test('the table\'s one-line grid is not behind a media query (a laptop took 2D\'s old wide table with group headings)', () => {
  const at = css.indexOf('.pz-table.dk-pztable tr { display: grid');
  assert.ok(at > 0, 'the grid rule is there');
  let depth = 0;
  for (const ch of css.slice(0, at)) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  assert.equal(depth, 0, 'at the top level of the stylesheet, not inside an @media block');
  assert.match(css, /\.deck-ui \.pz-table\.dk-pztable tbody tr th\[scope="row"\] \.pz-kick \{ display: none; \}/, 'the group heading is hidden at every width');
});

test('every case of the Prehepatic summary table carries one finding line', () => {
  const t = slide('summary');
  assert.deepEqual(t.note, ['Finding']);
  for (const r of t.of) assert.ok(Array.isArray(r.note) && r.note.length === 1 && r.note[0].length > 3, r.title);
});

test('a flat Doppler row says "No flow" (its hover title is what the cell prints)', () => {
  const flat = { t: [0, 1, 2], v: [0, 0.2, 0] };
  assert.equal(waveWords(flat, 'PV_TRUNK').title, 'No flow');
  assert.notEqual(waveWords({ t: [0, 1], v: [20, 30] }, 'PV_TRUNK').title, 'No flow');
});

test('the PPG curve runs on the slide\'s own patient, so its last point is the reading the words print; the HVPG is never "unchanged" over moving numbers', () => {
  assert.equal(slide('relation').tool.patient, undefined);
  assert.doesNotMatch(slide('course').title, /unchanged/);
  assert.doesNotMatch(JSON.stringify(slide('course').ask), /unchanged/);
  assert.doesNotMatch(String(DECK.checks[3]![0]), /stays at \{hvpg@anticoag\}/, 'one HVPG value is not claimed for two model states');
});
