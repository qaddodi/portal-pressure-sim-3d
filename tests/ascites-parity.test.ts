// Ascites follows the figure (2D parity, package B of the 21 Nov plan: rebuild-3d/ascites-3d-plan.md). Two rules of the 2D app the 3D pool skipped:
//  1. the straw is kept off a congested liver (stage-organs.js liverFluidCut = smooth01(congestion / 0.5); veins-gl.js fluidAt cuts the fluid above the liver's lower edge): without it
//     Budd-Chiari and cardiac congestion with a large volume got "a brown blotch" over the lower lobe;
//  2. the fluid dims with the figure (stage-transitions.js stepFluid: ink x (1 - morph) x the organs' dim): the pool's opacity is the organs' own eased dim, never a value of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AscitesLayer, POOL_FS, POOL_VS } from '../src/scene/disease/ascites.ts';
import { FLUID_COLS, FLUID_R, LIVER_AT, NO_LIVER, liverCut, liverEdgeTable, liverKeep, lowerEdge } from '../src/scene/disease/liver-edge.ts';
import { LiverFollow } from '../src/scene/disease/follow.ts';
import { liverShrink } from '../src/scene/disease/copied/liver-morph.js';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { DiseaseLayer } from '../src/scene/disease/index.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { presetState } from './b4-presets.ts';

const fixture = JSON.parse(readFileSync('tests/fixtures/liver-edge-2d.json', 'utf8')) as { cols: number[]; cases: { c: number; g: number; scale: number; edge: [number, number][] }[] };
type Mat = { uniforms: Record<string, { value: number }> };
const uni = (a: AscitesLayer) => (a.group.children[0] as unknown as { material: Mat }).material.uniforms;
const PX = 1 / 0.8;   // one screen pixel in 2D units at about the figure's size on a laptop (0.8 px per unit)

test('2D parity: the liver table is 2D\'s own, at five or more columns, for every (cirrhosis, congestion) pair the fixture holds', () => {
  assert.equal(FLUID_COLS, 1201); assert.deepEqual([...FLUID_R], [284, 430, 856, 650]);
  for (const k of fixture.cases) {
    const t = liverEdgeTable(k.c, k.g);
    for (const [u, y] of k.edge) assert.ok(Math.abs(t[u!]! - y) < 1e-3, `c ${k.c} g ${k.g} column ${u}: ${t[u!]} vs 2D ${y}`);
    assert.ok(Math.abs(liverShrink(k.c, k.g) - k.scale) < 1e-9);
  }
  assert.ok(fixture.cols.length >= 5);
  const some = liverEdgeTable(0, 0.5);
  assert.ok(some.some((v) => v > 0) && some.some((v) => v === NO_LIVER), 'the liver spans part of the rectangle and the rest has none (nothing cut there)');
  assert.ok(Math.abs(lowerEdge([[300, 500], [320, 520], [340, 500]], new Float32Array(FLUID_COLS))[Math.round((320 - 284) * 1200 / 856)]! - 520) < 1, "the lowest y in the column");
});

test('the liver cut is 2D\'s smooth01(congestion / 0.5): none at 0, whole from 0.5, and above the liver\'s lower edge the pool\'s alpha is 0 while 10 units below it nothing changes', () => {
  assert.equal(liverCut(0), 0); assert.equal(liverCut(0.5), 1); assert.equal(liverCut(1), 1);
  const g = 0.8, table = liverEdgeTable(0, g), scale = liverShrink(0, g), col = Math.round((560 - FLUID_R[0]!) * (FLUID_COLS - 1) / FLUID_R[2]!), edge = table[col]!;
  assert.ok(edge > 0, 'there is liver at x = 560');
  const world = (ly: number) => (ly - LIVER_AT[1]) * scale + LIVER_AT[1];   // the point in the liver's frame, drawn at its scale
  assert.equal(liverKeep(table, 560, world(edge - 4), scale, 1, PX), 0, 'above the edge: no straw');
  assert.equal(liverKeep(table, 560, world(edge + 10), scale, 1, PX), 1, 'ten units below it: unchanged');
  assert.equal(liverKeep(table, 560, world(edge - 40), scale, 0, PX), 1, 'no cut at congestion 0, whatever the point');
  const half = liverKeep(table, 560, world(edge - 40), scale, 0.5, PX);
  assert.ok(Math.abs(half - 0.5) < 1e-9, 'a half cut leaves half');
  // a column with no liver is never cut, and a point clear of the liver is whole
  assert.equal(liverKeep(table, 1100, 700, scale, 1, PX), 1);
});

test('the cut eases: over a 0 to 0.6 ramp of the liver\'s own congestion (LiverFollow, 60 fps) no frame changes the cut by 0.05', () => {
  const f = new LiverFollow(), t = { congestion: 0, cirrhosis: 0, tint: 0 } as never;
  f.follow(t, 0.016, true);
  const goal = { congestion: 0.6, cirrhosis: 0, tint: 0 } as never;
  let prev = liverCut(f.shown.congestion), worst = 0;
  for (let i = 0; i < 200; i++) { f.follow(goal, 1 / 60, false); const c = liverCut(f.shown.congestion); worst = Math.max(worst, Math.abs(c - prev)); prev = c; }
  assert.ok(worst < 0.05, `the cut moves at most ${worst.toFixed(4)} a frame`);
  assert.equal(prev, 1, 'and arrives');
});

