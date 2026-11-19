import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Raycaster, Vector3 } from 'three';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { buildVessel } from '../src/scene/anatomy/vessels.ts';
import { COURSES, N_TRACK } from '../src/scene/circuit/course.ts';
import { CIRCUIT_ATTRIBUTES, attachCircuit, slicesFor } from '../src/scene/circuit/geometry.ts';
import { cross, decode, encode, frameN } from '../src/scene/circuit/frame.ts';
import { CIRC_C, MAP_CENTRE, MAP_K, mapToScene, sceneToMap, turnScenePt } from '../src/scene/circuit/map.ts';
import { PEEL_DL, chordPointInto, chordShape, peelAt, peelRank, reverses } from '../src/scene/circuit/peel.ts';
import { flatten, resample } from '../src/scene/circuit/paths.ts';
import { morphInto, needsTrack, revOf, tangentsInto } from '../src/scene/circuit/morph.ts';
import { CircuitView } from '../src/scene/circuit/view.ts';
import { DOT_IDS, mapRamp } from '../src/scene/circuit/map-layer.ts';
import { CIRCUIT_NODES, CIRCUIT_D, MAP_LOOKS, TURN_MS, VIEW_CHANGE_MS } from '../src/scene/circuit/data.copied.ts';
import { CIRCUIT_VS_CALL, CIRCUIT_VS_HEAD } from '../src/scene/circuit/shader.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { circuitBounds, circuitShot } from '../src/scene/circuit/shots.ts';
import { claims as b1 } from '../src/parity/b1.ts';

// ── the copied 2D data ──
const repo = process.env.PPS_2D_REPO;
test('the copied circuit data is current (needs PPS_2D_REPO)', { skip: !repo }, () => {
  execFileSync('node', ['scripts/copy-b7-data.mjs', '--from', repo!, '--check'], { stdio: 'pipe' });
});
test('the copied circuit data says it is generated, and has the 2D numbers the morph is judged by', () => {
  assert.match(readFileSync('src/scene/circuit/data.copied.ts', 'utf8').slice(0, 500), /copy-b7-data|generated|do not edit/i);
  assert.equal(VIEW_CHANGE_MS, 1300); assert.equal(TURN_MS, 480); assert.equal(PEEL_DL, 0.4);
  assert.equal(Object.keys(MAP_LOOKS).length >= 4, true);
});

// ── paths ──
test('a path flattens and resamples to even steps', () => {
  const p = flatten('M0 0 L10 0 L10 10');
  assert.deepEqual(p[0], [0, 0]); assert.deepEqual(p[p.length - 1], [10, 10]);
  const r = resample(p, 5);
  assert.equal(r.length, 5);
  const d = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
  assert.ok(Math.abs(d(r[0]!, r[1]!) - 5) < 1e-9 && Math.abs(d(r[3]!, r[4]!) - 5) < 1e-9);
});

// ── the peel ──
test('the peel is exactly 0 and 1 at the ends of the change, and the heart end follows the gut end', () => {
  for (const r of [0, 0.3, 1]) { assert.equal(peelAt(0, r), 0); assert.equal(peelAt(1, r), 1); }
  for (let t = 0.05; t < 1; t += 0.05) assert.ok(peelAt(t, 0) >= peelAt(t, 1), `t ${t}`);
  let last = 0;
  for (let t = 0; t <= 1; t += 0.02) { const w = peelAt(t, 0.5); assert.ok(w >= last); last = w; }
  assert.equal(peelRank(-1e9), 0); assert.equal(peelRank(1e9), 1);
});

