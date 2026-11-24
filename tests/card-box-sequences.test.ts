// Plan 45: a card's box is decided once, before it shows, and a whole slide's life never changes it on screen except on a real viewport change. Node only.
// The size decision is the pure reducer boxOf (cards/box-lock.ts) that CardFrame calls; these are real sequences of what CardFrame measures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxOf, BOX_START, grewFindings, noteGrew, clearGrew, type BoxEvent, type BoxState } from '../src/ui/cards/box-lock.ts';

const K = 'teach:rhf|600|sig-a';
/** Plays events through the reducer the way CardFrame does and returns the height the card is drawn at after each (what it last reported). */
function play(events: BoxEvent[], start: BoxState = BOX_START) {
  let s = start, drawn = 0;
  const drawnAfter: number[] = [], grew: number[] = [];
  for (const ev of events) {
    const out = boxOf(s, ev);
    s = out.state;
    if (out.report && ev.t === 'measure') drawn = ev.h;
    if (out.grew) grew.push(out.grew);
    drawnAfter.push(drawn);
  }
  return { drawnAfter, grew, state: s, drawn };
}
const m = (h: number, o: { fresh?: boolean; shown?: boolean; key?: string } = {}): BoxEvent => ({ t: 'measure', key: o.key ?? K, h, fresh: !!o.fresh, shown: o.shown ?? true });

test('before the card shows every measure is taken (it is still being laid out); showing locks the last one', () => {
  const r = play([m(300, { fresh: true, shown: false }), m(344, { shown: false }), m(352, { shown: false }), { t: 'show', key: K }]);
  assert.deepEqual(r.drawnAfter, [300, 344, 352, 352]);
  assert.deepEqual(r.state, { key: K, h: 352 });
});

test('the slide of the clip: readings arrive, tick, a compare button swaps the words, back again, a slider drags: the box never moves', () => {
  const settled = [m(300, { fresh: true, shown: false }), m(352, { shown: false }), { t: 'show', key: K } as BoxEvent];
  const live: BoxEvent[] = [
    m(352),                                        // fonts
    m(352),                                        // chart built
    m(326), m(352),                                // readings arrive ("…" → a value: a line re-wraps shorter, then back)
    ...Array.from({ length: 40 }, (_, i) => m(i % 2 ? 326 : 352)),   // readings tick 40 times
    m(300),                                        // a compare press: the words in the box are the shorter variant's
    m(352),                                        // and back
    ...Array.from({ length: 30 }, (_, i) => m(340 + (i % 3))),        // a slider drag, 30 steps (never above the lock)
    m(330),                                        // a Doppler gate press
    m(352),                                        // a font swap
  ];
  const r = play([...settled, ...live]);
  const after = r.drawnAfter.slice(settled.length);
  assert.ok(after.every((h) => h === 352), `drawn heights after landing: ${[...new Set(after)]}`);
  assert.deepEqual(r.grew, [], 'nothing grew');
});

test('a measure that is not fresh never shrinks a shown card, and reports nothing', () => {
  let s: BoxState = { key: K, h: 352 };
  for (const h of [351, 300, 120, 352]) { const o = boxOf(s, m(h)); assert.equal(o.report, false, String(h)); s = o.state; }
  assert.deepEqual(s, { key: K, h: 352 });
});

test('a viewport change (a new key, width or step: the measuring effect\'s own fresh pass) takes the lock again, once, then it is constant again', () => {
  const K2 = 'teach:rhf|820|sig-b';
  const r = play([m(352, { fresh: true, shown: false }), { t: 'show', key: K }, m(352), m(300, { fresh: true, key: K2 }), m(290, { key: K2 }), m(300, { key: K2 }), m(280, { key: K2 })]);
  assert.deepEqual(r.drawnAfter, [352, 352, 352, 300, 300, 300, 300]);
});

test('above the lock the card grows (the words are never clipped), the growth is logged for the audit, and it never shrinks back', () => {
  clearGrew();
  const r = play([m(352, { fresh: true, shown: false }), { t: 'show', key: K }, m(352), m(378), m(352), m(366), m(300)]);
  assert.deepEqual(r.drawnAfter, [352, 352, 352, 378, 378, 378, 378]);
  assert.deepEqual(r.grew, [26]);
  noteGrew({ card: 'teach', slide: 'teach:rhf', px: 26 });
  const f = grewFindings();
  assert.equal(f.length, 1);
  assert.equal(f[0]!.kind, 'card-grew-live');
  assert.equal(f[0]!.sev, 'fail');
  clearGrew();
  assert.deepEqual(grewFindings(), []);
});

test('CardFrame asks the reducer on every measure and shows it only once let in; the quick check is the one card that grows by design', () => {
  const cf = readFileSync('src/ui/cards/CardFrame.tsx', 'utf8');
  assert.match(cf, /boxOf\(box\.current, \{ t: 'measure', key: lockKey, h, fresh, shown: gate\.current && !GROWS_BY_DESIGN\.has\(entry\.id\) \}\)/);
  assert.match(cf, /if \(!out\.report\) \{[^}]*return;\s*\}\s*\n\s*if \(out\.grew\) noteGrew\(/);
  assert.match(cf, /box\.current = boxOf\(box\.current, \{ t: 'show', key: lockKey \}\)\.state/);
  assert.match(cf, /report\(true, !sameStep\);/, 'the measuring effect\'s first pass is the fresh one (but for a kept data card at the same step)');
  assert.match(cf, /GROWS_BY_DESIGN: ReadonlySet<string> = new Set\(\['check'\]\)/);
  assert.match(readFileSync('src/ui/debug/audit/app.ts', 'utf8'), /grewFindings\(\)/, 'the audit reads the log');
  assert.match(readFileSync('src/ui/debug/audit/app.ts', 'utf8'), /clearGrew\(\)/);
});
