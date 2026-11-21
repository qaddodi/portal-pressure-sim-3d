// The ascites hull's program (organic ascites package B, 21 Nov 2026). Node only: three's math, no renderer. `hullVertex` / `hullAlpha` are the JS twins of the vertex and fragment maths.
// Not tested here (they need package A's layout): the projected outline's turn between rows and its straight runs; package D adds them against the real HullLayout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { outlinePolygon, wallDistance, shellHalf, fluidTone } from '../src/scene/disease/ascites.ts';
import { GRAZE_CAP, HEADON_FORM, HI_ALPHA, HULL_FS, HULL_MID, HULL_TB_MAX, HULL_TF_MAX, HULL_VS, hullAlpha, hullVertex, type HullUniforms } from '../src/scene/disease/ascites-hull-glsl.ts';
import { FOV, SHOTS } from '../src/scene/camera/shots.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const W = 1440, H = 900;
const camera = (): PerspectiveCamera => {
  const s = SHOTS.play, [tx, ty, tz] = s.target, cam = new PerspectiveCamera(FOV, W / H, s.r * 0.02, s.r * 120);
  cam.position.set(tx, ty, tz + s.r); cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
};
const px = (cam: PerspectiveCamera, p: readonly number[]): [number, number] => { const v = new Vector3(p[0], p[1], p[2]).project(cam); return [(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H]; };
const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The shape uniforms the layer will set (design 3.3): fill = min(1, ml / 6000)^0.6, small = smoothstep(0, 160, R). */
const uniforms = (cam: PerspectiveCamera, ml: number, R: number, living = 1): HullUniforms => {
  const k = Math.pow(Math.min(1, ml / 6000), 0.6) * ss(0, 160, R) * living;
  return { R, Tf: HULL_TF_MAX * k, Tb: HULL_TB_MAX * k, off: 0, restEye: [cam.position.x, cam.position.y, cam.position.z], living, phase: 0, amp: 0, slosh: 0, pxu: 1 };
};
const poly = outlinePolygon(ABDOMEN_OUTLINES[68]!);
/** Sample 2D points inside the cavity (below y = 500): their scene x, y and wall distance. */
function samples(): { x: number; y: number; aW: number }[] {
  const out: { x: number; y: number; aW: number }[] = [];
  for (let x = 380; x <= 1040; x += 33) for (let y = 480; y <= 700; y += 22) out.push({ x: x3(x), y: y3(y), aW: wallDistance(poly, x, y) });
  return out;
}

test('head-on is 2D: every front, back and lid vertex projects onto its flat 2D point from the rest eye, and the lid has no area', () => {
  const cam = camera();
  for (const ml of [800, 5000, 8500]) {
    const pts = samples(), R = Math.max(...pts.map((p) => p.aW)), u = uniforms(cam, ml, R);
    for (const p of pts) for (const [aK, aLid] of [[1, 0], [-1, 0], [-1, 1], [0, 1], [1, 1]] as const) {
      const v = { x: p.x, y: p.y, aW: p.aW, aD: 12, aK, aLid };
      const flat = hullVertex(v, { ...u, Tf: 0, Tb: 0 });   // thickness 0 = the plane itself
      const got = hullVertex(v, u), a = px(cam, got), b = px(cam, flat);
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1, `${ml} mL (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) aK ${aK} lid ${aLid}: ${a} vs ${b}`);
    }
    // the lid: the same 2D point at every aK lands on one screen point
    const p = pts[40]!, ends = [-1, 0, 1].map((aK) => px(cam, hullVertex({ x: p.x, y: p.y, aW: p.aW, aD: 0, aK, aLid: 1 }, u)));
    assert.ok(Math.hypot(ends[0]![0] - ends[2]![0], ends[0]![1] - ends[2]![1]) < 0.1, 'the lid collapses to the surface line');
  }
});

