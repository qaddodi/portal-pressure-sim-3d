// Ascites that looks like fluid (Mohammad, 20 Nov 2026: "ascites can look better. it has those lines on both sides"). The root causes this pins:
//  - the pool ended in a hard cut along the belly wall (two near-straight lines, sharp wedges at the surface): it now fades out over FEATHER units, climbs the wall, and has a pale rim (Living fluid);
//  - the surface had no ripple (2D's is amp 2, the phase running with the model): it runs with the eased flow rate again;
//  - a column outside the cavity was written at y = 0 (the top of the figure), leaving a sliver from there to the first real column: it takes its neighbour's surface now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AscitesLayer, CLIMB, FEATHER, LIVING_TAU, POOL_COLS, POOL_FS, POOL_ROWS, POOL_VS, RIPPLE_DEPTH, RIPPLE_REST, SLOSH_MAX,
  bulgeStep, outlinePolygon, poolLift, sloshStep, wallDistance,
} from '../src/scene/disease/ascites.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { DEFAULTS } from '../src/state/settings.ts';
import { y2d } from '../src/scene/frame2d.ts';

type Geo = { getAttribute(n: string): { array: Float32Array } };
const attrs = (a: AscitesLayer) => { const g = (a.group.children[0] as unknown as { geometry: Geo }).geometry; return { pos: g.getAttribute('position').array, aD: g.getAttribute('aD').array, aW: g.getAttribute('aW').array }; };
const uni = (a: AscitesLayer) => (a.group.children[0] as unknown as { material: { uniforms: Record<string, { value: number }> } }).material.uniforms;

test('Living fluid is a Figure depth switch, on by default', () => {
  assert.equal(DEFAULTS.fluidSurface, true);
});

