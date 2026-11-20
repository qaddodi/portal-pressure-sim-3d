#!/usr/bin/env node
// Bakes the Anatomy's junction skins (src/scene/vessels/skin) into public/anatomy/skins.bin at BUILD time, so the page plans and remeshes nothing at load (about 6 s of CPU for the 14 skins on a laptop, the cava's alone 2 s):
// it fetches this one file (gzip) next to the fonts and the engine, and the scene lays the skins in. The build runs it before the bundler (scripts/build.mjs); a failure only warns, and the page then builds them live as before.
// `--check` builds nothing and says whether the file on disk is the one for the current figure (its digest).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

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