test('the pool\'s program carries 2D\'s liver frame map and the cut on the final alpha only; the vertex program writes the 2D position', () => {
  assert.match(POOL_FS, /\(w - vec2\(560\.0, 350\.0\)\) \/ uLiverScale \+ vec2\(560\.0, 350\.0\)/, 'the liver\'s frame, exactly as veins-gl.js fluidAt');
  assert.match(POOL_FS, /texelFetch\(uLiverEdge, ivec2\(l0, 0\), 0\)/);
  assert.match(POOL_FS, /gl_FragColor\.a \*= liverKeep\(vW2d, /);
  assert.match(POOL_VS, /varying vec2 vW2d;/); assert.match(POOL_VS, /vW2d = vec2\(position\.x \* 300\.0 \+ 700\.0, 556\.0 - position\.y \* 300\.0\);/);
});

test('setLiver: congestion 0 leaves the cut off and the table untouched; congestion past 0.5 turns it on, and the table moves with the liver', () => {
  const a = new AscitesLayer(), u = uni(a);
  assert.equal(a.setLiver(0.3, 0), false); assert.equal(u.uLiverCut!.value, 0);
  assert.equal(a.setLiver(0, 0.8), true); assert.equal(u.uLiverCut!.value, 1);
  assert.ok(Math.abs(u.uLiverScale!.value - liverShrink(0, 0.8)) < 1e-12);
  assert.equal(a.setLiver(0, 0.8), false, 'the same liver is not laid again');
  assert.equal(a.setLiver(0, 0.85), true, 'a changed liver writes the table');
  a.dispose();
});

test('Budd-Chiari with a large ascites: no column of the pool has straw over the liver\'s lower lobe', async () => {
  const p = await presetState('budd-chiari'), t = bodyTargets(p.frame, p.params, p.healthyP);
  assert.ok(t.congestion > 0.4 && t.ascites > 0);
  const f = new LiverFollow(); f.follow(t, 0.016, true);
  const { cirrhosis: c, congestion: g } = f.shown, cut = liverCut(g);
  assert.equal(cut, 1, 'the liver is congested enough for the whole cut');
  const table = liverEdgeTable(c, g), scale = liverShrink(c, g);
  let cols = 0;
  for (let i = 0; i < FLUID_COLS; i++) {
    if (table[i]! === NO_LIVER) continue;
    cols++;
    const x = FLUID_R[0]! + (i * FLUID_R[2]!) / (FLUID_COLS - 1), wx = (x - LIVER_AT[0]) * scale + LIVER_AT[0];
    for (const up of [3, 12, 30]) {   // inside the lower lobe: above the edge by 3, 12 and 30 units (in the liver's frame)
      const wy = (table[i]! - up - LIVER_AT[1]) * scale + LIVER_AT[1];
      assert.ok(liverKeep(table, wx, wy, scale, cut, PX) < 1e-9, `column ${i} up ${up}: no straw`);
    }
  }
  assert.ok(cols > 200, `${cols} columns have liver`);
});

test('the pool\'s opacity is poolA x body x the organs\' dim, which it takes from the organs\' own eased value in the same frame, with no timer of its own', async () => {
  const a = new AscitesLayer(), u = uni(a);
  a.set(5000);
  const pool = u.uOpacity!.value;
  assert.ok(pool > 0);
  a.setFade(0.5); assert.ok(Math.abs(u.uOpacity!.value - pool * 0.5) < 1e-12);
  a.setDim(0.6); assert.ok(Math.abs(u.uOpacity!.value - pool * 0.5 * 0.6) < 1e-12, 'poolA x body x dim');
  a.setFade(1); a.setDim(1); assert.ok(Math.abs(u.uOpacity!.value - pool) < 1e-12);
  a.setDim(0); assert.equal((a.group.children[0] as unknown as { visible: boolean }).visible, false, 'a fully dimmed pool is not drawn');
  a.dispose();

  // through the layers: the organs ease their dim (their clock) and the pool is handed that value on the same update; at rest it is the organs' own
  const d = new DiseaseLayer(createShared(), []), p = await presetState('cirr-decomp'), t = bodyTargets(p.frame, p.params, p.healthyP);
  d.feed(p.frame, p.params, p.healthyP, { instant: true, presence: () => 1, recruit: () => 0 }, true);
  let now = 1000; d.update(now);
  const op = () => uni(d.ascites).uOpacity!.value, full = op();
  assert.ok(t.ascites > 0 && full > 0, 'the preset has a pool');
  d.organs.setFigureDim(0.6);
  let prev = d.organs.figureDim, worst = 0;
  for (let i = 0; i < 120; i++) {
    now += 16.7; d.update(now);
    const k = d.organs.figureDim;
    assert.ok(Math.abs(op() - full * k) < 1e-9, 'the pool is the organs\' dim, the same frame');
    worst = Math.max(worst, Math.abs(k - prev)); prev = k;
  }
  assert.ok(Math.abs(prev - 0.6) < 0.01 && worst < 0.05, 'it eased there (the organs\' 0.42 s), no step');
  d.organs.setFigureDim(1);
  for (let i = 0; i < 160; i++) { now += 16.7; d.update(now); }
  assert.ok(Math.abs(op() - full) < 1e-6, 'and back');
  d.dispose();
});
