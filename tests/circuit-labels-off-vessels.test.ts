// A station's reading in the Circuit stands clear of every vessel's line where any clear spot exists, as 2D's does ("a reading that sits on a vessel moves to the nearest clear spot",
// stage-label-solve.js), and the hepatic artery's caption is its name alone: 2D gives it no number ("the hepatic artery has no number to drop"). Judged on the real map's courses
// with the real solver (no DOM, no three.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptions, type CapCtx } from '../src/scene/circuit/captions.ts';
import { CIRCUIT_D, CIRCUIT_NODES, LANE_CAPTIONS } from '../src/scene/circuit/data.copied.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';
import { solve } from '../src/scene/labels/solver.ts';
import { nearestOn, segsCross } from '../src/scene/labels/geometry.ts';

const S = 0.7, OX = 40, OY = 20;
const ctx = (over: Partial<CapCtx> = {}): CapCtx => ({
  proj: (x, y) => [OX + x * S, OY + y * S], upright: false, vp: { w: 1000, h: 700 }, measure: (t, size) => t.length * size * 0.55,
  stationOn: () => true, laneDrawn: (id) => id in LANE_CAPTIONS, view: { x0: 0, y0: 0, x1: 1000, y1: 640 }, liverOpen: false, zoomed: false, compact: false,
  laneCourse: (id) => (CIRCUIT_D[id] ? courseOf(CIRCUIT_D[id]!) : null), station: (id) => CIRCUIT_NODES[id]?.at ?? null,
  res: {}, scale: S, resWidth: () => 5, resLane: () => courseOf(CIRCUIT_D['A_SMA']!), must: new Set(), halfW: () => 5, ...over,
});

const lines = (): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (const d of Object.values(CIRCUIT_D)) {
    const c = courseOf(d);
    for (let i = 1; i < c.length; i++) out.push([OX + c[i - 1]![0] * S, OY + c[i - 1]![1] * S, OX + c[i]![0] * S, OY + c[i]![1] * S]);
  }
  return out;
};
const crosses = (l: readonly number[], b: { x0: number; y0: number; x1: number; y1: number }): boolean => {
  // sample the segment (cheap and exact enough for a box test)
  for (let t = 0; t <= 1; t += 0.02) { const x = l[0]! + (l[2]! - l[0]!) * t, y = l[1]! + (l[3]! - l[1]!) * t; if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true; }
  return false;
};

test('the hepatic artery is named, with no number (2D: no reading for it)', () => {
  const ha = buildCaptions(ctx()).meta.get('HA');
  assert.ok(ha, 'it shows');
  assert.ok(ha!.forms.length >= 1);
  assert.ok(ha!.forms.every((f) => !f.value), 'no form of it carries a reading');
  assert.ok(ha!.forms.every((f) => f.name !== ''), 'and none is a bare number');
});

test('every station item asks to stand clear of the vessel lines (the solver then takes a clear spot when one exists)', () => {
  const built = buildCaptions(ctx());
  const st = built.items.filter((i) => built.meta.get(i.id)?.kind === 'station');
  assert.ok(st.length > 10);
  assert.deepEqual(st.filter((i) => !i.clearLines).map((i) => i.id), []);
});

test('on the map, the stations\' names stand off the vessels (19 before: the dense left side may keep a few)', () => {
  const built = buildCaptions(ctx());
  const ln = lines();
  const out = solve({ items: built.items, view: { x0: 0, y0: 0, x1: 1000, y1: 640 }, blockers: [], lines: ln, leaderLineCost: 30 });
  const byId = new Map(built.items.map((i) => [i.id, i]));
  const on: string[] = [];
  for (const p of out.placed) {
    if (built.meta.get(p.id)?.kind !== 'station') continue;
    const it = byId.get(p.id)!;
    const box = { x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h };
    if (ln.some((l) => crosses(l, box))) on.push(p.id);
  }
  // (22 Nov: a leader never crosses a vessel, so a name whose only clear spot lay behind one now stands beside its vessel, on the lines round it, where 8 stood clear on a leader across them: the dense
  // left side keeps these, the leaders are the ones the owner saw run across the sinusoid ovals)
  assert.ok(on.length <= 16, `on a vessel: ${on.join(', ')}`);
  for (const p of out.placed) {
    if (!p.leader) continue;
    const it = byId.get(p.id)!, [px, py] = nearestOn({ x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h }, it.ax, it.ay);
    const len = Math.hypot(px - it.ax, py - it.ay), k = Math.min(1, ((it.vw ?? 0) + 4) / len);
    const from: [number, number, number, number] = [it.ax + (px - it.ax) * k, it.ay + (py - it.ay) * k, px, py];
    assert.deepEqual(ln.filter((l) => segsCross(from, l)).length, 0, `${p.id}'s leader crosses a vessel`);
  }
});