test('the pool is one program with the wall distance and the depth per vertex, named so a refused shader hides it rather than greys the belly', () => {
  assert.match(POOL_VS, /attribute float aW;/); assert.match(POOL_VS, /attribute float aD;/);
  assert.match(POOL_FS, new RegExp(`smoothstep\\(0\\.0, ${FEATHER}\\.0, vW\\)`), 'the edge fades over FEATHER units');
  assert.doesNotMatch(POOL_FS, /pow\(/, 'pow of a negative base is undefined in GLSL (the rim is exp(-q*q))');
  assert.equal(((new AscitesLayer().group.children[0] as unknown as { material: { name: string } }).material.name), 'pool');
  assert.match(readFileSync('src/debug/shader-guard.ts', 'utf8'), /m\.name === 'pool'/);
});

test('the pool is a wall-hugging mesh: every inside column ends on the wall, none runs up to the top of the figure', () => {
  for (const ml of [800, 2500, 5000, 8500]) {
    const a = new AscitesLayer(); a.set(ml);
    const { pos, aD, aW } = attrs(a), poly = outlinePolygon(ABDOMEN_OUTLINES[bulgeStep(ml)]!);
    let inside = 0;
    for (let c = 0; c < POOL_COLS; c++) {
      const floor = c * POOL_ROWS + POOL_ROWS - 1, y = y2d(pos[floor * 3 + 1]!);
      assert.ok(y >= 440 - 1e-3 && y <= 1075, `${ml} mL, column ${c}: y ${y.toFixed(1)} is inside the cavity (a column outside it once sat at 0, the top of the figure)`);
      if (aD[floor]! > 0) { inside++; assert.ok(aW[floor]! < 1e-3, `${ml} mL, column ${c}: the floor row lies on the wall (${aW[floor]})`); }
    }
    assert.ok(inside > 40, `${ml} mL: ${inside} columns hold water`);
    // the wall distance in the buffer is the distance to the outline
    for (const c of [20, 52, 80]) {
      const v = c * POOL_ROWS + 2;
      if (aD[c * POOL_ROWS + POOL_ROWS - 1]! > 0) assert.ok(Math.abs(aW[v]! - wallDistance(poly, 296 + c * 8, y2d(pos[v * 3 + 1]!))) < 0.1, `${ml} mL, column ${c}: the buffer holds the distance to the outline`);
    }
    a.dispose();
  }
});

test('the soft edge: the surface climbs the wall and rests the ripple against it', () => {
  const poly = outlinePolygon(ABDOMEN_OUTLINES[20]!);
  assert.ok(wallDistance(poly, 336, 460) < 1e-9, 'a point on the outline is at distance 0');
  assert.ok(Math.abs(wallDistance(poly, 346, 460) - 10) < 0.6, 'ten units in from the side wall');
  const at = (aW: number, living = 1, amp = 2) => poolLift({ wx: 500, aW, aD: 0, phase: 0.3, amp, slosh: 0, living });
  assert.ok(Math.abs(at(0, 1, 0) - CLIMB) < 1e-9, 'at the wall the surface stands CLIMB units up it');
  assert.ok(at(0, 1, 0) > at(6, 1, 0) && at(6, 1, 0) > at(30, 1, 0), 'and falls back to the level as it leaves the wall');
  assert.ok(Math.abs(at(30, 1, 0)) < 0.03, 'flat water far from the wall');
  const free = poolLift({ wx: 500, aW: 200, aD: 0, phase: 0.3, amp: 2, slosh: 0, living: 1 });
  const wall = poolLift({ wx: 500, aW: 0, aD: 0, phase: 0.3, amp: 2, slosh: 0, living: 1 });
  assert.ok(Math.abs(wall - CLIMB) < 1e-9 && Math.abs(free) <= 2 + 1e-9, 'the ripple (at most its amplitude) rests to nothing at the wall');
  assert.ok(RIPPLE_REST > 0 && FEATHER > 0);
  assert.equal(poolLift({ wx: 500, aW: 0, aD: RIPPLE_DEPTH, phase: 1, amp: 2, slosh: 3, living: 1 }), 0, 'only the top of the water moves; the deep water and the floor stay');
  assert.ok(poolLift({ wx: 500, aW: 100, aD: 5, phase: 1, amp: 2, slosh: 0, living: 1 }) !== 0);
  // Living fluid off is 2D's pool: the ripple alone, the same at the wall, no climb and no tilt
  const t = (aW: number) => poolLift({ wx: 500, aW, aD: 0, phase: 0.3, amp: 2, slosh: 4, living: 0 });
  assert.equal(t(0), t(100)); assert.ok(Math.abs(t(0)) <= 2);
});

test('the ripple is 2D\'s: two sines, amplitude from the volume', () => {
  const r = (wx: number, phase: number) => poolLift({ wx, aW: 500, aD: 0, phase, amp: 2, slosh: 0, living: 0 });
  assert.ok(Math.abs(r(100, 0) - (Math.sin(100 / 38) * 0.7 + Math.sin(100 / 23) * 0.3) * 2) < 1e-9);
  assert.match(POOL_VS, /sin\(wx \/ 38\.0 \+ uPhase\) \* 0\.7 \+ sin\(wx \/ 23\.0 - uPhase \* 1\.3\) \* 0\.3/);
});

test('the slosh swings with the level and always comes back to calm, never past its limit, never a jump', () => {
  const s = { x: 0, v: 0 }; let peak = 0, first = 0;
  for (let i = 0; i < 90; i++) { sloshStep(s, 220, 1 / 60); if (i === 0) first = Math.abs(s.x); peak = Math.max(peak, Math.abs(s.x)); }
  assert.ok(first < 0.2, `the first frame moves ${first}: it eases in`);
  assert.ok(peak > 1 && peak <= SLOSH_MAX, `fills swing the surface (${peak})`);
  for (let i = 0; i < 60 * 8; i++) sloshStep(s, 0, 1 / 60);
  assert.ok(Math.abs(s.x) < 0.01 && Math.abs(s.v) < 0.01, 'and it settles flat once the level stops');
  // a long frame (a hidden tab) cannot throw it out
  const l = { x: 0, v: 0 }; sloshStep(l, 400, 5); assert.ok(Math.abs(l.x) <= SLOSH_MAX);
});

test('the layer steps on the clock: the ripple runs with the eased flow rate, stills with Pause and Reduce Motion, the switch glides', () => {
  const a = new AscitesLayer(); a.set(5000);
  const u = uni(a);
  assert.equal(u.uPhase!.value, 0);
  assert.equal(a.step(1 / 60, 1), true, 'a rippling pool asks for frames');
  const p1 = u.uPhase!.value; assert.ok(p1 > 0 && u.uAmp!.value > 0);
  a.step(1 / 60, 0.5); const p2 = u.uPhase!.value; assert.ok(p2 - p1 > 0 && p2 - p1 < p1, 'half the flow, half the pace');
  a.step(1 / 60, 0); assert.equal(u.uPhase!.value, p2, 'paused, the phase stands');
  assert.equal(a.step(1 / 60, 0), false, 'and a pool at rest asks for nothing');
  // Reduce Motion: no ripple, no slosh
  const b = new AscitesLayer(); b.still = true; b.set(5000); b.step(1 / 60, 1);
  assert.equal(uni(b).uAmp!.value, 0); assert.equal(uni(b).uPhase!.value, 0);
  // the switch glides, never snaps
  assert.equal(u.uLiving!.value, 1);
  a.setLiving(false); a.step(1 / 60, 0);
  assert.ok(u.uLiving!.value < 1 && u.uLiving!.value > 0.5, 'a frame later it is part-way');
  let n = 0; while (a.step(1 / 60, 0) && n++ < 1000);
  assert.equal(u.uLiving!.value, 0); assert.ok(n * (1 / 60) < 10 * LIVING_TAU + 1);
  a.setLiving(true, true); assert.equal(u.uLiving!.value, 1, 'the first read at boot is instant');
  a.dispose(); b.dispose();
});

test('the slosh is driven by the level moving, and is gone with no pool', () => {
  const a = new AscitesLayer(); const u = uni(a);
  for (let i = 0; i < 40; i++) { a.set(1500 + i * 120); a.step(1 / 60, 0); }
  assert.ok(Math.abs(u.uSlosh!.value) > 0.2, `filling tilts the surface (${u.uSlosh!.value})`);
  for (let i = 0; i < 60 * 10; i++) a.step(1 / 60, 0);
  assert.ok(Math.abs(u.uSlosh!.value) < 0.02, 'and it rests');
  a.dispose();
});
