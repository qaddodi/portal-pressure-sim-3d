// THE FORK FILLET (Mohammad, 28 Nov, iPhone, SOS slide 3: the right hepatic vein's split "not seamless smooth": a corner on the upper edge, a notch where the lower branch leaves).
// Root cause, proved in node: the skin matched its own smooth union (upper edge 20.7 vs 19.7 degrees per 0.01 of arc), so the weld and the bake were faithful; the union's blend, SKIN_K of the narrowest radius (0.0105 against tubes
// 0.013 to 0.019), rounds a 60 degree split over less than a tube's width. Every junction in the middle of a vein (inventory.ts liverBranchJunctions) now takes a blend widened by the angle its branch leaves at (types.ts forkFillet),
// and a liver branch's capsule starts at J (skin-set.ts axisOf) so that wider blend never leaves it a gap to the host. Pure numbers, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { liverBranchJunctions } from '../src/scene/vessels/skin/inventory.ts';
import { SKIN_K, skinKOf } from '../src/scene/vessels/skin/sdf.ts';
import { FORK_GAIN, armR, forkFillet } from '../src/scene/vessels/skin/types.ts';

test('forkFillet: none without a split angle, growing with the angle, and never more than 1 + FORK_GAIN', () => {
  assert.equal(forkFillet([{}]), 1);
  assert.ok(forkFillet([{ splitDeg: 20 }]) < forkFillet([{ splitDeg: 40 }]) && forkFillet([{ splitDeg: 40 }]) < forkFillet([{ splitDeg: 60 }]));
  for (const d of [10, 30, 60, 90]) assert.ok(forkFillet([{ splitDeg: d }]) <= 1 + FORK_GAIN + 1e-9);
});

test('every junction in the middle of a vein carries its split angle, and its blend is the narrowest joint radius times SKIN_K times the fork fillet (at least doubled at 45 degrees or more)', () => {
  const js = liverBranchJunctions();
  assert.ok(js.length >= 1, 'the right hepatic vein splits in the middle of its host');
  for (const j of js) {
    const br = j.arms.filter((a) => a.splitDeg !== undefined);
    assert.equal(br.length, 1, `${j.node}: one branch arm carries the angle`);
    const d = br[0]!.splitDeg!;
    assert.ok(d > 5 && d <= 90, `${j.node}: the branch leaves at ${d.toFixed(1)} degrees`);
    const base = SKIN_K * Math.min(...j.arms.map(armR));
    assert.ok(Math.abs(skinKOf(j.arms) - base * forkFillet(j.arms)) < 1e-12, `${j.node}: the blend is the plain one times the fork fillet`);
    if (d >= 45) assert.ok(skinKOf(j.arms) >= 2 * base, `${j.node}: ${d.toFixed(0)} degrees gets at least twice the plain blend`);
  }
});

test('every mid-vein split is built as one closed piece (no open edge off the seams, no two pieces), and no skin of the figure is lost or dropped', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const set = new SkinSet({
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }) as never,
      add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
    });
    set.build(2);
    const b = set.bake();
    assert.deepEqual(b.lost, [], 'no skin lost'); assert.deepEqual(b.dropped, [], 'no skin dropped');
    const nodes = new Set(liverBranchJunctions().map((j) => j.node));
    let seen = 0;
    for (const s of b.skins) {
      if (!nodes.has(s.plan.junction.node)) continue;
      seen++;
      const m = s.mesh, V = m.position.length / 3, par = Array.from({ length: V }, (_, i) => i);
      const find = (a: number): number => { while (par[a] !== a) a = par[a] = par[par[a]!]!; return a; };
      const e = new Map<string, number>(), key = (a: number, c: number) => (a < c ? `${a}_${c}` : `${c}_${a}`);
      for (let t = 0; t < m.index.length; t += 3) for (let q = 0; q < 3; q++) {
        const a = m.index[t + q]!, c = m.index[t + (q + 1) % 3]!; par[find(a)] = find(c); e.set(key(a, c), (e.get(key(a, c)) ?? 0) + 1);
      }
      const seam = new Set<string>();
      for (const ids of m.seamVerts) for (let q = 0; q < ids.length; q++) seam.add(key(ids[q]!, ids[(q + 1) % ids.length]!));
      let open = 0; for (const [k, c] of e) if (c === 1 && !seam.has(k)) open++;
      const roots = new Set<number>(); for (let i = 0; i < V; i++) roots.add(find(i));
      assert.equal(roots.size, 1, `${s.plan.junction.node}: one piece, not ${roots.size}`);
      assert.equal(open, 0, `${s.plan.junction.node}: ${open} open edges off the seams`);
    }
    assert.equal(seen, nodes.size, 'every mid-vein split has a skin');
  } finally { scene.dispose(); setSmoothJoins(was); }
});
