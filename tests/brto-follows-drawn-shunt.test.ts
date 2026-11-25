// BRTO and the gastric varices follow what is drawn (Mohammad, 25 Nov: the sclerosant "doesn't really follow the paths of what's drawn... we injected sclerosant into a hidden vessel"; the coil "in the air").
// Root cause: the catheter's route (and so its column of sclerosant) is laid on the gastrorenal shunt's REST course, straight, while the shunt is drawn at the curve its fill gives it (coil strength up to 5, a sideways travel of
// about one lumen radius); and the EUS glue's course was the varix's invisible trunk (radius 0), between the strands that are drawn. Both now read the course as drawn (vessels/live-shape.ts). Node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { REST } from '../src/scene/vessels/shape.ts';
import { reportShape, liveMain, liveWidest, liveCourses } from '../src/scene/vessels/live-shape.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { geoNow, glueVarix, coilLine } from '../src/scene/devices/glue-cast.ts';
import { UNITS_PER_SCENE as U, x3, y3 } from '../src/scene/frame2d.ts';

setSmoothJoins(true);
/** The nearest distance from `p` to the polyline `pts` (scene units). */
function near(pts: readonly (readonly number[])[], p: Vector3): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!, l2 = dx * dx + dy * dy + dz * dz;
    const u = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a[0]!) * dx + (p.y - a[1]!) * dy + (p.z - a[2]!) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a[0]! - dx * u, p.y - a[1]! - dy * u, p.z - a[2]! - dz * u));
  }
  return best;
}

for (const kind of ['brto']) {
  test(`${kind}: the shaft and the column lie on the shunt as it is drawn at every coil strength, not on its rest course`, () => {
    const r3 = route3d(kind)!, r = r3.route, [d0, d1] = r.spans.shunt!;
    const radius = NETWORK_BY_ID.get('C5')!.radius;
    let seenMove = 0;
    for (const wig of [0, 1.25, 2.5, 3.75, 5]) {
      reportShape('C5', { ...REST, wig });
      r3.follow();
      const live = liveMain('C5')!.pts, rest = (reportShape('C5', REST), liveMain('C5')!.pts);
      reportShape('C5', { ...REST, wig }); r3.follow();
      let worst = 0, worstRest = 0;
      for (let k = 1; k < 40; k++) {
        const d = d0 + ((d1 - d0) * k) / 40, p = r3.centre(d, new Vector3());
        worst = Math.max(worst, near(live, p));
        worstRest = Math.max(worstRest, near(rest, p));
      }
      assert.ok(worst < radius * 0.25, `wig ${wig}: the centre of the route is ${(worst / radius).toFixed(2)} lumen radii off the drawn shunt`);
      if (wig >= 3.75) seenMove = Math.max(seenMove, worstRest);
    }
    assert.ok(seenMove > radius * 0.3, `the drawn shunt has left its rest course (${(seenMove / radius).toFixed(2)} radii), so the test means something`);
    reportShape('C5', REST); r3.follow();
  });
}

test('the EUS glue lies on the widest drawn strand of the fundal varices, not on their invisible trunk', () => {
  const live = liveWidest('C2')!;
  assert.ok(live.radius > 0);
  const cur = geoNow().C2!.cur;
  let worst = 0;
  for (const q of cur) worst = Math.max(worst, near(live.pts, new Vector3(x3(q[0]!), y3(q[1]!), q[2]! / U)));
  assert.ok(worst < live.radius * 0.5, `the glue's course is ${(worst / live.radius).toFixed(2)} strand radii off the strand`);
});

test('the fundal varices are as wide as the shunt that drains them (the widest strand is at least 0.75 of the shunt)', () => {
  reportShape('C2', { ...REST, spr: 1, wig: 5 });
  const strand = liveWidest('C2')!.radius, shunt = liveMain('C5')!.radius;
  assert.ok(strand >= shunt * 0.75, `the widest strand ${strand.toFixed(4)} against the shunt ${shunt.toFixed(4)}`);
  reportShape('C2', REST);
});

test('the EUS coil, fully out, lies inside the drawn strand (never in the air beside it), at the varix\'s rest and at full size', () => {
  for (const spr of [0.55, 1]) {
    reportShape('C2', { ...REST, spr, wig: spr === 1 ? 5 : 0 });
    const w = liveWidest('C2')!, g = glueVarix(w.radius * U, geoNow()), line = coilLine(1, g);
    assert.ok(line.length > 10, 'the coil is drawn');
    let worst = 0;
    for (const q of line) {
      let dz = 0, best = Infinity;
      for (const p of geoNow().C2!.cur) { const d = Math.hypot(q[0] - p[0]!, q[1] - p[1]!); if (d < best) { best = d; dz = p[2]!; } }
      void dz;
      worst = Math.max(worst, best);
    }
    assert.ok(worst <= w.radius * U * 1.05, `spread ${spr}: the coil strays ${(worst / (w.radius * U)).toFixed(2)} strand radii from the strand's course`);
  }
  reportShape('C2', REST);
});

test('the BRTO runs on from the shunt into the fundal varices (the sclerosant fills what is drawn), its tip stands short of the splenic vein, and the injection\'s frame is the shunt and the varices, not the way in from the cava', async () => {
  const { stepShot } = await import('../src/ui/deck/cath-shot.ts');
  const { BRTO_TIP_AT } = await import('../src/scene/procedures/route-placed.ts');
  const r3 = route3d('brto')!, r = r3.route;
  assert.ok(r.spans.varices, 'the route has a varices leg');
  assert.ok(r.spans.varices![1] > r.spans.shunt![1] + 50, 'and it is a good stretch of the fundal varices');
  assert.deepEqual(r.focus, [r.spans.shunt![0], r.spans.varices![1]]);
  const tip = r3.point(r.free, new Vector3()), [d0, d1] = r.spans.shunt!;
  assert.ok(Math.abs((r.free - d0) / (d1 - d0) - BRTO_TIP_AT) < 0.01);
  // the tip is clear of the splenic vein as seen from the front (>= 3 of its radii of screen distance to the tube in front of it)
  let worst = Infinity;
  for (const id of ['SV_CONF', 'SV_MID']) for (const c of liveCourses(id)!) { if (c.radius <= 0) continue; for (const q of c.pts) if (q[2] > tip.z) worst = Math.min(worst, Math.hypot(q[0] - tip.x, q[1] - tip.y) / c.radius); }
  assert.ok(worst >= 3, `the tip is ${worst.toFixed(2)} splenic radii from its outline`);
  // the injection's frame holds the shunt from its mouth on and the varices, and starts no earlier than the shunt (the cava and renal vein are not in it)
  const fill = stepShot('brto', 'fill', tip)!, way = stepShot('brto', 'way', tip)!;
  assert.ok(fill && way);
  const first = r3.point(r.focus[0], new Vector3()), last = r3.point(r.focus[1], new Vector3());
  for (const p of [first, last, tip]) { assert.ok(Math.abs(p.x - fill.target[0]) <= fill.half[0] + 1e-6 && Math.abs(p.y - fill.target[1]) <= fill.half[1] + 1e-6, 'held in the frame'); }
  const cava = r3.point(r.spans.lrv![0], new Vector3());
  assert.ok(Math.abs(cava.x - fill.target[0]) > fill.half[0] || Math.abs(cava.y - fill.target[1]) > fill.half[1], 'the way in from the cava is not in the injection\'s frame');
});
