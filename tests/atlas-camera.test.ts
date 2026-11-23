// The atlas camera and the label anchors (atlas-look-plan §6, §7; owner's decision B, 19 Nov 2026): the anatomy rests face on with a long lens so the plate lines
// up with the 2D app's, and every label dot stands on the vessel it names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { FOV, SHOTS, lensDistance, type ShotName } from '../src/scene/camera/shots.ts';
import { fitDistance, fullRoom } from '../src/scene/camera/room.ts';
import { ORBIT_LIMIT } from '../src/scene/camera/shots.ts';
import { NETWORK, NETWORK_BY_ID, NODE_Z } from '../src/scene/vessels/network.ts';
import { REST as AT_REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { STATIONS, nodeZ } from '../src/scene/labels/stations.ts';
import { TIER_Z } from '../src/scene/frame2d.ts';

const REST: ShotName[] = ['title', 'play', 'pick'];

test('the rest shots look straight at the plate: yaw 0, pitch 0; the catheter shots keep only a small turn', () => {
  for (const n of REST) { assert.equal(SHOTS[n].yaw, 0, n); assert.equal(SHOTS[n].pitch, 0, n); }
  for (const n of ['route', 'free', 'wedge', 'hvpg'] as const) { assert.ok(Math.abs(SHOTS[n].yaw) <= 0.2 && Math.abs(SHOTS[n].pitch) <= 0.05, n); }
});

test('the lens is long (14°), and a shot frames what it framed at 30°: the distance scales with the lens', () => {
  assert.equal(FOV, 14);
  // the half height seen at the distance is what the old lens saw at the old one
  for (const [name, old] of [['title', 7], ['route', 3.7], ['wedge', 3.0], ['play', 7.6], ['pick', 5.5]] as const) {
    const seen = SHOTS[name].r * Math.tan((FOV * Math.PI) / 360), was = old * Math.tan((15 * Math.PI) / 180);
    assert.ok(Math.abs(seen - was) < 1e-9, name);
  }
  assert.ok(Math.abs(lensDistance(5, 30) - 5) < 1e-9);
  // the room solver follows the same lens: the same half extents need the longer distance
  assert.ok(fitDistance([2, 1.8], fullRoom(900, 700), 700) > 12);
});

/** A vessel's course as it is drawn (its depth eases to its end nodes': shape.ts), which is what a dot has to stand on. */
const drawn = (id: string) => coursesOf(NETWORK_BY_ID.get(id)!, AT_REST)[0]!.pts;

/** The canvas distance (px) from a point to a polyline, both given in scene units, and the pixel radius of a tube at that depth. */
function pxDistance(rig: CameraRig, p: Vector3, line: readonly (readonly number[])[]): number {
  const a = rig.project(p), pts = line.map((q) => rig.project(new Vector3(q[0]!, q[1]!, q[2]!)));
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [u, v] = [pts[i]!, pts[i + 1]!], dx = v.x - u.x, dy = v.y - u.y;
    const t = Math.max(0, Math.min(1, ((a.x - u.x) * dx + (a.y - u.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a.x - u.x - t * dx, a.y - u.y - t * dy));
  }
  return best;
}
const pxRadius = (rig: CameraRig, p: Vector3, radius: number): number => {
  const right = new Vector3(1, 0, 0).applyQuaternion(rig.camera.quaternion);
  const a = rig.project(p), b = rig.project(p.clone().addScaledVector(right, radius));
  return Math.hypot(b.x - a.x, b.y - a.y);
};

test('every station dot stands on a vessel it names: inside the drawn tube (+2 px) at each rest shot, a phone and a laptop, face on and turned', () => {
  const sizes: [number, number, number][] = [[390, 700, 0], [1280, 800, 0], [1280, 800, 0.4], [390, 700, -0.4]];
  let checked = 0;
  for (const [w, h, orbit] of sizes) for (const name of REST) {
    const rig = new CameraRig(name);
    rig.resize(w, h);
    rig.goTo(name, fullRoom(w, h), 0, 0); rig.update(0); rig.setOrbit(orbit); rig.update(1);
    for (const s of STATIONS) {
      if (s.kind === 'organ') continue;
    for (const u of s.slides ? [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] : [0.5]) {
      const p = s.at(u, new Vector3());
      const near = NETWORK.filter((v) => (s.vessel ? v.id === s.vessel : v.from === s.node || v.to === s.node));
      assert.ok(near.length, s.id);
      const best = Math.min(...near.map((v) => pxDistance(rig, p, drawn(v.id)) - pxRadius(rig, p, v.radius)));
      assert.ok(best <= 2, `${s.id} at u=${u}, ${w}x${h}, ${name}, orbit ${orbit}: the dot is ${best.toFixed(1)} px off the tube's edge`);
      checked++;
    }
    }
  }
  assert.ok(checked > 500);
});

test('Lower IVC and the SMV: at every rest shot and across the whole ±25° turn, each dot (and so its leader tip) stays on its own tube, never on the other', () => {
  const ivc = STATIONS.find((s) => s.id === 'IVCI')!, smv = STATIONS.find((s) => s.id === 'SMV')!;
  assert.ok(ivc.vessel && smv.vessel && ivc.vessel !== smv.vessel);
  const tube = (id: string) => NETWORK.find((v) => v.id === id)!;
  for (const [w, h] of [[390, 700], [1280, 800]] as const) for (const name of REST) for (let k = -5; k <= 5; k++) {
    const orbit = (k / 5) * ORBIT_LIMIT;
    const rig = new CameraRig(name);
    rig.resize(w, h); rig.goTo(name, fullRoom(w, h), 0, 0); rig.update(0); rig.setOrbit(orbit); rig.update(1);
    for (const [own, other] of [[ivc, smv], [smv, ivc]] as const) {
      const p = own.at(0.5, new Vector3()), a = tube(own.vessel!), b = tube(other.vessel!);
      assert.ok(pxDistance(rig, p, drawn(a.id)) - pxRadius(rig, p, a.radius) <= 2, `${own.id} on its own tube (${w}x${h}, ${name}, ${orbit.toFixed(2)})`);
      // (turned far enough, the front tier's vessels project over the back tier's cava: a real overlap in the picture, not a mislabel; the other-tube check holds while the turn is small)
      if (Math.abs(orbit) <= 0.2) assert.ok(pxDistance(rig, p, drawn(b.id)) - pxRadius(rig, p, b.radius) > 2, `${own.id} is not on ${other.id}'s tube (${w}x${h}, ${name}, ${orbit.toFixed(2)})`);
    }
  }
});

test('a point station stands at the depth of its vessel, not on the front tier: the atrium on the cava, the varices on the collaterals', () => {
  assert.equal(nodeZ('RA'), TIER_Z.back);
  assert.ok(Math.abs(nodeZ('VAR') - TIER_Z.mid) < 0.05);
  for (const id of ['RA', 'SIN_R', 'VAR']) assert.equal(nodeZ(id), NODE_Z.get(id), `${id}: where the vessels that meet there are drawn`);
  for (const id of ['RA', 'SIN_R', 'VAR']) {
    const s = STATIONS.find((x) => x.id === id)!;
    assert.equal(s.at(0, new Vector3()).z, nodeZ(id), id);
  }
});

test('nothing in the camera or the labels reads the first slice\'s placeholder courses (anatomy/vessels.ts HOSTS, VESSELS, CHAINS)', () => {
  for (const f of ['src/scene/labels/stations.ts', 'src/scene/camera/rig.ts', 'src/scene/camera/room.ts', 'src/scene/camera/shots.ts', 'src/scene/gesture/controller.ts']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\b(VESSELS|HOSTS|CHAINS|VESSEL_IDS|buildVessel)\b/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), f);
    assert.ok(!/from '[^']*anatomy\/vessels\.ts'/.test(src.replace(/import type[^\n]*\n/g, '')), `${f} imports only the Vec3 type from anatomy/vessels.ts`);
  }
});

