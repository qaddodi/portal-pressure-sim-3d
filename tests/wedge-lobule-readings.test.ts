// The wedge slide's lobule (Mohammad, 25 Nov 2026, slide 5/15 of Measuring HVPG and PPG: "show the sinusoid pressure on the lobule and show a callout on the sinusoid with the HVPG pressure").
// Two root causes. (1) The Sinusoids name stood with no number beside the WHVP card, because the solver priced the wide "Sinusoids 16.7 mmHg" over the dense net above the narrow bare name and
// took the narrow one, and nothing ever fed `must` (a name the slide shows stands first). Now a slide whose callout says `reads: ['sin']` stands that name first and keeps only the forms that carry its
// reading, clear of the sinusoids' courses as the central vein's is. (2) The slide had no pointer: it gets a callout on a
// sinusoid whose words are the WHVP, read from the same fingerprint as the patient card's tile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadHpDeck } from '../src/decks/hp/index.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, type Fp } from '../src/ui/deck/figure-calls.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { buildLobuleCaptions, lobuleLabelView, readingText } from '../src/scene/lobule/captions.ts';
import { boxOf, solve } from '../src/scene/labels/solver.ts';
import { type Box, crosses, hits } from '../src/scene/labels/geometry.ts';
import { valueText } from '../src/decks/hp/numbers.ts';
import { FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { calloutSpot } from '../src/scene/lobule/callout-spot.ts';
import { cardKeepOut, placeCards } from '../src/scene/labels/figure-cards.ts';
import { BAR } from '../src/ui/layout/plan.ts';
import { SIZES, frame } from './lobule-frame.ts';

const gold = JSON.parse(readFileSync(new URL('./fixtures/decks-hp-numbers.json', import.meta.url), 'utf8')) as { decks: Record<string, { id: string; fp: Fp }[]> };
const fp = gold.decks.hvpg!.find((s) => s.id === 'wedge-sinusoid')!.fp;
const deck = await loadHpDeck('hvpg');
const slide = deck.slides.find((s) => s.id === 'wedge-sinusoid')!;

test('the slide asks for the Sinusoids name to stand first with its reading, and only this slide does', async () => {
  const calls = figureCalls(figurePlan(slide), { fp });
  assert.deepEqual(calls.reads, ['sin', 'cv']);
  assert.deepEqual(calls.lit, ['sin'], 'only the sinusoids take the colour; the central vein just shows its pressure');
  assert.equal(calls.readsTone, 'wedge', 'the Sinusoids name takes the callout\'s colour, so the two read together');
  for (const id of ['presin', 'wedge']) assert.deepEqual(figureCalls(figurePlan(deck.slides.find((x) => x.id === id)!), { fp }).reads, [], `${id}: unchanged`);
  const lob = await loadHpDeck('lobule');
  for (const x of lob.slides) assert.deepEqual(figureCalls(figurePlan(x), { fp }).reads, [], `lobule/${x.id}: unchanged`);
});

test('the callout stands on a sinusoid and says the WHVP, the number of the patient card\'s tile', () => {
  const plan = figurePlan(slide);
  assert.deepEqual(plan.callout && { at: plan.callout.at, kind: plan.callout.kind }, { at: 'sin', kind: 'wedge' });
  const co = figureCalls(plan, { fp }).cards.find((c) => c.id === 'callout')!;
  assert.ok(co, 'the callout is a card of the figure');
  assert.deepEqual(co.anchor, { lobule: 'sinusoid:mid' });
  assert.equal(co.text, `WHVP ${valueText('whvp', fp as never)}`);
  assert.equal(co.text, 'WHVP 16.3 mmHg');
  assert.equal(co.tone, 'wedge', 'the amber the slide\'s words give the sinusoids and the WHVP, not the danger red');
  // the same slide's tiles read the same fingerprint, so the callout and the card cannot differ
  assert.equal(readingText('P2', { P1: 0, P2: fp.sin!, P3: 0, lymph: 0 }, false, true), '16.7 mmHg');
});

const net = buildLobule();
const measure = (t: string) => t.length * 6.8;
// The slide as the screens lay it out (Mohammad's iPhone capture of 0a5f831f, 25 Nov: no Sinusoids name, no number on the central vein, the WHVP words lying across the vessels): the shot 'lobule:sinusoid',
// zoomed, in the room the cards leave: a phone's between its patient card above and its words card below, a landscape phone's, an iPad's and a Mac's beside the card column.
const FRAMES = [
  { n: 'iPhone 375x812', w: 375, h: 812, top: 47, port: true }, { n: 'iPhone 390x844', w: 390, h: 844, top: 47, port: true }, { n: 'iPhone 430x932', w: 430, h: 932, top: 59, port: true },
  { n: 'iPhone 440x956', w: 440, h: 956, top: 62, port: true }, { n: 'iPhone landscape 844x390', w: 844, h: 390, top: 0, port: false }, { n: 'iPad 1180x820', w: 1180, h: 820, top: 0, port: false },
  { n: 'Mac 1440x900', w: 1440, h: 900, top: 0, port: false },
];
function slideFrame(f: (typeof FRAMES)[number]) {
  const cards = f.port ? [{ x0: 0, y0: f.top, x1: f.w, y1: f.top + Math.round(f.h * 0.185) }, { x0: 0, y0: Math.round(f.h * 0.675), x1: f.w, y1: f.h }]
    : f.w < 900 ? [{ x0: 0, y0: 0, x1: 330, y1: f.h }] : [{ x0: 0, y0: 60, x1: 380, y1: f.h - 20 }];
  const room = f.port ? { x: 0, y: cards[0]!.y1, w: f.w, h: cards[1]!.y0 - cards[0]!.y1 } : { x: cards[0]!.x1, y: f.top, w: f.w - cards[0]!.x1, h: f.h };
  const full = { w: f.w, h: f.h, safe: { top: f.top, right: 0, bottom: f.port ? 34 : 0, left: 0 } };
  const D = effectiveDistance(lobuleShot('lobule:sinusoid'), room, f.h, f.w);
  const pxR = (f.h / (2 * Math.tan((FOV * Math.PI) / 360)) / D) * LOBULE_R * LOBULE_SCALE;
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
  // (the shot looks at the point half way from the portal corner to the centre: x = -0.5 R)
  const proj = (x: number, y: number): [number, number] => [cx + (x + 0.5) * pxR, cy + y * pxR];
  return { cards, room, view: lobuleLabelView(full, BAR, room), proj, pxR, vp: { w: f.w, h: f.h } };
}
const touches = (b: Box, lines: readonly (readonly number[])[]) => lines.some((l) => crosses(l[0]!, l[1]!, l[2]!, l[3]!, b));

for (const f of FRAMES) {
  test(`${f.n}: the slide's Sinusoids name and central vein stand with their numbers, the WHVP words stand clear of the vessels, and none lies on another or on a card`, () => {
    const { cards, view, proj, pxR, vp } = slideFrame(f);
    const spot = calloutSpot(net, 'sinusoid:mid'), [sx, sy] = proj(spot.x, spot.y), ring = Math.max(8, spot.r * pxR);
    const plain = buildLobuleCaptions({ proj, vp, measure, net, layers: { zones: false, lymph: false }, unit: true });
    const text = `WHVP ${valueText('whvp', fp as never)}`;
    const co = placeCards([{ id: 'callout', x: sx, y: sy, w: measure(text) + 4, h: 18, ring: ring + 8 }], view, cardKeepOut(cards), [], plain.lines)[0]!;
    assert.equal(co.ok, true, 'the callout has a place');
    assert.equal(touches(co.box, plain.lines), false, 'its words lie on no vessel');
    const ringBox = { x0: sx - ring - 6, y0: sy - ring - 6, x1: sx + ring + 6, y1: sy + ring + 6 };
    const walls = [...cards, co.box, ringBox];
    const c = buildLobuleCaptions({ proj, vp, measure, net, layers: { zones: false, lymph: false }, unit: true, must: new Set(['sin', 'cv']) });
    const out = solve({ items: c.items, view, blockers: walls, lines: c.lines, keep: c.keep });
    const boxes: { id: string; box: Box }[] = [];
    for (const id of ['sin', 'cv']) {
      const p = out.placed.find((x) => x.id === id), it = c.items.find((i) => i.id === id)!;
      assert.ok(p, `${id} is placed (placed ${out.placed.map((x) => x.id)}, hidden ${out.hidden})`);
      assert.equal(c.meta.get(id)!.forms[p.form]!.value, true, `${id} carries its number`);
      assert.equal(p.leader, true, `${id} keeps its leader`);
      const box = boxOf(p, it.ax, it.ay);
      assert.ok(box.x0 >= view.x0 && box.x1 <= view.x1 && box.y0 >= view.y0 && box.y1 <= view.y1, `${id} inside the view`);
      for (const w of walls) assert.ok(!hits(box, w), `${id} clear of a card or the callout`);
      boxes.push({ id, box });
    }
    assert.ok(!hits(boxes[0]!.box, boxes[1]!.box), 'the two names clear of each other');
  });
}

test('without the slide\'s ask the Sinusoids name keeps its bare fallback (free play and other slides are unchanged)', () => {
  const f = frame(SIZES[5]!);
  const c = buildLobuleCaptions({ proj: f.proj, vp: { w: 1440, h: 900 }, measure, net, layers: { zones: false, lymph: false }, unit: true });
  assert.deepEqual(c.meta.get('sin')!.forms.map((x) => x.value), [true, false]);
});

test('the wedge colour is drawn for the callout\'s ring, its words and the station name it sits beside (a token of the app\'s own, never a new colour)', () => {
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  assert.match(css, /\.lz-co\[data-tone="wedge"\]\s*\{[^}]*--tr-wedge\)/);
  assert.match(css, /\.cl\[data-fig="callout"\]\[data-co="wedge"\] \.cl-k\s*\{\s*color: var\(--tr-wedge-ink\)/);
  const cap = readFileSync(new URL('../src/scene/lobule/LobuleCaptions.tsx', import.meta.url), 'utf8');
  assert.match(cap, /fig\.lit\.includes\(id\) && fig\.readsTone/, 'a named station takes the tone');
  assert.match(cap, /restyle\(e\.root, \(\) => writeTone/, 'and crosses over to it');
});

test('the callout comes from a source patch, so a re-copy from 2D keeps it', () => {
  const src = readFileSync(new URL('../scripts/source-edits.mjs', import.meta.url), 'utf8');
  assert.match(src, /slides\.wedge-sinusoid\.callout/);
});
