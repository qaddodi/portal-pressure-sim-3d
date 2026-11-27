// An overlay that stands on an organ or a vessel stands at THAT thing's depth, never on one plane for the whole figure (27 Nov, the 2D-plate audit; the same root cause as the spleen caliper, tests/caliper-on-poles.test.ts).
// The 2D figure was one flat plate, so a 2D point had no depth and 0.26 was "the front". The approved placement gives every organ its own depth (spleen front -0.12, kidney -0.17) and puts the varix at about -0.03;
// the camera's 14 degree turn changes a depth gap into a sideways slide, so a mark at 0.26 on the spleen, or a ring at 0.36 on the varix, floats beside what it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { PLACED_ORGAN_BOX } from '../src/scene/anatomy/placed-organs.generated.ts';
import { hasOrganFront, organFrontZ, organMidZ } from '../src/scene/organs/organ-front.ts';
import { silhouettes } from '../src/scene/labels/organ-screen.ts';
import { organAnchor } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint } from '../src/scene/labels/figure-cards.ts';
import { ORGAN_ANCHOR_2D } from '../src/scene/labels/figure2d.copied.ts';
import { ScopeRing, ringZ, RING_REST } from '../src/scene/disease/scope-ring.ts';
import { tearAt } from '../src/scene/disease/stream-fit.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const OLD_PLANE = 0.26;

test('an organ\'s front and middle depth are the placed organ\'s own', () => {
  for (const [id, b] of Object.entries(PLACED_ORGAN_BOX)) {
    assert.equal(organFrontZ(id), b[5], `${id} front`);
    assert.equal(organMidZ(id), (b[2] + b[5]) / 2, `${id} middle`);
    assert.ok(organMidZ(id) <= organFrontZ(id));
  }
  assert.equal(organFrontZ('kidney'), organFrontZ('kidney-l'), 'the cards say "kidney"');
  assert.throws(() => organFrontZ('nope'), /no organ/);
  // the organs the old plane was wrong for are the ones the placement moved back: that is what this test is about
  assert.ok(OLD_PLANE - organFrontZ('spleen') > 0.3 && OLD_PLANE - organFrontZ('kidney-l') > 0.3, 'the spleen and kidney stand well behind the old plane');
});

test('an organ\'s mark stands on the organ\'s own front, every organ the figure marks', () => {
  const out = new Vector3();
  let n = 0;
  for (const organ of Object.keys(ORGAN_ANCHOR_2D)) {
    // (the caudate lobe's mark stands on its egg's own dome: tests/caudate-lobe.test.ts)
    if (organ === 'caudate') continue;
    n++;
    const a = organAnchor(organ);
    assert.ok('at2d' in a, organ);
    assert.ok(Number.isFinite(a.z) && a.z !== OLD_PLANE, `${organ}: has its own depth`);
    assert.equal(anchorPoint(a, out)!.z, a.z, `${organ}: the point the card is drawn from`);
    if (hasOrganFront(organ)) assert.equal(a.z, organFrontZ(organ), `${organ}: its mark's depth`);
  }
  assert.ok(n >= 12, 'the organs the figure marks');
});

test('an organ\'s silhouette on the canvas is projected at that organ\'s own depth', () => {
  const asked = new Set<number>();
  const sil = silhouettes((x, y, z) => { asked.add(z); return [x, y]; });
  assert.ok(sil.rings.size >= 7);
  assert.ok(asked.size > 1 && !asked.has(OLD_PLANE), 'no organ is judged on the old shared plane');
  for (const id of ['spleen', 'kidney-l', 'stomach', 'liver', 'heart', 'esophagus']) assert.ok(asked.has(organMidZ(id)), `${id} at its middle depth`);
});

// a turned camera, as the figure's: what the canvas does to a gap in depth
function slide(gap: number): number {
  const cam = new PerspectiveCamera(30, 800 / 600, 0.1, 100);
  cam.position.set(Math.sin(0.18) * 5, 0, Math.cos(0.18) * 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const px = (z: number): number => new Vector3(0.3, 1.1, z).project(cam).x * 400;
  return Math.abs(px(0 + gap) - px(0));
}

test('the scope ring stands on its varix at the varix\'s depth (the turned figure keeps them together)', () => {
  const t = tearAt('VAR');
  assert.ok(Math.abs(ringZ(t.y) - t.z) < 0.01, `the ring's depth at the tear ${ringZ(t.y)} is the vein's near surface ${t.z}`);
  assert.ok(Math.abs(ringZ(206) - t.z) < 0.05, 'and at rest');
  const r = new ScopeRing();
  r.setCentre([t.x, t.y]); r.set(true, true); r.step(1, true);
  const c = (r as unknown as { mat: { uniforms: { uC: { value: Vector3 } } } }).mat.uniforms.uC.value;
  assert.ok(Math.abs(c.x - x3(t.x)) < 1e-6 && Math.abs(c.y - y3(t.y)) < 1e-6);
  const gap = Math.abs(c.z - t.z);
  assert.ok(slide(gap) < 1.5, `at the varix's depth the ring slides ${slide(gap).toFixed(2)} px on a turned view`);
  assert.ok(slide(OLD_PLANE + 0.1 - t.z) > 10, 'the control: at the old plane (0.36) the same ring slid off its vein');
  r.dispose();
});

test('at rest the scope ring is centred on the placed varix, not on the 2D plate\'s esophagus', async () => {
  const { PLACED_PATH_2D } = await import('../src/scene/anatomy/placed-network.ts');
  const { RING } = await import('../src/scene/disease/copied/scope-lens-rule.js');
  const c = PLACED_PATH_2D['C1a']!;
  const at = c.reduce((b, p) => (Math.abs(p[1] - RING.y) < Math.abs(b[1] - RING.y) ? p : b), c[0]!);
  assert.ok(Math.abs(RING_REST.x - at[0]) < 1e-9 && RING_REST.y === RING.y, 'on the vein at the rule\'s height');
  assert.ok(Math.abs(RING.x - at[0]) > RING.r * 0.7, 'the 2D point was about a ring radius off it');
});