test('the deck link tells the camera a step happened, so a slide on the same shot brings the turn home', () => {
  const link = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
  assert.ok(/frameRoom\(room, undefined, undefined, stepped\)/.test(link));
  assert.ok(/sync\(s\.pos !== prev\.pos \|\| s\.stops !== prev\.stops\)/.test(link));
  const api = readFileSync('src/scene/api.ts', 'utf8');
  assert.ok(/homeTurn\) gesturesRef\.current\?\.turnOff\(\)/.test(api));
});

test('the cava runs straight up the figure at one depth to the hepatic junction, with no rise there (a rise and a fall to the atrium was the kink at its upper end: Mohammad, 20 Nov), and the dot is on the tube at the junction end (iPhone, 19 Nov)', () => {
  const low = drawn('IVC_IS'), cava = drawn('IVCS_RA');
  for (const p of low) assert.ok(Math.abs(p[2] - low[0]![2]) < 1e-6, 'the lower cava is at one depth');
  assert.ok(Math.abs(cava[0]![2] - low[low.length - 1]![2]) < 1e-6, 'the cava leaves the junction at the depth it arrived at');
  const ivc = STATIONS.find((x) => x.id === 'IVCS')!;
  assert.ok(Math.abs(ivc.at(0, new Vector3()).z - cava[0]![2]) < 1e-6, 'the dot at the junction end is at the depth the tube is drawn at there, not the tier\'s');
});

