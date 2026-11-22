// ?geom=net hides the old tubes only for an object the figure has been SEEN to draw (occlusion queries, net/probe.ts): a figure that draws nothing never leaves vessels missing (22 Nov, an iPhone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawProbe, PROBE_FRAMES, type QueryGL } from '../src/scene/vessels/net/probe.ts';
import { loadNetFromDisk } from '../src/scene/vessels/net/load.ts';
import { CelScene } from '../src/scene/scene.ts';

/** A stand-in WebGL2 context whose queries answer `hits` samples, `lag` polls late. */
function fakeGL(hits: (key: string) => number, lag = 1) {
  const live = new Set<unknown>(); let current = '';
  const gl: QueryGL & { keyOf: (q: unknown) => string } = {
    ANY_SAMPLES_PASSED: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    createQuery: () => { const q = { key: current, age: 0 }; live.add(q); return q; }, deleteQuery: (q) => { live.delete(q); },
    beginQuery: () => undefined, endQuery: () => undefined,
    getQueryParameter: (q, name) => { const o = q as { key: string; age: number }; if (name === 2) return ++o.age > lag; return hits(o.key); },
    keyOf: (q) => (q as { key: string }).key,
  };
  return { gl, draw(probe: DrawProbe, key: string) { current = key; probe.begin(gl, key); probe.end(gl, key); } };
}

test('an object that puts a pixel on the screen is drawn; one that gets its frames and none is blank; before that it is pending', () => {
  const probe = new DrawProbe(), f = fakeGL((k) => (k === 'net1' ? 12 : 0));
  assert.equal(probe.state(['net1']), 'pending');
  for (let i = 0; i < 3; i++) { f.draw(probe, 'net1'); f.draw(probe, 'net0'); probe.poll(f.gl); }
  assert.equal(probe.state(['net1']), 'drawn');
  assert.equal(probe.state(['net0']), 'pending', 'a few empty frames are not yet blank');
  for (let i = 0; i < PROBE_FRAMES + 3; i++) { f.draw(probe, 'net0'); probe.poll(f.gl); }
  assert.equal(probe.state(['net0']), 'blank');
  assert.match(probe.report(), /net0: 0\/\d+ frames with pixels/);
  assert.equal(probe.state(['never drawn']), 'pending', 'an object that was never drawn is pending (the scene gives it a bound of steps)');
});

test('a context without occlusion queries proves nothing (the old tubes stay)', () => {
  const probe = new DrawProbe();
  probe.begin({}, 'x'); probe.end({}, 'x'); assert.equal(probe.poll({}), false); assert.equal(probe.state(['x']), 'pending');
});

const data = loadNetFromDisk();
const skip = data ? false : 'the baked network meshes are not in public/anatomy (node scripts/bake-skins.mjs --net)';
const tubes = (scene: CelScene, edgeIds: Set<string>) => scene.vessels.filter((o) => edgeIds.has(o.edge?.id ?? '')).map((o) => (o as unknown as { toon: { visible: boolean } }).toon.visible);

test('the scene keeps every old tube until its object is seen drawn, and brings them back if it never is', { skip }, async () => {
  const edgeIds = new Set(data!.skel.edges.map((e) => e.id.split('#')[0]!));
  const scene = new CelScene({ joins: 'old' });
  await scene.attachNet(data!);
  const net = scene.netFigure!;
  assert.ok(tubes(scene, edgeIds).length > 50 && tubes(scene, edgeIds).every(Boolean), 'at mount every tube is still drawn');
  // the figure draws nothing: its queries answer 0 samples
  const none = fakeGL(() => 0);
  for (let i = 0; i < 300; i++) { for (const d of net.draws) for (const m of d.meshes) none.draw(net.probe, m.name); net.probe.poll(none.gl); scene.stepNet(); }
  assert.ok(tubes(scene, edgeIds).every(Boolean), 'a figure that drew nothing leaves every tube up');
  // the figure draws net1 only
  const scene2 = new CelScene({ joins: 'old' });
  await scene2.attachNet(data!);
  const n2 = scene2.netFigure!, some = fakeGL((k) => (k.includes('net1') ? 40 : 0));
  for (let i = 0; i < 5; i++) { for (const d of n2.draws) for (const m of d.meshes) some.draw(n2.probe, m.name); n2.probe.poll(some.gl); scene2.stepNet(); }
  const net1Edges = new Set(n2.draws.find((d) => d.name === 'net1')!.edges.map((e) => data!.skel.edges[e]!.id.split('#')[0]!));
  for (const o of scene2.vessels) {
    const id = o.edge?.id ?? '', visible = (o as unknown as { toon: { visible: boolean } }).toon.visible;
    if (net1Edges.has(id)) assert.equal(visible, false, `${id}: its object was seen drawn, its tube goes`);
    else if (edgeIds.has(id)) assert.equal(visible, true, `${id}: its object was not seen, its tube stays`);
  }
});
