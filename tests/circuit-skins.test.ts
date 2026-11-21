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
import { TUCKED, TUCK_Z } from '../src/scene/circuit/course.ts';
import { MAP_CENTRE, MAP_K, mapToScene, turnScenePt } from '../src/scene/circuit/map.ts';
import { NODE_CIRCUIT } from '../src/scene/circuit/data.copied.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import { weldOf } from '../src/scene/vessels/skin/plain.ts';
import { armPresenceAt } from '../src/scene/vessels/skin/arm-twins.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import { MAP_DROPPED } from '../src/scene/circuit/map-sewn.ts';
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
/** What the build leaves out of a skin: nothing now. The skins are STATIC full-size shapes (the growing arms whole, the tube's own sunk and flared end is what grows, the weld at growth 0.9 to 1), so REX (5 degrees from S_MC on SMV) and DIPS (at the merged cava node IVCS+IVC_D, six arms) are welded
 *  like the rest: the sheet started on the surface, one fold of the valley between two arms taken out by the loose collapse (mesh.ts). */
const DROPPED: string[] = [];
/** The nodes that get a skin: every junction, the cava's IVCS and its run-on IVC_D as ONE skin (merged: the six arms with DIPS, IVC_IS hidden). */
const BUILT = [...Object.keys(TABLE).filter((n) => n !== 'IVC_D' && n !== 'IVCS'), 'IVCS+IVC_D'];
const armKeys = (j: { arms: readonly { vesselId: string; end: number; grow?: boolean }[] }): string[] => j.arms.filter((a) => !a.grow).map((a) => `${a.vesselId}:${a.end}`).sort();
const growKeys = (j: { arms: readonly { vesselId: string; end: number; grow?: boolean }[] }): string[] => j.arms.filter((a) => a.grow).map((a) => `${a.vesselId}:${a.end}`).sort();

