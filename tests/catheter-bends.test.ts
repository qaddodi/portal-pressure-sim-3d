// The IR catheters take generous bends (20 Nov 2026, "shape smoothness, roundedness at corners"): the route's path is smoothed to a minimum bend radius, so no step of a swept tube turns sharply,
// and every sample stays inside its vessel's lumen with the shaft's own radius to spare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

for (const kind of ['hvpg']) {
  test(`the ${kind} catheter's path has no sharp elbow`, () => {
    const r3 = route3d(kind)!, r = r3.route, U = UNITS_PER_SCENE, step = r3.rc * U * 1.2;
    const a = new Vector3(), b = new Vector3();
    let worst = 0;
    // (only the stretch the shaft lies on: it ends at the tip, and the route runs on past it into a branch the catheter never enters)
    for (let d = step; d < r.free - step; d += step) {
      r3.dir(d - step, a); r3.dir(d + step, b);
      worst = Math.max(worst, Math.acos(Math.min(1, a.dot(b))));
    }
    // Measured over about 9 units of path (two steps and the direction's own window). Before the smoothing the sharpest was 0.99 rad (the lead-in and the cava's turn into the hepatic vein); the vessel's own elbow
    // and the lumen's room bound what is left, so this holds the gain: a tube swept through it has no kink.
    assert.ok(worst < 0.9, `sharpest turn ${worst.toFixed(2)} rad over two steps`);
  });
}
