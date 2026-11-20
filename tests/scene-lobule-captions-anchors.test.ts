// The lobule's names stand where 2D puts them (lobule-tract-labels.js, lobule-zoom-labels.js): each on its real vessel with a dot, a leader whenever its words stand away, never on the disc of a vessel
// seen end-on, none stranded far off at the bottom of the screen (Mohammad's Mac play-test, 19 Nov: the Bile ductule and Hepatic arteriole names floated with no leader or anchor; "Portal venule 17.2" sat
// on a vessel's edge). The layer's own numbers (captions.ts + the solver) run here on the rest shots of a Mac and a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { type CapKey, STATION_R, buildLobuleCaptions, labelledTriad, stationAt } from '../src/scene/lobule/captions.ts';
import { LEAD_ON, boxOf, solve } from '../src/scene/labels/solver.ts';
import { boxGap } from '../src/scene/labels/geometry.ts';

const net = buildLobule();
type Room = { w: number; h: number; name: string };
const ROOMS: Room[] = [{ w: 1280, h: 800, name: 'Mac' }, { w: 820, h: 1180, name: 'iPad portrait' }, { w: 390, h: 844, name: 'iPhone portrait' }, { w: 844, h: 390, name: 'iPhone landscape' }];
// the four lobule cameras (shots.ts): where the plate's point at the screen's centre is, and the zoom over the fit
const SHOTS = { lobule: { c: [0, 0], z: 1 }, 'lobule:triad': { c: [-0.88, 0], z: 2 }, 'lobule:sinusoid': { c: [-0.5, 0], z: 2 }, 'lobule:central': { c: [0, 0], z: 2 } } as const;

function run(room: Room, shot: keyof typeof SHOTS, layers = { zones: true, lymph: true }) {
  const { w, h } = room, view = { x0: 0, y0: 56, x1: w, y1: h }, free = { x0: 12, y0: 56 + 8, x1: w - 12, y1: h - 76 };
  const fw = free.x1 - free.x0, fh = free.y1 - free.y0, pxR = Math.min(fw * 0.86 / 1.732, fh * 0.9 / 1.732) * SHOTS[shot].z, cx = (free.x0 + free.x1) / 2, cy = (free.y0 + free.y1) / 2, [px0, py0] = SHOTS[shot].c;
  const proj = (x: number, y: number): [number, number] => [cx + (x - px0) * pxR, cy + (y - py0) * pxR];
  const blockers = [{ x0: w / 2 - 170, y0: h - 70, x1: w / 2 + 170, y1: h }];
  const inView = (x: number, y: number) => x > view.x0 + 64 && x < view.x1 - 64 && y > view.y0 + 64 && y < view.y1 - 64 && !blockers.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
  const c = buildLobuleCaptions({ proj, vp: { w, h }, measure: (t: string) => t.length * 6.2, net, layers, inView });
  const out = solve({ items: c.items, view, blockers, lines: c.lines, keep: c.keep });
  return { c, out, view, pxR, proj };
}

test('every station stands on its own vessel (the tract\'s real venule, arteriole, ductule and lymphatic, a sinusoid, the centre), not on the tract\'s centre', () => {
  const tri = net.triads[0]!;
  assert.deepEqual(stationAt(net, 0, 'triad'), [tri.x, tri.y]);
  assert.deepEqual(stationAt(net, 0, 'ha'), tri.ha);
  assert.deepEqual(stationAt(net, 0, 'bd'), tri.bd);
  assert.deepEqual(stationAt(net, 0, 'lymph'), tri.lv);
  assert.notDeepEqual(tri.ha, [tri.x, tri.y], 'the arteriole is not at the venule');
  // the sinusoid's dot lies on one of the tract's sinusoids (within its lumen of the course)
  const [sx, sy] = stationAt(net, 0, 'sin');
  const near = Math.min(...net.courses.filter((c) => c.kind === 's1').flatMap((c) => c.pts.map((p) => Math.hypot(p[0] - sx, p[1] - sy))));
  assert.ok(near < 1e-9, 'a sample of a drawn sinusoid');
});