test('the map finds the body\'s junctions: eighteen nodes, their arms, growing arms and ends pinned; the two liver beds are named fallbacks, not hidden (the hepatic arteries stop at the lanes\' tips as 2D draws them)', () => {
  const js = findCircuitJunctions();
  assert.deepEqual(js.map((j) => j.node).sort(), Object.keys(TABLE).sort());
  for (const j of js) { assert.deepEqual(armKeys(j), [...TABLE[j.node]!].sort(), j.node); assert.deepEqual(growKeys(j), [...(GROWS[j.node] ?? [])].sort(), `${j.node}: growing arms`); }
  assert.deepEqual(circuitFarGrowers(), [], 'every growing arm ends at its station on the map: none is a side-wall landing there');
  // the beds: the 2D art stops the arteriole at the comb beside the lanes (A_HR ends 30 map units off the bed's station) and the map draws it so (Mohammad, 21 Nov: "do it like 2D does it"): the bed is not a junction there
  assert.deepEqual(circuitFallbacks().map((f) => f.node).sort(), ['SIN_L', 'SIN_R']);
  assert.ok(circuitFallbacks().every((f) => f.why === 'an arm ends too far from the station'));
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

test('a build welds the seventeen skins with no fall back and no growing arm dropped: each skin starts on its arms\' own ring vertices, the tubes take their second cut, a clear puts them back', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set, made, ends } = setOf(scene);
    set.build();
    assert.deepEqual([...set.nodes].sort(), [...BUILT].sort());
    assert.deepEqual(set.fellBack, [], 'nothing falls back on the map');
    assert.deepEqual([...set.dropped].sort(), DROPPED, 'the growing arms that keep their lines, named');
    assert.deepEqual([...MAP_DROPPED].sort(), DROPPED, 'circuit/map-sewn.ts names exactly the arms the build refuses');
    assert.deepEqual(set.why, {}, 'nothing was refused');
    assert.equal(set.count, 17);
    assert.ok(made.length >= 17, 'every skin was made once at least (a retry makes more)');
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

test('the hepatic arteries stop at the tips of the bed\'s lanes as 2D draws them and never cross a lane (Mohammad, 21 Nov: "do it like 2D does it"): SIN_R and SIN_L are no junction on the map, nothing is orphaned', () => {
  // (the course is the 2D art's own, to its last point: A_HR (786, 333) to (800, 333), A_HL (786, 357) to (800, 357), beside the outermost lane of each bed)
  const end = { A_HR: [800, 333], A_HL: [800, 357] } as const;
  for (const [id, e] of Object.entries(end)) {
    const pts = COURSES.get(id)!.mapPts, last = pts[pts.length - 1]!;
    assert.ok(Math.hypot(last[0] - e[0], last[1] - e[1]) < 1e-6, `${id} ends at the lane's tip ${e}`);
    // the artery stays on its own side of the bed: the right one at or below its lowest lane (y 333), the left one at or above its highest (357); no lane is crossed
    for (const [, y] of pts) assert.ok(id === 'A_HR' ? y >= 333 - 1e-6 : y <= 357 + 1e-6, `${id} stays clear of the bed's lanes (y ${y})`);
    const station = NODE_CIRCUIT[id === 'A_HR' ? 'SIN_R' : 'SIN_L']!;
    assert.ok(Math.hypot(last[0] - station[0], last[1] - station[1]) >= 25, `${id} does not run on to the bed's station`);
  }
  // no blunt end: each artery's last stretch sinks behind the lanes' plane (the shader sorts a tube by its axis), so the lane tip is drawn over its end at every zoom, and its start at HA stays on the plane the HA skin's rings are on
  for (const id of ['A_HR', 'A_HL']) {
    const c = COURSES.get(id)!.curveC, a = c.getPointAt(0), b = c.getPointAt(1);
    assert.ok(TUCKED.has(id) && Math.abs(a.z - MAP_CENTRE.z) < 1e-9, `${id} starts on the plane`);
    assert.ok(b.z <= MAP_CENTRE.z - 0.9 * TUCK_Z, `${id} ends ${TUCK_Z} behind it (${b.z})`);
    for (let u = 0; u <= 1; u += 0.05) assert.ok(c.getPointAt(u).z <= MAP_CENTRE.z + 0.1 * TUCK_Z && c.getPointAt(u).z >= b.z - 0.1 * TUCK_Z, `${id}: the sink eases in`);
  }
  assert.deepEqual([...TUCKED].sort(), ['A_HL', 'A_HR']);
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    for (const n of ['SIN_R', 'SIN_L']) assert.ok(!set.nodes.includes(n), `${n} has no skin`);
    assert.deepEqual(set.fellBack, [], 'a node the map does not find is no fall back of the build');
    assert.deepEqual([...set.dropped].sort(), DROPPED);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('every skin of the map is STATIC (no growth morph), whole in the full shape: no triangle turned against its normals, the plain trunks included; S_DSR, REX and DIPS are welded; the skins meshed from the surface are SMV\'s, LRV_S\'s and the cava\'s', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    const plains = set.nodes.map((n) => set.plainOf(n)).filter((m): m is SkinMesh => !!m);
    for (const n of set.nodes) {
      const m = set.skinOf(n)!;
      assert.equal(foldedTriangles(m.position, m.normal, m.index).length, 0, `${n}: whole`);
    }
    for (const m of plains) assert.equal(foldedTriangles(m.position, m.normal, m.index).length, 0, `${m.junction.node}: whole`);
    const growers = (n: string) => set.skinOf(n)!.junction.arms.filter((a) => a.grow).map((a) => a.vesselId).sort();
    assert.deepEqual(growers('SVD'), ['C6', 'S_DSR']);
    assert.deepEqual(growers('LRV_S'), ['C6', 'S_DSR']);
    assert.deepEqual(growers('SMV'), ['REX', 'S_MC']);
    assert.deepEqual(growers('IVCS+IVC_D'), ['DIPS']);
    assert.equal(set.skinOf('IVCS+IVC_D')!.junction.arms.length, 6, 'the five permanent arms of the merged cava node and DIPS');
    assert.deepEqual(set.nodes.filter((n) => set.skinOf(n)!.junction.surface).sort(), ['IVCS+IVC_D', 'LRV_S', 'SMV']);
    // the plain trunks: the arms that stay, where three or more stay (a run-on pair's tubes carry the weld alone)
    assert.deepEqual(set.nodes.filter((n) => set.plainOf(n)).sort(), ['CONF', 'IVCI', 'IVCS+IVC_D', 'PVH']);
    for (const n of ['CONF', 'IVCI', 'IVCS+IVC_D', 'PVH']) { const p = set.plainOf(n)!; assert.ok(p.junction.arms.every((a) => !a.grow) && p.junction.surface, `${n}: the plain trunk is meshed from the surface`); }
  } finally { scene.dispose(); setSmoothJoins(was); }
});

/** A set of the map's skins whose draws record what the handover writes (the weld of each, the presence of each arm). */
function recorded(scene: CelScene): { set: CircuitSkinSet; draws: Map<string, { weld: [number, number][]; pres: number[][]; plain: boolean }> } {
  const draws = new Map<string, { weld: [number, number][]; pres: number[][]; plain: boolean }>(), parent = new Group();
  const set = new CircuitSkinSet({
    vessel: (id) => scene.vesselObject(id),
    make: (mesh) => { const rec = { weld: [] as [number, number][], pres: [] as number[][], plain: mesh.junction.node.endsWith('~plain') }; draws.set(mesh.junction.node, rec); return { mesh, object: new Group(), setArm() {}, setArc() {}, setPres(i: number, p: number) { (rec.pres[i] ??= []).push(p); }, setWeld(m: number, w: number) { rec.weld.push([m, w]); }, setArmCopy() {}, setTransparent() {}, dispose() {} } as never; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build();
  return { set, draws };
}

test('the weld follows the growing arm\'s own draw-on (the map tube\'s): 0 while it grows (the sunk and flared tube alone, the plain trunk), the welded skin comes in from growth 0.9 to 1 by smoothstep and never jumps; the tubes\' map cut ends take it per end', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set, draws } = recorded(scene);
    const spc = scene.vesselObject('S_PC')!, conf = set.skinOf('CONF')!, ui = conf.junction.arms.findIndex((a) => a.vesselId === 'S_PC'), u = conf.cuts[ui]!.u;
    spc.group.visible = false; set.sync();
    assert.equal(spc.skinWeldC(0), 0, 'S_PC starts at CONF: the tube\'s cut end is drawn whole while it is not there');
    spc.group.visible = true; spc.setReveal(0); set.sync();
    assert.equal(spc.skinWeldC(0), 0);
    let last = 0, biggest = 0, firstOn = -1;
    for (let s = 1; s <= 400; s++) {
      spc.setReveal(s / 400); set.sync();
      const w = spc.skinWeldC(0), g = armPresenceAt(true, s / 400, 1, u);
      assert.ok(Math.abs(w - weldOf(g)) < 1e-12, 'the weld is the smoothstep of the arm\'s presence');
      if (g < 0.9) assert.equal(w, 0, 'under 0.9 the skin is not drawn');
      if (w > 0 && firstOn < 0) firstOn = g;
      assert.ok(w >= last - 1e-12); biggest = Math.max(biggest, w - last); last = w;
    }
    assert.equal(last, 1, 'whole: the welded skin, the tube\'s cut whole');
    assert.ok(biggest < 0.5, `the biggest step of 400 is ${biggest.toFixed(3)}`);
    assert.ok(firstOn >= 0.9, `the skin starts at growth ${firstOn.toFixed(3)}`);
    // the draws: the welded skin keeps the pixels under the weld (mode +1), the plain trunk the rest (mode -1), the permanent arms' own cut ends are untouched where a plain trunk stands in for them
    assert.deepEqual(draws.get('CONF')!.weld.at(-1), [1, 1]);
    assert.deepEqual(draws.get('CONF~plain')!.weld.at(-1), [-1, 1]);
    assert.equal(scene.vesselObject('SMV_CONF')!.skinWeldC(1), 1, 'CONF has a plain trunk: its permanent arms\' cuts stay whole');
    // a run-on pair has no plain trunk: the trunk's own cut ends take the weld too
    assert.equal(set.plainOf('SMV'), undefined);
    const sm = scene.vesselObject('S_MC')!; sm.group.visible = true; sm.setReveal(0); scene.vesselObject('REX')!.group.visible = false; set.sync();
    assert.equal(scene.vesselObject('SMV_CONF')!.skinWeldC(0), 0, 'SMV: the two shunts are not there: the tubes\' cut ends alone');
    assert.equal(scene.vesselObject('V_INT_1')!.skinWeldC(1), 0);
    sm.setReveal(1); scene.vesselObject('REX')!.group.visible = true; scene.vesselObject('REX')!.setReveal(1); set.sync();
    assert.equal(scene.vesselObject('SMV_CONF')!.skinWeldC(0), 1, 'both whole: the skin');
    // a dotted thread (a closed potential collateral) counts 0
    spc.setDotted(true); set.sync();
    assert.equal(spc.skinWeldC(0), 0, 'dotted');
    spc.setDotted(false); set.sync();
    assert.equal(spc.skinWeldC(0), 1);
    // a clear gives the tubes their ends back whole
    set.clear();
    assert.equal(spc.skinWeldC(0), 1); assert.deepEqual(spc.skinCutC(), [...SKIN_CUT_C_NONE]);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('the tube\'s map cut draws a growing arm\'s cut end where the skin is not, by the same screen pattern as the body\'s weld, and the weld is the skin\'s own mode share', () => {
  assert.match(VESSEL_FS, /uniform vec2 skinWeldC;/);
  assert.match(VESSEL_FS, /float skinWeldAtC\(\)/);
  assert.match(VESSEL_FS, /\(keepC <= 0\.0 \|\| cutHC >= keepC\) && \(weldC > 0\.9999 \|\| cutHC < weldC\)/);
  assert.match(SKIN_FS, /skinKW\.y > 0\.0 \? wh >= skinKW\.z : wh < skinKW\.z/, 'the map\'s skins are the body\'s program: the weld pair is one screen pattern');
});

test('a growing arm\'s seam ring is a ring of the SEWN tube: its map end is sunk and flared, so the skin starts on the vertices the live tube has', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  try {
    const { set } = setOf(scene); set.build();
    let n = 0;
    for (const node of set.nodes) set.skinOf(node)!.cuts.forEach((cut, i) => {
      const arm = set.skinOf(node)!.junction.arms[i]!;
      if (!arm.grow) return;
      const t = circuitTube(cut.vesselId), ring = ringOf(t.geometry, cut.ring, t.radius);
      for (let q = 0; q < TUBE_RADIAL; q++) assert.ok(Math.abs(ring.rest[q]! - set.skinOf(node)!.restR[set.skinOf(node)!.seamVerts[i]![q]!]!) < 1e-9, `${node} ${cut.vesselId}: the skin's rest radius at the seam is the sewn tube's own`);
      n++;
    });
    assert.equal(n, 15, 'the fifteen growing arms of the map');
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('what the map still draws the old way is named: the four liver trees\' 24 branches, the caudate lane, the custom shunts (routed when a learner opens one); none of them is a vessel of the network, so none is an arm of a skin', () => {
  const old = circuitOldJoins();
  assert.deepEqual(old.trees, ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL'].flatMap((l) => [0, 1, 2, 3, 4, 5].map((i) => `${l}#${i}`)));
  assert.deepEqual(old.caudate, ['CAUD']);
  for (const k of ['trees', 'caudate', 'custom'] as const) assert.ok(old.why[k].length > 40, `${k}: the reason it is not welded is named`);
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
    assert.equal(made.skins.length, 17);
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
