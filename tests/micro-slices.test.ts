// L4 (21 Nov): the 3D lobule and sinusoid are built in steps that each fit a budget, counted by the build meter (cel3d.ts meshWork: vertices written plus vertices copied), never by a clock, so the
// test says the same on every machine. The sliced build is the one-shot build: the same bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Object3D } from 'three';

const { CelScene } = await import('../src/scene/scene.ts');
const { Sinusoid3D } = await import('../src/scene/micro3d/sinusoid3d.ts');
const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts');
const { MeshBuilder, STEP_WORK, STEP_WORK_CAP, meshWork, pacing } = await import('../src/scene/micro3d/cel3d.ts');

const digest = (root: Object3D): string => {
  const h = createHash('sha1');
  root.traverse((o) => {
    const g = (o as { geometry?: { attributes: Record<string, { array: ArrayBufferView }>; index: { array: ArrayBufferView } | null } }).geometry;
    if (!g) return;
    h.update(o.name);
    for (const n of Object.keys(g.attributes).sort()) { const a = g.attributes[n]!.array; h.update(n); h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
    if (g.index) h.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
  });
  return h.digest('hex');
};

type Built = { sinus: number[]; lobule: number[]; dSinus: string; dLobule: string };
const builds = new Map<string, Built>();
/** Builds both views, one small step at a time, returning the work of every step and the finished geometry's digests.
 *  (Plan 50: one build per step budget for the whole file; the tests that only read it share it. Test 2 asks for exactly two: the sliced and the whole.) */
function build(): Built {
  const key = String(pacing.stepWork), had = builds.get(key);
  if (had) return had;
  const made = buildNow();
  builds.set(key, made);
  return made;
}
function buildNow(): Built {
  const sc = new CelScene();
  const sinus = new Sinusoid3D(sc.sinus, sc.shared), lobule = new Lobule3D(sc.lobule, sc.shared, true);
  const steps = (more: () => boolean): number[] => { const w: number[] = []; for (let go = true; go;) { const m = meshWork.n; go = more(); w.push(meshWork.n - m); } return w; };
  const s = steps(() => !sinus.prepareShapeStep());
  const l = steps(() => lobule.prepareVessels());
  return { sinus: s, lobule: l, dSinus: digest(sinus.group), dLobule: digest(lobule.group) };
}

test('no step of the sinusoid\'s or the lobule\'s build takes more than the cap of the build meter (40 000 vertices), and each is cut to the budget', () => {
  const b = build();
  assert.equal(pacing.stepWork, STEP_WORK);
  for (const [name, w] of [['sinusoid', b.sinus], ['lobule', b.lobule]] as const) {
    const max = Math.max(...w);
    assert.ok(max <= STEP_WORK_CAP, `${name}: the biggest step took ${Math.round(max)} of the meter, cap ${STEP_WORK_CAP}`);
    assert.ok(w.length > 100, `${name}: ${w.length} steps (it was ${name === 'sinusoid' ? 144 : 11} sections of up to 100 ms each)`);
  }
  assert.ok(b.sinus.reduce((a, c) => a + c, 0) > 1e6, 'the meter does count the work (the sinusoid\'s build writes millions of vertices over its passes)');
});

test('the sliced build is byte for byte the one-shot build (a section run whole gives the same geometry as the same section run in steps)', () => {
  const sliced = build();
  const was = pacing.stepWork;
  pacing.stepWork = Infinity;   // (a section never yields: the one-shot path)
  try {
    const whole = build();
    assert.equal(whole.dSinus, sliced.dSinus, 'the sinusoid\'s geometry');
    assert.equal(whole.dLobule, sliced.dLobule, 'the lobule\'s geometry');
    assert.ok(Math.max(...whole.sinus) > Math.max(...sliced.sinus), 'and the one-shot steps really were bigger');
  } finally { pacing.stepWork = was; }
});

test('MeshBuilder.buildSteps is build(): same attributes, same index, and the meter sees the copy', () => {
  const mk = () => { const b = new MeshBuilder(); for (let i = 0; i < 3000; i++) { const x = i * 0.01; const a = b.v(x, 0, 0, 0, 0, 1, [1, 0, 0]), c = b.v(x + 1, 0, 0, 0, 0, 1, [1, 0, 0]), d = b.v(x, 1, 0, 0, 0, 1, [1, 0, 0]); b.tri(a, c, d); } return b; };
  const one = mk().build(), m0 = meshWork.n;
  const b2 = mk(), m1 = meshWork.n, was = pacing.stepWork;
  pacing.stepWork = 100;   // (a small budget: the copy of a mesh this size is only a few thousand of the meter)
  let yields = 0;
  try { const g = b2.buildSteps(); for (let r = g.next(); !r.done; r = g.next()) yields++; } finally { pacing.stepWork = was; }
  assert.ok(meshWork.n - m1 > 0 && m1 - m0 > 0);
  assert.ok(yields >= 1, 'a big mesh\'s build ends a step part way');
  const bytes = (a: { array: ArrayBufferView }) => Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength).toString('hex');
  const two = (() => { const b = mk(); pacing.stepWork = 100; try { const gg = b.buildSteps(); let r = gg.next(); while (!r.done) r = gg.next(); return r.value; } finally { pacing.stepWork = was; } })();
  for (const n of ['position', 'normal', 'color']) assert.equal(bytes(two.getAttribute(n) as never), bytes(one.getAttribute(n) as never), n);
  assert.equal(bytes(two.getIndex() as never), bytes(one.getIndex() as never));
});