for (const room of ROOMS) for (const shot of Object.keys(SHOTS) as (keyof typeof SHOTS)[]) {
  test(`${room.name}, ${shot}: each name has its dot, a leader when its words stand away, and stands clear of every vessel disc`, () => {
    const { c, out, view, pxR } = run(room, shot);
    const placed = new Map(out.placed.map((p) => [p.id, p]));
    const stations = c.items.filter((i) => !i.id.startsWith('z:'));
    // nothing is silently lost: every station is placed, or reported hidden (its vessel is off the view or under a card) or dropped
    for (const it of stations) assert.ok(placed.has(it.id) || out.hidden.includes(it.id) || out.dropped.includes(it.id), `${it.id} accounted for`);
    // the whole lobule shows its tract and its centre: those are named
    // (a name of a small vessel that finds no room with a leader is left out, ring and all, as 2D leaves out a name no slide asks for rather than put it on a vessel with no leader: only the phone held sideways,
    // where the tract's four names and the zone names share a band 130 px high, loses any. The old test passed on a six-pixel empty box standing for a name, which is no name.)
    if (shot === 'lobule') {
      assert.ok(placed.has('triad') && placed.has('cv'), `the venule and the central vein are named (placed: ${[...placed.keys()]})`);
      if (room.name !== 'iPhone landscape') assert.ok(placed.has('ha') && placed.has('bd'), `the arteriole and the ductule are named (placed: ${[...placed.keys()]})`);
    }
    for (const it of stations) assert.ok(it.forms.every((f) => f.text !== ''), `${it.id}: no form is a reading alone or an empty box (2D builds the name always)`);
    for (const it of stations) {
      const p = placed.get(it.id);
      if (!p) continue;
      const k = it.id as CapKey, box = boxOf(p, it.ax, it.ay);
      // what it clears is the vessel's own radius on the canvas
      assert.ok(Math.abs((it.vw ?? 0) - Math.max(2, STATION_R[k] * pxR)) < 1e-6, `${k}: the width it clears is the vessel's own`);
      // a leader whenever the words stand more than LEAD_ON from the vessel's edge, none when they hug it
      const gap = boxGap(box, it.ax, it.ay) - (it.vw ?? 0);
      assert.equal(p.leader, gap > LEAD_ON, `${k}: leader exactly when the name stands ${LEAD_ON}px from its vessel (gap ${gap.toFixed(1)})`);
      // never stranded: within a leader's reach of its dot, and inside the view
      assert.ok(boxGap(box, it.ax, it.ay) <= 160 + (it.vw ?? 0), `${k}: stands within a leader of its vessel (${boxGap(box, it.ax, it.ay).toFixed(0)}px)`);
      assert.ok(box.x0 >= view.x0 && box.x1 <= view.x1 && box.y0 >= view.y0 && box.y1 <= view.y1, `${k}: inside the view`);
      // never on a vessel's disc, its own included
      for (const d of c.keep) assert.ok(boxGap(box, d.x, d.y) >= d.r, `${k}'s name is clear of ${d.id}'s disc`);
    }
  });
}

test('the Portal venule name stands clear of the venule\'s own disc (it sat on the vessel edge): its words start the disc\'s radius and more from its dot', () => {
  for (const room of ROOMS) {
    const { c, out } = run(room, 'lobule');
    const it = c.items.find((i) => i.id === 'triad')!, p = out.placed.find((x) => x.id === 'triad')!;
    const d = boxGap(boxOf(p, it.ax, it.ay), it.ax, it.ay), r = c.keep.find((k) => k.id === 'triad')!.r;
    assert.ok(d >= r + 3, `${room.name}: ${d.toFixed(1)} px from the dot, the disc is ${r.toFixed(1)}`);
  }
});

test('the tract names stand on the side their vessel faces (2D FACE_COS .5: a name more than 60 degrees off its own spoke is on the wrong side of the tract)', () => {
  for (const room of ROOMS) {
    const { c, out, proj } = run(room, 'lobule');
    const t = net.triads[c.tri]!, v = proj(t.x, t.y);
    for (const k of ['ha', 'bd', 'lymph'] as const) {
      const it = c.items.find((i) => i.id === k), p = out.placed.find((x) => x.id === k);
      if (!it || !p) continue;
      const b = boxOf(p, it.ax, it.ay), q = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
      const sx = it.ax - v[0], sy = it.ay - v[1], vx = q[0]! - v[0], vy = q[1]! - v[1];
      const cos = (vx * sx + vy * sy) / ((Math.hypot(sx, sy) || 1) * (Math.hypot(vx, vy) || 1));
      // (60 degrees, 2D's FACE_COS; on the phone held upright the ductule's whole name does not fit east of the tract, which is 108 px from the screen's edge, so it stands 61 degrees round: the nearest side that
      // fits, never the wrong side of the tract)
      assert.ok(cos > (room.name === 'iPhone portrait' ? 0.45 : 0.5), `${room.name}: ${k}'s name is ${(Math.acos(cos) * 180 / Math.PI).toFixed(0)} degrees off its spoke`);
    }
  }
});

test('the labelled tract is one on screen: a tract off the view does not take the names', () => {
  const proj = (x: number, y: number): [number, number] => [400 + x * 300, 300 + y * 300];
  const lowest = labelledTriad({ proj, net });
  const y = proj(net.triads[lowest]!.x, net.triads[lowest]!.y)[1];
  const tri = labelledTriad({ proj, net, inView: (_x, yy) => yy < y - 1 });
  assert.notEqual(tri, lowest);
  assert.ok(proj(net.triads[tri]!.x, net.triads[tri]!.y)[1] < y);
});
