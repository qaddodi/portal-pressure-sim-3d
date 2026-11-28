// J9 (review of 27 Nov): the stray-hole rule "a loop under a quarter of the longest, when there are more loops than seams" must not take a thin arm's own seam for a hole.
// A thin collateral on the cava has a short seam beside the cava's long ones; it is the loop nearest its own arm's centre, so a seam owns it and it is never capped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strayLoops } from '../src/scene/vessels/skin/sheet-caps.ts';

/** A ring of `n` points of radius `r` round (cx, cz) in the plane y = 0, appended to `pos`. */
function ring(pos: number[], cx: number, cz: number, r: number, n: number): number[] {
  const loop: number[] = [];
  for (let q = 0; q < n; q++) { loop.push(pos.length / 3); pos.push(cx + r * Math.cos((2 * Math.PI * q) / n), 0, cz + r * Math.sin((2 * Math.PI * q) / n)); }
  return loop;
}

test('a thin arm\'s short seam is never capped as a stray hole, with more loops than seams and the loop under a quarter of the longest', () => {
  const pos: number[] = [];
  // two cava seams (48 points each) and a collateral's seam (10 points: 10 x 4 < 48), plus one real hole 1.5 radii from the collateral's seam
  const cavaA = ring(pos, 0, 0, 3, 48), cavaB = ring(pos, 0, 20, 3, 48), thin = ring(pos, 10, 10, 0.8, 10), hole = ring(pos, 11.2, 10, 0.1, 6);
  const cen = [[0, 0, 0], [0, 0, 20], [10, 0, 10]] as const, rad = [3, 3, 0.8];
  const stray = strayLoops([cavaA, cavaB, thin, hole], pos, cen, rad);
  assert.ok(!stray.includes(thin), 'the collateral\'s own seam is kept');
  assert.ok(!stray.includes(cavaA) && !stray.includes(cavaB), 'the cava seams are kept');
  assert.deepEqual(stray, [hole], 'only the hole no seam owns is capped');
});

test('the same short loop IS capped when no arm owns it (a hole beside a thin seam stays a hole)', () => {
  const pos: number[] = [];
  const cavaA = ring(pos, 0, 0, 3, 48), cavaB = ring(pos, 0, 20, 3, 48), thin = ring(pos, 10, 10, 0.8, 10), hole = ring(pos, 11.2, 10, 0.1, 6);
  // the hole alone beside the cava seams and the thin one: counted by the arms (3), four loops: the hole is the extra
  assert.deepEqual(strayLoops([thin, cavaA, hole, cavaB], pos, [[0, 0, 0], [0, 0, 20], [10, 0, 10]], [3, 3, 0.8]), [hole]);
});

