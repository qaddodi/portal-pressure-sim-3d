// A stenosis (Mohammad, 20 Nov: "I did stenose the portal vein and the chevrons started flowing the other way, pointing in a different direction; the outline went away"): the narrowing is a smooth, LOCAL pinch of the vessel's drawn
// lumen, the same for every vessel that can be narrowed (the shared place: disease/clamps.ts for its profile, vessels/shaders.ts for how it is drawn). These pin the rules, over every stenosable vessel and not one of them:
//  1. the pinch is exactly nothing at both ends of its vessel (so the calibre either side is the vessel's own and no step stands against the next piece), symmetric, and falls off smoothly;
//  2. the shader's lumen radius (what the line, the flow marks, the dust and the tones are made from) is the PINCHED radius, and the outline's thinning is judged on the unpinched one (the line runs on through the waist);
//  3. the arrowheads stand on the drawn waist, at the pinched wall plus their gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3, type BufferAttribute } from 'three';
import { CLAMP, WAIST_MAX_SIG, WAIST_REACH, isClampable, waistNarrow, waistSigma } from '../src/scene/disease/clamps.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { UNITS_PER_SCENE as U } from '../src/scene/frame2d.ts';
import { VESSEL_VS, VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { CelScene } from '../src/scene/scene.ts';

const STENOSABLE = MAPPED.filter((v) => isClampable(v.id));
const sigOf = (v: (typeof STENOSABLE)[number]): number => {
  const c = coursesOf(v, REST)[0]!, curve = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
  return waistSigma(2 * v.radius * U, curve.getLength() * U);
};

test('the waist is exactly nothing at both ends of every stenosable vessel, and a smooth symmetric bell between', () => {
  assert.ok(STENOSABLE.length > 40, `${STENOSABLE.length} vessels can be narrowed`);
  for (const v of STENOSABLE) {
    const sig = sigOf(v);
    assert.ok(sig <= WAIST_MAX_SIG + 1e-12, `${v.id}: the bell fits inside the vessel`);
    for (const s of [0.3, 0.6, 0.95]) {
      assert.equal(waistNarrow(s, 0, sig), 0, `${v.id} start at ${s}`);
      assert.equal(waistNarrow(s, 1, sig), 0, `${v.id} end at ${s}`);
      assert.equal(waistNarrow(s, 0.5, sig), s, `${v.id} the middle takes the whole stenosis`);
      let prev = 0;
      for (let k = 0; k <= 200; k++) {
        const u = 0.5 - 0.5 * (1 - k / 200), n = waistNarrow(s, u, sig);   // (the start up to the middle)
        assert.ok(n >= prev - 1e-12, `${v.id}: rises to the middle (u ${u.toFixed(3)})`);
        assert.ok(Math.abs(waistNarrow(s, u, sig) - waistNarrow(s, 1 - u, sig)) < 1e-12, `${v.id}: symmetric`);
        prev = n;
      }
    }
  }
});

test('the bell ends with no slope at its reach (no kink where the pinch stops)', () => {
  const sig = 0.1, edge = 0.5 - WAIST_REACH * sig, h = 1e-4;
  assert.equal(waistNarrow(0.9, edge, sig), 0);
  assert.ok(waistNarrow(0.9, edge + h, sig) < 1e-6, 'a hair inside the reach it is still nothing');
  assert.ok(waistNarrow(0.9, edge - h, sig) === 0, 'and outside it is nothing');
  // 2D's own length where it fits: about 2.5 diameters, the Gaussian's centre untouched
  assert.ok(Math.abs(waistNarrow(0.6, 0.5 + 0.1, 0.1) - 0.6 * Math.exp(-1)) < 1e-9);
});

test('the pinched geometry carries no narrowing at a vessel\'s two ends, on any stenosable vessel in the scene', () => {
  const s = new CelScene();
  for (const v of STENOSABLE) {
    const obj = s.vesselObject(v.id);
    if (!obj) continue;
    s.disease.clamps.set({ [v.id]: 0.95 }, () => 1, 0.016, true);
    const g = obj.toonMesh.geometry, nar = g.getAttribute('narrow') as BufferAttribute, uv = g.getAttribute('uv') as BufferAttribute;
    let mid = 0;
    for (let i = 0; i < nar.count; i++) {
      const u = uv.getX(i);
      if (u < 1e-6 || u > 1 - 1e-6) assert.equal(nar.getX(i), 0, `${v.id}: no pinch at u ${u}`);
      mid = Math.max(mid, nar.getX(i));
    }
    assert.ok(mid > 0, `${v.id} is pinched somewhere`);
    s.disease.clamps.set({}, () => 1, 0.016, true);
  }
  s.dispose?.();
});

test('the vessel shader draws everything from the PINCHED lumen: the line, the flow marks, the dust (the outline and the chevrons followed the unpinched one)', () => {
  // the one lumen radius the fragment stage reads is the pinched one
  assert.match(VESSEL_VS, /float narrowK = 1\.0 - clamp\(narrow, 0\.0, 0\.97\);/);
  assert.match(VESSEL_VS, /vR = radius \* rkE \* swell \* narrowK \* vU;/);
  // the geometry is pinched by that same factor (no second formula)
  assert.match(VESSEL_VS, /radius \* rkE \* \(swell \* narrowK - 1\.0\)/);
  assert.match(VESSEL_VS, /float lumenW = radius \* rkE \* swell \* narrowK;/);
  assert.doesNotMatch(VESSEL_VS, /\(1\.0 - narrow\)/, 'no stray copy of the pinch that the lumen radius does not see');
  // the outline's thinning for a hairline is judged on the vessel's own radius: a pinch keeps its line
  assert.match(VESSEL_VS, /rCssV \/ narrowK\);/);
  // and the fragment stage's marks are made from vR (the pinched one) and nothing else
  assert.match(VESSEL_FS, /float R = max\(vR, 0\.3\)/);
  assert.match(VESSEL_FS, /float rDevAx = vR \//);
});

test('the arrowheads stand on the drawn waist, a gap off the pinched wall, on every stenosable vessel', () => {
  const s = new CelScene();
  for (const v of STENOSABLE) {
    const obj = s.vesselObject(v.id);
    if (!obj) continue;
    const cur = 0.8;
    s.disease.clamps.set({ [v.id]: cur }, () => 1, 0.016, true);
    const group = (s.disease.clamps as unknown as { clamps: Map<string, { obj: { group: unknown } }> }).clamps.get(v.id)!.obj.group as unknown as { children: { geometry: { getAttribute(n: string): BufferAttribute } }[] };
    const pos = group.children[0]!.geometry.getAttribute('position');
    const curve = new CatmullRomCurve3(coursesOf(v, REST)[0]!.pts.map((p) => new Vector3(p[0], p[1], p[2]))), at = curve.getPointAt(0.5);
    let nearest = Infinity;
    for (let i = 0; i < pos.count; i++) nearest = Math.min(nearest, Math.hypot(pos.getX(i) - at.x, pos.getY(i) - at.y));
    const want = v.radius * (1 - cur) + CLAMP.gap;
    assert.ok(Math.abs(nearest - want) < 2e-3, `${v.id}: the arrow tip stands ${nearest.toFixed(4)} from the axis, wanted ${want.toFixed(4)}`);
    s.disease.clamps.set({}, () => 1, 0.016, true);
  }
  s.dispose?.();
});
