import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeCards, ringLeader, RING_AIR, RING_LABEL_GAP, RING_LEAD_MIN, type CardIn } from '../src/scene/labels/figure-cards.ts';
import { hits, type Box } from '../src/scene/labels/geometry.ts';
import { RING_STROKE, typeVars, type Vp } from '../src/scene/labels/type.ts';

// iPhone, 21 Nov (Sites and causes 6 and 7, Budd-Chiari 8): a slide's callout was the catheter's grey glass pill with a pointer, on the central vein or at the edge of the figure.
// 2D draws it as a thick red ring on the place, a leader of the same stroke from the ring to the words, and the words in that colour (lobule-zoom.js callEl, callLine, callRing).
// Root cause: figure-calls.ts made every slide callout a `mark` card, and figure-cards.ts drew every `mark` as a glass pill; nothing in 3D had a ring.
const VP: Vp = { w: 390, h: 844 };
const VIEW: Box = { x0: 0, y0: 60, x1: 390, y1: 800 };
const ringCard = (over: Partial<CardIn> = {}): CardIn => ({ id: 'callout', x: 195, y: 300, w: 120, h: 24, ring: 40 + RING_AIR, ...over });
const box = (o: { x0: number; y0: number }, w = 120, h = 24): Box => ({ x0: o.x0, y0: o.y0, x1: o.x0 + w, y1: o.y0 + h });

test('the words stand clear of the ring, never on it', () => {
  const [o] = placeCards([ringCard()], VIEW, []);
  assert.ok(o!.ok);
  const r = 40 + RING_AIR, rb: Box = { x0: 195 - r, y0: 300 - r, x1: 195 + r, y1: 300 + r };
  assert.ok(!hits(box(o!), rb), 'the label keeps off the ring');
});

test('the words keep off the cards and the ring even when the near places are taken', () => {
  const blockers: Box[] = [{ x0: 0, y0: 150, x1: 390, y1: 480 }];
  const [o] = placeCards([ringCard()], VIEW, blockers);
  assert.ok(o!.ok);
  for (const b of blockers) assert.ok(!hits(box(o!), b), 'clear of the card');
  const r = 40 + RING_AIR;
  assert.ok(!hits(box(o!), { x0: 195 - r, y0: 300 - r, x1: 195 + r, y1: 300 + r }));
});

test('the leader starts on the ring and stops short of the words', () => {
  const b: Box = { x0: 135, y0: 160, x1: 255, y1: 184 };
  const seg = ringLeader({ x: 195, y: 300 }, 40, b)!;
  assert.ok(seg, 'a line shows');
  assert.ok(Math.abs(Math.hypot(seg[0] - 195, seg[1] - 300) - 40) < 1e-6, 'starts on the ring');
  assert.ok(Math.abs(seg[3] - (b.y1 + RING_LABEL_GAP)) < 1e-6, 'ends RING_LABEL_GAP under the words');
  assert.ok(seg[3] > b.y1, 'never runs in under the letters');
});

test('a label too close for a line shows none', () => {
  assert.equal(ringLeader({ x: 195, y: 300 }, 40, { x0: 135, y0: 238, x1: 255, y1: 262 }), null);
});

