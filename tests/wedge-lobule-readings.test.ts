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
import { pairSpots } from '../src/scene/lobule/callout-spot.ts';
import { PAIR_AIR, PAIR_AT, PAIR_LABEL_GAP, PAIR_LEAD, PAIR_RING_R, placeAbove } from '../src/scene/labels/pair.ts';
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
  assert.deepEqual(co.anchor, { lobule: PAIR_AT }, 'the lower of a pair of readings on one sinusoid');
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
  test(`${f.n}: the pair stands on one sinusoid, Sinusoids above its ring and WHVP below its own, the central vein keeps its number, and none lies on another or on a card`, () => {
    const { cards, view, proj, vp } = slideFrame(f);
    const pair = pairSpots(net), [sx, sy] = proj(pair.sin[0], pair.sin[1]), [wx, wy] = proj(pair.whvp[0], pair.whvp[1]);
    const course = net.courses.find((c) => c.id === pair.course)!;
    assert.ok(course.pts.includes(pair.sin) && course.pts.includes(pair.whvp), 'both rings are samples of the same sinusoid');
    assert.ok(Math.hypot(wx - sx, wy - sy) > 3 * PAIR_RING_R, 'the two rings stand apart');
    for (const [x, y] of [[sx, sy], [wx, wy]] as const) assert.ok(x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1, 'both rings are in the view');
    const c = buildLobuleCaptions({ proj, vp, measure, net, layers: { zones: false, lymph: false }, unit: true, must: new Set(['sin', 'cv']) });
    const sin = c.items.find((i) => i.id === 'sin')!;
    assert.ok(Math.abs(sin.ax - sx) < 1e-6 && Math.abs(sin.ay - sy) < 1e-6, 'the Sinusoids station stands on the pair\'s upper ring');
    // above: its widest form, which carries the number
    assert.equal(c.meta.get('sin')!.forms[0]!.value, true);
    const up = placeAbove({ x: sx, y: sy }, sin.forms[0]!, view, cards);
    assert.ok(up, 'a clear place above the ring');
    const text = `WHVP ${valueText('whvp', fp as never)}`;
    const lo = placeCards([{ id: 'callout', x: wx, y: wy, w: measure(text) + 4, h: 18, ring: PAIR_AIR, below: true, pair: true }], view, cardKeepOut(cards), [], c.lines)[0]!;
    assert.equal(lo.ok, true, 'the callout has a place');
    assert.ok(up!.y1 <= sy - PAIR_RING_R, 'Sinusoids stands wholly above its ring');
    assert.ok(lo.y0 >= wy + PAIR_RING_R, 'WHVP stands wholly below its ring');
    assert.ok(!hits(up!, lo.box), 'the two words clear of each other');
    // the central vein keeps its number beside the pair
    const walls = [...cards, { x0: Math.min(up!.x0, sx - 1), y0: up!.y0, x1: Math.max(up!.x1, sx + 1), y1: sy + 4 }, lo.box];
    const out = solve({ items: c.items.filter((i) => i.id !== 'sin'), view, blockers: walls, lines: c.lines, keep: c.keep });
    const cv = out.placed.find((x) => x.id === 'cv')!, cvIt = c.items.find((i) => i.id === 'cv')!;
    assert.ok(cv, `cv is placed (hidden ${out.hidden})`);
    assert.equal(c.meta.get('cv')!.forms[cv.form]!.value, true, 'the central vein carries its number');
    assert.equal(cv.leader, true, 'and keeps its leader');
    const cvBox = boxOf(cv, cvIt.ax, cvIt.ay);
    assert.ok(cvBox.x0 >= view.x0 && cvBox.x1 <= view.x1 && cvBox.y0 >= view.y0 && cvBox.y1 <= view.y1, 'cv inside the view');
    for (const w of [...walls]) assert.ok(!hits(cvBox, w), 'cv clear of a card and of the pair');
  });
}

test('the pair\'s numbers are the ones the callout and the station share, and a slide with no pair draws no pair', () => {
  const fc = readFileSync(new URL('../src/scene/labels/figure-cards.ts', import.meta.url), 'utf8');
  assert.match(fc, new RegExp(`RING_LEAD_MIN = ${PAIR_LEAD};`));
  assert.match(fc, new RegExp(`RING_LABEL_GAP = ${PAIR_LABEL_GAP};`));
  // another slide's callout on a sinusoid, with no reading asked for, is not a pair
  const lob = figurePlan({ ...slide, callout: { at: 'sin', label: 'Resistance', kind: 'block' } } as never);
  const co = figureCalls(lob, { fp }).cards.find((x) => x.id === 'callout')!;
  assert.deepEqual(co.anchor, { lobule: 'sinusoid:mid' });
});

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
