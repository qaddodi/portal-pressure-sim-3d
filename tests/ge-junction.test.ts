// The gastro-oesophageal junction is read from the stomach mesh itself, in all three axes (owner, 26 Nov 2026: "the direction the gastric balloon is being tugged is not right; these
// are anterior and posterior views and
// you can clearly see it's missing the GE junction"). Root cause: the tamponade tube was seated from the 2D app's waypoints, but the placed 3D stomach is a different shape with depth,
// so from any view but the front the tube
// left the oesophagus's wall early. These tests pin what the junction is: the opening where the narrow oesophageal tube meets the roof, the way the oesophagus runs into it, and the
// mesh as a signed distance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_MESHES, organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { ESO_X, geJunction } from '../src/scene/organs/ge-junction.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const U = 300;

async function junction() {
  await organsReady;
  const geo = ORGAN_MESHES.stomach!();
  return { geo, j: geJunction(geo), pos: geo.getAttribute('position').array as Float32Array };
}
/** The width (x) of the mesh at height y: the vertices within a hair of it. */
function widthAt(pos: Float32Array, y: number): number {
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 1]! - y) < 0.006) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); }
  return x1 - x0;
}

test('the opening is where the narrow oesophageal tube ends and the stomach\'s roof begins', async () => {
  const { j, pos } = await junction();
  assert.ok(widthAt(pos, j.centre[1] + 0.05) <= ESO_X, 'above the opening the mesh is the narrow tube');
  assert.ok(widthAt(pos, j.centre[1] - 0.06) > ESO_X * 1.5, 'below it the mesh is the stomach\'s wide roof');
  assert.ok(j.radius * U > 5 && j.radius * U < 14, `the opening's radius is the oesophagus's (${(j.radius * U).toFixed(1)} figure units)`);
  assert.ok(j.clearance(...j.centre) > 0.5 / U * 4, 'the middle of the opening is inside the lumen');
});

test('the oesophagus runs down into the opening, and the tube goes on into the lumen, turning no more than 70 degrees', async () => {
  const { j } = await junction();
  assert.ok(j.normal[1] < -0.95, `the oesophagus runs down (${j.normal.map((v) => v.toFixed(2)).join(', ')})`);
  assert.ok(Math.abs(Math.hypot(...j.normal) - 1) < 1e-9 && Math.abs(Math.hypot(...j.into) - 1) < 1e-9, 'both are unit directions');
  const turn = (Math.acos(j.normal[0] * j.into[0] + j.normal[1] * j.into[1] + j.normal[2] * j.into[2]) * 180) / Math.PI;
  assert.ok(turn <= 70 + 1e-6, `the turn into the lumen is ${turn.toFixed(0)} degrees`);
  assert.ok(j.into[1] < -0.3, 'and it goes on down, into the stomach');
  for (const t of [0.05, 0.1, 0.15]) {
    const c = j.clearance(j.entry[0] + j.into[0] * t, j.entry[1] + j.into[1] * t, j.entry[2] + j.into[2] * t);
    assert.ok(c > 0, `the way on is inside the lumen ${(t * U).toFixed(0)} units on`);
  }
});

test('the tube\'s pass through the opening is a point of the opening itself', async () => {
  const { j } = await junction();
  const off = Math.hypot(j.entry[0] - j.centre[0], j.entry[1] - j.centre[1], j.entry[2] - j.centre[2]);
  assert.ok(off <= 0.6 * j.radius + 1e-9, `the pass is ${(off * U).toFixed(1)} units off the centre of a ${(j.radius * U).toFixed(1)} radius`);
  const along = (j.entry[0] - j.centre[0]) * j.normal[0] + (j.entry[1] - j.centre[1]) * j.normal[1] + (j.entry[2] - j.centre[2]) * j.normal[2];
  assert.ok(Math.abs(along) < 1e-9, 'in the opening\'s plane');
});

test('the mesh\'s signed distance: positive in the lumen, negative outside, and the same as the distance to the wall', async () => {
  const { j, pos } = await junction();
  assert.ok(j.clearance(0.6, 0.7, 0.0) > 30 / U, 'deep in the stomach there is room all round');
  assert.ok(j.clearance(0.0, 1.0, -0.06) < 0, 'beside the stomach is outside');
  assert.ok(j.clearance(0.5, 0.9, 0.6) < 0, 'in front of it is outside');
  assert.ok(j.clearance(0.5, 0.0, -0.05) < 0, 'below the field is outside');
  // against the nearest vertex of the mesh (the mesh is dense: its vertices are within a hair of the true wall): within two figure units
  for (const [x, y, z] of [[0.33, 1.0, -0.06], [0.5, 0.9, -0.05], [0.6, 0.7, 0.0], [0.45, 0.8, 0.05], [0.7, 0.6, 0.1]] as const) {
    let m = Infinity;
    for (let i = 0; i < pos.length; i += 3) m = Math.min(m, Math.hypot(pos[i]! - x, pos[i + 1]! - y, pos[i + 2]! - z));
    assert.ok(Math.abs(j.clearance(x, y, z) - m) * U < 2, `at (${x}, ${y}, ${z}) the field says ${(j.clearance(x, y, z) * U).toFixed(1)}, the nearest vertex is ${(m * U).toFixed(1)}`);
  }
});
