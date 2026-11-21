// The ascites is a body of water, not a curtain (Mohammad, 21 Nov 2026: "the ascites is not volumetric; it looks like a curtain in front of the figure").
// Root cause pinned: the pool was ONE flat sheet (plus a 0.075 swell and a lid that only showed past 6 degrees of tilt), drawn after the organs, so nothing of the water lay behind them and a turn showed a card.
// It is now a closed body: front face (over the organs), back face and far walls (BEFORE the organs, so they lie in the water), near walls (over them) and the lid. Node only: three's math, no renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3, type BufferGeometry, type Mesh, type ShaderMaterial } from 'three';
import {
  AscitesLayer, DOME, POOL_FS, POOL_ORDER, POOL_VS, SHELL_BACK, SHELL_BACK_ORDER, bellyZ, bulgeStep, outlinePolygon, shellHalf,
} from '../src/scene/disease/ascites.ts';
import { wallBelow } from '../src/scene/disease/ascites-shell.ts';
import { FLANK_ORDER } from '../src/scene/disease/landmarks.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { fluidBase, fluidLevel } from '../src/scene/disease/copied/fluid-step.js';
import { ORGAN_ORDER } from '../src/scene/organs/layer.ts';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { FOV, SHOTS } from '../src/scene/camera/shots.ts';
import { x3, y3, x2d, y2d } from '../src/scene/frame2d.ts';

const W = 1440, H = 900, D2R = Math.PI / 180;
type M = Mesh & { material: ShaderMaterial & { defines: Record<string, string> } };
const parts = (a: AscitesLayer) => { const c = a.group.children as M[]; return { pool: c[0]!, top: c[1]!, back: c[2]!, far: c[3]!, near: c[4]! }; };
const camera = (yaw: number, pitch: number): PerspectiveCamera => {
  const s = SHOTS.play, r = s.r, cp = Math.cos(pitch), [tx, ty, tz] = s.target, cam = new PerspectiveCamera(FOV, W / H, r * 0.02, r * 120);
  cam.position.set(tx + Math.sin(yaw) * cp * r, ty + Math.sin(pitch) * r, tz + Math.cos(yaw) * cp * r); cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); return cam;
};
const screen = (cam: PerspectiveCamera, p: [number, number, number]) => { const v = new Vector3(...p).project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; };
const wallGeo = (a: AscitesLayer) => parts(a).far.geometry as BufferGeometry;
const wallTris = (a: AscitesLayer): [number, number, number][] => {
  const g = wallGeo(a), idx = g.index!.array, n = g.drawRange.count, out: [number, number, number][] = [];
  for (let i = 0; i + 2 < n; i += 3) out.push([idx[i]!, idx[i + 1]!, idx[i + 2]!]);
  return out;
};

test('the body has five parts in the right order: back face and far walls before the organs, front face, near walls and lid after them', () => {
  const a = new AscitesLayer(), p = parts(a);
  assert.equal(a.group.children.length, 5);
  assert.ok(ORGAN_ORDER.length > 0 && p.back.renderOrder < 0, 'the back face is drawn before the first organ (the heart\'s fill is order 0)');
  assert.ok(p.back.renderOrder > FLANK_ORDER, 'and after the flank line');
  assert.ok(p.far.renderOrder < 0 && p.far.renderOrder >= p.back.renderOrder, 'the far walls with it');
  assert.equal(p.back.renderOrder, SHELL_BACK_ORDER);
  for (const m of [p.pool, p.top, p.near]) assert.equal(m.renderOrder, POOL_ORDER, 'front face, lid and near walls are drawn after every organ');
  assert.equal(p.far.material.side, 1, 'the far walls are the inner faces (BackSide)');
  assert.equal(p.near.material.side, 0, 'the near walls are the outer faces (FrontSide)');
  for (const m of Object.values(p)) assert.equal(m.material.depthTest, false);
  assert.ok('POOL_BACK' in p.back.material.defines && 'POOL_WALL' in p.far.material.defines && 'POOL_WALL' in p.near.material.defines);
  assert.equal(p.far.geometry, p.near.geometry, 'both sides of the wall are one mesh');
  assert.equal(p.back.geometry, p.pool.geometry, 'the back face is the pool\'s own geometry');
  a.dispose();
});

test('every part shares the pool\'s one uniforms object, so bindRes, the ripple, the ink, the liver cut and the dim reach all of them', () => {
  const a = new AscitesLayer(), p = parts(a), u = p.pool.material.uniforms;
  for (const m of [p.top, p.back, p.far, p.near]) assert.equal(m.material.uniforms, u);
  const res = { value: u.uRes!.value.clone().set(1440, 900) };
  a.bindRes(res as never);
  for (const m of Object.values(p)) assert.equal(m.material.uniforms.uRes, res);
  a.dispose();
});

