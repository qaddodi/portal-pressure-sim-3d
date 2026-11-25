// Every sewn end (shunt-ends.ts: the Warren and portocaval rows and every collateral, shunt and stent end that lands on a host's wall) is drawn the way 2D draws it, narrowed, sunk and flared, on the tube's own rings, so it cannot fold (final weld plan, step 8).
// Pinned over every end of the table, on the network's real courses: the last ring stands inside its host or within half its radius of the wall, the radius over the end's last rings runs flare then narrowing (one valley, no wobble),
// and no ring crosses the next (the radius changes by less than the rings' spacing, so the surface never doubles back). Node only. (The base normals blending into the host's: not done, the vertex stage takes the radial direction from the normal attribute.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { shuntEnds } from '../src/scene/vessels/shunt-ends.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { isPermanent, nearestOnPolyline } from '../src/scene/vessels/skin/inventory.ts';

test('every sewn end: last ring inside its host or within half its radius of the wall, one flare-then-narrow valley of radius, no ring crossing the next', () => {
  setSmoothJoins(true);
  const hosts = NETWORK.filter(isPermanent).map((h) => ({ r: h.radius, pts: coursesOf(h, REST)[0]!.pts }));
  let ends = 0;
  for (const v of NETWORK) {
    const e = shuntEnds(v.id);
    if (!e) continue;
    const g = buildTubes([coursesOf(v, REST)[0]!], tubularOf(v, 32).slice(0, 1), v.radius), run = g.runs[0]!, pos = g.geometry.getAttribute('position'), rk = g.geometry.getAttribute('rk');
    const W = run.radial + 1, ring = (k: number) => run.tubeStart + k * W;
    const centre = (k: number): number[] => { const c = [0, 0, 0]; for (let j = 0; j < run.radial; j++) { c[0]! += pos.getX(ring(k) + j) / run.radial; c[1]! += pos.getY(ring(k) + j) / run.radial; c[2]! += pos.getZ(ring(k) + j) / run.radial; } return c; };
    (['0', '1'] as const).forEach((s) => {
      const end = Number(s) as 0 | 1, pe = e[end];
      if (!pe) return;
      ends++;
      const step = end ? -1 : 1, last = end ? run.tubular : 0;
      let worst = -Infinity;
      for (let j = 0; j < run.radial; j++) {
        const p: [number, number, number] = [pos.getX(ring(last) + j), pos.getY(ring(last) + j), pos.getZ(ring(last) + j)];
        let best = Infinity;
        for (const h of hosts) best = Math.min(best, nearestOnPolyline(h.pts as never, p).d - h.r);
        worst = Math.max(worst, best);
      }
      assert.ok(worst <= 0.5 * pe.hostR, `${v.id} end ${end}: the last ring stands ${(worst / pe.hostR).toFixed(2)} host radii outside the wall`);
      // the radius along the end's last rings (30, or up to the middle of a short tube): at most one change of direction (the flare falls away from the wall, the narrowing eases back out to the tube's own width)
      let dir = 0, turns = 0;
      // (not the rings of the closing itself: an end inside its host closes to nothing over the last 0.6 host radii (2D sideEndScale). That stretch was under one ring on the 2D courses, so only the end ring was skipped; the placed S_DSR is 0.30 long
      //  on 32 rings (0.0094 apart) against a closing of 0.0116, so its first ring in still closes, and that rise toward the flare's peak is no wobble)
      const closing = pe.inside && !pe.sink ? 0.6 * pe.hostR : 0;
      let q0 = 1;
      for (let along = 0; q0 < (run.tubular >> 1) - 1; q0++) { const c0 = centre(last + step * (q0 - 1)), c1 = centre(last + step * q0); along += Math.hypot(c1[0]! - c0[0]!, c1[1]! - c0[1]!, c1[2]! - c0[2]!); if (along >= closing) break; }
      for (let q = q0; q < Math.min(30, (run.tubular >> 1) - 1); q++) {
        const a = rk.getX(ring(last + step * q)), b = rk.getX(ring(last + step * (q + 1))), d = b - a;
        if (Math.abs(d) < 0.006) continue;   // (6 parts in a thousand of the width is under a pixel: S_PC's end narrows to 0.995 of its width ahead of the flare, a dip that sat at 0.0039 and a faired course moved to 0.0041)
        const sg = Math.sign(d);
        if (dir && sg !== dir) turns++;
        dir = sg;
      }
      assert.ok(turns <= 1, `${v.id} end ${end}: the radius wobbles (${turns} turns)`);
      // no ring crosses the next (the end ring itself closes like a cap): the surface's slope along the tube stays under 1 (radius change less than the spacing), and the rings keep their order along the path
      for (let q = 0; q < Math.min(30, (run.tubular >> 1) - 1); q++) {
        const k = last + step * q, c0 = centre(k), c1 = centre(k + step), sp = Math.hypot(c1[0]! - c0[0]!, c1[1]! - c0[1]!, c1[2]! - c0[2]!);
        const dr = Math.abs(rk.getX(ring(k + step)) - rk.getX(ring(k))) * v.radius;
        assert.ok(sp > 1e-9 && (q === 0 || dr < sp), `${v.id} end ${end} ring ${k}: the radius changes ${dr.toFixed(5)} over ${sp.toFixed(5)} of path`);
      }
    });
  }
  assert.ok(ends >= 20, `${ends} sewn ends checked`);
});