test('no station caption is a number alone: every form of it carries its name', () => {
  const built = buildCaptions(ctx());
  for (const [id, m] of built.meta) if (m.kind === 'station') assert.ok(m.forms.every((f) => f.name !== ''), `${id} has a bare-number form`);
});

test('upright (a phone or a portrait iPad): the stations that stand stand with their names, never as a bare number', () => {
  const up = (x: number, y: number): [number, number] => [20 + y * 0.45, 30 + (1330 - x) * 0.45];
  const c = ctx({ upright: true, proj: up, scale: 0.45, vp: { w: 700, h: 760 }, view: { x0: 0, y0: 0, x1: 700, y1: 760 }, compact: true });
  const built = buildCaptions(c);
  const ln: [number, number, number, number][] = [];
  for (const d of Object.values(CIRCUIT_D)) { const cs = courseOf(d); for (let i = 1; i < cs.length; i++) { const a = up(cs[i - 1]![0], cs[i - 1]![1]), b = up(cs[i]![0], cs[i]![1]); ln.push([a[0], a[1], b[0], b[1]]); } }
  const out = solve({ items: built.items, view: c.view, blockers: [], lines: ln, leaderLineCost: 30 });
  for (const p of out.placed) { const m = built.meta.get(p.id); if (m?.kind === 'station') assert.notEqual(m.forms[p.form]!.name, '', `${p.id} stands as a bare number`); }
});

test('a resistor reading is never dropped or left on a station name: it moves to a free spot (phone play-test: "Hepatic artery" on "R liver")', () => {
  for (const S of [0.2, 0.25, 0.3, 0.35]) for (const must of [[], ['HA']]) {
    const up = (x: number, y: number): [number, number] => [20 + y * S, 30 + (1330 - x) * S];
    const c = ctx({ upright: true, proj: up, scale: S, vp: { w: 390, h: 700 }, view: { x0: 0, y0: 0, x1: 390, y1: 700 }, compact: true, res: { rLiver: 8.4, rColl: 1.2 }, resLane: () => courseOf(CIRCUIT_D['C1b']!), must: new Set(must) });
    const built = buildCaptions(c);
    const ln: [number, number, number, number][] = [];
    for (const d of Object.values(CIRCUIT_D)) { const cs = courseOf(d); for (let i = 1; i < cs.length; i++) { const a = up(cs[i - 1]![0], cs[i - 1]![1]), b = up(cs[i]![0], cs[i]![1]); ln.push([a[0], a[1], b[0], b[1]]); } }
    const out = solve({ items: built.items, view: c.view, blockers: [], lines: ln, leaderLineCost: 30 });
    const by = new Map(built.items.map((i) => [i.id, i]));
    const box = (id: string) => { const p = out.placed.find((q) => q.id === id)!; const it = by.get(id)!; return { x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h }; };
    assert.deepEqual(out.dropped.filter((d) => d.startsWith('res:')), [], `scale ${S}: a reading was dropped`);
    for (const k of ['res:rLiver', 'res:rColl']) for (const p of out.placed) {
      if (p.id === k || p.id.startsWith('z:')) continue;
      const a = box(p.id), b = box(k);
      assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `scale ${S}: ${k} stands on ${p.id}`);
    }
  }
});