test('the body is round: elliptic from the wall, the sheets meet on the wall at the middle plane, no plateau', () => {
  const cam = camera(), R = 400, u = uniforms(cam, 8500, R);
  let last = HULL_MID - 1, firstRise = 0;
  for (let i = 0; i <= 64; i++) {
    const aW = (R * i) / 64, z = hullVertex({ x: 0, y: 0, aW, aD: 99, aK: 1, aLid: 0 }, { ...u, restEye: [0, 0, 1e6] })[2], zb = hullVertex({ x: 0, y: 0, aW, aD: 99, aK: -1, aLid: 0 }, u)[2];
    if (i === 0) { assert.equal(z, HULL_MID); assert.equal(zb, HULL_MID); }
    assert.ok(z > last, `front z rises strictly with the wall distance (step ${i})`);
    if (i === 1) firstRise = z - HULL_MID;
    last = z;
  }
  assert.ok(Math.abs(last - (HULL_MID + u.Tf)) < 1e-9, 'it reaches Tf at R');
  assert.ok(firstRise > 0.15 * u.Tf, 'a vertical tangent at the wall: the first 1/64 of the way already carries over 15 % of the thickness (sqrt(2/64) = 0.18) (no flat face)');
  assert.ok(HULL_MID + HULL_TF_MAX > 0.040 && HULL_MID - HULL_TB_MAX < -0.224, 'it encloses the gut (colon front 0.040, bowel back -0.224)');
});

test('Living fluid off is flat: thickness 0 puts every vertex on the middle plane, and the back sheet and lid have no alpha', () => {
  const cam = camera(), u = uniforms(cam, 8500, 400, 0);
  assert.equal(u.Tf, 0); assert.equal(u.Tb, 0);
  for (const aK of [-1, 1]) assert.equal(hullVertex({ x: 0.2, y: 0.1, aW: 300, aD: 50, aK, aLid: 0 }, u)[2], HULL_MID);
  assert.equal(hullAlpha(0.4, 'back', 'back', 0), 0); assert.equal(hullAlpha(0.4, 'lid', 'front', 0), 0);
  assert.equal(hullAlpha(0.4, 'front', 'front', 0, 0), 0.4, 'the front sheet is 2D\'s whole alpha');
});

test('head-on alpha is 2D\'s: the two layers stack to the pool\'s alpha, and the highlight adds at most 0.035 (exact with HEADON_FORM 0)', () => {
  for (const a2d of [0.1, 0.24, 0.4]) {
    const front = hullAlpha(a2d, 'front', 'front', 1), back = hullAlpha(a2d, 'back', 'back', 1);
    assert.ok(Math.abs(front - shellHalf(a2d)) < 1e-12);
    assert.ok(Math.abs(1 - (1 - front) * (1 - back) - a2d) < 1e-12, 'the pair stacks to 2D');
    const lit = hullAlpha(a2d, 'front', 'front', 1, 1, HEADON_FORM);
    assert.ok(lit - front <= HI_ALPHA * HEADON_FORM + 1e-12 && lit - front > 0);
    assert.equal(hullAlpha(a2d, 'front', 'front', 1, 1, 0), front, 'with form 0 it is exact');
  }
  assert.ok(Math.abs(HI_ALPHA * HEADON_FORM - 0.035) < 1e-12);
  assert.ok(fluidTone([1, 1, 1], 0.4, 0)[3] > 0);
});

test('the programs: the world light, no rim, no hard step of colour, the rest eye and the grazing term only when turned', () => {
  assert.match(HULL_FS, /uniform vec3 uLight;/); assert.match(HULL_FS, /normalize\(uLight \+ V\)/);
  assert.doesNotMatch(HULL_FS, /rim/i); assert.doesNotMatch(HULL_FS, /\bstep\(/); assert.doesNotMatch(HULL_VS, /\bstep\(/);
  assert.match(HULL_FS, /\* uOff/, 'the grazing depth scales with uOff: none at rest');
  assert.match(HULL_FS, /if \(!lid\) \{[^}]*uOff/s);
  assert.match(HULL_VS, /uniform vec3 uRestEye;/); assert.match(HULL_VS, /\(uRestEye\.z - z\) \/ \(uRestEye\.z - /);
  assert.match(HULL_VS, /sqrt\(w \* \(2\.0 - w\)\)/); assert.match(HULL_VS, /uOff \* uLiving/);
  assert.ok(GRAZE_CAP >= 1);
  assert.match(HULL_FS, /#ifdef HULL_BACK/); assert.match(HULL_FS, /liverKeep\(vW2d/, 'the highlight is kept off a congested liver');
});
