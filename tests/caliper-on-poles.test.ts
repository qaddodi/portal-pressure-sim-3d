// A length caliper stands on the measured organ's own poles (27 Nov, "the caliper is missing the target": the spleen's 16.8 cm line stood 30 px to the side of the spleen and ran past its lower tip).
// Root cause pinned: the caliper's ends were two hand-read points of the 2D plate, laid on the 3D plate by the plain 2D map at the front plane (z 0.26), as if the approved placement had not moved the
// spleen (X = 0.84 x - 0.072) and put it 0.48 behind that plane, where the camera turns the gap in depth into a sideways shift. The rule: the ends are vertices of the organ's mesh (organ-axis.ts poleEnds),
// carried by the same group move the organ wears (scaleAbout), so no map, depth or size can leave a caliper off its organ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Vector3, type BufferGeometry } from 'three';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { poleEnds, scaleAbout, placedPoint } from '../src/scene/organs/organ-axis.ts';
import { planeMap, mapX, mapY } from '../src/scene/organs/placed-map.ts';
import { SPLEEN_CENTER } from '../src/scene/disease/copied/anatomy-b4.ts';
import { SPLEEN_BASE_ML } from '../src/scene/disease/targets.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
await organsReady;

const spleen = (): BufferGeometry => ORGAN_MESHES['spleen']!();
/** The mesh's reach along the axis through the two ends, and how far any vertex of `g` (moved by `at`) lies beyond them. */
function overshoot(g: BufferGeometry, ends: readonly [Vector3, Vector3], at: (v: Vector3, o: Vector3) => Vector3): number {
  const pos = g.getAttribute('position'), a = ends[0], ax = new Vector3().subVectors(ends[1], a), len = ax.length(), u = ax.clone().divideScalar(len), v = new Vector3(), w = new Vector3();
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    at(v.fromBufferAttribute(pos, i), w);
    const t = w.sub(a).dot(u);
    worst = Math.max(worst, -t, t - len);
  }
  return worst;
}

test('every organ\'s poles are vertices of its own mesh, and no vertex of it reaches past them along the axis', () => {
  let n = 0;
  for (const id of ['spleen', 'liver', 'kidney-l', 'stomach', 'heart']) {
    const mesh = ORGAN_MESHES[id];
    if (!mesh) continue;
    const g = mesh(), [p, q] = poleEnds(g), pos = g.getAttribute('position'), v = new Vector3();
    for (const e of [p, q]) {
      let on = false;
      for (let i = 0; i < pos.count && !on; i++) on = v.fromBufferAttribute(pos, i).equals(e);
      assert.ok(on, `${id}: a pole is a vertex of the surface`);
    }
    assert.ok(overshoot(g, [p, q], (x, o) => o.copy(x)) < 0.05 * p.distanceTo(q), `${id}: nothing reaches past the poles (an organ that is not symmetric lets the line between its two poles lean a little off the principal axis)`);
    n++;
  }
  assert.ok(n >= 4, `${n} organs checked`);
});

test('the spleen\'s poles stand at its top and its bottom, inside its depth: the picture where it is drawn, never two points of the unmoved 2D plate', () => {
  const g = spleen(); g.computeBoundingBox();
  const bb = g.boundingBox!, [p, q] = poleEnds(g), hi = p.y > q.y ? p : q, lo = p.y > q.y ? q : p, h = bb.max.y - bb.min.y;
  assert.ok(hi.y > bb.max.y - 0.02 * h && lo.y < bb.min.y + 0.02 * h, 'pole to pole is the organ\'s whole length');
  for (const e of [p, q]) {
    assert.ok(e.x >= bb.min.x && e.x <= bb.max.x, 'a pole is over the organ in x');
    assert.ok(e.z >= bb.min.z && e.z <= bb.max.z, `a pole is at the organ's depth (z ${e.z.toFixed(3)} of ${bb.min.z.toFixed(3)}..${bb.max.z.toFixed(3)}), not on the front plane`);
  }
  // the old ends (2D's hand-read points, plain map, z 0.26) were off the organ: that is the bug this test keeps out
  const old = [[1030, 268], [1040, 460]].map(([x, y]) => new Vector3(x3(x!), y3(y!), 0.26));
  assert.ok(old.every((e) => Math.abs(e.z - (bb.min.z + bb.max.z) / 2) > 0.3), 'the old front-plane ends stood 0.4 and more in front of the spleen');
  const m = planeMap('spleen');
  assert.ok(Math.abs(mapX(m, old[0]!.x) - p.x) < 0.05 || Math.abs(mapX(m, old[0]!.x) - q.x) < 0.05, 'the placed map explains the sideways shift (the old x was the unplaced one)');
  assert.ok(Math.abs(old[0]!.x - hi.x) > 0.1, 'the old end was over 0.1 scene units (30 px of the 2D plate) off the pole in x');
});

test('a spleen drawn at 16.8 cm: the caliper\'s ends are the poles of the scaled spleen, and its length is that reading over the base', () => {
  const g = spleen(), poles = poleEnds(g), L = poles[0].distanceTo(poles[1]);
  const m = planeMap('spleen'), pv = new Vector3(mapX(m, x3(SPLEEN_CENTER[0])), mapY(m, y3(SPLEEN_CENTER[1])), 0);
  for (const cm of [SPLEEN_BASE_ML, 16.8, 8]) {
    const k = cm / SPLEEN_BASE_ML, grp = new Group();
    scaleAbout(grp, pv, k);
    const a = placedPoint(grp, poles[0], new Vector3()), c = placedPoint(grp, poles[1], new Vector3());
    assert.ok(Math.abs(a.distanceTo(c) - L * k) < 1e-6, `${cm} cm: the caliper is ${k.toFixed(3)} times the spleen at rest`);
    assert.ok(overshoot(g, [a, c], (v, o) => placedPoint(grp, v, o)) < 1e-6, `${cm} cm: no point of the drawn spleen reaches past a caliper end`);
    // (it grows about the spleen's own pivot, so the pivot stays where it was and the poles move apart from it along the axis)
    const was = new Vector3().copy(poles[0]).sub(pv).length(), now = a.clone().sub(pv).length();
    assert.ok(Math.abs(now - was * k) < 1e-6, `${cm} cm: grown about the pivot`);
  }
});

test('a slide\'s spleen caliper names the organ, not a place on the plate; its reading is the model\'s own length', () => {
  const fp = { spleen: 16.8 } as never;
  const c = figureCalls(figurePlan({ id: 'k', line: '', calipers: ['spleen'] } as unknown as CopiedSlide), { fp });
  assert.deepEqual(c.calipers[0]!.line, { organ: 'spleen' });
  assert.match(c.calipers[0]!.text, /16\.8/);
});