test('the organs sit in the water: the gut, the spleen, the kidney and the stomach lie between the back face and the front face', () => {
  const back = bellyZ() - SHELL_BACK, front = bellyZ() + DOME;
  assert.ok(SHELL_BACK >= 0.25, 'a real thickness: a quarter of a unit or more (75 2D units)');
  for (const id of ['bowel', 'colon', 'duodenum', 'spleen', 'kidney-l', 'stomach']) assert.ok(ORGAN_Z[id]! > back && ORGAN_Z[id]! < front + 0.2, `${id} (${ORGAN_Z[id]}) lies in the body (${back.toFixed(2)} to ${front.toFixed(2)})`);
  assert.ok(Math.min(...Object.values(ORGAN_Z)) > back, 'no organ is behind the back face');
});

test('the walls: only under the surface, from the surface down around the floor and up, depth carried per point', () => {
  const ml = 5000, step = bulgeStep(ml), poly = outlinePolygon(ABDOMEN_OUTLINES[step]!), { h } = fluidLevel(ml);
  const ymin = Math.min(...poly.map((q) => q[1])), surf = (x: number) => Math.max(fluidBase(x, h), ymin);
  const pts = wallBelow(poly, surf);
  assert.ok(pts.length > 20, `${pts.length} wall points`);
  for (const q of pts) { assert.ok(q.d >= 0); assert.ok(Math.abs(q.y - surf(q.x) - q.d) < 1e-6 || q.d === 0, 'depth is under the surface'); }
  assert.equal(pts[0]!.d, 0, 'it starts at the surface on one side'); assert.equal(pts[pts.length - 1]!.d, 0, 'and ends at it on the other');
  for (const q of pts.slice(0, 1).concat(pts.slice(-1))) assert.ok(Math.abs(q.y - surf(q.x)) < 0.5, `the end lies on the surface (${q.y.toFixed(2)} vs ${surf(q.x).toFixed(2)})`);
  // none of the points above the water is kept
  const dry = wallBelow(poly, () => Infinity); assert.equal(dry.length, 0, 'no water under an infinitely low surface: no wall');
  // the laid mesh holds those points at the two depths
  const a = new AscitesLayer(); a.set(ml);
  const g = wallGeo(a), pos = g.getAttribute('position').array as Float32Array;
  const used = Math.max(...wallTris(a).flat()) + 1;
  assert.equal(used, 2 * pts.length);
  for (let v = 0; v < used; v++) { const z = pos[v * 3 + 2]!; assert.ok(Math.abs(z - (v % 2 ? bellyZ() - SHELL_BACK : bellyZ())) < 1e-6, `wall vertex ${v} is on the belly's plane or on the back face`); }
  a.dispose();
});

