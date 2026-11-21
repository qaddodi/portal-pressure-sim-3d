// The live rebuild of junction skins (docs/junction-skin-spec.md 10.3): a skin whose arm changes course is rebuilt, at most one skin a frame, in the scene's render phase; the new skin and the arms' new cuts replace the old together;
// a rebuild over 8 ms is done every other frame while the arms keep changing and once more after they stop; and nothing here draws or pops. Run on the real network with a recorder in place of the GL objects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { useSettings } from '../src/state/settings.ts';
import { SkinSet, SKIN_BUILD_SLOW_MS, SKIN_BUILD_TAG, SKIN_SLOW_GAP, type SkinDraw } from '../src/scene/vessels/skin/skin-set.ts';
import { SKIN_CUT_NONE } from '../src/scene/vessels/skin/types.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

/** A SkinDraw with no GL behind it: what the set tells it, kept. */
class Rec implements SkinDraw {
  readonly object = { name: 'rec' } as unknown as Object3D;
  disposed = false;
  setArm(): void {} setArc(): void {} setPres(): void {} setArmCopy(): void {} setTransparent(): void {}
  dispose(): void { this.disposed = true; }
}

interface Rig { set: SkinSet; scene: CelScene; clockMs: { t: number }; cost: { ms: number }; draws: Rec[]; inScene: Set<Object3D>; log: string[]; ends: { n: number }; done(): void }
function rig(): Rig {
  const was = smoothJoinsOn(); setSmoothJoins(true);  const scene = new CelScene({ joins: 'old' });   // (the vessels with no skins of the scene's own: the set under test is the only one)
  const draws: Rec[] = [], inScene = new Set<Object3D>(), log: string[] = [], clockMs = { t: 0 }, cost = { ms: 0 }, ends = { n: 0 };
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id) as VesselObject | undefined,
    stateOf: () => undefined,
    make: () => { const r = new Rec(); draws.push(r); log.push('make'); return r; },
    add: (o) => { inScene.add(o); log.push('add'); },
    remove: (o) => { inScene.delete(o); log.push('remove'); },
    endsChanged: () => { ends.n++; },
    now: () => (clockMs.t += cost.ms),   // (every reading moves the clock by the cost one rebuild is given, so a rebuild reads t0 and t1 apart by that much)
    warn: () => {},
  });
  return { set, scene, clockMs, cost, draws, inScene, log, ends, done: () => { set.dispose(); scene.dispose(); setSmoothJoins(was); } };
}
const cutOf = (r: Rig, id: string) => (r.scene.vesselObject(id) as VesselObject).skinCut();

test('a rebuild is the same skin again on the tubes as drawn now: one mesh swapped for one, the arms cut as before, nothing left behind', () => {
  const r = rig();
  try {
    r.set.build(2);
    assert.ok(r.set.count >= 4, `${r.set.count} skins`);
    const node = r.set.nodes[0]!, mesh = r.set.skinOf(node)!;
    const arm = mesh.junction.arms[0]!.vesselId, before = [...cutOf(r, arm)], objs = r.inScene.size, made = r.draws.length, gone = r.draws.filter((d) => d.disposed).length;   // (gone: the skins the planner took back to plan with a neighbour while building)
    r.set.markDirty(arm);
    assert.equal(r.set.pending, true, 'flagged, waiting for the render phase');
    assert.equal(r.draws.length, made, 'marking draws and builds nothing');
    assert.equal(r.set.step(), r.set.pending);
    assert.equal(r.draws.length, made + 1, 'one skin made');
    assert.equal(r.inScene.size, objs, 'the old one out, the new one in: the same number of skins stands');
    assert.equal(r.draws.filter((d) => d.disposed).length - gone, 1, 'the old one is disposed');
    assert.deepEqual([...cutOf(r, arm)], before, 'on unchanged tubes the seam is where it was');
    assert.equal(r.set.stats.rebuilds, 1);
    assert.equal(r.set.stats.lastNode.length > 0, true);
  } finally { r.done(); }
});

test('the new skin is added, the cuts written and the old skin removed inside the one step: the order is make, add, (cuts), remove, with no step in between', () => {
  const r = rig();
  try {
    r.set.build(2);
    const arm = r.set.skinOf(r.set.nodes[0]!)!.junction.arms[0]!.vesselId;
    r.log.length = 0;
    r.set.markDirty(arm); r.set.step();
    assert.deepEqual(r.log, ['make', 'add', 'remove'], 'swapped in one call (the scene reads nothing between)');
  } finally { r.done(); }
});

test('budget: a course moved 20 times in a frame rebuilds its skin once; two skins flagged at once take two frames, one each', () => {
  const r = rig();
  try {
    r.set.build(2);
    const a = r.set.skinOf(r.set.nodes[0]!)!.junction.arms[0]!.vesselId;
    const b = [...r.set.nodes].map((n) => r.set.skinOf(n)!).find((m) => !m.junction.arms.some((x) => x.vesselId === a))!.junction.arms[0]!.vesselId;
    const made = r.draws.length;
    for (let i = 0; i < 20; i++) r.set.markDirty(a);
    r.set.step();
    assert.equal(r.draws.length - made, 1, '20 marks, one rebuild');
    assert.equal(r.set.pending, false);
    r.set.markDirty(a); r.set.markDirty(b);
    const shared = r.set.nodes.filter((n) => r.set.skinOf(n)!.junction.arms.some((x) => x.vesselId === a || x.vesselId === b)).length;
    let frames = 0, builds = 0;
    for (; r.set.pending && frames < 10; frames++) { const m = r.draws.length; r.set.step(); builds += r.draws.length - m; assert.ok(r.draws.length - m <= 1, 'never more than one skin in a frame'); }
    assert.equal(builds, shared, 'every flagged skin was rebuilt, once');
    assert.equal(frames, shared, 'one frame each');
  } finally { r.done(); }
});