test('a lobule callout is a ring, a leader and coloured words, not a glass card (source)', () => {
  const fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  assert.match(fc, /spec\.kind === 'mark' && 'lobule' in spec\.anchor/, 'a lobule-anchored mark makes a ring');
  assert.match(fc, /dataset\.fig = 'callout'/);
  assert.match(fc, /lobuleRing\(c\.anchor\.lobule/, 'the ring radius is read from the camera');
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  // one stroke source: RING_STROKE (type.ts) reaches the stylesheet as --co-w through typeVars; the ring, its leader and the leader's centring read it (labels.css holds no 4px in .lz-co-*)
  assert.match(css, /\.lz-co-ring \{[^}]*border: var\(--co-w\) solid var\(--co\)/, 'the ring is 2D\'s stroke, read from --co-w');
  assert.match(css, /\.lz-co-line \{[^}]*height: var\(--co-w\)/, 'the leader is the ring\'s stroke');
  assert.match(css, /\.lz-co-line \{[^}]*margin-top: calc\(var\(--co-w\) \/ -2\)/, 'and is centred on it');
  assert.doesNotMatch(css.split('\n').filter((l) => /^\.lz-co-(ring|line) /.test(l)).join('\n'), /\b4px|-2px/, 'no stroke number of its own in .lz-co-*');
  assert.equal(typeVars(VP)['--co-w'], `${RING_STROKE}px`, 'typeVars carries the stroke');
  assert.equal(RING_STROKE, 4, '2D\'s 4 px');
  assert.match(css, /\.lz-co \{[^}]*--co: var\(--cl-danger/, 'block is the danger red');
});

test('the ring is clear inside: no glass, blur or tint under it, and it fades with its leader on its own pieces', () => {
  const fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  assert.match(fc, /fadeRing\(co, r\.a\)/, 'it fades with the leader');
  assert.doesNotMatch(fc.split('private paintRing')[1]!.split('\n  }\n')[0]!, /co\.root\.style\.opacity/);
  assert.doesNotMatch(fc, /lz-co-focus|focus: HTMLElement/, 'the soft focus is gone');
});

test('a mark on a vessel or an organ is a coloured label with a leader, never a solid pill', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  assert.doesNotMatch(css, /data-fig="mark"\][^{]*\{[^}]*background:/, 'no fill behind a mark\'s words');
});

test('the ring and the leader only move by transform and fade by opacity', () => {
  const fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8').split('private paintRing')[1]!.split('\n  }\n')[0]!;
  assert.doesNotMatch(fc, /style\.(left|top)\b/);
  assert.match(fc, /fadeRing\(co, r\.a\)/);
});

// Plan B (23 Nov, the SOS slide: "the ring has no leader"): the words stood 3 px of leader off the ring (under ringLeader's 4 px), so no slide ever showed one.
test('every spot placeCards gives a ring card shows a leader of at least RING_LEAD_MIN (both sides, every sideways step, the free-spot fallback)', () => {
  const r = 40, ring = r + RING_AIR;
  const spots: Box[] = [];
  for (const below of [false, true]) {
    // a clear view: the first spot tried (straight above, or below)
    const [o] = placeCards([ringCard({ below })], VIEW, []);
    spots.push(box(o!));
    // each sideways step: the ones before it are blocked, one at a time, so placeCards falls through to the next
    const w = 120, steps = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5].map((k) => k * w);
    for (let n = 1; n < steps.length; n++) {
      const blockers: Box[] = steps.slice(0, n).map((dx) => { const x0 = 195 + dx - w / 2; return { x0, y0: below ? 300 + ring : 300 - ring - 24, x1: x0 + w, y1: below ? 300 + ring + 24 : 300 - ring }; });
      const [p] = placeCards([ringCard({ below })], VIEW, blockers);
      if (p!.ok) spots.push(box(p!));
    }
  }
  // the free-spot fallback: both sides blocked, so the nearest clear place anywhere
  const [f] = placeCards([ringCard()], VIEW, [{ x0: 0, y0: 300 - ring - 30, x1: 390, y1: 300 + ring + 30 }]);
  if (f!.ok) spots.push(box(f!));
  assert.ok(spots.length >= 10);
  for (const b of spots) {
    const seg = ringLeader({ x: 195, y: 300 }, r, b);
    assert.ok(seg, `a leader shows for the words at ${b.x0},${b.y0}`);
    const len = Math.hypot(seg![2] - seg![0], seg![3] - seg![1]);
    assert.ok(len >= RING_LEAD_MIN - 0.5, `leader ${len.toFixed(1)} px`);
  }
  assert.equal(RING_LEAD_MIN, 16);
});
