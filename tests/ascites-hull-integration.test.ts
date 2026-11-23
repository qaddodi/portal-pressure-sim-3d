// Organic ascites, package D (21 Nov 2026): the hull joined into the scene. Node only: three's math, no renderer.
//   - one set of hull constants (layout and program), pinned; the modules load in any order (ascites.ts imports the hull, the hull never imports ascites.ts);
//   - the deleted shell and top are gone, and nothing in src names them;
//   - the layer builds ONE hull geometry under two materials, the belly's plane is the hull's middle, the flank lies on it, the tap goes through hullHit;
//   - the projected outline of the turned hull is round (design section 9: <= 15 degrees between rows, no straight run over 40 CSS px), built from A's layout and B's vertex twin;
//   (every GLSL file is on the compile list: tests/glsl-compile.test.ts, run with this one.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { AscitesLayer, bellyZ, bulgeStep, outlinePolygon, SHELL_BACK_ORDER } from '../src/scene/disease/ascites.ts';
import { HULL, HullLayout, hullThickness } from '../src/scene/disease/ascites-hull.ts';
import { polyOf } from '../src/scene/disease/ascites-pool.ts';
import { HULL_MID, HULL_TB_MAX, HULL_TF_MAX, HULL_VS, hullVertex } from '../src/scene/disease/ascites-hull-glsl.ts';
import { fluidBase, fluidLevel } from '../src/scene/disease/copied/fluid-step.js';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { Landmarks } from '../src/scene/disease/landmarks.ts';
import { FOV, SHOTS } from '../src/scene/camera/shots.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const W = 1440, H = 900, D2R = Math.PI / 180;

test('the hull constants are one set: the program reads the layout\'s', () => {
  assert.equal(HULL_MID, HULL.MID); assert.equal(HULL_TF_MAX, HULL.TF_MAX); assert.equal(HULL_TB_MAX, HULL.TB_MAX);
  const src = readFileSync('src/scene/disease/ascites-hull-glsl.ts', 'utf8');
  assert.doesNotMatch(src, /HULL_MID\s*[:=][^;]*-0\.09|0\.16,\s*HULL_TB_MAX/, 'no second copy of the numbers');
  assert.match(src, /from '\.\/ascites-hull\.ts'/);
  assert.equal(bellyZ(), HULL.MID, 'the belly\'s one plane is the hull\'s middle');
});

test('load order: each hull module imports cleanly first, in a fresh process (no cycle through ascites.ts)', () => {
  for (const first of ['ascites-hull-glsl.ts', 'ascites-hull.ts', 'ascites-pool.ts', 'ascites.ts']) {
    const code = `await import('./src/scene/disease/${first}'); await import('./src/scene/disease/ascites.ts'); await import('./src/scene/disease/ascites-hull-glsl.ts');`;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { stdio: 'pipe' });
  }
  for (const f of ['ascites-hull.ts', 'ascites-hull-glsl.ts', 'ascites-pool.ts']) assert.doesNotMatch(readFileSync(`src/scene/disease/${f}`, 'utf8'), /from '\.\/ascites\.ts'/, `${f} never imports ascites.ts`);
});

test('the extruded box is gone: no shell, no top, no dome in src', () => {
  assert.ok(!existsSync('src/scene/disease/ascites-shell.ts') && !existsSync('src/scene/disease/ascites-top.ts'));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
  for (const f of walk('src')) assert.doesNotMatch(readFileSync(f, 'utf8'), /from '[^']*ascites-(shell|top)|SHELL_BACK\b|poolDome|poolSwell|AscitesShell|AscitesTop/, f);
});

test('the layer is one hull geometry under two materials, back before the organs and front after them', () => {
  const a = new AscitesLayer(); a.set(5000);
  const [back, front] = a.group.children as unknown as { geometry: unknown; renderOrder: number; material: { side: number; defines?: Record<string, string>; vertexShader: string } }[];
  assert.equal(a.group.children.length, 2);
  assert.equal(back.geometry, front.geometry);
  assert.equal(back.renderOrder, SHELL_BACK_ORDER); assert.ok(front.renderOrder > back.renderOrder);
  assert.equal(back.material.side, 1); assert.equal(front.material.side, 0);
  assert.ok(back.material.defines && 'HULL_BACK' in back.material.defines && !front.material.defines?.HULL_BACK);
  assert.equal(front.material.vertexShader, HULL_VS);
  a.dispose();
});

test('thickness follows the volume and the living switch: a film is thin, a full belly whole, living off is flat', () => {
  const a = new AscitesLayer(); const u = (a as unknown as { uniforms: Record<string, { value: number }> }).uniforms;
  a.set(1000); const t1 = u.uTf!.value; a.set(8000); const t8 = u.uTf!.value;
  assert.ok(t1 > 0 && t1 < t8 * 0.8 && t8 <= HULL.TF_MAX + 1e-9, `1 L ${t1}, 8 L ${t8}`);
  a.setLiving(false, true); a.set(8000); assert.equal(u.uTf!.value, 0); assert.equal(u.uTb!.value, 0);
  a.setLiving(true); for (let i = 0; i < 4; i++) a.step(0.016, 0); const mid = u.uTf!.value;
  assert.ok(mid > 0 && mid < t8, 'it glides back, never pops');
  a.dispose();
});

