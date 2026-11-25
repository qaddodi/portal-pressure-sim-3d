// BATO's route runs in the gastric varices (C2) too: its shaft, balloon and column lie on the widest DRAWN strand, not on the invisible trunk (same root cause as the BRTO's, tests/brto-follows-drawn-shunt.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { REST } from '../src/scene/vessels/shape.ts';
import { reportShape, liveWidest } from '../src/scene/vessels/live-shape.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';

setSmoothJoins(true);
test('bato: every sample of the route that lies in C2 is on the widest drawn strand, at rest and at full spread', () => {
  const r3 = route3d('bato')!, r = r3.route, span = Object.entries(r.spans).find(([, v]) => r.parts.some((p) => p.id === 'C2' && p.d0 === v[0]));
  assert.ok(span, 'the route has a C2 leg');
  const [d0, d1] = span![1];
  for (const [spr, wig] of [[0.55, 0], [1, 5]] as const) {
    reportShape('C2', { ...REST, spr, wig }); r3.follow();
    const w = liveWidest('C2')!;
    let worst = 0;
    for (let k = 1; k < 30; k++) {
      const p = r3.centre(d0 + ((d1 - d0) * k) / 30, new Vector3());
      let best = Infinity;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1]!, b = w.pts[i]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz, u = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a[0]) * dx + (p.y - a[1]) * dy + (p.z - a[2]) * dz) / l2)) : 0;
        best = Math.min(best, Math.hypot(p.x - a[0] - dx * u, p.y - a[1] - dy * u, p.z - a[2] - dz * u));
      }
      worst = Math.max(worst, best);
    }
    assert.ok(worst < w.radius * 0.5, `spread ${spr}: ${(worst / w.radius).toFixed(2)} strand radii off the strand`);
  }
  reportShape('C2', REST);
});
