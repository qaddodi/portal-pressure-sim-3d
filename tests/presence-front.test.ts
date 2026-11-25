// Mohammad, 25 Nov: "I don't want it to start growing from azygous towards varices. I want the opening to be realistic. Coronary vein into varices then into azygous."
// The root: the engine splits one collateral route in edges (network.ts SEGMENT_OF) and each edge drew on over its own 1150 ms from its own start, so the drain began mid-route, joined to nothing, while the feeding piece grew.
// Now a segment has one front along the whole run (presence-track.ts frontsOf/alongFronts): in flow order each piece draws only after the one before it is whole, and the run retracts the other way. Node only.
// Run: node --test tests/presence-front.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { SEGMENT_OF, NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { PresenceTracks, frontsOf, PRESENCE_TIMES } = await import('../src/scene/vessels/presence-track.ts');
const { easeMove } = await import('../src/scene/gesture/ease.ts');

type Obj = { edge: { id: string }; group: { visible: boolean }; reveal: number; setDotted(d: boolean): void; setReveal(r: number): void };
const fake = (id: string): Obj => ({ edge: { id }, group: { visible: true }, reveal: 1, setDotted() {}, setReveal(r: number) { this.reveal = r; } });
const routes = [...new Set([...SEGMENT_OF.values()].map((m) => m.join('+')))].map((k) => k.split('+'));
const rig = (ids: string[]) => { const os = [...ids, 'C3'].map(fake), t = new PresenceTracks(os as never); return { os, t, by: (id: string) => os.find((o) => o.edge.id === id)! }; };
const MS = PRESENCE_TIMES.collateral.in;

test('the engine splits the oesophageal route, and the fronts are found from it, not named', () => {
  assert.ok(routes.some((r) => r.join() === 'C1a,C1b'), 'C1a and C1b are one run');
  const f = frontsOf();
  assert.equal(f.length, routes.length);
  for (const fr of f) {
    assert.ok(Math.abs(fr.share.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.equal(fr.from[0], 0);
    fr.ids.forEach((id, i) => assert.ok(fr.share[i]! > 0, id));
  }
});

for (const ids of routes) {
  test(`${ids.join(' then ')} opens as one front in flow order: a piece draws only after the one before it is whole, and never from its end back`, () => {
    const { t, by } = rig(ids);
    for (const id of ids) t.set(id, 'hidden', true);
    for (const id of ids) t.set(id, 'shown');
    const lens = ids.map((id) => NETWORK_BY_ID.get(id)!.pts.length);
    assert.ok(lens.every((l) => l > 1));
    let last = ids.map(() => 0), moving = true, steps = 0;
    while (moving && steps < 400) {
      moving = t.step(16); steps++;
      const a = ids.map((id) => by(id).reveal);
      a.forEach((x, i) => {
        assert.ok(x >= last[i]! - 1e-12, `${ids[i]} only draws on`);
        if (i > 0) assert.ok(a[i - 1]! >= 1 - 1e-12 || x === 0, `${ids[i]} starts (${x.toFixed(3)}) while ${ids[i - 1]} is only ${a[i - 1]!.toFixed(3)} whole`);
      });
      last = a;
    }
    assert.ok(last.every((x) => x === 1), 'every piece ends whole');
    assert.ok(steps * 16 >= MS && steps * 16 <= MS + 64, `the whole run takes about one collateral's time (${steps * 16} ms)`);
  });

  test(`${ids.join(' then ')} closes the other way: the end of the run retracts first, back toward the vein that feeds it`, () => {
    const { t, by } = rig(ids);
    for (const id of ids) t.set(id, 'shown', true);
    for (const id of ids) t.set(id, 'hidden');
    let last = ids.map(() => 1), moving = true, steps = 0;
    while (moving && steps < 400) {
      moving = t.step(16); steps++;
      const a = ids.map((id) => by(id).reveal);
      a.forEach((x, i) => {
        assert.ok(x <= last[i]! + 1e-12, `${ids[i]} only retracts`);
        if (i < ids.length - 1) assert.ok(a[i + 1]! <= 1e-12 || x >= 1 - 1e-12, `${ids[i]} (${x.toFixed(3)}) retracts while ${ids[i + 1]} is still ${a[i + 1]!.toFixed(3)}`);
      });
      last = a;
    }
    assert.ok(last.every((x) => x === 0));
  });

  test(`${ids.join(' then ')}: the length drawn is the front's, so the run draws at one steady pace through the join`, () => {
    const { t, by } = rig(ids);
    for (const id of ids) t.set(id, 'hidden', true);
    for (const id of ids) t.set(id, 'shown');
    const f = frontsOf().find((x) => x.ids.join() === ids.join())!;
    t.step(16);   // (the first step only hands the hidden vessel over to its new goal)
    for (let i = 1; i <= 40; i++) {
      t.step(16);
      const drawn = ids.reduce((s, id, k) => s + by(id).reveal * f.share[k]!, 0);
      assert.ok(Math.abs(drawn - easeMove(Math.min(1, (i * 16) / MS))) < 1e-9, `step ${i}: ${drawn}`);
    }
  });
}

test('a collateral that is one edge draws on as before: its own whole length over its own time', () => {
  const { t, by } = rig([]);
  t.set('C3', 'hidden', true); t.set('C3', 'shown');
  t.step(16);
  for (let i = 1; i <= 20; i++) { t.step(16); assert.ok(Math.abs(by('C3').reveal - easeMove((i * 16) / MS)) < 1e-9); }
});
