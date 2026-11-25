// A balloon HUGS its vessel (Mohammad, 20 Nov: "maintained within the bounds of the blood vessel"; 25 Nov: "balloons everywhere on any catheter should wedge, hug the blood vessel, not be smaller than it"):
// ONE path (balloonFit) for the HVPG, BRTO, BATO and the TIPS / DIPS dilation balloons. Fully inflated, every ring lies inside the DRAWN lumen of the vessel it is in, and the barrel of the glass fills it to the wall
// (0.97 or more of the drawn radius, not the 2D route's nominal one), with short round caps. It swells smoothly: the barrel's radius never falls as the inflation rises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balloonFit, HUG } from '../src/scene/devices/catheters/proc-catheter.ts';
import { makeRings } from '../src/scene/devices/tube-rings.ts';
import { route3d, drawnShare } from '../src/scene/procedures/route3d.ts';
import { specFor } from '../src/ui/deck/procs-plan.ts';

function drawnAround(r3: NonNullable<ReturnType<typeof route3d>>, q: { c: { x: number; y: number; z: number } }): { radius: number; dist: number } {
  let best: { radius: number; dist: number } | null = null;
  for (const id of r3.route.ids) { const c = drawnShare(id, q.c.x, q.c.y, q.c.z); if (c && c.share < 1 && (!best || c.radius < best.radius)) best = c; }
  assert.ok(best, 'a ring lies in no drawn vessel');
  return best;
}

for (const kind of ['hvpg', 'brto', 'brtoC6', 'bato', 'tips', 'dips']) {
  const sp = specFor(kind) as { route?: string; balloonSpan?: string } | null;
  const span = sp?.balloonSpan ?? (kind === 'tips' || kind === 'dips' ? 'tract' : null);
  test(`${kind}: the inflated balloon hugs the drawn lumen`, () => {
    const r3 = route3d(sp?.route ?? kind);
    if (!r3) return;   // (a kind with no route here)
    const rings = makeRings(41);
    balloonFit(r3, r3.rc, 1, r3.tipD(1), span, rings);
    let fullest = 0;
    for (const q of rings) {
      if (q.r < 0.002) continue;   // (the round caps)
      const c = drawnAround(r3, q);
      assert.ok(c.dist + q.r <= c.radius * 1.001, `${kind}: ring reaches ${(c.dist + q.r).toFixed(4)} of a drawn lumen ${c.radius.toFixed(4)}`);
      fullest = Math.max(fullest, q.r / c.radius);
    }
    assert.ok(fullest >= 0.97 && fullest <= HUG + 1e-6, `${kind}: the barrel fills ${fullest.toFixed(3)} of the lumen`);
  });
  test(`${kind}: the barrel only widens as the balloon inflates`, () => {
    const r3 = route3d(sp?.route ?? kind);
    if (!r3) return;
    let prev = 0;
    for (let k = 1; k <= 10; k++) {
      const rings = makeRings(41);
      balloonFit(r3, r3.rc, k / 10, r3.tipD(1), span, rings);
      const mid = Math.max(...rings.map((q) => q.r));
      assert.ok(mid >= prev - 1e-9, `${kind}: radius fell from ${prev} to ${mid} at ${k / 10}`);
      prev = mid;
    }
  });
}
