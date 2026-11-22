#!/usr/bin/env node
// Bakes the Anatomy's junction skins (src/scene/vessels/skin) into public/anatomy/skins.bin at BUILD time, so the page plans and remeshes nothing at load (about 6 s of CPU for the 14 skins on a laptop, the cava's alone 2 s):
// it fetches this one file (gzip) next to the fonts and the engine, and the scene lays the skins in. The build runs it before the bundler (scripts/build.mjs); a failure only warns, and the page then builds them live as before.
// `--check` builds nothing and says whether the file on disk is the one for the current figure (its digest).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// `--net` bakes the network meshes of ?geom=net (net/mesh.ts) instead, from net/skeleton.ts: one public/anatomy/net-<n>.bin (gzip) per network, and a junction that will not mesh FAILS the bake naming itself (no fallback). Not part of the default build.
if (process.argv.includes('--net')) {
  const sk = new URL('../src/scene/vessels/net/skeleton.ts', import.meta.url);
  if (!existsSync(fileURLToPath(sk))) { console.error('net bake: src/scene/vessels/net/skeleton.ts does not exist yet (WP0)'); process.exit(1); }
  const { skeleton } = await import(sk.href);
  const { buildNetMesh, networksOf } = await import('../src/scene/vessels/net/mesh.ts');
  const { encodeNet, skeletonDigest } = await import('../src/scene/vessels/net/baked.ts');
  const { presetSwells } = await import('./net-states.mjs');
  const skel = skeleton(), digest = skeletonDigest(skel), states = await presetSwells(skel);   // (the real states: the wide junctions' keys, net/keys.ts)
  mkdirSync(fileURLToPath(new URL('../public/anatomy/', import.meta.url)), { recursive: true });
  // cached by digest: a file that is for THIS skeleton and newer than every source the mesher reads is kept (the page never meshes, so a stale file is never laid in; a fresh checkout has none and bakes once)
  const { readFileSync, statSync, readdirSync } = await import('node:fs'), { gunzipSync } = await import('node:zlib');
  const srcNewest = Math.max(...['../src/scene/vessels/net/', '../src/scene/vessels/skin/'].flatMap((d) => readdirSync(fileURLToPath(new URL(d, import.meta.url))).filter((f) => f.endsWith('.ts')).map((f) => statSync(fileURLToPath(new URL(d + f, import.meta.url))).mtimeMs)), statSync(fileURLToPath(import.meta.url)).mtimeMs);
  const fresh = (file) => { try { const b = gunzipSync(readFileSync(file)), dl = b.readUInt32LE(16), d = b.subarray(20, 20 + dl).toString(); return d === digest && statSync(file).mtimeMs >= srcNewest; } catch { return false; } };
  networksOf(skel).forEach((edges, n) => {
    if (fresh(fileURLToPath(new URL(`../public/anatomy/net-${n}.bin`, import.meta.url))) && !process.argv.includes('--force')) { console.log(`net-${n}.bin: current (digest ${digest}), kept`); return; }
    const t0 = Date.now(), r = buildNetMesh(skel, edges, { states, maps: true });
    const gz = gzipSync(Buffer.from(encodeNet(r.mesh, digest, r.nodes)), { level: 9 });
    writeFileSync(fileURLToPath(new URL(`../public/anatomy/net-${n}.bin`, import.meta.url)), gz);
    console.log(`net-${n}.bin: ${edges.length} edges, ${r.report.vertices} vertices, ${r.report.triangles} triangles, ${(gz.length / 1048576).toFixed(2)} MB gzip, ${Date.now() - t0} ms${r.mapNotes.length ? `; ${r.mapNotes.length} regions without a bridging map mesh: ${r.mapNotes.map((x) => x.node).join(', ')}` : ''}`);
  });
  process.exit(0);
}
process.env.PPS_NO_BAKED = '1';   // (the bake builds live: it must never lay in the file it is about to replace)
const out = fileURLToPath(new URL('../public/anatomy/skins.bin', import.meta.url));
const outCircuit = fileURLToPath(new URL('../public/anatomy/circuit-skins.bin', import.meta.url));
const { Group } = await import('three');
const { CelScene } = await import('../src/scene/scene.ts');
const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');
const { SkinSet } = await import('../src/scene/vessels/skin/skin-set.ts');
const { joinsPhase } = await import('../src/scene/vessels/skin/joins-mode.ts');
const { encodeSkins, decodeSkins } = await import('../src/scene/vessels/skin/baked.ts');
const { CircuitSkinSet } = await import('../src/scene/circuit/skins.ts');

// the figure as the page first builds it: smooth joins on, every vessel at rest, the default joins mode's phase
setSmoothJoins(true);
const scene = new CelScene({ joins: 'old' });
const body = new Group();
const set = new SkinSet({
  vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
  make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }),
  add: (o) => body.add(o), remove: (o) => body.remove(o), warn: () => {},
});
const t = Date.now();
set.build(joinsPhase('mesh2'));
const baked = set.bake();
// the Circuit's skins (src/scene/circuit/skins.ts): the same script, the map's frame
const circuit = new CircuitSkinSet({
  vessel: (id) => scene.vesselObject(id),
  make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }),
  add: (o) => body.add(o), remove: (o) => body.remove(o), warn: () => {},
});
circuit.build();
const bakedCircuit = circuit.bake();
const current = (file, want) => existsSync(file) && (() => { const b = gunzipSync(readFileSync(file)); return decodeSkins(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))?.digest === want; })();
if (process.argv.includes('--check')) {
  const ok = current(out, baked.digest) && current(outCircuit, bakedCircuit.digest);
  console.log(ok ? 'baked skins: current' : 'baked skins: missing or for another figure');
  process.exit(ok ? 0 : 1);
}
mkdirSync(fileURLToPath(new URL('../public/anatomy/', import.meta.url)), { recursive: true });
const gz = gzipSync(encodeSkins(baked), { level: 9 });
writeFileSync(out, gz);
const gzC = gzipSync(encodeSkins(bakedCircuit), { level: 9 });
writeFileSync(outCircuit, gzC);
console.log(`baked circuit skins: ${bakedCircuit.skins.length} skins, ${bakedCircuit.lost.length} left as lines, ${(gzC.length / 1048576).toFixed(2)} MB gzip`);
console.log(`baked skins: ${baked.skins.length} skins, ${baked.lost.length} left as joins, ${(gz.length / 1048576).toFixed(2)} MB gzip, ${((Date.now() - t) / 1000).toFixed(1)} s`);
process.exit(0);