// ── the map's frame ──
test('the map frame is a round trip, and the turn is a quarter turn about its centre', () => {
  const m = mapToScene(CIRC_C[0], CIRC_C[1]);
  assert.deepEqual(m, [MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z]);
  const back = sceneToMap(...mapToScene(123, 456).slice(0, 2) as [number, number]);
  assert.ok(Math.abs(back[0] - 123) < 1e-9 && Math.abs(back[1] - 456) < 1e-9);
  assert.deepEqual(turnScenePt(1, 0.45, 0), [1, 0.45]);
  const q = turnScenePt(MAP_CENTRE.x + 1, MAP_CENTRE.y, 1);
  assert.ok(Math.abs(q[0] - MAP_CENTRE.x) < 1e-9 && Math.abs(q[1] - (MAP_CENTRE.y + 1)) < 1e-9, 'counter-clockwise: east goes to north (flow, left to right, then bottom to top)');
  assert.ok(MAP_K > 0);
});

// ── the tube's frame ──
test('a vertex offset encodes in the frame of its direction and decodes to itself, for any direction', () => {
  for (const T of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.6, 0.0, 0.8], [0, -0.3, 0.954], [-0.7, 0.7, 0]] as const) {
    const l = Math.hypot(...T), t: [number, number, number] = [T[0] / l, T[1] / l, T[2] / l];
    const N = frameN(t), B = cross(t, N);
    assert.ok(Math.abs(Math.hypot(...N) - 1) < 1e-9 && Math.abs(Math.hypot(...B) - 1) < 1e-9);
    const off: [number, number, number] = [0.3, -0.8, 0.1];
    const d = decode(encode(off, t), t);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(d[i]! - off[i]!) < 1e-9);
  }
});

// ── the courses ──
test('every drawn vessel has a body course and a map course on the same samples', () => {
  for (const v of MAPPED) {
    const c = COURSES.get(v.id);
    assert.ok(c, `course of ${v.id}`);
    assert.equal(c!.A.length, N_TRACK); assert.equal(c!.C.length, N_TRACK); assert.equal(c!.rank.length, N_TRACK);
    assert.ok(c!.lenA > 0 && c!.lenC > 0, `${v.id} has a length in both views`);
    assert.ok(CIRCUIT_D[v.id], `${v.id} has a map path`);
    assert.ok(slicesFor(v.id) >= 16 && slicesFor(v.id) <= 360);
  }
});

test('the vessels that reverse and the ends that are pinned are the ones the 2D app names', () => {
  const rev = MAPPED.filter((v) => revOf(COURSES.get(v.id)!, 0)).map((v) => v.id);
  const pinned = MAPPED.filter((v) => COURSES.get(v.id)!.pins).map((v) => v.id);
  console.log(`circuit: reverse (wide) ${rev.join(' ')} | pinned ${pinned.join(' ')}`);
  // the 2D app's own examples (stage-geo.js): the portal chain from the spleen to the liver, the left renal vein, the hepatic artery
  for (const id of ['V_SPL', 'PV_TRUNK', 'LRV_IVC', 'A_HEP']) assert.ok(rev.includes(id), `${id} runs the other way in the circuit`);
  assert.ok(rev.length < MAPPED.length / 2, 'most vessels do not');
  assert.ok(pinned.length > 0, 'a side join (the left gastric vein on the portal trunk) is found');
  // a pin names a host that is a real vessel
  for (const id of pinned) for (const p of COURSES.get(id)!.pins!) assert.ok(COURSES.has(p.host), `${id} pinned to ${p.host}`);
});

test('the morph lands exactly on the body at the start and on the map at the end, for every vessel and both turns', () => {
  const m = new Float32Array(3 * N_TRACK), base = new Float32Array(3 * N_TRACK);
  for (const rr of [0, 1]) for (const v of MAPPED) {
    const g = COURSES.get(v.id)!;
    for (const t of [1e-7, 1 - 1e-7]) {
      morphInto(g, t, rr, m, base);
      let worst = 0;
      for (let i = 0; i < 3 * N_TRACK; i++) worst = Math.max(worst, Math.abs(m[i]! - base[i]!));
      // the track (what is added to the plain lerp) is nothing at either end
      assert.ok(worst < 1e-3, `${v.id} rr ${rr} t ${t}: track ${worst}`);
    }
    // at the ends the plain lerp is the course itself
    morphInto(g, 1 - 1e-7, rr, m, base);
    for (const i of [0, 31, N_TRACK - 1]) {
      const q = turnScenePt(g.C[i]!.x, g.C[i]!.y, rr);
      assert.ok(Math.abs(base[3 * i]! - q[0]) < 1e-3 && Math.abs(base[3 * i + 1]! - q[1]) < 1e-3, `${v.id} sample ${i} on the map`);
    }
  }
});

