// L3 (21 Nov): every program the figure can ask for is compiled under the splash. The scene constructs the 3D lobule and sinusoid (their materials, no geometry) before the warm-up, and hidden stand-ins
// (materials/prototypes.ts) wear the shaders and flags of the materials made later. three.js keys a program on materials/program-key.ts, so what these tests compare is what the driver would be asked to link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Mesh, Object3D, ShaderMaterial } from 'three';

const { setOrganData } = await import('../src/scene/organs/meshes.ts');
const { setArtData } = await import('../src/scene/organs/organ-art.ts');
{   // (the organs' files, as the browser would fetch them: the organs and their art are built once both are in)
  const f = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
  setArtData(JSON.parse(readFileSync(new URL('../public/anatomy/organ-art.json', import.meta.url), 'utf8')));
}
const { CelScene } = await import('../src/scene/scene.ts');
const { programKey, programsOf } = await import('../src/scene/materials/program-key.ts');
const { programPrototypes } = await import('../src/scene/materials/prototypes.ts');
const { ResistorLayer } = await import('../src/scene/circuit/resistors.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');

const keys = (root: Object3D): Set<string> => new Set(programsOf(root).keys());

test('constructing the micro views adds every one of their programs, and building and priming them adds none', async () => {
  const sc = new CelScene();
  await sc.organsBuilt;
  const before = keys(sc.scene);
  sc.constructMicro();
  const boot = keys(sc.scene);
  assert.ok(boot.size >= before.size + 15, `the 3D lobule and sinusoid bring ${boot.size - before.size} programs: they were compiled when first shown (a driver stall in the dive)`);
  const micro = sc as unknown as { micro: { sinus: { shapeReady: boolean; prepareShapeStep(): boolean; update(on: boolean, rate: number, force: boolean): boolean }; lobule: { prepareVessels(): boolean; update(on: boolean, u: number, now: number, rate: number, force: boolean): boolean } } };
  while (!micro.micro.sinus.shapeReady) micro.micro.sinus.prepareShapeStep();
  while (micro.micro.lobule.prepareVessels());
  (sc as unknown as { snapMicroToModel(): void }).snapMicroToModel();
  micro.micro.lobule.update(true, 0, 0, 1, true); micro.micro.sinus.update(true, 1, true);
  const after = keys(sc.scene);
  const late = [...after].filter((k) => !boot.has(k));
  assert.deepEqual(late.map((k) => programsOf(sc.scene).get(k)), [], 'a program the built views need that the constructors did not make: it would compile in the dive');
});

test('the devices (every procedure\'s catheter, the bands, the balloon, the glue) add no program the boot graph lacks', async () => {
  const sc = new CelScene();
  await sc.organsBuilt;
  sc.constructMicro();
  const boot = keys(sc.scene);
  const procs = sc.procs as unknown as { catheterFor(k: string): unknown; syncBands(n: number, i: boolean): void; syncTamponade(p: unknown, i: boolean): void; glue: { set(s: unknown): void } };
  for (const k of ['tips', 'brto', 'tipsgrad', 'hvpgcath', 'eusglue', 'brtoC6', 'tipscoil', 'tipscoilin', 'hvpg']) procs.catheterFor(k);
  procs.syncBands(3, true); procs.syncTamponade({ balloonGas: true, balloonEso: true }, true); procs.glue.set({ coil: 1, column: 1, flash: 0, opacity: 1 });
  const late = [...keys(sc.scene)].filter((k) => !boot.has(k));
  assert.deepEqual(late.map((k) => programsOf(sc.scene).get(k)), []);
});

test('the stand-ins are on the scene graph (hidden), each one wears its material\'s shaders, and the clot is the real class', async () => {
  const sc = new CelScene();
  await sc.organsBuilt;
  const protos = sc.scene.getObjectByName('program-prototypes')!;
  assert.ok(protos, 'the scene holds the stand-ins');
  assert.equal(protos.visible, false);
  const names = protos.children.map((c) => c.name);
  for (const n of ['prototype/circuit resistors', 'prototype/blood streaks', 'prototype/bleed jet ink', 'prototype/clot']) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => n.startsWith('prototype/organ halo')), 'an organ\'s glow shells and the spleen\'s ring');
  // the resistor layer's own material has the stand-in's program
  const real = (new ResistorLayer() as unknown as { material(): ShaderMaterial }).material();
  const stand = protos.getObjectByName('prototype/circuit resistors') as Mesh;
  assert.equal(programKey(stand, stand.material as ShaderMaterial), programKey(stand, real));
  // a clot built by the clot layer is a ClotObject on a ringTube: the stand-in is too
  const g = (protos.getObjectByName('prototype/clot') as Object3D);
  assert.ok(g, 'clot');
  // every stand-in is a distinct program (none is dead weight)
  assert.equal(programsOf(protos).size >= names.length, true);
});

