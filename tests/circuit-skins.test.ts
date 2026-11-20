// The Circuit's junction skins (src/scene/circuit/skins.ts): the Anatomy's welds on the map. Node only: no browser, no GPU. What is held here is the INVENTORY (which junctions of the map are welded, which are not and why: a new
// one fails by name until someone looks), the RINGS (the tube the vertex shader draws at circT = 1, computed on the CPU, is a tube whose ring k is where the cut at u = k / tubular lies), the SEAMS (the skin starts on those very
// vertices), the TUBES' second cut, the baked file, the turn and the shaders' shape. Run: node --test tests/circuit-skins.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Vector3, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { decodeSkins, encodeSkins } from '../src/scene/vessels/skin/baked.ts';
import { ringOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SKIN_CIRC_IN, SKIN_CUT_C_NONE, SKIN_HIDDEN } from '../src/scene/vessels/skin/types.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { rawPrograms } from '../src/debug/gl-registry.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { CIRC_SKIN_REACH, CircuitSkinSet, circuitFallbacks, circuitRadius, circuitReach, circuitTube, findCircuitJunctions, turnMatrix, type CircuitSkinDeps } from '../src/scene/circuit/skins.ts';
import { MAP_CENTRE, MAP_K, turnScenePt } from '../src/scene/circuit/map.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { SKIN_REACH } from '../src/scene/vessels/skin/inventory.ts';

const text = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** The junctions the map welds on 20 Nov 2026, with their arms and ends: the body's twelve less the two liver beds. */
const TABLE: Record<string, readonly string[]> = {
  HA: ['A_HEP:1', 'A_HR:0', 'A_HL:0'],
  SV: ['V_IMV:1', 'SV_MID:1', 'SV_CONF:0'],
  CONF: ['SMV_CONF:1', 'SV_CONF:1', 'PV_TRUNK_1:0'],
  PVT_L: ['PV_TRUNK_1:1', 'PV_TRUNK:0', 'LGV_CONF:1'],
  PVH: ['PV_TRUNK:1', 'PVH_R:0', 'PVH_L:0'],
  CV_R: ['SIN_RR:1', 'POST_R_RHV:0', 'POST_R_MHV:0'],
  IVCS: ['IVC_IS:1', 'IVCS_RA:0', 'RHV_IVC:1', 'MHV_IVC:1', 'LHV_IVC:1'],
  IVCI: ['IVC_IS_1:0', 'LRV_IVC:1', 'ILI_IVC_1:1'],
  SVC_E: ['EPI_SVC:1', 'SVC_RA_1:1', 'SVC_RA:0'],
  SVC: ['V_UP:1', 'AZY_SVC:1', 'SVC_RA_1:0'],
};
const armKeys = (j: { arms: readonly { vesselId: string; end: number }[] }): string[] => j.arms.map((a) => `${a.vesselId}:${a.end}`).sort();

test('the map welds the body\'s permanent junctions: ten nodes, their arms and ends pinned; the two liver beds are named fallbacks, not hidden', () => {
  const js = findCircuitJunctions();
  assert.deepEqual(js.map((j) => j.node).sort(), Object.keys(TABLE).sort());
  for (const j of js) assert.deepEqual(armKeys(j), [...TABLE[j.node]!].sort(), j.node);
  // the beds: the map draws the arteriole beside the lanes (A_HR ends at the comb, 30 map units off the bed's station), so it is not a junction there
  assert.deepEqual(circuitFallbacks().map((f) => f.node).sort(), ['SIN_L', 'SIN_R']);
  assert.ok(circuitFallbacks().every((f) => f.why === 'an arm ends too far from the station'));
  assert.equal(CIRC_SKIN_REACH, SKIN_REACH, 'the map keeps the body\'s reach');
});

