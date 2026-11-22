import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { solve, slideInView, boxOf, LEAD_ON, CALL_MIN_GAP, type Item, type Form } from '../src/scene/labels/solver.ts';
import { hits, grow, type Box } from '../src/scene/labels/geometry.ts';

const form = (w: number, h = 26): Form => ({ text: 'x', w, h });
const item = (id: string, ax: number, ay: number, over: Partial<Item> = {}): Item => ({ id, ax, ay, au: 0.5, forms: [form(120)], pri: 5, ...over });
const VIEW: Box = { x0: 0, y0: 56, x1: 1000, y1: 700 };
const boxes = (r: ReturnType<typeof solve>, items: Item[]) => r.placed.map((p) => { const it = items.find((i) => i.id === p.id)!; return { id: p.id, box: boxOf(p, it.ax, it.ay) }; });

test('the same input always gives the same answer, in any order of items', () => {
  const items = [item('a', 300, 300), item('b', 330, 340), item('c', 600, 400, { pri: 9 }), item('d', 640, 420, { pri: 2 })];
  const a = solve({ items, view: VIEW, blockers: [] });
  const b = solve({ items: [...items].reverse(), view: VIEW, blockers: [] });
  assert.deepEqual(a.placed.map((p) => [p.id, p.dx, p.dy, p.form]).sort(), b.placed.map((p) => [p.id, p.dx, p.dy, p.form]).sort());
});

test('a label never stands under a card, nor over another label, and stays inside the view', () => {
  const cards: Box[] = [{ x0: 40, y0: 80, x1: 480, y1: 380 }, { x0: 640, y0: 440, x1: 960, y1: 660 }];
  const items = [item('a', 520, 200), item('b', 540, 230), item('c', 560, 260), item('d', 600, 420), item('e', 520, 480), item('f', 700, 300)];
  const r = solve({ items, view: VIEW, blockers: cards });
  const bs = boxes(r, items);
  assert.equal(r.dropped.length, 0, `dropped ${r.dropped}`);
  for (const { id, box } of bs) {
    for (const c of cards) assert.ok(!hits(box, c), `${id} is under a card`);
    assert.ok(box.x0 >= VIEW.x0 && box.x1 <= VIEW.x1 && box.y0 >= VIEW.y0 && box.y1 <= VIEW.y1, `${id} left the view`);
  }
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!hits(bs[i].box, grow(bs[j].box, 3)), `${bs[i].id} overlaps ${bs[j].id}`);
});

test('a crowded label shortens to its abbreviation before it is dropped, and a must label is never dropped', () => {
  // a corridor 60 px wide between two cards: the full name (150 px) cannot stand anywhere, the abbreviation (50 px) can
  const cards: Box[] = [{ x0: 0, y0: 56, x1: 470, y1: 700 }, { x0: 530, y0: 56, x1: 1000, y1: 700 }];
  const forms = [form(150), form(50), form(34)];
  const r = solve({ items: [item('pv', 500, 300, { forms })], view: VIEW, blockers: cards });
  assert.equal(r.placed.length, 1);
  assert.ok(r.placed[0].form >= 1, 'it should have taken a short form');
  const tight = solve({ items: [item('x', 500, 300, { forms: [form(150)], must: false })], view: VIEW, blockers: cards });
  assert.deepEqual(tight.dropped, ['x']);
  // a must label in a pocket: every compass spot is covered, so it is searched all the way round and lands clear of the cards, with a leader
  const pocket: Box[] = [{ x0: 0, y0: 56, x1: 470, y1: 700 }, { x0: 530, y0: 56, x1: 1000, y1: 330 }, { x0: 470, y0: 56, x1: 530, y1: 250 }];
  const m = item('x', 500, 300, { forms: [form(150)], must: true });
  const roomy = solve({ items: [m], view: VIEW, blockers: pocket });
  assert.equal(roomy.placed.length, 1, 'a must label is placed');
  const b = boxOf(roomy.placed[0], m.ax, m.ay);
  for (const c of pocket) assert.ok(!hits(b, c), 'and clear of the cards');
});

test('a label has a leader exactly when it stands farther than the leader distance from the edge of its vessel', () => {
  const cards: Box[] = [{ x0: 200, y0: 200, x1: 480, y1: 330 }, { x0: 520, y0: 270, x1: 760, y1: 330 }];
  const items = [item('a', 500, 300, { dirs: ['E'], vw: 3 }), item('b', 500, 240, { dirs: ['W'] }), item('c', 800, 400, { vw: 10 }), item('d', 810, 440)];
  const r = solve({ items, view: VIEW, blockers: cards });
  assert.ok(r.placed.length >= 3);
  for (const p of r.placed) {
    const it = items.find((i) => i.id === p.id)!, b = boxOf(p, it.ax, it.ay);
    const gap = Math.hypot(Math.max(b.x0 - it.ax, 0, it.ax - b.x1), Math.max(b.y0 - it.ay, 0, it.ay - b.y1));
    assert.equal(p.leader, gap - (it.vw ?? 0) > LEAD_ON, `${p.id}: gap ${gap.toFixed(1)} px, leader ${p.leader}`);
  }
});