test('the walls wind outward: the far inner faces are the back faces and the near outer faces the front ones, at every volume', () => {
  for (const ml of [800, 2500, 5000, 8500]) {
    const a = new AscitesLayer(); a.set(ml);
    const poly = outlinePolygon(ABDOMEN_OUTLINES[bulgeStep(ml)]!), cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    const pos = wallGeo(a).getAttribute('position').array as Float32Array, tris = wallTris(a);
    assert.ok(tris.length > 20, `${ml} mL: ${tris.length} wall triangles`);
    let bad = 0;
    for (const [i, j, k] of tris) {
      const P = [i, j, k].map((v) => new Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
      const n = P[1]!.clone().sub(P[0]!).cross(P[2]!.clone().sub(P[0]!));
      if (n.lengthSq() < 1e-14) continue;   // (a sliver)
      const mid = P[0]!.clone().add(P[1]!).add(P[2]!).multiplyScalar(1 / 3);
      if (n.z !== 0 && Math.abs(n.z) > 1e-9) bad++;
      if (n.x * (mid.x - x3(cx)) + n.y * (mid.y - y3(cy)) <= 0) bad++;
    }
    assert.equal(bad, 0, `${ml} mL: every wall triangle faces away from the water's middle`);
    a.dispose();
  }
});

test('the depth is seen: a full turn shows a side wall at least 20 px wide, a 12 degree tilt a lid at least 15 px deep (the curtain had neither)', () => {
  const a = new AscitesLayer(); a.set(8500);
  const pos = wallGeo(a).getAttribute('position').array as Float32Array, aD = wallGeo(a).getAttribute('aD').array as Float32Array, n = Math.max(...wallTris(a).flat()) + 1;
  // the wall point on the left side at about 150 units under the surface: its front and back rings
  let k = -1; for (let v = 0; v + 1 < n; v += 2) if (aD[v]! > 150) { k = v; break; }
  assert.ok(k >= 0);
  const f: [number, number, number] = [pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!], b: [number, number, number] = [pos[(k + 1) * 3]!, pos[(k + 1) * 3 + 1]!, pos[(k + 1) * 3 + 2]!];
  for (const yaw of [25, -25]) {
    const cam = camera(yaw * D2R, 0), s0 = screen(cam, f), s1 = screen(cam, b);
    assert.ok(Math.hypot(s0.x - s1.x, s0.y - s1.y) >= 20, `yaw ${yaw}: the wall shows ${Math.hypot(s0.x - s1.x, s0.y - s1.y).toFixed(1)} px of depth`);
  }
  const down = camera(0, 12 * D2R), t = a.group.children[1] as Mesh, tp = t.geometry.getAttribute('position').array as Float32Array, c = 52;
  const front = screen(down, [tp[2 * c * 3]!, tp[2 * c * 3 + 1]!, bellyZ() + DOME]), rear = screen(down, [tp[2 * c * 3]!, tp[2 * c * 3 + 1]!, bellyZ() - SHELL_BACK]);
  assert.ok(Math.abs(front.y - rear.y) >= 15, `the lid is ${Math.abs(front.y - rear.y).toFixed(1)} px deep`);
  a.dispose();
});

test('head-on the two layers of a ray stack to the one alpha 2D paints: (1 - h)^2 = 1 - a, and the front glides between the whole and the half', () => {
  for (const alpha of [0.05, 0.22, 0.4, 0.8, 1]) { const h = shellHalf(alpha); assert.ok(Math.abs((1 - h) * (1 - h) - (1 - alpha)) < 1e-9, `a = ${alpha}`); assert.ok(h <= alpha + 1e-12 && h >= 0); }
  assert.equal(shellHalf(0), 0);
  assert.match(POOL_FS, /float halfA = 1\.0 - sqrt\(max\(1\.0 - gl_FragColor\.a, 0\.0\)\);/);
  assert.match(POOL_FS, /#if defined\(POOL_BACK\) \|\| defined\(POOL_WALL\)\n  gl_FragColor\.a = halfA \* uLiving;\n#else\n  gl_FragColor\.a = mix\(gl_FragColor\.a, halfA, uLiving\);/, 'back parts take the half scaled by the living switch, the front mixes from the whole (2D) to the half');
  assert.match(POOL_FS, /#ifdef POOL_WALL\n  float edge = 1\.0;/, 'the wall does not feather at itself');
  assert.match(POOL_VS, /#ifdef POOL_BACK\n  p\.z -= 0\.3/, 'the back face lies SHELL_BACK behind the belly plane');
});

test('Living fluid off is 2D\'s flat pool: the back face and the walls are not drawn, and they come in as the switch glides', () => {
  const a = new AscitesLayer(); a.set(5000);
  const vis = () => parts(a).back.visible && parts(a).far.visible && parts(a).near.visible;
  assert.equal(vis(), true, 'water and living: the whole body is drawn');
  a.setLiving(false);
  a.step(0.016, 1); assert.equal(vis(), true, 'still drawn while the switch glides (it fades by its alpha, nothing pops)');
  for (let i = 0; i < 400; i++) a.step(0.016, 1);
  assert.equal(a.living, 0); assert.equal(parts(a).back.visible || parts(a).far.visible || parts(a).near.visible, false, 'off: nothing behind the flat pool');
  assert.equal(parts(a).pool.visible, true, 'the flat pool itself stays');
  a.setLiving(true); a.step(0.016, 1); assert.equal(vis(), true, 'on again: the body comes back');
  const dry = new AscitesLayer(); dry.set(0);
  assert.equal(Object.values(parts(dry)).some((m) => m.visible), false, 'no water, no body');
  a.dispose(); dry.dispose();
});

test('the back face and the walls follow the volume: more water, a higher surface, a wall that starts higher', () => {
  const top = (ml: number): number => { const a = new AscitesLayer(); a.set(ml); const pos = wallGeo(a).getAttribute('position').array as Float32Array; const y = y2d(pos[1]!); a.dispose(); return y; };
  assert.ok(top(8500) < top(2500), 'the wall\'s first point (at the surface) is higher with more water');
  void x2d;
});