test('on the map every arm of a welded node ends exactly on its station: no side-wall landing, no art gap to bridge; arms are widest first by their MAP width', () => {
  for (const j of findCircuitJunctions()) {
    for (const r of circuitReach(j)) assert.ok(r < 1e-3, `${j.node}: an arm ends ${r} radii from J`);
    const w = j.arms.map((a) => a.restR);
    assert.deepEqual([...w].sort((a, b) => b - a), w, `${j.node}: widest first`);
    for (const a of j.arms) {
      assert.ok(COURSES.has(a.vesselId), `${a.vesselId} has a map course`);
      assert.equal(a.restR, circuitRadius(NETWORK_BY_ID.get(a.vesselId)!), `${a.vesselId}: the radius the rings are built at is the map's`);
      assert.equal(NETWORK_BY_ID.get(a.vesselId)!.circFine ?? 1, 1, `${a.vesselId}: no fine-width artery among the arms (circSwellOf has no such term)`);
      assert.ok(!a.side && !a.grow, 'plain arms');
    }
  }
});

test('the map radius is half 2D\'s width at boost 1 with no floor, and the shader\'s width rule is the same formula (veins 6 to 15 by diameter, arteries 3, beds 8)', () => {
  assert.equal(circuitRadius({ widthKind: 1, baseD: 4, circFine: undefined }), 0.5 * 3 * MAP_K);
  assert.equal(circuitRadius({ widthKind: 2, baseD: 4, circFine: undefined }), 0.5 * 8 * MAP_K);
  for (const d of [1, 3, 5, 8, 12, 16, 25]) {
    const glsl = Math.min(15, Math.max(6, 1.3 * Math.max(2.6, 2 * Math.pow(Math.max(d, 0.1), 0.72)) * 0.95));   // (skin/shaders.ts circWidthAt at boost 1)
    assert.ok(Math.abs(circuitWidthMap(0, d, 1) - glsl) < 1e-9, `d ${d}: ${circuitWidthMap(0, d, 1)} against the shader's ${glsl}`);
  }
  assert.match(SKIN_VS, /float circWidthAt\(float d, float kind, float boost\)/);
  assert.match(SKIN_VS, /clamp\(1\.3 \* max\(2\.6, 2\.0 \* pow\(max\(d, 0\.1\), 0\.72\)\) \* 0\.95, 6\.0, 15\.0\) \* boost/);
});

test('circuitTube: ring k of the map tube is a ring round the map course\'s centre at share k / tubular, of the map\'s radius, in the plane square to the course', () => {
  for (const id of ['PV_TRUNK', 'SMV_CONF', 'RHV_IVC', 'A_HEP', 'LGV_CONF']) {
    const t = circuitTube(id), c = COURSES.get(id)!, R = circuitRadius(NETWORK_BY_ID.get(id)!), pos = t.geometry.getAttribute('position');
    assert.equal(t.radius, R);
    for (const k of [0, Math.floor(t.tubular / 3), Math.floor(t.tubular / 2), t.tubular]) {
      const want = c.curveC.getPointAt(k / t.tubular), tan = c.curveC.getTangentAt(k / t.tubular);
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < TUBE_RADIAL; j++) { const i = k * (TUBE_RADIAL + 1) + j; cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
      const centre = new Vector3(cx / TUBE_RADIAL, cy / TUBE_RADIAL, cz / TUBE_RADIAL);
      assert.ok(centre.distanceTo(want) < 1e-5, `${id} ring ${k}: centre ${centre.distanceTo(want)} off the map course`);
      for (let j = 0; j < TUBE_RADIAL; j++) {
        const i = k * (TUBE_RADIAL + 1) + j, d = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(centre);
        assert.ok(Math.abs(d.length() - R) < 1e-5, `${id} ring ${k} vertex ${j}: radius ${d.length()} against ${R}`);
        assert.ok(Math.abs(d.dot(tan)) < 1e-4 * Math.max(1, R * 100), `${id} ring ${k} vertex ${j}: off the plane square to the course`);
      }
    }
  }
});

