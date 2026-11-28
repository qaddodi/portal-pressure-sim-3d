// The lecture export (scripts/export-lectures.mjs, src/ui/debug/export/): every talk becomes one Markdown outline with its two cards in full, its figure's framing in words and a flat wireframe per slide,
// in well under a second a slide, with no browser. The rules are checked over EVERY talk the app has, not the one that was looked at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
(globalThis as Record<string, unknown>).location = { search: '', pathname: '/', hostname: 'localhost' };
const { loadSource, SOURCE_IDS } = await import('../src/decks/source.ts');
const { toDeck } = await import('../src/decks/hp/deck.ts');
const { lectureOf, cardWords } = await import('../src/ui/debug/export/lecture.ts');
const { viewportOf } = await import('../src/ui/debug/export/frame.ts');
const { DEVICES } = await import('../src/ui/debug/devices.ts');
const { zipBytes } = await import('../src/ui/debug/request/bundle.ts');
const { zipNames } = await import('../src/ui/capture/zip.ts');

const mac = DEVICES.find((d) => d.id === 'mac')!;
const make = async (id: string, extra: object = {}) => {
  const copied = await loadSource(id);
  const deck = toDeck(copied);
  return lectureOf({ deck, copied, states: undefined, baked: null, vp: viewportOf(mac.w, mac.h), screen: mac.name, ...extra }, () => performance.now());
};

test('every talk exports: one heading per slide, a wireframe per slide, no unfilled braces, and a slide takes well under a second', async () => {
  let slides = 0, worst = 0;
  for (const id of SOURCE_IDS) {
    const out = await make(id);
    const deck = toDeck(await loadSource(id));
    assert.equal(out.slides.length, deck.slides.length, `${id}: every slide is in the outline`);
    assert.equal(out.wires.length, deck.slides.length, `${id}: a wireframe for every slide`);
    for (const s of deck.slides) assert.ok(out.markdown.includes(`id \`${s.id}\``), `${id}: slide ${s.id} is in the file`);
    assert.ok(!/\{[a-z]+[:@}]/.test(out.markdown.replace(/`[^`]*`/g, '')), `${id}: a reading was left as a brace`);
    for (const w of out.wires) { assert.ok(w.svg.startsWith('<svg') && w.svg.trim().endsWith('</svg>'), `${id}: ${w.name} is a whole svg`); assert.ok(!/NaN|Infinity/.test(w.svg), `${id}: ${w.name} has a number that is not one`); }
    slides += deck.slides.length;
    worst = Math.max(worst, out.seconds / deck.slides.length);
  }
  assert.ok(slides >= 500, `all the talks were read (${slides} slides)`);
  assert.ok(worst < 0.25, `a slide took ${(worst * 1000).toFixed(0)} ms on average in the slowest talk (the ask: well under a second)`);
});

test('the words card and the data card are printed in full with the card\'s own number format, and the camera is told in words', async () => {
  const out = await make('tips-complete');
  const md = out.markdown;
  assert.match(md, /### Card 1: the words/);
  assert.match(md, /### Card 2: the data/);
  assert.match(md, /\*\*Framing:\*\* (the whole figure|a wide view|a medium close-up|a close-up), centred on/);
  assert.match(md, /\*\*Organs in the room:\*\*/);
  assert.match(md, /\*\*Lens:\*\*/);
  assert.equal(cardWords('the PPG is {ppg} and {>=10 mmHg} is the cut-off, **bold** and [the portal vein](pv)', { ppg: 8.46 }, () => null), 'the PPG is **8.5 mmHg** and ≥10 mmHg is the cut-off, **bold** and the portal vein');
  assert.equal(cardWords('the PPG is {ppg}', null, () => null), 'the PPG is **…**', 'a reading with no state prints as the card does while it waits');
});

test('--no-wire leaves the wireframes out, and a picked slide list leaves the others out', async () => {
  const none = await make('day', { wire: false });
  assert.equal(none.wires.length, 0);
  assert.ok(!none.markdown.includes('![wireframe'));
  const two = await make('tips-complete', { only: [2, 3] });
  assert.deepEqual(two.slides.map((s) => s.n), [2, 3]);
  assert.equal(two.wires.length, 2);
});

test('a slide whose labelled stations stand under 40 px from the room\'s edge is called out (the framing rule F3, read from the same numbers)', async () => {
  // the check is the survey's own `clear`: every station a slide labels has one, and the words say when it is short
  const out = await make('tips-complete');
  assert.ok(/Labels on the figure:/.test(out.markdown));
  for (const m of out.markdown.matchAll(/(\d+) px clear/g)) assert.ok(Number(m[1]) >= 40);
});

test('the zip holds INDEX.md, the talks and the wireframes under the paths the Markdown points at', async () => {
  const out = await make('day');
  const files = [{ name: 'INDEX.md', text: '# x' }, { name: `lectures/${out.file}`, text: out.markdown }, ...out.wires.map((w) => ({ name: `lectures/${w.name}`, text: w.svg }))];
  const names = zipNames(zipBytes(files, new Date(2026, 10, 28))).map((z) => z.name);
  assert.ok(names.includes('INDEX.md') && names.includes('lectures/day.md'));
  for (const m of out.markdown.matchAll(/\]\((wire\/[^)]+)\)/g)) assert.ok(names.includes(`lectures/${m[1]}`), `${m[1]} is in the zip`);
});
