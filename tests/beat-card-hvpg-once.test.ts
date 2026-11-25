// "HVPG 15.6" stood three times on a beat card in the photo: the card's own header, the narrow plot's top line, and the gap's label (on a wide card the column's block is a fourth). The 2D canvas card
// had no header, so beatFrame draws the number; the slide's BeatCard has one, so it asks for the frame without (`headed`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { beatFrame } from '../src/ui/tests/slide/beat-frame.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

function recorded(secs: number): SampleFeed {
  const f = new SampleFeed(), o: Record<string, number[]> = { t: [] };
  for (const k of CHANNELS) o[k] = [];
  const lv: Record<string, number> = { whvp: 27, RHV: 11.4, CONF: 28, hvpg: 15.6 };
  for (let i = 0; i < secs * 100; i++) {
    const t = i / 100, ph = (t / 0.8) % 1, b = Math.sin(2 * Math.PI * ph);
    o.t!.push(t); o.ph!.push(ph);
    for (const k of CHANNELS) if (k !== 'ph') o[k]!.push(k in lv ? lv[k]! + (k === 'hvpg' ? 0 : b) : 0);
  }
  f.adopt({ jump: false, samples: o } as never);
  return f;
}
const asRec = (f: SampleFeed) => ({ t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times, days: f.days, calm: (k: string) => f.calmOf(k) });
const NOW = { whvp: 27, fhvp: 11.4, pv: 28, hr: 83, hvpg: 15.6 };
const pal = paletteOf('light');
const texts = (headed: boolean | undefined, w: number, h: number) => {
  const f = recorded(30);
  const out = beatFrame({ rec: asRec(f) as never, head: 29.9, now: NOW, before: null, ekg: true, noPv: false, ...(headed === undefined ? {} : { headed }) }, { w, h, pal });
  return { out, words: out.frame.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s) };
};

for (const [w, h, name] of [[356, 223, 'the iPhone card'], [520, 250, 'a wide card']] as const) {
  test(`${name} (w ${w}): a headed card draws no HVPG number of its own; an unheaded one is as before`, () => {
    const headed = texts(true, w, h);
    assert.deepEqual(headed.words.filter((s) => /HVPG/.test(s)), [], 'no word of the plot says HVPG');
    assert.ok(!headed.words.includes('15.6'), 'the big number is not drawn either');
    assert.match(headed.out.frame.label, /HVPG 15\.6 mmHg/, 'the screen reader still has it');
    // the heart rate stays
    assert.ok(headed.words.some((s) => /83/.test(s)), 'the heart rate is still on the card');
    const plain = texts(false, w, h), unset = texts(undefined, w, h);
    assert.deepEqual(plain.words, unset.words);
    assert.ok(plain.words.some((s) => /HVPG/.test(s)), 'the card without a header names the HVPG');
  });
}

test('the slide card asks for the headed frame', () => {
  assert.match(readFileSync(new URL('../src/ui/tests/slide/BeatCard.tsx', import.meta.url), 'utf8'), /headed: true/);
});

// Variceal bleed 3, capture 52ef8e63: the words say the blood pressure has fallen only slightly; the card showed the heart rate alone. A slide with tool.bp prints the pressure beside it, every other beat card is as before.
for (const [w, h, name] of [[356, 223, 'the iPhone card'], [420, 250, 'an iPad card'], [520, 250, 'a wide card']] as const) {
  test(`${name} (w ${w}): the blood pressure stands beside the heart rate only when the slide asks`, () => {
    const f = recorded(30), now = { ...NOW, sbp: 118, dbp: 72 };
    const run = (bp: boolean | undefined) => beatFrame({ rec: asRec(f) as never, head: 29.9, now, before: null, ekg: true, noPv: false, headed: true, ...(bp === undefined ? {} : { bp }) }, { w, h, pal }).frame.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
    assert.ok(run(true).some((s) => s === 'BP 118/72'), 'the pressure is on the card');
    assert.ok(!run(false).some((s) => /BP/.test(s)) && !run(undefined).some((s) => /BP/.test(s)), 'the other beat cards are as before');
    assert.deepEqual(run(false), run(undefined));
  });
}