test('the scene constructs the sinusoid and the lobule in steps of their own, and the build is driven by the steps, not by one call', () => {
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  assert.match(scene, /if \(!this\.microSinus\) this\.makeSinus\(\); else this\.buildMicro\(\);/);
  const lobule = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8'), sinusoid = readFileSync('src/scene/micro3d/sinusoid3d.ts', 'utf8');
  assert.doesNotMatch(lobule.slice(lobule.indexOf('private *vesselSteps()')), /\n\s+yield;\n/, 'a bare yield in the vessels\' steps is a step of unknown size: yield through the pace');
  assert.match(sinusoid, /private \*shapeFinalSteps\(/, 'the moves of the shapes are worked out a part (and a chunk of the wall\'s fit) at a time');
});

test('the lobule\'s bile is worked out once per net (the flat view, the unwelded build and the welds all ask for it)', async () => {
  const { buildBile } = await import('../src/scene/lobule/bile.ts');
  const { LobuleView } = await import('../src/scene/lobule/view.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const net = new LobuleView(createShared()).net;
  assert.equal(buildBile(net), buildBile(net));
});

test('with a weld plan laid in (the device\'s path), the lobule\'s steps stay inside the cap and are byte for byte the whole build', async () => {
  const { weldRequest } = await import('../src/scene/micro3d/lobule3d.ts');
  const { planWelds } = await import('../src/scene/lobule/welds.ts');
  // (Plan 50: the plan is worked out once for the file, the way the device gets it: the baked file when there is one, else planned once with the bake's own options)
  const { decodePlan, weldDigest } = await import('../src/scene/lobule/weld-codec.ts');
  const req0 = weldRequest(new CelScene().lobule.net);
  const baked = ((): ReturnType<typeof decodePlan> => { try { const b = gunzipSync(readFileSync('public/lobule/welds.bin')); return decodePlan(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), weldDigest(req0)); } catch { return null; } })();
  const plan = baked ?? planWelds(req0.courses, { avoid: req0.avoid, splay: false });
  const run = (): { w: number[]; d: string; skins: number } => {
    const sc = new CelScene();
    const l3 = new Lobule3D(sc.lobule, sc.shared, true);
    l3.layWeldsForTest(plan);   // (the plan is taken when the vessels are built: they are not yet)
    const w: number[] = [];
    for (let go = true; go;) { const m = meshWork.n; go = l3.prepareVessels(); w.push(meshWork.n - m); }
    return { w, d: digest(l3.group), skins: l3.weldCount };
  };
  const sliced = run();
  assert.ok(sliced.skins > 0, 'a plan with skins was laid');
  assert.ok(Math.max(...sliced.w) <= STEP_WORK_CAP, `the biggest welded step took ${Math.round(Math.max(...sliced.w))}`);
  pacing.stepWork = Infinity;
  try { assert.equal(run().d, sliced.d); } finally { pacing.stepWork = STEP_WORK; }
});

test('the priming is steps of its own: the lobule\'s tiles in several, the sinusoid\'s tail a keyed piece a step, and the scene is primed once they end', () => {
  const sc = new CelScene();
  let tileSteps = 0, tailSteps = 0;
  const cells = Lobule3D.prototype.primeCells, upd = Sinusoid3D.prototype.update;
  Lobule3D.prototype.primeCells = function (this: InstanceType<typeof Lobule3D>) { const r = cells.call(this); if (!r) tileSteps++; return r; };
  Sinusoid3D.prototype.update = function (this: InstanceType<typeof Sinusoid3D>, on: boolean, rate?: number, force?: boolean, upTo?: number) { if (upTo != null && upTo < 9) tailSteps++; return upd.call(this, on, rate, force, upTo); };
  try {
    let n = 0;
    while (!(sc as unknown as { microStep(): boolean }).microStep()) if (++n > 20000) assert.fail('the priming never ended');
  } finally { Lobule3D.prototype.primeCells = cells; Sinusoid3D.prototype.update = upd; }
  assert.ok(tileSteps >= 5, `the tiles took ${tileSteps} steps (they were one)`);
  assert.equal(tailSteps, 4, 'the sinusoid\'s tail: the tail, the colours, the stellate cell\'s, the rest');
  assert.ok(sc.microPrimedNow);
});

test('the lobule\'s first cell build in steps is the one-shot build: the same tiles, and nothing left to build once it is done', () => {
  type Tiles = { cells: { geometry: { getAttribute(n: string): { array: Float32Array } } }; flat: { look: string } };
  const mk = (): InstanceType<typeof Lobule3D> => { const sc = new CelScene(); return new Lobule3D(sc.lobule, sc.shared, true); };
  const tiles = (l: InstanceType<typeof Lobule3D>): string => { const a = (l as unknown as Tiles).cells.geometry.getAttribute('position').array; return createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex'); };
  const a = mk(); let steps = 0;
  while (!a.primeCells()) steps++;
  assert.ok(steps >= 5, `${steps} steps for the tiles`);
  assert.equal(a.primeCells(), true, 'built: nothing more to do');
  const b = mk(); b.buildForTest((b as unknown as Tiles).flat.look as never, 0, 0);
  assert.equal(tiles(a), tiles(b));
});
