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
import { CIRC_SKIN_REACH, CircuitSkinSet, circuitFallbacks, circuitOldJoins, circuitFarGrowers, circuitRadius, circuitReach, circuitTube, findCircuitJunctions, turnMatrix, type CircuitSkinDeps } from '../src/scene/circuit/skins.ts';
import { MAP_CENTRE, MAP_K, mapToScene, turnScenePt } from '../src/scene/circuit/map.ts';
import { BED_REACH } from '../src/scene/circuit/course.ts';
import { NODE_CIRCUIT } from '../src/scene/circuit/data.copied.ts';
import { closedShapeFolds } from '../src/scene/vessels/skin/mesh.ts';
import { circuitWidthMap } from '../src/scene/circuit/width.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';
import { GROW_REACH, SKIN_REACH } from '../src/scene/vessels/skin/inventory.ts';

const text = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** The junctions the map finds on 20 Nov 2026 (the body's permanent junctions, and every node a collateral or shunt lands on), with their permanent arms and ends; the growing arms are in GROWS. */
const TABLE: Record<string, readonly string[]> = {
  HA: ['A_HEP:1', 'A_HR:0', 'A_HL:0'],
  SMV: ['SMV_CONF:0', 'V_INT_1:1'],
  SV: ['SV_MID:1', 'SV_CONF:0', 'V_IMV:1'],
  SVD: ['V_SPL:1', 'SV_MID:0'],
  CONF: ['PV_TRUNK_1:0', 'SMV_CONF:1', 'SV_CONF:1'],
  PVT_L: ['PV_TRUNK_1:1', 'PV_TRUNK:0', 'LGV_CONF:1'],
  PVH: ['PV_TRUNK:1', 'PVH_R:0', 'PVH_L:0'],
  RPV_T: ['PVH_R_1:1', 'PVH_R_2:0'],
  SIN_R: ['PRE_R:1', 'SIN_RR:0', 'A_HR:1'],
  SIN_L: ['PRE_L:1', 'SIN_LL:0', 'A_HL:1'],
  CV_R: ['SIN_RR:1', 'POST_R_RHV:0', 'POST_R_MHV:0'],
  RHV_T: ['RHV_IVC_1:1', 'RHV_IVC:0'],
  IVCS: ['IVC_IS:1', 'IVCS_RA:0', 'RHV_IVC:1', 'MHV_IVC:1', 'LHV_IVC:1'],
  IVCI: ['IVC_IS_1:0', 'ILI_IVC_1:1', 'LRV_IVC:1'],
  IVC_D: ['IVC_IS_1:1', 'IVC_IS:0'],
  LRV_S: ['V_KID_L:1', 'V_KID_L_1:0'],
  LRV: ['LRV_IVC:0', 'V_KID_L_1:1'],
  EPI: ['EPI_ILI:0', 'EPI_SVC:0'],
  SVC_E: ['SVC_RA_1:1', 'SVC_RA:0', 'EPI_SVC:1'],
  SVC: ['V_UP:1', 'SVC_RA_1:0', 'AZY_SVC:1'],
};
const GROWS: Record<string, readonly string[]> = {
  SMV: ['S_MC:0', 'REX:0'], SVD: ['C6:0', 'S_DSR:0'], CONF: ['S_PC:0'], PVH: ['DIPS:0'], RPV_T: ['TIPS:0'], RHV_T: ['TIPS:1'], IVCI: ['S_PC:1', 'C9:0'], IVC_D: ['DIPS:1'], LRV_S: ['C6:1', 'S_DSR:1'], LRV: ['C5:1'], EPI: ['C3:1'],
};
/** What the build leaves out of a skin: a growing arm one skin cannot take, each with the reason (`set.why`). REX leaves SMV 5 degrees from S_MC, and DIPS lands on the run-on IVC_D beside the cava's skin: their closed shapes fold (mesh.ts closedShapeFolds). S_DSR is welded
 *  at SVD and at LRV_S (the hull refused it: SVD is meshed from the surface, sheet.ts, and its two growers are closed together, mesh.ts). */
const DROPPED = ['IVC_D:DIPS', 'SMV:REX'];
/** The nodes that get a skin: every junction less IVC_D (a run-on pair whose one collateral could not be taken). */
const BUILT = Object.keys(TABLE).filter((n) => n !== 'IVC_D');
const armKeys = (j: { arms: readonly { vesselId: string; end: number; grow?: boolean }[] }): string[] => j.arms.filter((a) => !a.grow).map((a) => `${a.vesselId}:${a.end}`).sort();
const growKeys = (j: { arms: readonly { vesselId: string; end: number; grow?: boolean }[] }): string[] => j.arms.filter((a) => a.grow).map((a) => `${a.vesselId}:${a.end}`).sort();

test('the map finds the body\'s junctions: twenty nodes, their arms, growing arms and ends pinned; the two liver beds are junctions on the map too (the arteriole runs on to the bed\'s station), nothing falls back', () => {
  const js = findCircuitJunctions();
  assert.deepEqual(js.map((j) => j.node).sort(), Object.keys(TABLE).sort());
  for (const j of js) { assert.deepEqual(armKeys(j), [...TABLE[j.node]!].sort(), j.node); assert.deepEqual(growKeys(j), [...(GROWS[j.node] ?? [])].sort(), `${j.node}: growing arms`); }
  assert.deepEqual(circuitFarGrowers(), [], 'every growing arm ends at its station on the map: none is a side-wall landing there');
  // the beds: the 2D art stops the arteriole at the comb beside the lanes (A_HR ends 30 map units off the bed's station), the map carries it on to the station (course.ts BED_REACH) as the body does: SIN_R and SIN_L are junctions on the map
  assert.deepEqual(circuitFallbacks(), [], 'no node of the body\'s inventory is left out of the map\'s');
  assert.equal(CIRC_SKIN_REACH, SKIN_REACH, 'the map keeps the body\'s reach');
});

test('on the map every permanent arm of a node ends exactly on its station (a growing arm within GROW_REACH): no side-wall landing, no art gap to bridge; arms are widest first by their MAP width', () => {
  for (const j of findCircuitJunctions()) {
    circuitReach(j).forEach((r, i) => assert.ok(r < (j.arms[i]!.grow ? GROW_REACH : 1e-3), `${j.node}: ${j.arms[i]!.vesselId} ends ${r} radii from J`));
    const w = j.arms.filter((a) => !a.grow).map((a) => a.restR);
    assert.deepEqual([...w].sort((a, b) => b - a), w, `${j.node}: widest first`);
    for (const a of j.arms) {
      assert.ok(COURSES.has(a.vesselId), `${a.vesselId} has a map course`);
      assert.equal(a.restR, circuitRadius(NETWORK_BY_ID.get(a.vesselId)!), `${a.vesselId}: the radius the rings are built at is the map's`);
      assert.equal(NETWORK_BY_ID.get(a.vesselId)!.circFine ?? 1, 1, `${a.vesselId}: no fine-width artery among the arms (circSwellOf has no such term)`);
      assert.ok(!a.side, 'no side-wall arm on the map');
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

test('a build welds the nineteen skins with no fall back, the two growing arms it cannot take named with their reason: each skin starts on its arms\' own ring vertices, the tubes take their second cut, a clear puts them back', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set, made, ends } = setOf(scene);
    set.build();
    assert.deepEqual([...set.nodes].sort(), [...BUILT].sort());
    assert.deepEqual(set.fellBack, [], 'nothing falls back on the map');
    assert.deepEqual([...set.dropped].sort(), DROPPED, 'the growing arms that keep their lines, named');
    for (const d of DROPPED) assert.match(set.why[d] ?? '', /the closed shape folds/, `${d}: why`);
    assert.equal(set.count, 19);
    assert.ok(made.length >= 19, 'every skin was made once at least (a retry makes more)');
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

test('the beds\' arterioles run on to the bed\'s station on the map (the 2D art stops them at the comb, 30 map units short): SIN_R and SIN_L are welded', () => {
  assert.deepEqual(BED_REACH, { A_HR: 'SIN_R', A_HL: 'SIN_L' });
  for (const [id, node] of Object.entries(BED_REACH)) {
    const e = COURSES.get(id)!.curveC.getPointAt(1), s = mapToScene(NODE_CIRCUIT[node]![0], NODE_CIRCUIT[node]![1]);
    assert.ok(Math.hypot(e.x - s[0], e.y - s[1]) < 1e-9, `${id} ends on ${node}'s station`);
  }
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    for (const n of ['SIN_R', 'SIN_L']) assert.ok(set.nodes.includes(n), `${n} is a skin`);
    assert.ok(!set.fellBack.includes('SIN_R') && !set.fellBack.includes('SIN_L'));
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('S_DSR is welded at both its ends and every skin\'s closed shape is whole: no triangle turned against its normals with the growing arms closed, half grown, three quarters and fully grown; the one skin meshed from the surface is SVD\'s', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    for (const n of set.nodes) { const m = set.skinOf(n)!; assert.equal(closedShapeFolds(m.position, m.normal, m.index, m.grow, m.junction.arms), 0, `${n}: closed shape`); }
    const growers = (n: string) => set.skinOf(n)!.junction.arms.filter((a) => a.grow).map((a) => a.vesselId).sort();
    assert.deepEqual(growers('SVD'), ['C6', 'S_DSR']);
    assert.deepEqual(growers('LRV_S'), ['C6', 'S_DSR']);
    assert.equal(set.skinOf('SVD')!.grow.length, 2, 'both of SVD\'s growing arms morph');
    // (the hull of SVD\'s seam rings refused it with S_DSR: its sheet starts on the surface, the last rung)
    assert.deepEqual(set.nodes.filter((n) => set.skinOf(n)!.junction.surface), ['SVD']);
    for (const d of DROPPED) assert.ok(!set.nodes.some((n) => growers(n).includes(d.split(':')[1]!) && n === d.split(':')[0]), `${d} is not an arm`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('what the map still draws the old way is named: the four liver trees\' 24 branches, the caudate lane, the custom shunts (routed when a learner opens one); none of them is a vessel of the network, so none is an arm of a skin', () => {
  const old = circuitOldJoins();
  assert.deepEqual(old.trees, ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL'].flatMap((l) => [0, 1, 2, 3, 4, 5].map((i) => `${l}#${i}`)));
  assert.deepEqual(old.caudate, ['CAUD']);
  assert.equal(old.custom.length, 119);
  assert.ok(old.custom.every((id) => id.startsWith('X_')));
  for (const id of [...old.trees, ...old.caudate, ...old.custom]) assert.ok(!NETWORK_BY_ID.has(id), `${id} is a map-only tube`);
  const skinned = new Set(findCircuitJunctions().flatMap((j) => j.arms.map((a) => a.vesselId)));
  for (const id of [...old.trees, ...old.caudate, ...old.custom]) assert.ok(!skinned.has(id), `${id} keeps its lines`);
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
    assert.equal(made.skins.length, 19);
    const bin = encodeSkins(made), back = decodeSkins(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)!;
    assert.ok(back && back.digest === made.digest);
    assert.equal(live.set.source, 'live');
    const baked = setOf(scene, () => back); baked.set.build();
    assert.equal(baked.set.source, 'baked', 'the first change to the Circuit meshes nothing on the page (a mesh is a stall; the file is for this figure)');
    assert.deepEqual(baked.set.nodes, live.set.nodes);
    for (const n of baked.set.nodes) assert.ok(back.skins.some((b) => b.mesh === baked.set.skinOf(n)), `${n}: the skin drawn is the baked mesh itself`);
    // a file for another figure is not laid in
    const other = setOf(scene, () => ({ ...back, digest: 'circuit/other' })); other.set.build();
    assert.equal(other.set.source, 'live');
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
  assert.match(SKIN_FS, new RegExp(`smoothstep\\(${SKIN_CIRC_IN.toFixed(4).replace(/0+$/, '')}0*, 1\\.0, circT\\), skinCirc\\)`));
  assert.ok(!/#if(n?def)?\s+SKIN_CIRC\b/.test(SKIN_FS + SKIN_VS), 'the map\'s skins are the body\'s programs: skinCirc is a uniform, not a define (nothing new to compile)');
  assert.match(SKIN_FS, /uniform vec2 skinMap;/);
  assert.match(SKIN_FS, /mix\(1\.0 - smoothstep\(0\.0, [0-9.]+, circT\), smoothstep\(/);
  assert.match(SKIN_VS, /float circSwellOf\(vec4 a\)/);
  assert.match(SKIN_FS, /skinCirc \* circT \* [0-9.]+ \* smoothstep\(-inDepth, 0\.0, sdPx\)/, 'the Circuit\'s inner line');
  const names = rawPrograms('').map((p) => p.name);
  assert.ok(!names.some((n) => /Circuit/.test(n) && /skin/.test(n)), 'no program of its own: the body\'s skin programs are the map\'s');
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
