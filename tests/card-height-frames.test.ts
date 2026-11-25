// 25 Nov, Mohammad's third report: a teaching or instrument card arrives at its final height and never changes it, not by 1 px. CardFrame draws a landed card at `freezeOf(...)`, and its measure lock holds every
// later measure (box-lock.ts). These drive both, frame by frame, through what a slide does to a card: a plan that gives more room after the card landed, a chart or readout that draws late, a font that swaps,
// a words card measured after it, a step of its own, a viewport change. The height drawn on every frame must not change except where the rule says (a smaller room, a new step, a new viewport).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freezeOf, boxOf, BOX_START, type Frozen } from '../src/ui/cards/box-lock.ts';

/** The heights drawn on each frame for a card let in at frame 0, given the plan's height for it on every frame, the step key of each, and the height the card itself measured for that key (null until it has). No clock anywhere. */
function frames(plan: number[], key: (i: number) => string = () => 'ladder|390|1|0|||390x844', measured: (i: number) => number | null = () => null): number[] {
  let f: Frozen | null = null; const out: number[] = [];
  plan.forEach((h, i) => { f = freezeOf(f, key(i), h, measured(i)); out.push(f.h); });
  return out;
}

test('a plan that gives the landed card more room later (a words card measured after it, a fit that settled, a chart that drew) never changes the drawn height', () => {
  const drawn = frames([300, 300, 312, 340, 340, 360, 300, 300, 420, 300]);
  assert.deepEqual([...new Set(drawn.slice(0, 5))], [300], 'the first frames and every later increase');
  assert.ok(drawn.every((h) => h === 300), "never any other height");
});

test('a room that gets smaller does not shrink the landed card either: it never changes size after it landed, in either direction', () => {
  assert.deepEqual(frames([300, 300, 260, 300, 340, 260]), [300, 300, 300, 300, 300, 300]);
});

test('a new key (a step of its own, a new slide\'s content) takes the plan\'s height, both ways, until the plan has caught up with what the card measured: at any clock scale, never a stale height', () => {
  const key = (i: number) => (i < 4 ? 'k1' : 'k2');
  // landed at 300; at frame 4 the key changes and the plan still gives 300; the card measured 380 for k2 (from frame 4 on); the plan catches up two frames later, then asks for more: held at 380
  const m = (i: number) => (i >= 4 ? 380 : null);
  assert.deepEqual(frames([300, 300, 300, 300, 300, 300, 380, 380, 420, 420], key, m), [300, 300, 300, 300, 300, 300, 380, 380, 380, 380]);
  // a slide whose content is SHORTER: the plan comes down to what the card measured and the card follows it (not the previous slide's 300)
  assert.deepEqual(frames([300, 300, 300, 300, 300, 270, 270, 330], key, (i) => (i >= 4 ? 270 : null)), [300, 300, 300, 300, 300, 270, 270, 270]);
  // the plan is slow (a hundred frames, a slow phone or a clock at 300x changes nothing: no time is read): still followed up to the measure
  const slow = [...Array(4).fill(300), ...Array(100).fill(300), 380];
  assert.equal(frames(slow, key, (i) => (i >= 4 ? 380 : null)).at(-1), 380);
  // before the card has measured the new key (null), the plan is followed whatever it is
  assert.deepEqual(frames([300, 300, 300, 300, 340, 360], key, () => null), [300, 300, 300, 300, 340, 360]);
});

test('a new viewport (the key carries it) takes its own height', () => {
  const key = (i: number) => `ladder|390|1|0||${i < 3 ? '390x844' : '844x390'}`;
  assert.deepEqual(frames([300, 300, 300, 220, 220], key), [300, 300, 300, 220, 220]);
});

test('every measure after the card is let in is held by the lock, whatever the content does (a late row, a readout, a font swap): the drawn box never changes', () => {
  const K = 'ladder|390|1';
  let s = boxOf(BOX_START, { t: 'measure', key: K, h: 300, fresh: true, shown: false }).state;
  s = boxOf(s, { t: 'show', key: K }).state;
  let reported = 0;
  for (const h of [300, 318, 342, 301, 360, 299, 420, 300]) { const o = boxOf(s, { t: 'measure', key: K, h, fresh: false, shown: true }); if (o.report) reported++; s = o.state; }
  assert.equal(reported, 0);
  assert.equal(s.h, 300);
});

test('CardFrame draws every height from the frozen one, and only a card that has landed glides (an arriving card takes its height at once, never growing from below)', () => {
  const cf = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(cf, /fz\.current = freezeOf\(fz\.current, fkey, rect\.h, box\.current\.key === lockKey \? box\.current\.h : null\)/);
  assert.doesNotMatch(readFileSync(new URL('../src/ui/cards/box-lock.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /clock|performance|Date\.now/, 'the height lock reads no clock');
  assert.doesNotMatch(cf, /animH \?\? rect\.h/, 'no height written from the plan\'s directly');
  assert.match(cf, /if \(prev == null \|\| prev === hOn \|\| !live\) return;/);
  assert.match(cf, /!n\.landed/, 'the measuring callback\'s glides need a landed card');
  assert.ok(!/GROWS_BY_DESIGN\.has\(entry\.id\)\) \{[^}]*hOn = rect\.h/.test(cf));
});
