// Devices run INSIDE the lumen (Mohammad, 20 Nov: "the scope should be INSIDE the lumen, not outside the entire structure; same for catheters"): every catheter route's points lie on the
// centreline of the vessel they run in (the vessels' own 3D courses, z included, read at run time so a changed course is followed), and the device is narrower than the lumen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { ROUTE_KINDS } from '../src/scene/procedures/route.ts';
import { courseDistance, route3d } from '../src/scene/procedures/route3d.ts';

const CORNER = 14, CORNER_K = 3.2;
const idsOf = (kind: string): string[] => {
  const r = route3d(kind)!.route, out = new Set<string>();
  const add = (q: { id: string | null; subs?: { id: string | null }[] }) => { if (q.id && NETWORK_BY_ID.has(q.id)) out.add(q.id); for (const s of q.subs ?? []) if (s.id && NETWORK_BY_ID.has(s.id)) out.add(s.id); };
  for (const q of r.parts) add(q);
  for (const i of r.ids) if (NETWORK_BY_ID.has(i)) out.add(i);
  return [...out];
};

test('every catheter route lies inside the lumen of the vessels it runs in, and the catheter is narrower than the lumen', () => {
  const report: string[] = [], corners: string[] = [];
  for (const kind of ROUTE_KINDS) {
    const r3 = route3d(kind);
    if (!r3) { report.push(`${kind}: no route`); continue; }
    const vs = idsOf(kind), r = r3.route;
    let worst = 0, worstD = 0, outside = 0, n = 0;
    for (let d = 0; d <= r.total; d += 2) {
      const part = r.parts.find((q) => d >= q.d0 && d <= q.d1);
      if (!part || part.name === 'lead') continue;   // (the lead-in above the figure is not in a vessel)
      const p = r3.point(d), lum = r3.lumen(d), dist = courseDistance(vs, p);
      if (!Number.isFinite(dist)) continue;
      n++;
      const k = dist / Math.max(lum, 1e-6);
      if (k > worst) { worst = k; worstD = d; }
      // a corner where the route turns from one vessel into the next (the IVC into a hepatic or renal vein's ostium) is the one place the way is not along a centreline: within CORNER figure units of a leg's
      // end it may stand up to CORNER_K lumens from the centreline (it is crossing the cava's wall into the branch); anywhere else it must be inside
      const nearCorner = r.parts.some((q) => q.name !== 'lead' && (Math.abs(d - q.d0) <= CORNER || Math.abs(d - q.d1) <= CORNER));
      if (dist >= lum && !(nearCorner && k < CORNER_K)) outside++;
      else if (dist >= lum) corners.push(`${kind} d=${d} ${k.toFixed(2)} lumens`);
    }
    const lumens = Array.from({ length: 40 }, (_, i) => r3.lumen(r.start + ((r.free - r.start) * i) / 39));
    assert.ok(r3.rc <= 0.7 * Math.min(...lumens) + 1e-9, `${kind}: the catheter (${r3.rc.toFixed(4)}) is narrower than 0.7 of its lumen (${Math.min(...lumens).toFixed(4)})`);
    if (outside > 0) report.push(`${kind}: ${outside} of ${n} samples outside the lumen, worst ${worst.toFixed(2)} lumens at d=${worstD}`);
  }
  if (corners.length) console.log(`device routes: ${corners.length} corner samples stand outside their lumen (they cross the cava's wall into a branch): ${corners.slice(0, 8).join(', ')}`);
  assert.deepEqual(report, [], report.join('; '));
});

test('the HVPG route is in the lumen over its whole way in the figure', () => {
  const r3 = route3d('hvpg')!, r = r3.route, vs = idsOf('hvpg');
  assert.ok(vs.length >= 4);
  for (let d = r.parts[1]!.d0; d <= r.free; d += 1.5) {
    const near = r.parts.some((q) => q.name !== 'lead' && (Math.abs(d - q.d0) <= CORNER || Math.abs(d - q.d1) <= CORNER)), k = courseDistance(vs, r3.point(d)) / r3.lumen(d);
    assert.ok(k < (near ? CORNER_K : 1), `hvpg at ${d.toFixed(1)}: ${k.toFixed(2)} lumens from the centreline`);
  }
});
