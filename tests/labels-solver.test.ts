import { test } from 'node:test';
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
  const withLine = solve({ items: [it], view: VIEW, blockers: [], lines: [[520, 100, 520, 500]] });
  assert.ok(withLine.placed[0].dx < 0, 'with a vessel across the east leader, it stands west');
});
