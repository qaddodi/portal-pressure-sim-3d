// A tube is always a lit tone and a shade tone (Mohammad, 26 Nov: "the right portal vein branch has like a weird area of no shadow"; TIPS slide, velocity lens, the stent's junction on the right portal vein).
// ROOT CAUSE: the shade is a hard step of n.L at VESSEL_STEP_AT. Across a tube every normal is square to its axis, so n.L can only reach the light's part square to the axis, sin(angle between axis and light) long.
// The right portal vein's feeder (PVH_R_2~F:b) runs up and toward the viewer, 0.97 to 1.0 of the world light: its slice is 0.06 to 0.25, under the step, so n.L never reached it anywhere across the tube, the whole tube was
// the shade tone, and its lit stripe closed to a blob where the junction's web (which turns toward the light) begins. The rule, for every tube of every program (tubes, junction skins, strands): the slice is never shorter than
// CEL_STYLE.TUBE_LIGHT_MIN (cel-glsl.ts celTubeLight; the light's part along the axis is untouched), so a tube is never one tone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_LIGHT_UNIT, CEL_LIGHT_GLSL, tubeLightFor } from '../src/scene/cel-glsl.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { TOON_FS } from '../src/scene/materials/shaders.ts';

type V3 = readonly [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const STEP = CEL_STYLE.VESSEL_STEP_AT;
/** The share of a tube's circumference lit (n.L at or over the step), for the light `L` and a tube's unit axis `a`: its normals run all round the circle square to `a`, and n.L over that circle peaks at the light's slice. */
function litShare(L: V3, a: V3): number {
  const d = dot(L, a), slice = Math.sqrt(Math.max(0, dot(L, L) - d * d));
  return slice <= STEP ? 0 : Math.acos(STEP / slice) / Math.PI;
}
/** Every sampled step of every course in the network: its unit axis. */
function axes(): { id: string; a: V3 }[] {
  const out: { id: string; a: V3 }[] = [];
  for (const v of NETWORK) for (const c of coursesOf(v, REST)) {
    const P = c.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      const d: V3 = [P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1], P[i + 1]![2] - P[i]![2]];
      if (Math.hypot(...d) > 1e-9) out.push({ id: v.id, a: unit(d) });
    }
  }
  return out;
}

test('a tube along the light keeps a slice of the floor; a tube square to it is untouched, and the part along the axis never changes', () => {
  const L = CEL_LIGHT_UNIT as V3, MIN = CEL_STYLE.TUBE_LIGHT_MIN;
  // (a tube exactly along the light has no slice at all: the direction of its stripe is arbitrary, but the light stays finite)
  assert.ok(tubeLightFor(L).every(Number.isFinite), 'a tube exactly along the light gives a finite light');
  const a = unit([-0.63, 0.68, 0.37]);   // the feeder's far end: 0.96 of the light
  const t = tubeLightFor(a);
  const d = dot(t, a), slice = Math.sqrt(dot(t, t) - d * d);
  assert.ok(Math.abs(d - dot(L, a)) < 1e-9, 'the part along the axis is the light\'s own');
  assert.ok(Math.abs(slice - MIN) < 1e-9, `the slice is the floor (${slice})`);
  const sq = unit([0.62, 0.5, 0]);   // square to the light: slice 1
  const u = tubeLightFor(sq);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(u[i]! - L[i]!) < 1e-12, 'a tube past the floor is lit exactly as before');
});

test('no tube of the network is a single tone: along every vessel the lit share of the circumference is real, and the old measure had tubes with none', () => {
  const L = CEL_LIGHT_UNIT as V3;
  let was0 = 0, minNow = 1, maxNow = 0, worst = '';
  for (const { id, a } of axes()) {
    if (litShare(L, a) === 0) was0++;
    const s = litShare(tubeLightFor(a) as V3, a);
    if (s < minNow) { minNow = s; worst = id; }
    maxNow = Math.max(maxNow, s);
  }
  assert.ok(was0 > 0, 'the check sees the bug: some tube steps had no lit stripe at all against the bare world light');
  // (the floor's slice is 0.6: a stripe of acos(0.25/0.6)/pi = 36 percent of the circumference, and a tube already past it keeps its own, up to 42)
  assert.ok(minNow > 0.3, `every tube step has a lit stripe of at least 30 percent (the least is ${(minNow * 100).toFixed(0)} percent, on ${worst})`);
  assert.ok(maxNow < 0.5, 'and never a tube all lit');
});

test('the light turns smoothly along a tube: no step in the shade where a tube bends across the light', () => {
  const L = CEL_LIGHT_UNIT as V3;
  let worst = 0, where = '';
  for (const v of NETWORK) for (const c of coursesOf(v, REST)) {
    const P = c.pts;
    let prev: V3 | null = null;
    for (let i = 0; i + 1 < P.length; i++) {
      const d: V3 = [P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1], P[i + 1]![2] - P[i]![2]];
      if (Math.hypot(...d) < 1e-9) continue;
      const t = tubeLightFor(unit(d), L) as V3;
      if (prev) { const s = Math.hypot(t[0] - prev[0], t[1] - prev[1], t[2] - prev[2]); if (s > worst) { worst = s; where = `${v.id}@${i}`; } }
      prev = t;
    }
  }
  // (the bare light is constant along a tube; the floor's turns at most a few tenths between two samples of the sharpest bend, where the axis crosses the light itself)
  assert.ok(worst < 0.3, `the tube's light moves ${worst.toFixed(2)} between two samples at ${where}`);
});

test('every tube program shades by the tube\'s own light: tubes, junction skins (the arms\' lights blended by the union\'s weights) and strands', () => {
  assert.ok(CEL_LIGHT_GLSL.includes('vec3 celTubeLight(vec3 a)'));
  assert.ok(CEL_LIGHT_GLSL.includes(`${CEL_STYLE.TUBE_LIGHT_MIN.toFixed(1)} / max(length(lp)`), 'the floor is the one constant of cel-style.ts');
  assert.match(VESSEL_FS, /vec3 lightD = celTubeLight\(vT\);/);
  assert.match(VESSEL_FS, /float sT = dot\(n, lightD\);/);
  assert.match(VESSEL_FS, /fwSt = fwidth\(dot\(nD, lightD\)\)/, 'the derivative reads the same light the tone does');
  assert.match(TOON_FS, /float sT0 = dot\(n, celTubeLight\(vT\)\);/);
  assert.match(SKIN_FS, /float sT = dot\(n, gSkinLight\);/);
  assert.match(SKIN_FS, /vec3 ul = celTubeLight\(ux\);/);
  assert.match(SKIN_FS, /lt = mix\(ul, lt, h\);/, 'the skin\'s light follows the union\'s own blend of the arms');
  // none of the three shades a tube with the bare world light any more
  assert.doesNotMatch(VESSEL_FS + TOON_FS + SKIN_FS, /dot\((n|nD), celLightView\(\)\)/);
});
