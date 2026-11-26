// The dilation balloon visibly inflates IN the tract (owner, 26 Nov 2026: "dilation of the tract of TIPS should show the balloon actually inflating in the tract; now it looks collapsed").
// Root cause: the catheter's route sized itself to the veins' width from the ENGINE's diameters only, while the vessel shader draws the larger of the engine's and the run's own tract (tract-override.ts). While the
// run dilates the tract the engine's shunt is still closed (D = 0), so the route saw a pinched vein (swell 0.2): the balloon was held under that pinched lumen, a thin sleeve on the catheter, inside a tract drawn
// at full width. Now both read the width through `drawnWidthD`, so at its peak the balloon fills the tract as drawn (HUG of its lumen) at the step's own diameter, whatever the diameter, on every TIPS and DIPS run.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { balloonFit, HUG } from '../src/scene/devices/catheters/proc-catheter.ts';
import { makeRings } from '../src/scene/devices/tube-rings.ts';
import { route3d, drawnShare } from '../src/scene/procedures/route3d.ts';
import { specFor } from '../src/ui/deck/procs-plan.ts';
import { setDrawnDiameter } from '../src/engine/tract-override.ts';
import { EDGE_COUNT, indexOf } from '../src/engine/vessel-data.ts';
import { NETWORK, NETWORK_BY_ID, SHUNT_IDS } from '../src/scene/vessels/network.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { tractDiameter, tractEdgeOf, tractTimes } from '../src/scene/procedures/tract.ts';

/** The engine as it is during the dilation: every vein at its built width, the shunt not yet in (D = 0). */
function closedShuntD(): Float32Array {
  const D = new Float32Array(EDGE_COUNT);
  for (const v of NETWORK) { const k = indexOf(v.lensId); if (k != null && k >= 0 && !SHUNT_IDS.has(v.id)) D[k] = v.baseD; }
  return D;
}
afterEach(() => { setDrawnDiameter('TIPS', 0); setDrawnDiameter('DIPS', 0); });

for (const kind of ['tips', 'tipscoil', 'dips']) {
  const sp = specFor(kind) as { route?: string; balloonSpan?: string; T?: unknown } | null;
  const T = tractTimes(sp?.T);
  if (!sp || !T) continue;
  const span = sp.balloonSpan ?? 'tract', edge = tractEdgeOf(kind), v = NETWORK_BY_ID.get(edge)!;
  for (const stentMm of [6, 8, 10, 12]) {
    test(`${kind}: at its peak the balloon fills a ${stentMm} mm tract (its drawn lumen), not a collapsed sleeve`, () => {
      const r3 = route3d(sp.route ?? kind);
      assert.ok(r3, `${kind} has a route`);
      // (the run's table draws the tract at the step's diameter at the balloon's peak; the engine's shunt is still closed)
      setDrawnDiameter(edge, tractDiameter(T, T.inflate1, stentMm));
      r3.setLive(closedShuntD());
      const rings = makeRings(41);
      balloonFit(r3, r3.rc, 1, r3.tipD(1), span, rings);
      let fullest = 0, wide = 0;
      // (the barrel's middle half lies in the tract itself; its ends run on into the hepatic and portal veins, whose width the run does not change)
      for (const q of rings.slice(10, 31)) {
        wide = Math.max(wide, q.r);
        const best = drawnShare(edge, q.c.x, q.c.y, q.c.z);
        if (!best || best.share >= 1) continue;
        // (the lumen as the vessel shader draws it at the step's diameter: the built radius times the width rule's swell)
        const lumen = best.radius * widthSwell(v.widthKind, v.baseD, stentMm);
        assert.ok(q.r + best.dist <= lumen * 1.002, `${kind}: a ring reaches past the ${stentMm} mm tract (${(q.r + best.dist).toFixed(4)} of ${lumen.toFixed(4)})`);
        fullest = Math.max(fullest, q.r / lumen);
      }
      assert.ok(fullest >= 0.97 && fullest <= HUG + 1e-6, `${kind}: the barrel fills ${fullest.toFixed(3)} of the ${stentMm} mm tract`);
      assert.ok(wide > r3.rc * 2.5, `${kind}: the barrel (${wide.toFixed(4)}) is a real balloon, wider than the shaft (${r3.rc.toFixed(4)})`);
    });
  }
  test(`${kind}: the balloon follows the tract as the run widens it, wider at the peak than a third of the way up, and the tract it leaves stays dilated as it deflates`, () => {
    const r3 = route3d(sp.route ?? kind)!;
    const barrel = (t: number, bl: number): number => {
      setDrawnDiameter(edge, tractDiameter(T, t, 8));
      r3.setLive(closedShuntD());
      const rings = makeRings(41);
      balloonFit(r3, r3.rc, bl, r3.tipD(1), span, rings);
      return rings[20]!.r;   // (the barrel's middle: in the tract)
    };
    const third = T.inflate0 + (T.inflate1 - T.inflate0) / 3;
    const early = barrel(third, 1 / 3), peak = barrel(T.inflate1, 1), down = barrel(T.inflate1 + 2000, 0.05);
    assert.ok(peak > early * 1.3, `${kind}: ${early.toFixed(4)} then ${peak.toFixed(4)}`);
    assert.ok(down < peak * 0.5, `${kind}: the balloon lets down (${down.toFixed(4)} from ${peak.toFixed(4)})`);
  });
}