// ── a station's dot does not move with the zoom ──
import { DOT_UNITS, stationById } from '../src/scene/labels/stations.ts';
import { LabelController, NO_STATE as NO_LABEL_STATE, type LabelDeps as LDeps } from '../src/scene/labels/controller.ts';
import { CameraRig as Rig } from '../src/scene/camera/rig.ts';
import { Vector3 as Vec } from 'three';

test('every station keeps its dot at every zoom: "Lower IVC" stands on the cava below the portal confluence, not beside it, zoomed in or out (Mac play-test, 20 Nov)', () => {
  const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, room = { x: 0, y: 0, w: 1440, h: 900 };
  const measure: LDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
  const at = (k: number) => {
    const rig = new Rig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0); rig.setHand({ k, x: 0, y: 0 }); rig.update(0);
    let t = 1000;
    const deps = { now: () => t, project: (p: Vec, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => rig.isMoving, free: () => ({ x0: 0, y0: 0, x1: vp.w, y1: vp.h }), view: () => ({ x0: 0, y0: 56, x1: vp.w, y1: vp.h }), vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, level: () => 'all' } as unknown as LDeps;
    const ctl = new LabelController(deps); ctl.setState({ ...NO_LABEL_STATE, organNames: true });
    for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
    const out = new Map<string, { x: number; y: number }>();
    for (const d of ctl.out) if (d.anchor) out.set(d.id, d.anchor);   // (the point the name stands for: a name beside its vessel has no ring, plan 21)
    return { rig, out };
  };
  const iv = stationById('IVCI')!, conf = stationById('CONF')!;
  assert.ok(Math.hypot(iv.at(iv.u0, new Vec()).x - conf.at(conf.u0, new Vec()).x, iv.at(iv.u0, new Vec()).y - conf.at(conf.u0, new Vec()).y) >= DOT_UNITS - 1e-6, 'at rest the two dots are a fixed distance apart in the plate');
  for (const k of [0.8, 1, 1.6, 2.4]) {
    const { rig, out } = at(k);
    for (const id of ['IVCI', 'CONF', 'RHV', 'SMV']) {
      const s = stationById(id)!, want = rig.project(s.at(s.u0, new Vec()), { x: 0, y: 0 }), got = out.get(id);
      if (!got) continue;   // (off the screen at that zoom: not placed)
      assert.ok(Math.hypot(got.x - want.x, got.y - want.y) < 1.5, `${id} at zoom ${k}: dot ${got.x.toFixed(0)},${got.y.toFixed(0)} is not where its fixed place projects (${want.x.toFixed(0)},${want.y.toFixed(0)})`);
    }
    assert.ok(out.has('IVCI') || k > 2, `Lower IVC stands at zoom ${k}`);
  }
});

// ── the play shot frames what the figure draws, not the plate ──
import { ORGANS as ORGANS_2D } from '../src/scene/labels/organ2d/outlines.copied.js';
import { flattenPath as flatten2D } from '../src/scene/labels/organ2d/flatten.js';
import { figureCourses } from '../src/scene/labels/stations.ts';

test('the play shot\'s middle and half extents hold every organ outline and every vessel course at rest (it framed the plate, which is less: the foot was cut off in a short room: Tests sheet up, a slide)', () => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const o of ORGANS_2D as { ring?: string; d?: string }[]) for (const p of flatten2D((o.ring ?? o.d)!, 4) as { pts: number[] }[]) for (let i = 0; i < p.pts.length; i += 2) grow(p.pts[i]!, p.pts[i + 1]!);
  for (const c of figureCourses()) { if (c.v.kind === 'collateral' || c.v.kind === 'shunt') continue; for (const q of c.pts) grow(q.x * 300 + 700, -q.y * 300 + 556); }
  const s = SHOTS.play, cx = s.target[0] * 300 + 700, cy = -s.target[1] * 300 + 556;
  assert.ok(cx - s.half[0] * 300 <= x0 + 3 && cx + s.half[0] * 300 >= x1 - 3, `x ${x0.toFixed(0)}..${x1.toFixed(0)} against ${(cx - s.half[0] * 300).toFixed(0)}..${(cx + s.half[0] * 300).toFixed(0)}`);
  assert.ok(cy - s.half[1] * 300 <= y0 + 3 && cy + s.half[1] * 300 >= y1 - 3, `y ${y0.toFixed(0)}..${y1.toFixed(0)} against ${(cy - s.half[1] * 300).toFixed(0)}..${(cy + s.half[1] * 300).toFixed(0)}`);
});