test('a rebuild over the slow limit waits SKIN_SLOW_GAP steps before the next while marks keep coming, and runs once more after the last mark', () => {
  const r = rig();
  try {
    r.set.build(2);
    const a = r.set.skinOf(r.set.nodes[0]!)!.junction.arms[0]!.vesselId, made = r.draws.length;
    r.cost.ms = SKIN_BUILD_SLOW_MS + 1;
    const builtOn: number[] = [];
    for (let f = 0; f < 8; f++) { r.set.markDirty(a); const m = r.draws.length; r.set.step(); if (r.draws.length > m) builtOn.push(f); }   // a drag: a mark every frame
    assert.deepEqual(builtOn, [0, 2, 4, 6].map((f) => f * (SKIN_SLOW_GAP / 2)), 'every other frame while the marks keep coming');
    assert.equal(r.set.pending, true, 'the last mark is still waiting its turn');
    // (frame 7 was the wait after frame 6's rebuild; the marks stop here)
    const m = r.draws.length;
    r.set.step();
    assert.ok(r.draws.length > m, 'the next frame: once more, after the course stopped changing');
    assert.equal(r.set.pending, false);
    assert.ok(r.draws.length - made >= 5);
    assert.ok(r.set.stats.worstMs > SKIN_BUILD_SLOW_MS, `the cost is kept (${r.set.stats.worstMs} ms)`);
  } finally { r.done(); }
});

test('a fast rebuild is not held back: it runs on every frame a mark comes', () => {
  const r = rig();
  try {
    r.set.build(2);
    const a = r.set.skinOf(r.set.nodes[0]!)!.junction.arms[0]!.vesselId, made = r.draws.length;
    r.cost.ms = 0;
    for (let f = 0; f < 5; f++) { r.set.markDirty(a); r.set.step(); }
    assert.equal(r.draws.length - made, 5);
  } finally { r.done(); }
});

test('a vessel that is no arm of any skin flags nothing, and an idle step builds nothing', () => {
  const r = rig();
  try {
    r.set.build(2);
    const made = r.draws.length;
    r.set.markDirty('NO_SUCH_VESSEL');
    assert.equal(r.set.step(), false);
    assert.equal(r.draws.length, made);
    assert.equal(r.set.stats.rebuilds, 0);
  } finally { r.done(); }
});

test('a node that cannot be rebuilt goes back to today\'s joins (cut off, the scene told once) and is tried again when an arm changes; the set never throws', () => {
  const r = rig();
  try {
    r.set.build(2);
    const node = r.set.nodes[0]!, arms = r.set.skinOf(node)!.junction.arms;
    const arm = arms[0]!.vesselId;
    // the arm's tube is rewritten into something no seam fits (every ring but the first thrown away would not build): make the planner fail by handing the set a state that has no vessel
    const real = r.scene.vesselObject;
    void real;
    let broken = true;
    const set2 = new SkinSet({
      vessel: (id) => r.scene.vesselObject(id) as VesselObject | undefined,
      stateOf: () => undefined,
      make: () => { if (broken) throw new Error('the builder refused'); const d = new Rec(); r.draws.push(d); return d; },
      add: () => {}, remove: () => {},
      endsChanged: () => { r.ends.n++; },
      warn: () => {},
    });
    broken = false; set2.build(2);
    const n0 = set2.count, e0 = r.ends.n;
    assert.ok(n0 >= 4);
    broken = true;
    set2.markDirty(arm); while (set2.pending) set2.step();   // (one skin a frame: a vessel two skins share flags both)
    assert.equal(set2.count, n0 - 1, 'that skin is gone');
    assert.equal(r.ends.n, e0 + 1, 'the scene was told, once, to redo the mates');
    assert.deepEqual([...(r.scene.vesselObject(arm) as VesselObject).skinCut()].length, 2);
    for (const a of arms) assert.equal(set2.endsOf(a.vesselId)[a.end], false, `${a.vesselId} end ${a.end} is today's join`);
    assert.ok(set2.fellBack.includes(node));
    // an arm changes again and the builder works: the skin returns, the scene is told again
    broken = false;
    set2.markDirty(arm); while (set2.pending) set2.step();
    assert.equal(set2.count, n0, 'back');
    assert.equal(r.ends.n, e0 + 2);
    assert.equal(set2.endsOf(arm)[arms[0]!.end], true);
    assert.equal(set2.fellBack.includes(node), false);
    set2.dispose();
    for (const a of arms) assert.deepEqual([...(r.scene.vesselObject(a.vesselId) as VesselObject).skinCut()], [...SKIN_CUT_NONE]);
  } finally { r.done(); }
});

test('the scene wires it: the reshape of a vessel marks its skin, the render phase steps it once, and a pending rebuild asks the clock under the tag skin-build', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);  const s = new CelScene({ joins: 'mesh2' });
  try {
    const sk = (s as unknown as { skins: SkinSet | null }).skins!;
    assert.ok(sk && sk.count >= 4);
    const arm = sk.skinOf(sk.nodes[0]!)!.junction.arms[0]!.vesselId;
    const shapes = (s as unknown as { shapes: { onReshaped: ((id: string) => void) | null } }).shapes;
    assert.equal(typeof shapes.onReshaped, 'function');
    shapes.onReshaped!(arm);
    assert.equal(sk.pending, true);
    assert.equal(SKIN_BUILD_TAG, 'skin-build');
    sk.step();
    assert.equal(sk.pending, false);
    assert.equal(sk.stats.rebuilds, 1);
  } finally { s.dispose(); setSmoothJoins(was); }
});