test('the strands of a braid (C1a, C2, C4, C7 and the caput fan) are sewn at the ends their trunk is; the cavernoma\'s channels end in a point, as before', () => {
  setSmoothJoins(true);
  let n = 0;
  for (const v of NETWORK) {
    const row = shuntEnds(v.id), cs = coursesOf(v, REST);
    if (cs.length < 2 || !row || v.kind !== 'collateral') continue;
    for (const c of cs.slice(1)) {
      if (v.id === 'C8') { assert.equal(c.sewn, undefined, 'a cavernoma channel ends in a point'); continue; }
      assert.deepEqual(c.sewn, row, `${v.id}: each strand carries its trunk's sewn ends`);
      n++;
    }
  }
  assert.ok(n >= 8, `${n} strands checked`);
});

test('no bulge: a generated end\'s flare never takes a ring wider than its host (or than the tube without the flare), and the end closes inside the wall, so no round cap is wider than the host\'s own width', () => {
  setSmoothJoins(true);
  let n = 0;
  for (const v of NETWORK) {
    const e = shuntEnds(v.id);
    if (!e || !e.some((x) => x?.capped)) continue;
    const c = coursesOf(v, REST)[0]!, seg = tubularOf(v, 32).slice(0, 1);
    const plain = { ...c, sewn: c.sewn!.map((x) => (x ? { ...x, flare: false } : x)) as unknown as typeof c.sewn };
    const a = buildTubes([c], seg, v.radius), b = buildTubes([plain], seg, v.radius), run = a.runs[0]!, ra = a.geometry.getAttribute('rk'), rb = b.geometry.getAttribute('rk');
    for (let k = 0; k <= run.tubular; k++) {
      const i = run.tubeStart + k * (run.radial + 1), flared = ra.getX(i) * v.radius, plainR = rb.getX(i) * v.radius;
      const host = Math.max(...e.map((x, end) => (x?.capped && x.flare && (end ? k > run.tubular / 2 : k < run.tubular / 2) ? x.hostR : 0)));
      assert.ok(flared <= Math.max(plainR, host) + 1e-6, `${v.id} ring ${k}: radius ${(flared * 1000).toFixed(2)} against the host's ${(host * 1000).toFixed(2)} and the plain tube's ${(plainR * 1000).toFixed(2)}`);
      n++;
    }
    e.forEach((x, end) => {
      if (!x?.capped) return;
      const k = end ? run.tubular : 0;
      assert.ok(ra.getX(run.tubeStart + k * (run.radial + 1)) * v.radius <= 0.5 * x.hostR, `${v.id} end ${end}: the end ring is closed to under half the host's radius, inside its wall`);
    });
  }
  assert.ok(n > 300);
});
