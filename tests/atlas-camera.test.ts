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
import { NETWORK } from '../src/scene/vessels/network.ts';
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
      const p = s.at(0.5, new Vector3());
      const near = NETWORK.filter((v) => (s.vessel ? v.id === s.vessel : v.from === s.node || v.to === s.node));
      assert.ok(near.length, s.id);
      const best = Math.min(...near.map((v) => pxDistance(rig, p, v.pts) - pxRadius(rig, p, v.radius)));
      assert.ok(best <= 2, `${s.id} at ${w}x${h}, ${name}, orbit ${orbit}: the dot is ${best.toFixed(1)} px off the tube's edge`);
      checked++;
    }
  }
  assert.ok(checked > 100);
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
      assert.ok(pxDistance(rig, p, a.pts) - pxRadius(rig, p, a.radius) <= 2, `${own.id} on its own tube (${w}x${h}, ${name}, ${orbit.toFixed(2)})`);
      assert.ok(pxDistance(rig, p, b.pts) - pxRadius(rig, p, b.radius) > 2, `${own.id} is not on ${other.id}'s tube (${w}x${h}, ${name}, ${orbit.toFixed(2)})`);
    }
  }
});

test('a point station stands at the depth of its vessel, not on the front tier: the atrium on the cava, the varices on the collaterals', () => {
  assert.equal(nodeZ('RA'), TIER_Z.back);
  assert.equal(nodeZ('VAR'), TIER_Z.mid);
  assert.ok(Math.abs(nodeZ('SIN_R') - TIER_Z.net) < 1e-9);
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
  assert.ok(/sceneApi\.setRoom\(room, undefined, stepped\)/.test(link));
  assert.ok(/sync\(s\.pos !== prev\.pos \|\| s\.stops !== prev\.stops\)/.test(link));
  const api = readFileSync('src/scene/api.ts', 'utf8');
  assert.ok(/homeTurn\) gesturesRef\.current\?\.turnOff\(\)/.test(api));
});