test('a region name (an organ) is drawn on what it names and never has a leader', () => {
  const r = solve({ items: [item('liver', 400, 300, { region: true, forms: [form(70)] })], view: VIEW, blockers: [] });
  const p = r.placed[0];
  assert.equal(p.leader, false);
  assert.ok(Math.abs(p.dx + p.w / 2) < 0.5 && Math.abs(p.dy + p.h / 2) < 0.5, 'centred on its point');
});

test('a vessel half under a card puts its dot at the middle of the part in view', () => {
  const path: [number, number][] = Array.from({ length: 21 }, (_, i) => [100 + i * 40, 300]);
  const card: Box = { x0: 0, y0: 56, x1: 520, y1: 700 };
  const s = slideInView(path, VIEW, [card])!;
  assert.ok(s.x > 520 && s.x < 900, `the dot is at ${s.x}`);
  assert.equal(slideInView(path, VIEW, [{ x0: 0, y0: 0, x1: 1000, y1: 700 }]), null, 'nothing in view: no dot');
  const r = solve({ items: [item('v', 300, 300, { path })], view: VIEW, blockers: [card] });
  assert.equal(r.placed.length, 1);
  assert.ok(r.placed[0].au > 0.5);
});

test('two stations whose dots stand close are kept apart: the lower ranked slides along its vessel', () => {
  const pathA: [number, number][] = Array.from({ length: 11 }, (_, i) => [300, 200 + i * 40]);
  const pathB: [number, number][] = Array.from({ length: 11 }, (_, i) => [306, 200 + i * 40]);
  const r = solve({ items: [item('a', 300, 400, { path: pathA, pri: 9 }), item('b', 306, 400, { path: pathB, pri: 3 })], view: VIEW, blockers: [] });
  const au = Object.fromEntries(r.placed.map((p) => [p.id, p.au]));
  assert.equal(au.a, 0.5);
  assert.notEqual(au.b, 0.5);
});

test('a callout stands clear of the cards and its pointer reaches its point', () => {
  const card: Box = { x0: 0, y0: 56, x1: 440, y1: 700 };
  const it = item('callout:f', 600, 300, { forms: [form(110, 56)], callout: { below: true }, must: true, pri: 500 });
  const r = solve({ items: [it], view: VIEW, blockers: [card] });
  const p = r.placed[0];
  assert.ok(p.tail, 'a callout has a pointer');
  const b = boxOf(p, it.ax, it.ay);
  assert.ok(!hits(b, grow(card, 0)));
  if (p.tail!.below) assert.ok(b.y0 >= it.ay + CALL_MIN_GAP, 'the card is below its point with room for the pointer'); else assert.ok(b.y1 <= it.ay - CALL_MIN_GAP);
  // in the open it keeps the full gap; only a band too narrow for it squeezes the gap
  assert.ok(p.tail!.below ? b.y0 >= it.ay + 18 : b.y1 <= it.ay - 18, 'with room it stands the usual 18 px or more from its point');
});


test('a name\'s leader prefers the side where it crosses no vessel (the leader over a vessel points at nothing useful)', () => {
  const it = item('a', 500, 300, { dirs: ['E', 'W'], vw: 0, minLead: 30 });
  const free = solve({ items: [it], view: VIEW, blockers: [] });
  assert.equal(free.placed[0].leader, true, 'a name with a minimum lead takes a leader');
  assert.ok(free.placed[0].dx > 0, 'without a vessel it keeps its first side, east');
  const withLine = solve({ items: [it], view: VIEW, blockers: [], lines: [[520, 100, 520, 500]], leaderLineCost: 9 });
  assert.ok(withLine.placed[0].dx < 0, 'with a vessel across the east leader, it stands west');
});

