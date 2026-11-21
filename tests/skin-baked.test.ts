// The Anatomy's junction skins are baked at build time (skin/baked.ts, scripts/bake-skins.mjs): the page plans and meshes nothing at load, the figure's first frame has its welds, and nothing is fetched late enough to pop
// (20 Nov: a first-frame stall is not acceptable). Run: node --test tests/skin-baked.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute, Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, type SkinSetDeps } from '../src/scene/vessels/skin/skin-set.ts';
import { decodeSkins, encodeSkins, skinsDigest, type BakedSkins } from '../src/scene/vessels/skin/baked.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

const text = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

function setOf(scene: CelScene, baked?: () => BakedSkins | null): { set: SkinSet; meshes: SkinMesh[] } {
  const all: SkinMesh[] = [], parent = new Group();   // (`meshes`: the ones that stand, not those a retried plan took back)
  const deps: SkinSetDeps = {
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh) => { all.push(mesh); return { mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} } as never; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {}, baked,
  };
  const set = new SkinSet(deps);
  return { set, get meshes() { const live = new Set<unknown>(set.liveDraws().map((d) => (d as unknown as { mesh: SkinMesh }).mesh)); return all.filter((m) => live.has(m)); } };
}

test('the baked file unpacks to the skins it was made from, and a build that is given it lays those in and meshes nothing (live build once, then the baked one)', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const live = setOf(scene), t0 = performance.now();
    live.set.build(2);
    const liveMs = performance.now() - t0, made = live.set.bake();
    assert.ok(made.skins.length >= 12, `${made.skins.length} skins baked`);
    assert.ok(made.digest.length > 10);
    assert.equal(made.skins.find((s) => s.plan.junction.node === 'IVCS')!.pace, 2, 'the cava closes on the slowest rung, which a later rebuild of it starts at');

    // the file: pack, unpack
    const bin = encodeSkins(made), back = decodeSkins(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)!;
    assert.ok(back, 'a baked file is known');
    assert.equal(back.digest, made.digest); assert.deepEqual(back.lost, made.lost); assert.deepEqual(back.dropped, made.dropped);
    assert.equal(back.skins.length, made.skins.length);
    back.skins.forEach((b, i) => {
      const a = made.skins[i]!;
      assert.deepEqual(b.plan, a.plan); assert.deepEqual(b.axes, a.axes); assert.equal(b.pace, a.pace);
      assert.equal(b.mesh.junction, b.plan.junction, 'the mesh and its plan share one junction, as they do when built live'); assert.equal(b.mesh.cuts, b.plan.cuts);
      for (const k of ['position', 'normal', 'cen', 'weight', 'weight2', 'restR', 'index'] as const) assert.deepEqual(b.mesh[k], a.mesh[k], `${a.plan.junction.node} ${k}`);
      assert.deepEqual(b.mesh.seamVerts, a.mesh.seamVerts);
      // the plain trunk of a skin with growing arms (plain.ts) ships baked too: its axes, mesh and pace, or the null that says it could not be built
      assert.equal(b.plain === undefined, a.plain === undefined, `${a.plan.junction.node}: the plain trunk is carried`);
      if (a.plain && b.plain) {
        assert.deepEqual(b.plain.axes, a.plain.axes); assert.equal(b.plain.pace, a.plain.pace);
        for (const k of ['position', 'normal', 'cen', 'weight', 'weight2', 'restR', 'index'] as const) assert.deepEqual(b.plain.mesh[k], a.plain.mesh[k], `${a.plan.junction.node}~plain ${k}`);
        assert.equal(b.plain.mesh.junction.node, `${a.plan.junction.node}~plain`); assert.equal(b.plain.mesh.cuts.length, b.plain.mesh.junction.arms.length);
      } else assert.equal(b.plain, a.plain);
    });
    const withPlain = made.skins.filter((x) => x.plain);
    assert.ok(withPlain.length >= 4, `${withPlain.length} skins bake a plain trunk (CONF, SV, RPV_T, IVCI at least)`);
    assert.deepEqual(made.skins.filter((x) => x.plain === null).map((x) => x.plan.junction.node), ['LPV_A'], 'the plain trunks that do not build are named');
    assert.equal(decodeSkins(new ArrayBuffer(4)), null);

    // the page's build from the file: the same skins, the same cuts, a fraction of the time
    const baked = setOf(scene, () => back), t1 = performance.now();
    baked.set.build(2);
    const bakedMs = performance.now() - t1;
    assert.deepEqual(baked.set.nodes, live.set.nodes);
    assert.deepEqual(baked.set.fellBack, live.set.fellBack); assert.deepEqual(baked.set.dropped, live.set.dropped);
    assert.deepEqual(baked.meshes.map((m) => m.position.length), live.meshes.map((m) => m.position.length));
    for (const m of baked.meshes) assert.ok(back.skins.some((b) => b.mesh === m), `${m.junction.node}: the skin drawn is the baked mesh itself, not a new one`);
    for (const x of back.skins) if (x.plain) assert.equal(baked.set.plainOf(x.plan.junction.node), x.plain.mesh, `${x.plan.junction.node}: the plain trunk drawn is the baked mesh itself`);
    assert.ok(bakedMs < liveMs / 4 && bakedMs < 2000, `baked ${Math.round(bakedMs)} ms against ${Math.round(liveMs)} ms live`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('a baked file is the file for one figure: the digest moves with a junction or with one vertex of an arm tube, and not with noise below 1e-4', () => {
  const tube = (dx: number) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1 + dx, 0, 0, 2, 0, 0], 3)); return { geometry: g, tubular: 2 }; };
  const j = (x: number) => ({ node: 'N', J: [x, 0, 0] as [number, number, number], arms: [] });
  const d = (dx: number, x = 0) => skinsDigest([j(x)], new Map([['V', tube(dx)]]));
  assert.equal(d(0), d(0));
  assert.equal(d(0), d(1e-6), 'the last bits of sin and cos between node and a phone do not matter');
  assert.notEqual(d(0), d(1e-3), 'a moved vertex');
  assert.notEqual(d(0), d(0, 0.5), 'a moved junction');
});

test('the build bakes the skins before the bundler, the scene builds nothing before the file is in, and the boot waits for it with the fonts and the engine', () => {
  const build = text('../scripts/build.mjs');
  assert.ok(build.indexOf('bake-skins.mjs') > 0 && build.indexOf('bake-skins.mjs') < build.indexOf('vite.js'));
  const scene = text('../src/scene/scene.ts');
  assert.match(scene, /if \(bakedPending\(\)\) void bakedReady\.then\(\(\) => \{[^}]*this\.refreshSkins\(\)/, 'with the file still on its way the skins are built when it lands');
  assert.match(scene, /baked: bakedSkins,/);
  assert.match(text('../src/main.tsx'), /await Promise\.all\(\[fontsReady\(\), bootEngine\(\)[^\]]*bakedReady\]\)/, 'the first picture is after the file');
  assert.match(text('../.gitignore'), /public\/anatomy\/skins\.bin/, 'a built file is not committed (organs.bin beside it is)');
});
