// The arrival times have no stipple (Mohammad, 23 Nov 2026: a wedge of black speckle beside the lymph at the portal corner). Root cause: where two septa overlap over a near-common course (a hex edge's end and a spur leaving the same corner),
// "the nearest centre line wins" flipped from texel to texel, so an early and a late arrival alternated across the overlap; at a growth between them the band showed as a speckle of holes. A pixel the band holds is now given by the band it is most
// inside, the earlier of two that are about as deep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { PLATE_BOX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { NEVER } from '../src/scene/lobule/growth.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';

export function isolatedFlips(tau: Uint8Array, n: number, jump = 25): { flips: number; covered: number } {
  let flips = 0, covered = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x, t = tau[4 * i]!;
    if (t === NEVER) continue;
    covered++;
    const l = tau[4 * (i - 1)]!, r = tau[4 * (i + 1)]!, u = tau[4 * (i - n)]!, d = tau[4 * (i + n)]!;
    const far = (o: number): boolean => o !== NEVER && Math.abs(o - t) > jump;
    if (far(l) && far(r) || far(u) && far(d)) flips++;   // (a texel unlike both its neighbours on a line: a stipple; a band's edge changes on one side only)
  }
  return { flips, covered };
}

test('the septa\'s arrival times hold no stipple: no texel is unlike both its neighbours on a line (N 2048, every band)', () => {
  const N = 2048, B = PLATE_BOX * PLATE_S, shape = { ...plateShape(buildLobule()), cells: [] };
  const tau = collagenTau(shape, DISC_R.cv * PLATE_S, N, B);
  const { flips, covered } = isolatedFlips(tau, N);
  assert.ok(covered > 100000, `the bands cover texels (${covered})`);
  assert.ok(flips <= covered * 0.0002, `${flips} isolated flips in ${covered} covered texels`);
});

test('the detector sees a stipple (a texel row alternating early and late)', () => {
  const n = 8, t = new Uint8Array(n * n * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) t[4 * (y * n + x)] = x % 2 ? 148 : 18;
  assert.ok(isolatedFlips(t, n).flips > 20);
});
