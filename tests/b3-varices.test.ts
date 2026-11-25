// Mohammad, 20 Nov: "Coronary vein into EV is not smoothly connected" (a wide tube ending in a blunt shoulder on a thinner vein, and a pinched knot where the vein splits into the columns);
// "Esophageal varices should be more prominent in anatomy view. Can make them beaded a little bit".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID, RUN_ONS } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, VARIX_THICK } from '../src/scene/vessels/shape.ts';
import { factorSpan } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { bundleShare } from '../src/scene/vessels/shape.ts';
import { VARIX_BEAD_FLOOR } from '../src/scene/vessels/shape-track.ts';

const strands = () => coursesOf(NETWORK_BY_ID.get('C1a')!, { ...REST, strandsOn: true }).filter((c) => c.radius > 0);
const endR = (c: { radius: number; taper?: readonly [number, number]; taperSpan?: readonly [number, number] }, u: number) => c.radius * factorSpan(c.taper ?? [1, 1], c.taperSpan ?? [0.3, 0.3], u);

test('each varix strand starts exactly as wide as the coronary vein it comes from and ends as wide as the esophageal trunk it joins (no shoulder, a smooth ease between)', () => {
  for (const on of [true]) {
    setSmoothJoins(on);
    try {
      // (placed: every run-on eases both vessels to one width at the join (network.ts meetRadius), the collaterals' too: the strands start and end at the width the coronary vein and the trunk have THERE)
      const at = (id: string, mate: string) => { const r = RUN_ONS.find((x) => (x.a === id && x.b === mate) || (x.b === id && x.a === mate))!, e = r.a === id ? r.ia : r.ib, c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!; return c.radius * (c.taper?.[e] ?? 1); };
      const lgv = at('LGV_CONF', 'C1a'), c1b = at('C1b', 'C1a');
      const cs = strands();
      assert.ok(cs.length >= 3, 'three columns');
      for (const c of cs) {
        // (the strands land on one point and together make the trunk's width there: each takes 1/sqrt(n) of it, shape.ts bundleShare; before 21 Nov each took all of it, a bulb)
        // (the weave gathers the strands onto one axis at both ends: their union is one strand wide there, so each is the trunk's whole width: bundleShare of one; 22 Nov, "coronary vein into varices look not welded")
        const w0 = bundleShare(c.sewn?.[0], 1), w1 = bundleShare(c.sewn?.[1], 1);
        assert.ok(Math.abs(endR(c, 0) - lgv * w0) < 1e-9, `starts at the coronary vein's calibre shared among the strands (${endR(c, 0)} vs ${lgv * w0})`);
        assert.ok(Math.abs(endR(c, 1) - c1b * w1) < 1e-9, 'ends at the trunk\'s calibre, shared');
        // monotone ease from the foot to the column's own width: never a dip below the column (a pinch)
        let prev = endR(c, 0);
        for (let u = 0.02; u <= 0.42; u += 0.02) { const r = endR(c, u); const lo = Math.min(endR(c, 0), c.radius), hi = Math.max(endR(c, 0), c.radius), up = c.radius > endR(c, 0); assert.ok(r >= lo - 1e-12 && r <= hi + 1e-12 && (up ? r >= prev - 1e-12 : r <= prev + 1e-12), `no pinch at ${u.toFixed(2)}`); prev = r; }
      }
    } finally { setSmoothJoins(false); }
  }
});

test('the varices are drawn thicker than 2D\'s strands, and always a little beaded, more so the bigger they are', () => {
  assert.ok(VARIX_THICK > 1.1 && VARIX_THICK < 1.5);
  const v = NETWORK_BY_ID.get('C1a')!;
  assert.ok(strands()[0]!.radius > v.radius * 0.5 * 0.9, 'a column is wider than 2D\'s');
  assert.ok(VARIX_BEAD_FLOOR >= 0.1 && VARIX_BEAD_FLOOR <= 0.25, 'a soft bead, not a knot');
});

test('a collateral that runs into a thinner vessel narrows to that vessel\'s calibre at its end (the azygos collateral on the azygos, the paraumbilical vein on the epigastric vein) and keeps its own where it ends on a wider one', () => {
  setSmoothJoins(true);
  const end = (id: string, e: 0 | 1) => { const c = coursesOf(NETWORK_BY_ID.get(id)!, { ...REST, strandsOn: true })[0]!; return c.radius * (c.taper?.[e] ?? 1); };
  // (placed: C9 is the azygos's own lower piece and runs on into its arch: the two meet at one width, the arch's start)
  assert.ok(Math.abs(end('C9', 1) - (NETWORK_BY_ID.get('AZY_SVC')!.radius * (coursesOf(NETWORK_BY_ID.get('AZY_SVC')!, REST)[0]!.taper?.[0] ?? 1))) < 1e-9, 'C9 meets the azygos at its calibre');
  // (since 67ed12d1 the paraumbilical vein ends in the caput's hub and narrows to the widest root of the fan there, never wider than the epigastric vein it is mated to)
  const fan = coursesOf(NETWORK_BY_ID.get('C3~F:caput')!, { ...REST, live: 1 }), hub = Math.max(...fan.filter((c) => c.lens && c.lens[0] === 0).map((c) => c.radius));
  assert.ok(end('C3', 1) <= NETWORK_BY_ID.get('EPI_ILI')!.radius + 1e-9, 'C3 is never wider than the epigastric vein at its end');
  assert.ok(Math.abs(end('C3', 1) - Math.min(hub, NETWORK_BY_ID.get('EPI_ILI')!.radius)) < 1e-9, 'C3 ends at the width of the fan\'s roots (one round hub)');
  assert.equal(end('C3', 0), NETWORK_BY_ID.get('C3')!.radius, 'and off the portal vein\'s wall');
  setSmoothJoins(false);
});