test('the flank ribbon lies on the hull\'s middle plane', () => {
  const l = new Landmarks(); l.setAscites(5000);
  const p = ((l as unknown as { flank: { geometry: { getAttribute(n: string): { array: Float32Array } } } }).flank.geometry.getAttribute('position')).array;
  for (let i = 0; i < p.length / 3; i++) assert.ok(Math.abs(p[i * 3 + 2]! - HULL.MID) < 1e-6);
});

test('the tap goes through the hull: a ray at the middle of the water hits it, 60 units outside the wall misses', () => {
  const a = new AscitesLayer(); a.set(5000); a.step(0.016, 0);
  const ray = (x: number, y: number): Raycaster => new Raycaster(new Vector3(x, y, 5), new Vector3(0, 0, -1));
  const poly = polyOf(bulgeStep(5000)), left = Math.min(...poly.map((q) => q[0]));
  const { h } = fluidLevel(5000);
  const y = fluidBase(712, h) + 80;
  const hit = a.pick(ray(x3(712), y3(y)));
  assert.ok(hit && Math.abs(hit.x - 712) < 40 && a.holds(hit.x, hit.y), JSON.stringify(hit));
  assert.equal(a.pick(ray(x3(left - 60), y3(y))), null);
  a.dispose();
});

test('round when turned: the projected outline turns <= 15 degrees between rows and has no straight run over 40 CSS px', () => {
  const ml = 8500, step = bulgeStep(ml), poly = polyOf(step), { h } = fluidLevel(ml);
  let ymin = Infinity; for (const q of poly) ymin = Math.min(ymin, q[1]);
  const L = new HullLayout(); L.lay(poly, (x) => Math.max(fluidBase(x, h), ymin));
  const s = SHOTS.play, [tx, ty, tz] = s.target, r = s.r, yaw = 25 * D2R;
  const cam = new PerspectiveCamera(FOV, W / H, r * 0.02, r * 120);
  cam.position.set(tx + Math.sin(yaw) * r, ty, tz + Math.cos(yaw) * r); cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const rest: [number, number, number] = [tx, ty, tz + r], th = hullThickness(L.radius, 1);
  const pxu = cam.projectionMatrix.elements[5]! * H * 0.5 / r / 300;
  const proj = (v: number): [number, number] => {
    const p = hullVertex({ x: L.pos[v * 3]!, y: L.pos[v * 3 + 1]!, aW: L.aW[v]!, aD: L.aD[v]!, aK: L.aK[v]!, aLid: 0 },
      { R: L.radius, Tf: th.tf, Tb: th.tb, off: 1, restEye: rest, living: 1, phase: 0, amp: 0, slosh: 0, pxu });
    const q = new Vector3(...p).project(cam); return [(q.x * 0.5 + 0.5) * W, (0.5 - q.y * 0.5) * H];
  };
  const NT = 20, NS = 96, SHEET = (NS + 1) * NT;
  // (the last three bands, the floor, are left out: there the outline runs near-horizontal, so extreme-x per band is ill-conditioned, and its turn is the cavity's own floor curve, not the hull's)
  // the silhouette: for each band of image rows, the extreme projected x of the whole hull (both sheets), right side then left; sampled every BAND px
  const BAND = 24, bands = new Map<number, [number, number]>();
  for (let v = 0; v < 2 * SHEET; v++) {
    const q = proj(v), b = Math.round(q[1] / BAND), cur = bands.get(b);
    if (!cur) bands.set(b, [q[0], q[0]]); else { if (q[0] < cur[0]) cur[0] = q[0]; if (q[0] > cur[1]) cur[1] = q[0]; }
  }
  const keys = [...bands.keys()].sort((x, y) => x - y);
  for (const side of [1, 0]) {
    const pts = keys.slice(0, -3).map((k) => [bands.get(k)![side]!, k * BAND] as [number, number]);
    let worst = 0, straight = 0, longest = 0;
    for (let k = 2; k < pts.length; k++) {
      const a = [pts[k - 1]![0] - pts[k - 2]![0], pts[k - 1]![1] - pts[k - 2]![1]], b = [pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]];
      worst = Math.max(worst, Math.abs(Math.atan2(a[0]! * b[1]! - a[1]! * b[0]!, a[0]! * b[0]! + a[1]! * b[1]!)) / D2R);
      if (Math.abs(Math.atan2(a[0]! * b[1]! - a[1]! * b[0]!, a[0]! * b[0]! + a[1]! * b[1]!)) / D2R < 1) straight += Math.hypot(b[0]!, b[1]!); else straight = 0;
      longest = Math.max(longest, straight);
    }
    if (process.env.HULL_DEBUG) console.log(side, 'worst', worst.toFixed(1), 'longest straight', longest.toFixed(0), pts.map((q) => q.map((n) => n.toFixed(0)).join(',')).join(' | '));
    assert.ok(worst <= 15, `side ${side}: the silhouette turns ${worst.toFixed(1)} degrees between bands`);
    assert.ok(longest <= 40, `side ${side}: the longest straight run is ${longest.toFixed(0)} px`);
  }
});