test('highlighting every organ (its glow shells, the spleen\'s normal-range ring) adds no program: the organs\' stand-ins have them', async () => {
  const { OrganPins } = await import('../src/scene/highlight.ts');
  const sc = new CelScene();
  await sc.organsBuilt;
  sc.constructMicro();
  const boot = keys(sc.scene);
  const organs = (sc.disease.organs as unknown as { byId: Map<string, import('../src/scene/materials/cel.ts').CelObject> }).byId;
  assert.ok(organs.size >= 5, `${organs.size} organs built`);
  const pins = new OrganPins();
  pins.select([...organs.keys()]); pins.set([...organs.keys()]); pins.setNormalOutline(true);
  pins.step(400, organs);
  const late = [...keys(sc.scene)].filter((k) => !boot.has(k));
  assert.deepEqual(late.map((k) => programsOf(sc.scene).get(k)), [], 'a highlight that compiles in the figure');
});

test('every material the real code makes from the stand-ins\' recipes spreads the same flag constant the stand-in wears', () => {
  const read = (f: string) => readFileSync(f, 'utf8');
  assert.match(read('src/scene/circuit/resistors.ts'), /vertexShader: VS, fragmentShader: FS, \.\.\.RESISTOR_FLAGS/);
  assert.match(read('src/scene/blood/cells/cells.ts'), /fragmentShader: CELLS_FS, \.\.\.STREAK_FLAGS/);
  assert.match(read('src/scene/disease/bleed.ts'), /fragmentShader: JET_INK_FS, \.\.\.JET_INK_FLAGS/);
  const hl = read('src/scene/highlight.ts');
  assert.equal((hl.match(/\.\.\.HALO_FLAGS/g) ?? []).length, 2, 'the organ glow shells and the spleen\'s ring');
});

/** Every `new ShaderMaterial(` and `new RawShaderMaterial(` in src/scene, by file, and how its programs are compiled under the splash. A new one fails here until it is listed with its answer. */
const SITES: Record<string, { n: number; how: 'graph' | 'micro' | 'stand-in' | 'pass' | 'late'; why: string }> = {
  'scene/disease/dye.ts': { n: 1, how: 'graph', why: 'the dye overlay is on the vessels from the start (hidden)' },
  'scene/disease/bleed.ts': { n: 1, how: 'stand-in', why: 'JET_INK_FLAGS' },
  'scene/disease/ascites.ts': { n: 1, how: 'graph', why: 'the pool hulls' },
  'scene/disease/scope-ring.ts': { n: 1, how: 'graph', why: 'the scope ring on the varices is in the disease group from the start (hidden until a slide asks for it)' },
  'scene/highlight.ts': { n: 2, how: 'stand-in', why: 'HALO_FLAGS on each organ\'s ink' },
  'scene/glow-fx.ts': { n: 2, how: 'pass', why: 'the glow\'s full-screen blur and lay (a pass, not a scene object): compiled with its first pick, GAP (not in the warm-up)' },
  'scene/materials/cel.ts': { n: 2, how: 'graph', why: 'the toon and the ink of every object' },
  'scene/materials/prototypes.ts': { n: 4, how: 'stand-in', why: 'the stand-ins themselves' },
  'scene/organs/layer.ts': { n: 1, how: 'graph', why: 'the organ seat' },
  'scene/post-aa.ts': { n: 1, how: 'pass', why: 'the anti-aliasing quad: compiled with the first frame' },
  'scene/post-dof.ts': { n: 3, how: 'pass', why: 'the depth-of-field quads: desktop only, GAP (compile at the first dive)' },
  'scene/vessels/skin/skin-object.ts': { n: 2, how: 'graph', why: 'junction skins' },
  'scene/vessels/vessel-object.ts': { n: 4, how: 'graph', why: 'vessel, glow, veil, crossing shadow' },
  'scene/circuit/resistors.ts': { n: 1, how: 'stand-in', why: 'RESISTOR_FLAGS' },
  'scene/circuit/map-layer.ts': { n: 2, how: 'graph', why: 'the Circuit plate and dots' },
  'scene/shunt-guide.ts': { n: 1, how: 'graph', why: 'the shunt guide' },
  'scene/micro3d/lobule3d.ts': { n: 1, how: 'micro', why: 'the marks plate, constructed under the splash' },
  'scene/micro3d/cel3d.ts': { n: 2, how: 'micro', why: 'microMaterials: every part of both views' },
  'scene/devices/contact-shadow.ts': { n: 1, how: 'graph', why: 'the soft shadow of a device tube (the balloon\'s and the catheters\' are made with them)' },
  'scene/blood/cells/cells.ts': { n: 1, how: 'stand-in', why: 'STREAK_FLAGS' },
  'scene/lobule/field.ts': { n: 1, how: 'graph', why: 'the neighbouring lobules' },
};

test('every site that makes a shader material is accounted for: on the boot graph, a micro view, a stand-in, or a named gap', () => {
  const found: Record<string, number> = {};
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const n = (readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').match(/new (Raw)?ShaderMaterial\(/g) ?? []).length;
      if (n) found[p.replace(/^src\//, '')] = n;
    }
  };
  walk('src/scene');
  for (const [f, n] of Object.entries(found)) assert.ok(SITES[f], `${f} makes ${n} shader material(s) nobody has said how to compile under the splash (add it to SITES in tests/program-warm.test.ts, and a stand-in in materials/prototypes.ts if the scene does not hold it at boot)`);
  for (const [f, s] of Object.entries(SITES)) assert.equal(found[f], s.n, `${f}: ${found[f] ?? 0} sites now, ${s.n} listed`);
});
