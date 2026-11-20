// A procedure step is framed from its own geometry (20 Nov 2026, "zoom sucked"): the stretch of route the step works on, its bounds plus a margin, never a number per slide. Every routed procedure
// gets a finite frame for every shot name that holds the tip, and a step that works across a tract holds the whole tract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepShot } from '../src/ui/deck/cath-shot.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { specFor } from '../src/ui/deck/procs-plan.ts';

const KINDS = ['hvpg', 'tips', 'tipscoil', 'brto', 'brtoC6', 'bato', 'ivcread', 'ppgperc'];
for (const kind of KINDS) {
  test(`${kind}: every step's frame holds the tip and is finite`, () => {
    const route = specFor(kind)?.route ?? kind, r3 = route3d(route);
    if (!r3) return;
    const tip = r3.point(r3.tipD(1));
    for (const shot of ['way', 'tip', 'fill', 'work']) {
      const s = stepShot(kind, shot, tip, route)!;
      assert.ok(s, `${kind}/${shot} has a frame`);
      for (const v of [...s.target, ...s.half]) assert.ok(Number.isFinite(v));
      if (shot !== 'way') {
        assert.ok(Math.abs(tip.x - s.target[0]) <= s.half[0] + 1e-6 && Math.abs(tip.y - s.target[1]) <= s.half[1] + 1e-6, `${kind}/${shot}: the tip is in frame`);
      }
    }
  });
}
test('the TIPS tip frame holds the whole tract', () => {
  const r3 = route3d('tips')!, r = r3.route, [a, b] = r.spans.tract!, s = stepShot('tips', 'tip', r3.point(r3.tipD(0.5)), 'tips')!;
  for (const d of [a, b]) { const p = r3.point(d); assert.ok(Math.abs(p.x - s.target[0]) <= s.half[0] && Math.abs(p.y - s.target[1]) <= s.half[1], `tract end at ${d.toFixed(0)} is in frame`); }
});
