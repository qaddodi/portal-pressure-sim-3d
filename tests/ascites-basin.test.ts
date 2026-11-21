// One belly, with a water top (21 Nov 2026, ascites package A). Root cause pinned: the pool, the flank line (the belly wall) and the tap test each had a depth constant of their own (0.28, -0.4, a plane at 0.28),
// so on a turn of the figure the pool slid off its own wall (about 86 2D units at 25 degrees) and off the bowel it washes. They now share one plane, `bellyZ()` (the gut's, organs/z.ts).
// Node only: three's math with no renderer; the vertex shader's sums are written again here from the same exported numbers (poolLift, poolDome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import {
  AscitesLayer, DOME, DOME_R, SHELL_BACK, LIVING_TAU, POOL_COLS, POOL_COMMON_GLSL, POOL_FS, POOL_ROWS, POOL_STEP, POOL_VS, POOL_X0, bellyZ, bulgeStep, outlinePolygon, poolDome, poolLift,
} from '../src/scene/disease/ascites.ts';
import { TOP_ELEV_FROM, TOP_ELEV_TO, topFS, topShow, topVS } from '../src/scene/disease/ascites-top.ts';
import { Landmarks, flankPoints } from '../src/scene/disease/landmarks.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { FOV, SHOTS } from '../src/scene/camera/shots.ts';
import { lensDistance } from '../src/scene/camera/shots.ts';
import { x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';

const W = 1440, H = 900, VOLUMES = [800, 2500, 5000, 8500];
type Pos = [number, number, number];
const D2R = Math.PI / 180;

/** The camera as the rig writes it (camera/rig.ts): the `play` shot turned by yaw and pitch about its target. */
function camera(yaw: number, pitch: number): PerspectiveCamera {
  const s = SHOTS.play, r = s.r, cp = Math.cos(pitch), [tx, ty, tz] = s.target;
  const cam = new PerspectiveCamera(FOV, W / H, r * 0.02, r * 120);
  cam.position.set(tx + Math.sin(yaw) * cp * r, ty + Math.sin(pitch) * r, tz + Math.cos(yaw) * cp * r);
  cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
}
const screen = (cam: PerspectiveCamera, p: Pos): { x: number; y: number } => { const v = new Vector3(...p).project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; };
const pxuAt = (cam: PerspectiveCamera, p: Pos): number => { const v = new Vector3(...p).applyMatrix4(cam.matrixWorldInverse); return cam.projectionMatrix.elements[5]! * H * 0.5 / Math.max(-v.z, 1e-3) / 300; };

type Geo = { getAttribute(n: string): { array: Float32Array } };
const attrs = (m: unknown) => { const g = (m as { geometry: Geo }).geometry; return { pos: g.getAttribute('position').array, aD: g.getAttribute('aD')?.array, aW: g.getAttribute('aW')?.array as Float32Array }; };
const poolOf = (a: AscitesLayer) => a.group.children[0]!;
const topOf = (a: AscitesLayer) => a.group.children[1]!;

/** A pool vertex as the vertex shader draws it: the lift of the water and the swell (living share `live`), ripple off. */
function drawn(cam: PerspectiveCamera, p: Pos, aW: number, aD: number, live: number, swell = true): Pos {
  const pxu = pxuAt(cam, p), lift = poolLift({ wx: x2d(p[0]), aW, aD, phase: 0, amp: 0, slosh: 0, living: live, pxu });
  return [p[0], p[1] + lift / 300, p[2] + (swell ? live * DOME * poolDome(aW) : 0)];
}
const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** The worst distance (CSS px) from a pool wall vertex (aW 0) to the flank polyline, both projected; the pool drawn at `zPool`, the flank at `zFlank`. */
function wallError(ml: number, yaw: number, pitch: number, zPool: number, zFlank: number): number {
  const a = new AscitesLayer(); a.set(ml);
  const { pos, aD, aW } = attrs(poolOf(a)), cam = camera(yaw, pitch);
  const line = flankPoints(bulgeStep(ml)).map((p) => screen(cam, [x3(p[0]), y3(p[1]), zFlank]));
  let worst = 0, n = 0;
  for (let v = 0; v < aW.length; v++) {
    if (aW[v]! > 1e-3 || v % POOL_ROWS !== POOL_ROWS - 1 || !(aD![v]! > 0)) continue;   // (the floor row of a column that holds water: it lies on the wall)
    const q = screen(cam, [pos[v * 3]!, pos[v * 3 + 1]!, zPool]);
    let best = Infinity;
    for (let i = 1; i < line.length; i++) best = Math.min(best, segDist(q, line[i - 1]!, line[i]!));
    worst = Math.max(worst, best); n++;
  }
  a.dispose();
  assert.ok(n > 30, `${ml} mL: ${n} wall vertices`);
  return worst;
}

test('one belly: the pool, the flank ribbon and the tap lie on the gut\'s own plane, bellyZ()', () => {
  assert.equal(bellyZ(), ORGAN_Z.bowel, 'the bowel\'s plane (organs/z.ts)');
  for (const ml of VOLUMES) {
    const a = new AscitesLayer(); a.set(ml);
    const { pos, aW } = attrs(poolOf(a));
    let wall = 0;
    for (let v = 0; v < aW.length; v++) { assert.ok(Math.abs(pos[v * 3 + 2]! - bellyZ()) < 1e-6, `${ml} mL: every pool vertex lies on bellyZ before the shader's swell`); if (aW[v]! < 1e-3) wall++; }
    assert.ok(wall > 30);
    assert.equal(poolDome(0), 0, 'the swell is zero on the wall, so a wall vertex stays exactly on bellyZ in the shader');
    const l = new Landmarks(); l.setAscites(ml);
    const fp = attrs((l.group.children as unknown[])[0]).pos;
    for (let i = 0; i < fp.length / 3; i++) assert.ok(Math.abs(fp[i * 3 + 2]! - bellyZ()) < 1e-6, `${ml} mL: the flank ribbon lies on bellyZ`);
    l.dispose(); a.dispose();
  }
  // the organ depth switch only shades the organs, it never moves them in z: the belly plane has no share of it
  assert.doesNotMatch(readFileSync('src/scene/organs/layer.ts', 'utf8'), /scale\.z|position\.z\s*=|translate\([^)]*uDepth/);
});

test('no depth constant of its own is left: FLUID_Z, FLANK_Z and the tap\'s plane are gone', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
  for (const f of walk('src')) { const t = readFileSync(f, 'utf8'); assert.doesNotMatch(t, /FLUID_Z|FLANK_Z/, `${f} still names a belly depth of its own`); }
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(scene, /ascites\.pick\(raycaster\)/, 'the tap casts a ray at what is drawn');
  assert.doesNotMatch(scene, /intersectPlane\(new Plane\(new Vector3\(0, 0, 1\), -FLUID/);
});

test('a turn keeps the pool on its wall: every wall vertex projects within 1 px of the flank line (yaw +-25, pitch +-12)', () => {
  for (const ml of VOLUMES) for (const yaw of [-25, 0, 25]) for (const pitch of [-12, 0, 12]) {
    const e = wallError(ml, yaw * D2R, pitch * D2R, bellyZ(), bellyZ());
    assert.ok(e < 1, `${ml} mL, yaw ${yaw}, pitch ${pitch}: worst ${e.toFixed(3)} px`);
  }
});

test('the test bites: with the old depths (pool 0.28, flank -0.4) the pool is far off its wall at a full turn', () => {
  const e = wallError(5000, 25 * D2R, 0, 0.28, -0.4);
  assert.ok(e > 20, `old depths drift ${e.toFixed(1)} px at yaw 25`);
  assert.ok(e > 3 * wallError(5000, 0, 0, 0.28, -0.4), 'and it is worse turned than head-on (head-on the long lens hides most of it, which is why 2D comparisons never caught it)');
});

test('head-on the swell does not move 2D\'s surface: within 1.5 px at x 400, 712 and 1024 (and over every column)', () => {
  const cam = camera(0, 0);
  for (const ml of [800, 2500, 5000, 8500]) {
    const a = new AscitesLayer(); a.set(ml);
    const { pos, aD, aW } = attrs(poolOf(a));
    let worst = 0, at = 0;
    for (let c = 0; c < POOL_COLS; c++) {
      const v = c * POOL_ROWS, floor = v + POOL_ROWS - 1;
      if (!(aD![floor]! > 0)) continue;   // a column outside the cavity holds no water
      const p: Pos = [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!];
      const flat = screen(cam, drawn(cam, p, aW[v]!, 0, 1, false)), swelled = screen(cam, drawn(cam, p, aW[v]!, 0, 1, true));
      const d = Math.hypot(flat.x - swelled.x, flat.y - swelled.y);
      if (d > worst) { worst = d; at = POOL_X0 + c * POOL_STEP; }
    }
    assert.ok(worst < 1.5, `${ml} mL: the surface moves ${worst.toFixed(2)} px head-on (at x ${at})`);
    for (const x of [400, 712, 1024]) {
      const c = (x - POOL_X0) / POOL_STEP, v = c * POOL_ROWS;
      if (!(aD![v + POOL_ROWS - 1]! > 0)) continue;
      const p: Pos = [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!];
      const f = screen(cam, drawn(cam, p, aW[v]!, 0, 1, false)), s = screen(cam, drawn(cam, p, aW[v]!, 0, 1, true));
      assert.ok(Math.hypot(f.x - s.x, f.y - s.y) < 1.5, `${ml} mL, x ${x}`);
    }
    a.dispose();
  }
});

test('the swell is an elliptic dome: 0 on the wall, the whole by DOME_R, monotone, and it stays inside its 0.075 unit budget', () => {
  assert.equal(poolDome(0), 0); assert.equal(poolDome(DOME_R), 1); assert.equal(poolDome(DOME_R * 3), 1);
  let prev = -1; for (let w = 0; w <= DOME_R; w += 5) { const d = poolDome(w); assert.ok(d >= prev); prev = d; }
  assert.ok(poolDome(DOME_R / 2) > 0.8 && poolDome(DOME_R / 2) < 0.9, 'elliptic: 0.87 at half way');
  assert.match(POOL_COMMON_GLSL, new RegExp(`uLiving \\* ${DOME}\\d* \\* sqrt\\(`), 'the shader\'s swell is the same sum, scaled by the living share');
  assert.match(POOL_COMMON_GLSL, new RegExp(`aW / ${DOME_R}\\.0`));
  assert.match(POOL_VS, /p\.z \+= poolSwell\(aW\)/);
});

test('the water\'s top: gone head-on and from below, whole with a 12 degree tilt down, at least 15 px deep at 8500 mL', () => {
  const a = new AscitesLayer(); a.set(8500);
  const { pos, aW } = attrs(topOf(a)), aH = (topOf(a) as unknown as { geometry: Geo }).geometry.getAttribute('aH').array;
  const column = (c: number): Pos[] => [0, 1].map((k) => { const v = 2 * c + k; return [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!]; });
  const show = (cam: PerspectiveCamera, c: number): number => { const [f] = column(c); const toCam = cam.position.clone().sub(new Vector3(...f!)).normalize(); return topShow(toCam.y, aH[2 * c]!); };
  const mid = (712 - POOL_X0) / POOL_STEP;
  // head-on (pitch 0) and from below: nothing shows, at any volume and any column
  for (const ml of VOLUMES) {
    const b = new AscitesLayer(); b.set(ml);
    const tp = attrs(topOf(b)).pos, th = (topOf(b) as unknown as { geometry: Geo }).geometry.getAttribute('aH').array;
    for (const pitch of [0, -12 * D2R]) {
      const cam = camera(0, pitch);
      for (let c = 0; c < POOL_COLS; c++) {
        const toCam = cam.position.clone().sub(new Vector3(tp[2 * c * 3]!, tp[2 * c * 3 + 1]!, tp[2 * c * 3 + 2]!)).normalize();
        assert.ok(topShow(toCam.y, th[2 * c]!) < 1e-6, `${ml} mL, pitch ${(pitch / D2R).toFixed(0)}: the top is not drawn (column ${c}, elevation sine ${toCam.y.toFixed(3)})`);
      }
    }
    b.dispose();
  }
  // tilted down 12 degrees: whole, a lens in the surface at least 6 px tall in the middle of the belly
  const down = camera(0, 12 * D2R), cf = screen(down, drawn(down, column(mid)[0]!, aW[2 * mid]!, 0, 1)), cb = screen(down, drawn(down, column(mid)[1]!, aW[2 * mid]!, 0, 1));
  const back = { ...drawn(down, column(mid)[1]!, aW[2 * mid + 1]!, 0, 1) };   // (the back vertex is the front's mirror)
  void back;
  const z0 = bellyZ(), sw = DOME * poolDome(aW[2 * mid]!);
  const front = screen(down, [column(mid)[0]![0], column(mid)[0]![1], z0 + sw]), rear = screen(down, [column(mid)[0]![0], column(mid)[0]![1], z0 - SHELL_BACK]);
  assert.ok(Math.abs(front.y - rear.y) >= 15, `the top is ${Math.abs(front.y - rear.y).toFixed(1)} px tall at x 712 with a 12 degree tilt`);
  void cf; void cb;
  assert.ok(show(down, mid) > 0.99, `whole at 12 degrees (${show(down, mid).toFixed(3)})`);
  assert.ok(front.y > rear.y, 'the back edge is higher on the screen than the front edge: it is a surface seen from above');
  // the front face winds toward the viewer from above (counter-clockwise on the screen) and away from below: the material culls what faces away
  const area = (cam: PerspectiveCamera): number => {
    const c = mid, f0 = column(c)[0]!, b0: Pos = [f0[0], f0[1], z0 - SHELL_BACK], f1 = column(c + 1)[0]!;
    const P = [screen(cam, [f0[0], f0[1], z0 + sw]), screen(cam, [f1[0], f1[1], z0 + DOME * poolDome(aW[2 * (c + 1)]!)]), screen(cam, b0)];
    return ((P[1]!.x - P[0]!.x) * (P[2]!.y - P[0]!.y) - (P[2]!.x - P[0]!.x) * (P[1]!.y - P[0]!.y)) * -1;   // (screen y is down: negate for a counter-clockwise sign)
  };
  assert.ok(area(camera(0, 12 * D2R)) > 0, 'seen from above it is front-facing');
  assert.ok(area(camera(0, -12 * D2R)) < 0, 'seen from below it is back-facing (culled), so it is never drawn from below');
  a.dispose();
});

test('the top is a strip on the surface: its ends have no width, a first film has no top, and it fades with the volume', () => {
  const a = new AscitesLayer(); a.set(5000);
  const { aW } = attrs(topOf(a));
  const aH = (topOf(a) as unknown as { geometry: Geo }).geometry.getAttribute('aH').array;
  let first = -1; for (let c = 0; c < POOL_COLS; c++) if (aH[2 * c]! > 0) { first = c; break; }
  assert.ok(first >= 0 && aH[2 * first]! < 20 && topShow(1, aH[2 * first]!) < 1, 'the first water column is a film: its top is faded out by depth');
  assert.ok(aW[2 * first]! < 40, 'and it lies at the wall, where the swell is small');
  assert.match(topVS(), /uLiving/); assert.match(topFS(), /uOpacity/);
  assert.equal(topOf(a).renderOrder, poolOf(a).renderOrder);
  assert.equal((topOf(a) as unknown as { material: { depthTest: boolean; depthWrite: boolean; name: string } }).material.depthTest, false);
  const small = new AscitesLayer(); small.set(0);
  assert.equal(topOf(small).visible, false, 'no water, no top');
  a.dispose(); small.dispose();
});

test('the pool has no pale rim and its alpha is never boosted above 2D\'s', () => {
  assert.doesNotMatch(POOL_FS, /rim/i);
  assert.doesNotMatch(POOL_FS, /\(1\.0 \+/);
  assert.match(POOL_FS, /gl_FragColor = vec4\(c, min\(1\.0, a \* edge\) \* uOpacity\);/);
  assert.doesNotMatch(topFS(), /rim/i);
  assert.ok(TOP_ELEV_FROM > 0.082 && TOP_ELEV_TO > TOP_ELEV_FROM, 'the top starts above the head-on perspective elevation of the lowest surface');
});

test('Living fluid off is 2D\'s flat pool with no top, and the switch glides (LIVING_TAU)', () => {
  const a = new AscitesLayer(); a.set(5000);
  assert.equal(a.living, 1);
  a.setLiving(false);
  const l0 = a.living; a.step(0.016, 1);
  assert.ok(a.living < l0 && a.living > 0.5, `it glides, not snaps (${a.living.toFixed(3)})`);
  const expected = Math.exp(-0.016 / LIVING_TAU);
  assert.ok(Math.abs(a.living - expected) < 0.02, 'the glide is the LIVING_TAU exponential');
  for (let i = 0; i < 400; i++) a.step(0.016, 1);
  assert.equal(a.living, 0);
  // the shader's swell and the top both scale with the living share, so at 0 the pool lies flat on bellyZ and the top shows nothing
  assert.equal(poolLift({ wx: 500, aW: 0, aD: 0, phase: 0, amp: 0, slosh: 0, living: 0, pxu: 1 }), 0);
  assert.match(topVS(), /\* uLiving;/);
  a.dispose();
});

test('the tap hits what is drawn: the pool\'s centre at a full turn is the abdomen, 60 units outside the wall is not, and the top counts', () => {
  const a = new AscitesLayer(); a.set(5000);
  const cam = camera(25 * D2R, 0);
  const { pos, aD, aW } = attrs(poolOf(a));
  const c = 52, v = c * POOL_ROWS + 4;   // the middle column, a row inside the water
  assert.ok(aD![c * POOL_ROWS + POOL_ROWS - 1]! > 0);
  const ray = (p: Pos): Raycaster => { const s = screen(cam, p), r = new Raycaster(); r.setFromCamera(new Vector2((s.x / W) * 2 - 1, -(s.y / H) * 2 + 1), cam); return r; };
  const centre = drawn(cam, [pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!], aW[v]!, aD![v]!, 1);
  const hit = a.pick(ray(centre));
  assert.ok(hit, 'a ray through the drawn pool\'s centre hits the water');
  assert.ok(Math.abs(hit!.x - 712) < 25, `at x ${hit!.x.toFixed(1)} (the swell bends it a little at a turn)`);
  const poly = outlinePolygon(ABDOMEN_OUTLINES[bulgeStep(5000)]!), left = Math.min(...poly.map((p) => p[0]));
  assert.equal(a.pick(ray([x3(left - 60), pos[v * 3 + 1]!, bellyZ()])), null, '60 units outside the wall is not the abdomen');
  // the CPU copy is put back flat after the cast: what is uploaded and what is held agree
  for (let i = 0; i < aW.length; i++) assert.ok(Math.abs(pos[i * 3 + 2]! - bellyZ()) < 1e-6);
  // tilted down: a ray at the water's top surface (above the pool's front face) is the abdomen too
  const down = camera(0, 12 * D2R), tp = attrs(topOf(a)).pos;
  const sw = DOME * poolDome(attrs(topOf(a)).aW[2 * 52]!);
  const onTop = [tp[2 * 52 * 3]!, tp[2 * 52 * 3 + 1]!, bellyZ() - SHELL_BACK * 0.5] as Pos;
  const s = screen(down, onTop), r2 = new Raycaster(); r2.setFromCamera(new Vector2((s.x / W) * 2 - 1, -(s.y / H) * 2 + 1), down);
  assert.ok(a.pick(r2), 'a ray at the water\'s top is the abdomen');
  // a pool with no water takes no tap
  const dry = new AscitesLayer(); dry.set(0);
  assert.equal(dry.pick(ray(centre)), null);
  a.dispose(); dry.dispose();
  void y2d; void lensDistance;
});