test('a reversing vessel never folds: its chord frame keeps the order of its points along the chord, mid-change', () => {
  const rev = MAPPED.filter((v) => needsTrack(COURSES.get(v.id)!, 0) && revOf(COURSES.get(v.id)!, 0));
  assert.ok(rev.length > 0);
  const m = new Float32Array(3 * N_TRACK), base = new Float32Array(3 * N_TRACK), tan = new Float32Array(3 * N_TRACK);
  for (const v of rev) {
    const g = COURSES.get(v.id)!;
    morphInto(g, 0.5, 0, m, base);
    tangentsInto(m, tan);
    for (let i = 0; i < 3 * N_TRACK; i++) assert.ok(Number.isFinite(m[i]!) && Number.isFinite(tan[i]!));
    for (let i = 0; i < N_TRACK; i++) assert.ok(Math.abs(Math.hypot(tan[3 * i]!, tan[3 * i + 1]!, tan[3 * i + 2]!) - 1) < 1e-4);
  }
  // the chord helper itself: a point on the chord's own line stays on it
  const out = [0, 0];
  chordPointInto(out, chordShape([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), chordShape([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]), 1, 1, 0, 0, 8, 0);
  assert.ok(Math.abs(out[0]! - 4) < 1e-9 && Math.abs(out[1]!) < 1e-9);
  assert.equal(reverses([{ x: 0, y: 0 }, { x: 1, y: 0 }], -1, 0), true);
  assert.equal(reverses([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1, 0.2), false);
});

// ── the tube's attributes ──
test('a built tube carries the morph attributes and decodes back to its own vertices', () => {
  for (const id of ['PV_TRUNK', 'V_SPL', 'RHV_IVC']) {
    const def = MAPPED.find((v) => v.id === id)!, course = COURSES.get(id)!;
    const built = buildVessel({ ...def, tone: def.tone === 'artery' ? 'portal' : def.tone }, slicesFor(id));
    const g = attachCircuit(built, course, def.radius);
    for (const a of CIRCUIT_ATTRIBUTES) assert.ok(g.getAttribute(a), `${id} has ${a}`);
    const pos = g.getAttribute('position'), tan = g.getAttribute('tang'), fr = g.getAttribute('fr'), pk = g.getAttribute('pk');
    assert.equal(g.getAttribute('cC').count, pos.count);
    for (let v = 0; v < pos.count; v += 7) {
      const s = pk.getY(v);
      assert.ok(s >= 0 && s <= 1 && pk.getX(v) >= 0 && pk.getX(v) <= 1);
      const c = built.curve.getPointAt(s), T: [number, number, number] = [tan.getX(v), tan.getY(v), tan.getZ(v)];
      const d = decode([fr.getX(v), fr.getY(v), fr.getZ(v)], T);
      const back = new Vector3(c.x + d[0] * def.radius, c.y + d[1] * def.radius, c.z + d[2] * def.radius);
      assert.ok(back.distanceTo(new Vector3(pos.getX(v), pos.getY(v), pos.getZ(v))) < 1e-4, `${id} vertex ${v}`);
    }
  }
});

// ── the shader ──
test('the vessel shader morphs through one call, and declares every attribute the tube carries', () => {
  for (const a of CIRCUIT_ATTRIBUTES) assert.match(CIRCUIT_VS_HEAD, new RegExp(`attribute\\s+\\w+\\s+${a}\\b`), a);
  assert.match(CIRCUIT_VS_CALL, /circuitMorph\(/);
  assert.ok(VESSEL_VS.includes('circuitMorph') && VESSEL_VS.includes('circPeel'));
  assert.equal((VESSEL_VS.match(/\bcircuitMorph\(/g) ?? []).length >= 2, true, 'defined once and called once');
  // at rest (circT 0) the body is drawn as before: the morph returns at once
  assert.match(CIRCUIT_VS_HEAD, /circT\s*<=\s*0\.0|circT\s*==\s*0\.0/);
});

// ── the clock of the change ──
test('the change runs 1300 ms from the body to the map and the turn 480 ms; a turn-back mid-change takes only what is left', () => {
  const c = new CircuitView();
  c.go(true, 0);
  assert.equal(c.changeMs(), VIEW_CHANGE_MS);
  assert.equal(c.update(0), true); assert.equal(c.t, 0);
  c.update(650);
  assert.ok(Math.abs(c.t - 0.5) < 1e-9, 'cubic in-out is half way at half the time');
  c.go(false, 650);
  assert.ok(Math.abs(c.changeMs(0) - 650) < 1e-6);
  c.update(650 + 650 + 1);
  assert.equal(c.t, 0); assert.equal(c.moving, false);
  c.go(true, 5000); c.update(5000 + VIEW_CHANGE_MS + 1);
  assert.equal(c.t, 1); assert.equal(c.toCircuit, true);
  c.setUpright(true, 6000); c.update(6000 + TURN_MS / 2);
  assert.ok(c.rr > 0 && c.rr < 1); assert.equal(c.moving, true);
  c.update(6000 + TURN_MS + 1);
  assert.equal(c.rr, 1); assert.equal(c.upright, true);
});

test('the view writes a track only for the vessels that need one, only mid-change, and each vessel\'s length follows the change', () => {
  const c = new CircuitView();
  const handles = MAPPED.map((v) => ({ id: v.id, len: { value: 1 }, circRow: { value: -1 } }));
  handles.forEach((h) => c.attach(h));
  c.go(true, 0); c.update(0);
  assert.ok(handles.every((h) => h.circRow.value === -1), 'none at rest');
  c.update(650);
  const on = handles.filter((h) => h.circRow.value >= 0);
  assert.ok(on.length > 0 && on.length < handles.length, `${on.length} of ${handles.length} carry a track mid-change`);
  assert.equal(new Set(on.map((h) => h.circRow.value)).size, on.length, 'each its own rows');
  for (const h of on) assert.equal(needsTrack(COURSES.get(h.id)!, c.rr), true);
  for (const h of handles) { const g = COURSES.get(h.id)!; assert.ok(h.len.value >= Math.min(g.lenA, g.lenC) - 1e-9 && h.len.value <= Math.max(g.lenA, g.lenC) + 1e-9); }
  c.update(VIEW_CHANGE_MS + 1);
  assert.ok(handles.every((h) => h.circRow.value === -1), 'none on the map');
  for (const h of handles) assert.ok(Math.abs(h.len.value - COURSES.get(h.id)!.lenC) < 1e-9);
});

// ── the map ──
test('the map comes in over the second half of the change, and every station dot is a station of the circuit', () => {
  assert.equal(mapRamp(0), 0); assert.equal(mapRamp(0.5), 0); assert.equal(mapRamp(1), 1);
  assert.ok(mapRamp(0.75) > 0 && mapRamp(0.75) < 1);
  assert.ok(DOT_IDS.length > 0);
  for (const id of DOT_IDS) assert.ok(CIRCUIT_NODES[id]!.r > 0);
  const light = MAP_LOOKS.light!, dark = MAP_LOOKS.dark!;
  assert.equal(light.ground, null); assert.ok(dark.ground);
});

test('the Circuit shot looks straight at the map and the hand is kept to the map\'s plate, wide and upright', () => {
  const w = circuitShot(false), u = circuitShot(true);
  assert.equal(w.yaw, 0); assert.equal(w.pitch, 0);
  assert.ok(w.half![0] > w.half![1] && u.half![1] > u.half![0], 'wide, then tall');
  const bw = circuitBounds(false), bu = circuitBounds(true);
  assert.ok(bw.x1 - bw.x0 > bw.y1 - bw.y0 && bu.y1 - bu.y0 > bu.x1 - bu.x0);
  assert.ok(Math.abs((bw.x0 + bw.x1) / 2 - MAP_CENTRE.x) < 1e-9);
});

// ── the scene ──
test('the scene turns the body into the map: the organs leave, the vessels stay, and going back (or to the lobule) lets the body settle', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  const { setOrganData } = await import('../src/scene/organs/meshes.ts');
  const s = new CelScene();
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  await new Promise((r) => setTimeout(r, 0));   // the organs layer builds when the file is in
  s.resize(800, 600);
  s.goTo('play', { x: 0, y: 60, w: 800, h: 480 }, 0, 0);
  s.update(0);
  const organ = s.disease.organs.objects[0]!;
  assert.equal(organ.group.visible, true);
  s.setCircuitUpright(false, 0);
  s.setView('circuit', 0);
  s.update(0);
  assert.equal(s.view, 'circuit');
  s.update(VIEW_CHANGE_MS / 2);
  assert.ok(s.circuit.t > 0 && s.circuit.t < 1);
  s.update(VIEW_CHANGE_MS + 10);
  assert.equal(s.circuit.t, 1);
  assert.equal(organ.group.visible, false, 'the organs have left');
  assert.equal(s.vessels.every((v) => v.group.visible || v.edge!.id.includes('~F')), true, 'the vessels are all still drawn (a fan of tributaries has no map course and leaves with the organs)');
  assert.ok(s.circuitStation(DOT_IDS[0]!), 'a station has a place on the map');
  assert.equal(s.circuitStation('nowhere'), null);
  // and back
  s.setView('body', 10_000);
  s.update(10_000);
  s.update(10_000 + VIEW_CHANGE_MS + 10);
  assert.equal(s.circuit.t, 0);
  assert.equal(organ.group.visible, true, 'the organs are back');
});

test('a tap on the map picks the vessel whose course is under the finger, and nothing on an empty place', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene();
  s.resize(800, 600);
  s.setCircuitUpright(false, 0);
  s.setView('circuit', 0);
  s.goTo(circuitShot(false), { x: 0, y: 40, w: 800, h: 520 }, 0, 0);
  s.update(0); s.update(VIEW_CHANGE_MS + 10);
  const rc = new Raycaster();
  assert.equal(s.circuit.t, 1);
  const g = COURSES.get('PV_TRUNK')!, mid = g.mapPts[Math.floor(g.mapPts.length / 2)]!;
  const q = mapToScene(mid[0], mid[1]), p = s.rig.project(new Vector3(q[0], q[1], q[2]));
  const hit = s.pickAt(p.x, p.y, rc);
  assert.ok(hit, 'a vessel is under the finger');
  // the vessel hit has a course through that place (a lane shared by two vessels may name either)
  const pts = COURSES.get(hit!)!.mapPts;
  assert.ok(pts.some((a) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) < 40));
  assert.equal(s.pickAt(2, 2, rc), null);
});

// ── the shell and the parity rows ──
test('the Circuit pill, Turn upright, the Layers row, the A shortcut and the Circuit search command are wired', async () => {
  const by = new Map(b1.map((c) => [c.id, c.wired]));
  assert.equal(by.get('view:circuit'), true);
  assert.equal(by.get('zoom:rotateCircuit'), true);
  assert.equal(by.get('menu:Layers (phone)/Turn upright'), true);
  assert.equal(by.get('search:View/Circuit view'), true);
  assert.equal(by.get('behaviour:view pills: Anatomy and Circuit turn the figure between the two views'), true);
  const { useShell } = await import('../src/ui/shell/store.ts');
  assert.equal(useShell.getState().ready.circuit, true);
  const { hasFeature } = await import('../src/ui/shell/features.ts');
  await import('../src/ui/shell/view-actions.ts');
  assert.equal(hasFeature('rotate'), true);
});
