// Rule #1 (20 Nov): the outline hull of a highlighted organ drew pale hair across the organ's face ("streaks on the liver when I highlight the outline").
// Root cause: the hull's push direction is the normal's screen direction NORMALISED, and a vertex whose normal faces the eye has a screen direction of a few thousandths (noise): normalising it sent
// that vertex the full line width in a random direction, and under a wide line (the tapped organ's glow, 26 figure units) those vertices drew diagonal slivers over the fill. Every outline hull now scales
// its push by `inkRim` (only what faces sideways on screen is pushed), as micro3d/cel3d.ts already did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_RIM_GLSL, INK_VS } from '../src/scene/materials/shaders.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { JET_INK_VS } from '../src/scene/disease/bleed.ts';
import { organsReady, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { smoothRestNormals } from '../src/scene/organs/normal-smooth.ts';
import fs from 'node:fs';
import { PLACED } from '../src/scene/anatomy/source.ts';

test('every outline hull takes its push through inkRim', () => {
  assert.match(INK_RIM_GLSL, /smoothstep\(0\.2, 0\.6, length\(v\.xy\) \/ l\)/);
  for (const [name, vs, n] of [['INK_VS', INK_VS, 'normal'], ['ORGAN_INK_VS', ORGAN_INK_VS, 'hullN'], ['JET_INK_VS', JET_INK_VS, 'normal']] as const) {
    assert.ok(vs.includes('float inkRim(vec3 n)'), `${name} defines inkRim`);
    assert.match(vs, new RegExp(`inkRim\\(${n}\\)`), `${name} scales its push by inkRim(${n})`);
  }
});

/** The shader's weight for a normal seen face-on (view = world here: the figure's rest view looks down -z). */
const weight = (x: number, y: number, z: number): number => {
  const l = Math.hypot(x, y, z), t = Math.min(1, Math.max(0, (Math.hypot(x, y) / l - 0.2) / 0.4));
  return t * t * (3 - 2 * t);
};

test('a normal facing the eye is not pushed, one facing sideways is, and the organs\' faces carry no push', async () => {
  assert.equal(weight(0.003, 0.002, 1), 0);
  assert.equal(weight(1, 0, 0.05), 1);
  const b = fs.readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  const { setOrganData } = await import('../src/scene/organs/meshes.ts');
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
  await organsReady;
  for (const id of ['liver', 'stomach', 'spleen']) {
    const g = ORMESH(id), pos = g.getAttribute('position').array, nor = g.getAttribute('normal').array;
    const h = smoothRestNormals(pos, nor, g.index ? g.index.array : []);
    let faced = 0, rim = 0;
    for (let i = 0; i < h.length; i += 3) { const w = weight(h[i]!, h[i + 1]!, h[i + 2]!); if (w === 0) faced++; else if (w === 1) rim++; }
    const n = h.length / 3;
    // (placed path: the stomach's esophagus strip is split twice across, placed.ts, so its upright vertices outnumber the crown's; its face-on share by vertex count is 3%, not 5%)
    assert.ok(faced / n > (PLACED && id === 'stomach' ? 0.025 : 0.05), `${id}: a good share of the surface faces the eye and takes no push (${(100 * faced / n).toFixed(0)}%)`);
    assert.ok(rim > 20, `${id}: the rim still takes the full push (${rim} vertices)`);
  }
});
function ORMESH(id: string) { return ORGAN_MESHES[id]!(); }