function setOf(scene: CelScene, baked?: CircuitSkinDeps['baked']): { set: CircuitSkinSet; made: Group[]; ends: number[] } {
  const made: Group[] = [], parent = new Group(), ends = [0];
  const set = new CircuitSkinSet({
    vessel: (id) => scene.vesselObject(id),
    make: (mesh) => { const object = new Group(); made.push(object); return { mesh, object, setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} } as never; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {}, baked, endsChanged: () => { ends[0]!++; },
  });
  return { set, made, ends };
}

test('a build welds the ten nodes with no fall back: each skin starts on its arms\' own ring vertices, the tubes take their second cut, a clear puts them back', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set, made, ends } = setOf(scene);
    set.build();
    assert.deepEqual([...set.nodes].sort(), Object.keys(TABLE).sort());
    assert.deepEqual(set.fellBack, [], 'nothing falls back on the map');
    assert.equal(made.length, 10);
    assert.ok(ends[0]! >= 1, 'the scene is told the ends changed (it writes the map mates again)');
    for (const node of set.nodes) {
      const m = set.skinOf(node)!;
      m.cuts.forEach((cut, i) => {
        const tube = circuitTube(cut.vesselId), ring = ringOf(tube.geometry, cut.ring, tube.radius), arm = m.junction.arms[i]!;
        // the seam: the skin's vertices ARE the tube's ring, bit for bit
        m.seamVerts[i]!.forEach((v, q) => {
          for (let a = 0; a < 3; a++) assert.equal(m.position[3 * v + a], ring.pos[3 * q + a], `${node} ${cut.vesselId} seam vertex ${q}`);
        });
        assert.equal(cut.u, cut.ring / tube.tubular);
        assert.ok(cut.u > 0 && cut.u < 1, `${node} ${cut.vesselId}: the cut is inside the vessel`);
        // the tube is cut AT that share on the map and nowhere else
        const c = set.cutOf(cut.vesselId);
        assert.equal(c[arm.end], cut.u);
        assert.equal(set.endsOf(cut.vesselId)[arm.end], true);
      });
    }
    // the cut is on the tube's uniform the fragment shader reads, and clear takes it away
    const o = scene.vesselObject('PVH_R')!;
    assert.equal(o.skinCutC()[0], set.cutOf('PVH_R')[0]);
    assert.notDeepEqual(o.skinCutC(), [...SKIN_CUT_C_NONE]);
    assert.deepEqual(o.skinCut(), [-1, 2], 'the BODY\'s cut is not touched');
    set.clear();
    assert.deepEqual(o.skinCutC(), [...SKIN_CUT_C_NONE]);
    assert.deepEqual(set.endsOf('PVH_R'), [false, false]);
    assert.equal(set.count, 0);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('two skins on one vessel never cross: PV_TRUNK_1 keeps a piece of tube between CONF and PVT_L', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    const c = set.cutOf('PV_TRUNK_1');
    assert.ok(c[0] >= 0 && c[1] <= 1 && c[1] - c[0] > 0, `PV_TRUNK_1 is cut at ${c[0]} and ${c[1]}`);
    assert.notDeepEqual([...c], [...SKIN_HIDDEN], 'on the map the two nodes are far enough apart to stay two skins');
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('the baked file: a round trip, the digest of the map\'s own rings, and a build that is given it lays those skins in and meshes nothing', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const live = setOf(scene); live.set.build();
    const made = live.set.bake();
    assert.ok(made.digest.startsWith('circuit/'), 'a Circuit file is never taken for the Anatomy\'s');
    assert.equal(made.skins.length, 10);
    const bin = encodeSkins(made), back = decodeSkins(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)!;
    assert.ok(back && back.digest === made.digest);
    const baked = setOf(scene, () => back); baked.set.build();
    assert.deepEqual(baked.set.nodes, live.set.nodes);
    for (const n of baked.set.nodes) assert.ok(back.skins.some((b) => b.mesh === baked.set.skinOf(n)), `${n}: the skin drawn is the baked mesh itself`);
    // a file for another figure is not laid in
    const other = setOf(scene, () => ({ ...back, digest: 'circuit/other' })); other.set.build();
    for (const n of other.set.nodes) assert.ok(!back.skins.some((b) => b.mesh === other.set.skinOf(n)), `${n}: built live`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('the map\'s turn is the skin\'s object matrix: the same quarter turn about the map\'s centre the vertex shader applies to the tubes', () => {
  for (const rr of [0, 0.3, 1]) {
    const a = (Math.PI / 2) * rr, m = turnMatrix(Math.cos(a), Math.sin(a));
    for (const [x, y] of [[0.1, 0.9], [-0.7, 0.2], [MAP_CENTRE.x, MAP_CENTRE.y]] as const) {
      const p = new Vector3(x, y, 0).applyMatrix4(m), want = turnScenePt(x, y, rr);
      assert.ok(Math.abs(p.x - want[0]) < 1e-9 && Math.abs(p.y - want[1]) < 1e-9, `rr ${rr}`);
      assert.equal(p.z, 0);
    }
  }
});

test('the shaders: the tube has a second cut that takes effect over the END of the change, the skin\'s program is the same source with the map\'s widths and lines, and it is in over the same stretch', () => {
  assert.match(VESSEL_FS, /uniform vec2 skinCutC;/);
  assert.match(VESSEL_FS, /bool skinPastC\(\) \{ return circT > 0\.0 && /);
  assert.match(VESSEL_FS, new RegExp(`float keepC = 1\\.0 - smoothstep\\(${SKIN_CIRC_IN.toFixed(4).replace(/0+$/, '')}0*, 1\\.0, circT\\);`), 'the tube\'s map cut and the skin come in over the same stretch');
  assert.match(SKIN_FS, new RegExp(`\\* smoothstep\\(${SKIN_CIRC_IN.toFixed(4).replace(/0+$/, '')}0*, 1\\.0, circT\\);`));
  assert.match(SKIN_FS, /#ifdef SKIN_CIRC/);
  assert.match(SKIN_VS, /float circSwellOf\(vec4 a\)/);
  assert.match(SKIN_FS, /circT \* [0-9.]+ \* smoothstep\(-inDepth, 0\.0, sdPx\)/, 'the Circuit\'s inner line');
  const names = rawPrograms('').map((p) => p.name);
  for (const n of ['skin (Circuit)', 'skin (Circuit, solid copy)', 'skin (Circuit, veil copy)']) assert.ok(names.includes(n), `${n} is in the compile registry`);
  // the body's skin is gone before the map's comes in: the two never share a pixel
  assert.ok(SKIN_CIRC_IN > 0.35, 'the body\'s skin is gone by 0.35 (SKIN_CIRC_SPAN)');
});

test('the scene builds them with the Anatomy\'s, writes the map\'s mates without the skinned ends, turns and shows them with the change, and the build bakes their file', () => {
  const scene = text('../src/scene/scene.ts');
  assert.match(scene, /this\.circuitSkins \?\?= new CircuitSkinSet\(/);
  assert.match(scene, /new SkinObject\(skin, arms\[0\]!, axes, arms, true\)/);
  assert.match(scene, /this\.circuitSkins\?\.endsOf\(def\.id\)/, 'applyMates writes the map mates without the skinned ends');
  assert.match(scene, /this\.circuitSkins\.setTurn\(rot\.x, rot\.y\)/);
  assert.match(scene, /this\.circuitSkins\?\.sync\(\)/);
  assert.match(text('../scripts/bake-skins.mjs'), /outCircuit/);
  assert.match(text('../.gitignore'), /public\/anatomy\/circuit-skins\.bin/);
  assert.match(text('../src/scene/vessels/skin/baked.ts'), /heldCircuit/);
});
