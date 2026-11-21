// Mohammad, 21 Nov: with the wedge full, the junction skin was a brighter patch than its tubes, gone with ?joins=nodust. ROOT CAUSE: the skin crossfades its arms' dust frames and renormalises by their shares (dust /= aN), so where NEITHER
// arm's cylinder holds (the fillet, the web between the arms) the dust one frame still sees was drawn at full strength, a slab of particle tones over the wall. A tube draws none past its own lumen. The dust now fades with the best frame's hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';

/** The CPU twin of the shader's weighting of the two frames' dust (shaders.ts: a0, a1, aN, the hold): the share of the dust drawn. */
const share = (w1: number, inD0: number, inD1: number): number => {
  const a0 = (1 - w1) * inD0, a1 = w1 * inD1, aN = a0 + a1;
  if (aN <= 1e-4) return 0;
  return (a0 + a1) / aN * Math.max(a0 > 0.004 ? inD0 : 0, a1 > 0.004 ? inD1 : 0);
};

test('the dust of a join is whole where an arm holds and fades to nothing where none does', () => {
  assert.equal(share(0.5, 1, 0), 1, 'one frame holds: whole');
  assert.equal(share(0.2, 1, 1), 1, 'both hold: whole');
  assert.ok(share(0.5, 0.05, 0.02) < 0.06, 'neither holds (the fillet): nearly none, not a full-strength slab');
  let was = 0;
  for (let k = 0; k <= 20; k++) { const v = share(0.5, k / 20, k / 40); assert.ok(v >= was - 1e-9, 'it grows smoothly with the hold, no step'); was = v; }
});

test('the shader applies that hold after renormalising', () => {
  assert.match(SKIN_FS, /dust \/= aN;[\s\S]*dust \*= max\(a0 > 0\.004 \? inD0 : 0\.0, a1 > 0\.004 \? inD1 : 0\.0\);/);
});

// 21 Nov, Mohammad: a pale smear at the chevron in the crotch: a head whose centre sat where two arms are equally near was drawn by both at half strength, two chevrons over each other. The ownership is steepened by a symmetric ease.
test('a head\'s ownership is eased steeply and symmetrically: a pair of arms still shares one head (the shares add to 1), and the shared stretch is narrow', () => {
  const ss = (x: number): number => { const t = Math.min(1, Math.max(0, (x - 0.25) / 0.5)); return t * t * (3 - 2 * t); };
  for (let k = 0; k <= 20; k++) { const s = k / 20; assert.ok(Math.abs(ss(s) + ss(1 - s) - 1) < 1e-12, `a pair adds to 1 at ${s}`); }
  assert.equal(ss(0.2), 0); assert.equal(ss(0.8), 1);
  assert.match(SKIN_FS, /return smoothstep\(0\.25, 0\.75, mine \/ max\(sum, 1\.0e-6\)\);/);
});