test('a must label that has to stand far off takes a spot no vessel runs under when one lies round the pocket (2D: every ring is clear)', () => {
  const pocket: Box[] = [{ x0: 0, y0: 56, x1: 470, y1: 700 }, { x0: 530, y0: 56, x1: 1000, y1: 330 }, { x0: 470, y0: 56, x1: 530, y1: 250 }];
  const lines: [number, number, number, number][] = [[470, 360, 1000, 360], [470, 340, 1000, 340], [470, 380, 1000, 380]];
  const m = item('x', 500, 300, { forms: [form(150)], must: true });
  const r = solve({ items: [m], view: VIEW, blockers: pocket, lines });
  assert.equal(r.placed.length, 1, 'it is placed');
  const b = boxOf(r.placed[0], m.ax, m.ay);
  for (const l of lines) assert.ok(!(l[1] > b.y0 && l[1] < b.y1), `it stands on the vessel at y ${l[1]} (box ${b.y0.toFixed(0)}-${b.y1.toFixed(0)})`);
  // and with every spot under a vessel, it still stands (the last resort), never dropped
  const all: [number, number, number, number][] = Array.from({ length: 30 }, (_, i) => [470, 335 + i * 13, 1000, 335 + i * 13]);
  const last = solve({ items: [m], view: VIEW, blockers: pocket, lines: all });
  assert.equal(last.placed.length, 1, 'a must label is never left off for a vessel');
});

test('a label whose near spots are taken keeps off the vessels at every far spot, and gives up a width before it stands on one (Lower IVC in Compare on a phone stood on the varices line)', () => {
  // a corridor 128 px wide (x 436-564) with the dot in it; the near spots above (a slot is left for the leader) and below are taken; a vessel runs down x = 450.
  // The wide form (120) cannot stand in the corridor without covering the vessel; the narrow one (60) can, east of it.
  const blockers: Box[] = [{ x0: 0, y0: 56, x1: 430, y1: 700 }, { x0: 570, y0: 56, x1: 1000, y1: 700 }, { x0: 436, y0: 250, x1: 490, y1: 290 }, { x0: 510, y0: 250, x1: 564, y1: 290 }, { x0: 436, y0: 310, x1: 564, y1: 340 }];
  const lines: [number, number, number, number][] = [[450, 56, 450, 700]];
  const it = item('x', 500, 300, { forms: [form(120), form(60)], must: true });
  const r = solve({ items: [it], view: VIEW, blockers, lines });
  assert.equal(r.placed.length, 1, 'it is placed');
  const p = r.placed[0], b = boxOf(p, it.ax, it.ay);
  assert.ok(!(450 > b.x0 && 450 < b.x1), `form ${p.form} stands on the vessel (box ${b.x0.toFixed(0)}-${b.x1.toFixed(0)})`);
  assert.equal(p.form, 1, 'it gives up the wide form, not the clear ground');
  // a callout or a region's name is not a label with a leader: lines never keep it out (the far spots of a callout are its normal places)
  const call = item('c', 500, 300, { forms: [form(120)], callout: { below: false } });
  assert.equal(solve({ items: [call], view: VIEW, blockers: [], lines: [[0, 50, 1000, 50], [450, 56, 450, 700], [0, 150, 1000, 150], [0, 200, 1000, 200], [0, 250, 1000, 250]] }).placed.length, 1, 'a callout is placed over lines');
});

test('a lobule name (looseFar) may stand at a far spot with a vessel under it before it is given up: the net fills the view, and 2D\'s lobule orders append the unclear spots (the bile ductule vanished on an iPhone after 5316a81e)', () => {
  // free ground: a corridor east of the dot with a vessel through it (a line under every spot there); the dot is boxed in on the other sides
  const blockers: Box[] = [{ x0: 0, y0: 56, x1: 440, y1: 700 }, { x0: 440, y0: 56, x1: 1000, y1: 270 }, { x0: 440, y0: 330, x1: 1000, y1: 700 }];
  const lines: [number, number, number, number][] = [[440, 300, 1000, 300]];
  const mk = (extra: object) => item('f', 460, 300, { forms: [form(100)], reach: 400, ...extra });
  const strict = solve({ items: [mk({})], view: VIEW, blockers, lines }), loose = solve({ items: [mk({ looseFar: true })], view: VIEW, blockers, lines });
  assert.equal(loose.placed.length, 1, 'with looseFar the name stands, over the net');
  assert.ok(strict.placed.length <= loose.placed.length);
  const src = readFileSync(new URL('../src/scene/lobule/captions.ts', import.meta.url), 'utf8');
  assert.match(src, /minLead: MIN_LEAD, looseFar: true/, 'every lobule station asks for it');
});

test('the diagnostic (?capwhy) names who stood in the way of a label\'s near spots, and costs nothing when it is not asked for', () => {
  const a = item('a', 300, 300), b = item('b', 330, 300, { pri: 1 });
  const why = new Map<string, Record<string, number>>();
  const r = solve({ items: [a, b], view: VIEW, blockers: [], why });
  assert.ok(Object.keys(why.get('b') ?? {}).some((k) => k.startsWith('label:a') || k.startsWith('dot:a') || k.startsWith('underLeader:a') || k === 'ownDot'), JSON.stringify(why.get('b')));
  assert.deepEqual(r.placed.map((p) => p.id).sort(), solve({ items: [a, b], view: VIEW, blockers: [] }).placed.map((p) => p.id).sort(), 'the answer is the same with or without it');
});

