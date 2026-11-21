// Collaterals grow by coiling, over a second or so, and a junction skin stands on the end of each (seam ring and all). A skin is meshed on the tubes as drawn, a rebuild costs 0.04 to 2 s of CPU, and one a frame
// while a collateral opened made the whole app lag. The root: the seam moved with the coil. So the stretch of every skinned end that the seam stands on is HELD as at rest (coil.ts pinCourse for the course, tubes.ts `hold`
// for the rings, which are spaced along the arc and would slide as the course lengthens): growth reaches the seam never, and no geometry the skin was built from changes. Tube rebuilds themselves run within a frame budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, seamState, type ShapeState } from '../src/scene/vessels/shape.ts';
import { pinCourse, PIN_MARGIN, type P2 } from '../src/scene/vessels/coil.ts';
import { SHAPE_BUDGET_MS, ShapeTracks } from '../src/scene/vessels/shape-track.ts';
import { armTube } from '../src/scene/vessels/skin/braid-arm.ts';
import { TUBE_RADIAL, buildTubes } from '../src/scene/vessels/tubes.ts';
import type { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';

interface Inside { shapes: ShapeTracks; skins: SkinSet | null }
type Item = { v: { id: string }; shown: number; spread: number; strandsOn: boolean; state: ShapeState };
const GROWN: Partial<ShapeState> = { wig: 6, spr: 1.6, strandsOn: true, bead: 0.3 };

function rig() {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'mesh2' });
  const inside = scene as unknown as Inside;
  return { scene, inside, items: (inside.shapes as unknown as { items: Item[] }).items, done: () => { scene.dispose(); setSmoothJoins(was); } };
}
/** An arm's tube as the skin reads it at `state`: its ring positions. */
function ringsOf(id: string, state: ShapeState): { pos: Float32Array; tubular: number; radius: number } {
  const def = NETWORK_BY_ID.get(id)!, at = armTube(def, state), b = buildTubes(at.courses, at.tubular, def.radius);
  return { pos: b.geometry.getAttribute('position').array as Float32Array, tubular: b.runs[0]!.tubular, radius: def.radius };
}
/** The most a held ring moved between two shapes, in radii: its centre, and its width. (Its vertices may turn round the ring's own axis: the tube's frames are carried along the whole course, so a coil twists the far end's by a few degrees. The ring is the same circle, and it is
 *  the circle the skin's seam stands on.) */
function heldDrift(id: string, pin: readonly [number, number], a: ShapeState, b: ShapeState): number {
  const A = ringsOf(id, a), B = ringsOf(id, b);
  assert.equal(A.tubular, B.tubular, id);
  const per = TUBE_RADIAL + 1;
  const ring = (r: typeof A, k: number) => {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < TUBE_RADIAL; j++) { const i = (k * per + j) * 3; x += r.pos[i]!; y += r.pos[i + 1]!; z += r.pos[i + 2]!; }
    x /= TUBE_RADIAL; y /= TUBE_RADIAL; z /= TUBE_RADIAL;
    let w = 0;
    for (let j = 0; j < TUBE_RADIAL; j++) { const i = (k * per + j) * 3; w += Math.hypot(r.pos[i]! - x, r.pos[i + 1]! - y, r.pos[i + 2]! - z); }
    return { c: [x, y, z], w: w / TUBE_RADIAL };
  };
  let worst = 0;
  for (const end of [0, 1] as const) {
    if (!(pin[end] > 0)) continue;
    for (let k = 0; k <= A.tubular; k++) {
      const u = k / A.tubular;
      if (end === 0 ? u > pin[0] : 1 - u > pin[1]) continue;
      const p = ring(A, k), q = ring(B, k);
      worst = Math.max(worst, Math.hypot(p.c[0]! - q.c[0]!, p.c[1]! - q.c[1]!, p.c[2]! - q.c[2]!) / A.radius, Math.abs(p.w - q.w) / A.radius);
    }
  }
  return worst;
}

test('pinCourse: the held stretch is the rest course exactly, it eases into the live one, and an end with no pin is untouched', () => {
  const rest: P2[] = Array.from({ length: 41 }, (_, i) => [i * 10, 0]);
  const live: P2[] = rest.map((p, i): P2 => [p[0], i % 40 === 0 ? 0 : 25]);
  const out = pinCourse(live, rest, [0.2, 0]);
  for (let i = 0; i <= 8; i++) assert.deepEqual(out[i], rest[i], `point ${i} is held`);
  assert.deepEqual(out[40], live[40]);
  assert.ok(out[11]![1] > 0 && out[11]![1] < 25, 'the ramp is in between');
  assert.equal(out[30]![1], 25, 'past the ramp the live course is whole');
  assert.equal(pinCourse(live, rest, [0, 0]), live);
});

