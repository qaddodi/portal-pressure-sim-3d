// A through run's two halves share the stretch between their seams by where a point lies along it (skin/sdf.ts `weights`, `runShare`).
// Mohammad, 22 Nov: the epigastric vein into the SVC, "the SVC has a hard horizontal colour/fade band at that spot". Root cause: each half's capsule runs on to the other's seam (through.ts), so along the stretch a merged skin hides whole (SVC_RA_1) the two halves were
// equally near and each had weight 0.5 over the whole stretch, then 1 on the seam ring: a step in colour, opacity, lens position and flow marks at both seams wherever the two halves differ. Run: node --test tests/skin-run-weights.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { runShare, weights, type Capsule } from '../src/scene/vessels/skin/sdf.ts';

/** two halves of a straight run along y, seams at y = 1 (half 0, running up from 0 to its far point 3) and y = 0 (half 1, running down) */
const half = (own: number, other: number, far: number, mate: number): Capsule => ({ n: 4, pts: Float64Array.from([0, other, 0, 0, own + Math.sign(own - other) * 0.1, 0, 0, own, 0, 0, far, 0]), r: Float64Array.from([0.1, 0.1, 0.1, 0.1]), mate });

test('runShare is 1 at a half\'s own seam and behind it, 0 at the other half\'s seam, and falls smoothly between', () => {
  const c = half(1, 0, 3, 1);
  assert.equal(runShare(c, 0, 1, 0), 1);
  assert.equal(runShare(c, 0, 2.5, 0), 1, 'behind its own seam: all this half\'s');
  assert.equal(runShare(c, 0, 0, 0), 0);
  assert.equal(runShare(c, 0, -1, 0), 0, 'past the other seam: none');
  assert.ok(Math.abs(runShare(c, 0, 0.5, 0) - 0.5) < 1e-9);
  let prev = 1;
  for (let y = 1; y >= 0; y -= 0.05) { const s = runShare(c, 0, y, 0); assert.ok(s <= prev + 1e-12, 'monotone'); prev = s; }
});

test('the two halves of a run have weights that cross over between their seams and add to what the pair had', () => {
  const a = half(1, 0, 3, 1), b = half(0, 1, -2, 0), caps = [a, b], out = new Float64Array(6);
  let prev = 1;
  for (let y = 1; y >= 0; y -= 0.1) {
    weights(caps, 0.08, 0.001, y, 0, out);
    assert.ok(Math.abs(out[0]! + out[1]! - 1) < 1e-9, 'two arms: they share everything');
    assert.ok(out[0]! <= prev + 1e-9, `half 0's weight falls as the point leaves its seam (y ${y.toFixed(1)})`);
    prev = out[0]!;
  }
  weights(caps, 0.08, 0.001, 0.5, 0, out);
  assert.ok(Math.abs(out[0]! - 0.5) < 0.02, 'half way between the seams: half each');
  weights(caps, 0.08, 0.001, 0.9, 0, out);
  assert.ok(out[0]! > 0.85, 'near its own seam it is nearly all this half\'s, not 0.5');
  // a third arm that is no part of the run keeps the share it had
  const side: Capsule = { n: 2, pts: Float64Array.from([0, 0.5, 0, 1, 0.5, 0]), r: Float64Array.from([0.05, 0.05]) };
  const w3 = new Float64Array(6); weights([a, b, side], 0.08, 0.3, 0.5, 0, w3);
  assert.ok(w3[2]! > 0.5, 'the side vein is the pixel\'s on its own capsule');
});

test('the real SVC skin: from the vein above to the trunk below the weights grade along the whole run through the skin, with no plateau and no step at either seam', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group();
  try {
    const set = new SkinSet({ vessel: (id) => scene.vesselObject(id), stateOf: () => undefined, make: (m, ax, arms) => new SkinObject(m, arms[0]!, ax, arms), add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {} });
    set.build(2);
    // (placed anatomy: the SVC's two junctions are 6.2 radii apart, so no skin merges them and hides SVC_RA_1 (the 2D figure's 'SVC_E+SVC'). The run through the azygos's junction SVC is the same weld: the vein above (V_UP) and the trunk below
    //  (SVC_RA_1) are one through-run, and its weights must grade along it the same way. The 2D axis was at x -0.267; the placed one is J's)
    const m = set.skinOf('SVC')!, ids = m.junction.arms.map((x) => x.vesselId), below = ids.indexOf('SVC_RA_1'), above = ids.indexOf('V_UP'), axisX = m.junction.J[0];
    assert.ok(below >= 0 && above >= 0, 'the SVC skin: the trunk below, the vein above');
    // the weights of the trunk below along the SVC's axis, by height: one bin per hundredth
    const bins = new Map<number, number[]>();
    for (let i = 0; i < m.position.length / 3; i++) {
      if (Math.abs(m.position[3 * i]! - m.position[0]!) > 1) continue;
      const x = m.position[3 * i]!, y = m.position[3 * i + 1]!;
      if (Math.abs(x - axisX) > 0.012) continue;
      const b = Math.round(y / 0.01), a = bins.get(b) ?? []; a.push(m.weight[4 * i + below]!); bins.set(b, a);
    }
    const ys = [...bins.keys()].sort((p, q) => q - p), w = ys.map((y) => bins.get(y)!.reduce((s, v) => s + v, 0) / bins.get(y)!.length);
    assert.ok(ys.length > 12, 'the stretch is meshed');
    assert.ok(w[0]! < 0.1 && w[w.length - 1]! > 0.95, `the trunk's share runs from ${w[0]!.toFixed(2)} at the top to ${w[w.length - 1]!.toFixed(2)} at the bottom`);
    let worst = 0, plateau = 0;
    for (let i = 1; i < w.length; i++) { worst = Math.max(worst, Math.abs(w[i]! - w[i - 1]!)); if (Math.abs(w[i]! - w[i - 1]!) < 0.005 && w[i]! > 0.2 && w[i]! < 0.8) plateau++; }
    assert.ok(worst < 0.2, `no step of ${worst.toFixed(2)} between neighbouring rings`);
    assert.ok(plateau === 0, 'and no plateau in the middle');
  } finally { scene.dispose(); setSmoothJoins(was); }
});