test('a station\'s name never takes the last resort of a spot over a vessel; the reader\'s own choices and the hepatic artery keep it (2D, 4 Nov: no labels covering the portal vein)', () => {
  // a corridor 140 wide that the label (138) fits only by touching the cards' edges (the last resort), with a vessel under every spot
  const blockers: Box[] = [{ x0: 0, y0: 56, x1: 430, y1: 700 }, { x0: 570, y0: 56, x1: 1000, y1: 700 }];
  const lines: [number, number, number, number][] = Array.from({ length: 40 }, (_, i) => [430, 70 + i * 14, 570, 70 + i * 14]);
  const mk = (over: Partial<Item>) => item('x', 500, 300, { forms: [form(138)], must: true, ...over });
  assert.equal(solve({ items: [mk({ offVessels: true })], view: VIEW, blockers, lines }).placed.length, 0, 'a station with no clear spot is left out');
  assert.deepEqual(solve({ items: [mk({ offVessels: true })], view: VIEW, blockers, lines }).dropped, ['x']);
  assert.equal(solve({ items: [mk({})], view: VIEW, blockers, lines }).placed.length, 1, 'a name that is not marked stands, as before (the picked, a slide\'s, the hepatic artery)');
  assert.equal(solve({ items: [mk({ offVessels: true })], view: VIEW, blockers, lines: [] }).placed.length, 1, 'with no vessel under it, it stands');
});

test('the controller marks every station name offVessels but the picked vessel, what a slide names or shows, and the hepatic artery', () => {
  const src = readFileSync(new URL('../src/scene/labels/controller.ts', import.meta.url), 'utf8');
  assert.match(src, /!picked && !isNamed && !this\.state\.shown\.has\(m\.station\.id\) && m\.station\.id !== 'HA' \? \{ offVessels: true \}/);
});

// ── Plan 27: a label keeps the spot it stands at ──
import { STAY } from '../src/scene/labels/solver.ts';

test('a legal standing spot survives every step of the picture while it moves (stay Infinity); an illegal one is left; at rest STAY holds a spot only against a small gain', () => {
  const view = { x0: 0, y0: 0, x1: 800, y1: 600 };
  const forms = [{ text: 'Hepatic artery', w: 90, h: 24 }];
  const item = (ax: number, ay: number, was?: { form: number; dx: number; dy: number }) => ({ id: 'HA', ax, ay, au: 0.5, forms, pri: 5, ...(was ? { was } : {}) });
  const first = solve({ items: [item(400, 300)], view, blockers: [] }).placed[0]!;
  // the label stands on the far side of its dot, a legal spot that is not its first choice
  const other = { form: 0, dx: -first.dx - first.w, dy: first.dy };
  assert.ok(Math.abs(other.dx - first.dx) > 20, 'a different spot');
  for (let step = 0; step < 60; step++) {
    const r = solve({ items: [item(400 + step * 0.4, 300 - step * 0.3, other)], view, blockers: [], stay: Infinity }).placed[0]!;
    assert.ok(Math.abs(r.dx - other.dx) <= 8 && Math.abs(r.dy - other.dy) <= 8, `step ${step}: it keeps its spot`);
  }
  // with no memory it goes back to its first choice (the input alone decides, as before)
  assert.ok(Math.abs(solve({ items: [item(400, 300)], view, blockers: [] }).placed[0]!.dx - first.dx) < 1e-9);
  // a spot that became illegal (a card over it) is left, whatever the stay
  const over = { x0: 400 + other.dx - 5, y0: 300 + other.dy - 5, x1: 400 + other.dx + 95, y1: 300 + other.dy + 29 };
  const moved = solve({ items: [item(400, 300, other)], view, blockers: [over], stay: Infinity }).placed[0]!;
  assert.ok(Math.abs(moved.dx - other.dx) > 8 || Math.abs(moved.dy - other.dy) > 8, 'an illegal spot is left');
  // at rest: the standing spot is worth STAY, no more (the near spots differ by a few cost units: kept; the far ring is worth more than STAY: left)
  const kept = solve({ items: [item(400, 300, other)], view, blockers: [], stay: STAY }).placed[0]!;
  assert.ok(Math.abs(kept.dx - other.dx) <= 8, 'a small gain does not move it');
  assert.ok(STAY <= 60, 'STAY is at most one long leader');
});