test('the real skins pin the ends they stand on (the collaterals among them), seam ring plus a margin', () => {
  const r = rig();
  try {
    const skins = r.inside.skins!, pins = skins.pins();
    assert.ok(pins.size >= 6, `${pins.size} pinned vessels`);
    for (const id of ['C2', 'C4', 'C5', 'C7']) assert.ok(pins.has(id), `${id} is pinned`);
    for (const [id, p] of pins) for (const e of [0, 1] as const) assert.ok(p[e] === 0 || p[e] > PIN_MARGIN, `${id} end ${e}: ${p[e]}`);
    for (const it of r.items) assert.deepEqual(it.state.pin, pins.get(it.v.id), `${it.v.id}: the tracker holds the skin's pin`);
    assert.ok(r.items.some((it) => it.state.pin), 'some vessel is held');
  } finally { r.done(); }
});

test('the rings of the held stretch are the same vertices at rest and fully grown (coiled, spread, beaded): nothing the skin was built from moves', () => {
  const r = rig();
  try {
    const pins = r.inside.skins!.pins();
    let checked = 0;
    for (const [id, pin] of pins) {
      if (NETWORK_BY_ID.get(id)?.plan?.kind !== 'coil') continue;
      const d = heldDrift(id, pin, { ...REST, pin }, { ...REST, ...GROWN, pin });
      assert.ok(d < 0.01, `${id}: the held rings drifted ${d.toFixed(4)} radii`);
      checked++;
    }
    assert.ok(checked >= 5, `${checked} coiling arms checked`);
    // (the check can fail: without the pin the same rings slide by a fraction of a radius or more)
    const slid = ['C7', 'C3', 'C5', 'C2'].map((id) => heldDrift(id, pins.get(id)!, { ...REST }, { ...REST, ...GROWN }));
    assert.ok(Math.max(...slid) > 0.1, `unpinned, the rings drift ${slid.map((x) => x.toFixed(2)).join(', ')} radii`);
  } finally { r.done(); }
});

test('a collateral growing rebuilds no skin and reports no seam moving, frame after frame; its tubes do follow the coil', () => {
  const r = rig();
  try {
    const skins = r.inside.skins!, shapes = r.inside.shapes, pins = skins.pins();
    const coils = r.items.filter((it) => pins.has(it.v.id) && NETWORK_BY_ID.get(it.v.id)?.plan?.kind === 'coil');
    assert.ok(coils.length >= 5);
    for (const it of r.items) { it.shown = 1; it.spread = 1; it.strandsOn = true; }
    const before = skins.stats.rebuilds;
    const reshaped: string[] = [];
    const was = shapes.onReshaped;
    shapes.onReshaped = (id) => { if (pins.has(id)) reshaped.push(id); was?.(id); };
    let frames = 0;
    for (let f = 0; f < 120; f++) {
      const moving = shapes.step(16);
      skins.step();
      frames++;
      assert.equal(skins.stats.rebuilds, before, `a skin was rebuilt at frame ${f}`);
      if (!moving && f > 3) break;
    }
    assert.ok(frames > 5, 'it took some frames to grow');
    assert.ok(coils.some((it) => it.state.wig > 1), 'the collaterals coiled');
    assert.deepEqual(reshaped, [], 'no vessel a skin stands on was reported as reshaped at its seam');
    assert.equal(skins.pending, false);
  } finally { r.done(); }
});

test('tubes are rebuilt within a frame budget: every collateral opening at once spreads over frames, nothing is left waiting, and the settled shape equals the unbudgeted one', () => {
  const r = rig();
  try {
    for (const it of r.items) { it.shown = 1; it.spread = 1; it.strandsOn = true; }
    let worst = 0;
    for (let f = 0; f < 400; f++) {
      const t = performance.now();
      const moving = r.inside.shapes.step(16);
      worst = Math.max(worst, performance.now() - t);
      if (!moving && f > 5) break;
    }
    assert.ok(worst < SHAPE_BUDGET_MS + 80, `the worst shape step took ${worst.toFixed(1)} ms (the budget is checked after each rebuild)`);
    assert.equal(r.inside.shapes.step(16), false, 'settled: nothing waits');
    const c7 = r.items.find((it) => it.v.id === 'C7')!;
    assert.ok(c7.state.wig > 1);
    const live = (r.scene.vesselObject('C7') as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array } } } }).toonMesh.geometry.getAttribute('position').array;
    const want = buildTubes(armTubeCourses('C7', c7.state), tubularOfId('C7'), NETWORK_BY_ID.get('C7')!.radius).geometry.getAttribute('position').array as Float32Array;
    assert.equal(live.length, want.length);
    for (let i = 0; i < live.length; i += 97) assert.ok(Math.abs(live[i]! - want[i]!) < 1e-5, `vertex value ${i}`);
  } finally { r.done(); }
});

import { coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
const armTubeCourses = (id: string, s: ShapeState) => coursesOf(NETWORK_BY_ID.get(id)!, s);
const tubularOfId = (id: string) => tubularOf(NETWORK_BY_ID.get(id)!, slicesFor(id));

test('a collateral easing open is BLENDED between key frames of its shape, not rebuilt each frame: a handful of builds for a whole growth, the blend itself is checked against a fresh build in the next test', () => {
  const r = rig();
  try {
    const shapes = r.inside.shapes, coils = r.items.filter((it) => NETWORK_BY_ID.get(it.v.id)?.plan?.kind === 'coil');
    for (const it of r.items) { it.shown = 1; it.spread = 1; it.strandsOn = true; }
    const b0 = shapes.stats.builds, w0 = shapes.stats.blends;
    for (let f = 0; f < 120; f++) {
      const moving = shapes.step(16);
      if (!moving && f > 3) break;
    }
    const builds = shapes.stats.builds - b0, blends = shapes.stats.blends - w0;
    assert.ok(blends > builds * 4, `${blends} blends from ${builds} builds`);
    assert.ok(builds <= coils.length * 6, `${builds} builds for ${coils.length} coiling vessels`);
  } finally { r.done(); }
});

test('between two key frames the blend is the shape built afresh to within 0.03 of the vessel\'s radius, for every coiling vessel and every step of the ladder', () => {
  const r = rig();
  try {
    const shapes = r.inside.shapes;
    for (const it of r.items) {
      const v = NETWORK_BY_ID.get(it.v.id)!;
      if (v.plan?.kind !== 'coil') continue;
      for (const w of [0.4, 1.9, 3.1, 4.4]) {
        const st: ShapeState = { ...REST, ...it.state, wig: w, spr: 1, strandsOn: true };
        it.state.wig = w; it.state.spr = 1; it.state.strandsOn = true;
        (shapes as unknown as { rebuild(i: unknown): boolean }).rebuild(it);
        const want = buildTubes(coursesOf(v, st), tubularOf(v, slicesFor(it.v.id)), v.radius).geometry.getAttribute('position').array as Float32Array;
        const got = (r.scene.vesselObject(it.v.id) as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array } } } }).toonMesh.geometry.getAttribute('position').array;
        let worst = 0;
        for (let i = 0; i < want.length; i += 3) worst = Math.max(worst, Math.hypot(got[i]! - want[i]!, got[i + 1]! - want[i + 1]!, got[i + 2]! - want[i + 2]!) / v.radius);
        assert.ok(worst < 0.03, `${it.v.id} at coil ${w}: ${worst.toFixed(4)} radii off`);
      }
    }
  } finally { r.done(); }
});


test('collapse: collaterals closing (coil easing back, strands off, bead and spread gone) rebuild no skin and report no seam moving either', () => {
  const r = rig();
  try {
    const skins = r.inside.skins!, shapes = r.inside.shapes, pins = skins.pins();
    for (const it of r.items) { it.shown = 1; it.spread = 1; it.strandsOn = true; }
    for (let f = 0; f < 200 && shapes.step(16); f++);
    const before = skins.stats.rebuilds, reshaped: string[] = [], was = shapes.onReshaped;
    shapes.onReshaped = (id) => { if (pins.has(id)) reshaped.push(id); was?.(id); };
    for (const it of r.items) { it.shown = 0; it.spread = 1; it.strandsOn = false; (it as unknown as { bead: number }).bead = 0; }
    for (let f = 0; f < 200; f++) { const moving = shapes.step(16); skins.step(); assert.equal(skins.stats.rebuilds, before, `a skin was rebuilt at frame ${f}`); if (!moving) break; }
    assert.deepEqual(reshaped, [], 'no skinned seam moved');
    assert.ok(r.items.filter((it) => it.state.pin).every((it) => it.state.wig === 0), 'the collaterals are straight again');
  } finally { r.done(); }
});

test('bands never reach the seam: the held rings of a banded vessel keep their rest width at 0 to 4 bands (so easing the bands remeshes no junction skin), and past the held stretch the band still thins it', () => {
  const r = rig();
  try {
    const pins = r.inside.skins!.pins();
    let checked = 0;
    for (const id of ['C1a', 'C1b']) {
      const pin = pins.get(id);
      if (!pin) continue;
      for (const bands of [1, 2, 3, 4]) {
        const d = heldDrift(id, pin, { ...REST, pin }, { ...REST, bands, pin });
        assert.ok(d < 0.01, `${id} at ${bands} bands: the held rings changed by ${d.toFixed(4)} radii`);
      }
      checked++;
    }
    assert.ok(checked >= 1, 'a banded vessel is pinned');
    assert.deepEqual(seamState({ ...REST, bands: 3, pin: [0.1, 0.1] }), seamState({ ...REST, bands: 0, pin: [0.1, 0.1] }));
    // (the check can fail: unpinned, bands do thin the same rings)
    assert.ok(heldDrift('C1b', [0.1, 0.1], { ...REST }, { ...REST, bands: 3 }) > 0.1);
  } finally { r.done(); }
});
