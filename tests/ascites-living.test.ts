// Ascites that looks like fluid (Mohammad, 20 Nov 2026: "ascites can look better. it has those lines on both sides"). The root causes this pins:
//  - the pool ended in a hard cut along the belly wall (two near-straight lines, sharp wedges at the surface): it now fades out over FEATHER units and climbs the wall (Living fluid; the pale rim it first had inside the wall was dropped 21 Nov: tests/ascites-basin.test.ts);
//  - the surface had no ripple (2D's is amp 2, the phase running with the model): it runs with the eased flow rate again;
//  - a column outside the cavity was written at y = 0 (the top of the figure), leaving a sliver from there to the first real column: it takes its neighbour's surface now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AscitesLayer, CLIMB_PX, POOL_BASE_GLSL, FEATHER_PX, LIVING_TAU, POOL_COLS, POOL_ROWS, RIPPLE_DEPTH, RIPPLE_PX, RIPPLE_REST_PX, SLOSH_MAX,
  bulgeStep, outlinePolygon, poolLift, rippleBoost, sloshStep, wallDistance,
} from '../src/scene/disease/ascites.ts';
import { HULL_FS, HULL_VS } from '../src/scene/disease/ascites-hull-glsl.ts';
import { polyOf } from '../src/scene/disease/ascites-pool.ts';
import { ABDOMEN_OUTLINES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { DEFAULTS } from '../src/state/settings.ts';
import { x2d, y2d } from '../src/scene/frame2d.ts';

type Geo = { getAttribute(n: string): { array: Float32Array } };
const attrs = (a: AscitesLayer) => { const g = (a.group.children[0] as unknown as { geometry: Geo }).geometry; return { pos: g.getAttribute('position').array, aD: g.getAttribute('aD').array, aW: g.getAttribute('aW').array }; };
const uni = (a: AscitesLayer) => (a.group.children[0] as unknown as { material: { uniforms: Record<string, { value: number }> } }).material.uniforms;

test('Living fluid is a Figure depth switch, on by default', () => {
  assert.equal(DEFAULTS.fluidSurface, true);
});

test('the pool is one program with the wall distance and the depth per vertex, named so a refused shader hides it rather than greys the belly', () => {
  assert.match(HULL_VS, /attribute float aW;/); assert.match(HULL_VS, /attribute float aD;/);
  assert.match(HULL_FS, new RegExp(`smoothstep\\(0\\.0, ${FEATHER_PX}\\.0, wpx\\)`), 'the edge fades over FEATHER_PX screen pixels');
  assert.doesNotMatch(POOL_BASE_GLSL, /pow\(/, 'pow of a negative base is undefined in GLSL (the sheen and the meniscus are exp(-x*x))');
  for (const m of new AscitesLayer().group.children as unknown as { material: { name: string } }[]) assert.match(m.material.name, /^pool-/);
  assert.match(readFileSync('src/debug/shader-guard.ts', 'utf8'), /m\.name\.startsWith\('pool-'\)/);
});

test('the hull hugs the wall: the last row of every column lies on it, none runs up to the top of the figure', () => {
  for (const ml of [800, 2500, 5000, 8500]) {
    const a = new AscitesLayer(); a.set(ml);
    const g = (a.group.children[1] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } }).geometry;
    const pos = g.getAttribute('position').array, aW = g.getAttribute('aW').array, NT = 20, COLS = 97, poly = polyOf(bulgeStep(ml));
    for (let c = 0; c < COLS; c++) {
      const floor = c * NT + NT - 1, y = y2d(pos[floor * 3 + 1]!);
      assert.ok(y >= 440 - 1e-3 && y <= 1075, `${ml} mL, column ${c}: y ${y.toFixed(1)} is inside the cavity`);
      assert.ok(aW[floor]! < 1e-3, `${ml} mL, column ${c}: the floor row lies on the wall (${aW[floor]})`);
    }
    // (the whole outline also holds the dry wall just above the surface, which can stand a unit or two nearer than the wet wall the hull measures: the belly curve of 23 Nov moved that from 1 to 1.6)
    for (const c of [20, 48, 76]) { const v = c * NT + 2; assert.ok(Math.abs(aW[v]! - wallDistance(poly, x2d(pos[v * 3]!), y2d(pos[v * 3 + 1]!))) < 3, `${ml} mL, column ${c}: the buffer holds the distance to the outline`); }
    a.dispose();
  }
});

test('the soft edge: the surface climbs the wall and rests the ripple against it', () => {
  const poly = outlinePolygon(ABDOMEN_OUTLINES[20]!);
  assert.ok(wallDistance(poly, 336, 460) < 1e-9, 'a point on the outline is at distance 0');
  assert.ok(Math.abs(wallDistance(poly, 346, 460) - 10) < 0.6, 'ten units in from the side wall');
  const at = (aW: number, living = 1, amp = 2, pxu = 1) => poolLift({ wx: 500, aW, aD: 0, phase: 0.3, amp, slosh: 0, living, pxu });
  assert.ok(Math.abs(at(0, 1, 0) - CLIMB_PX) < 1e-9, 'at the wall the surface stands CLIMB_PX up it (one px to the unit)');
  assert.ok(at(0, 1, 0) > at(6, 1, 0) && at(6, 1, 0) > at(40, 1, 0), 'and falls back to the level as it leaves the wall');
  assert.ok(Math.abs(at(80, 1, 0)) < 0.02, 'flat water far from the wall');
  const free = poolLift({ wx: 500, aW: 400, aD: 0, phase: 0.3, amp: 2, slosh: 0, living: 1 });
  const wall = poolLift({ wx: 500, aW: 0, aD: 0, phase: 0.3, amp: 2, slosh: 0, living: 1 });
  assert.ok(Math.abs(wall - CLIMB_PX) < 1e-9 && Math.abs(free) <= 2 * rippleBoost(1) + 1e-9, 'the ripple rests to nothing at the wall');
  assert.ok(RIPPLE_REST_PX > 0 && FEATHER_PX > 0);
  assert.equal(poolLift({ wx: 500, aW: 0, aD: RIPPLE_DEPTH, phase: 1, amp: 2, slosh: 3, living: 1 }), 0, 'only the top of the water moves; the deep water and the floor stay');
  assert.ok(poolLift({ wx: 500, aW: 400, aD: 5, phase: 1, amp: 2, slosh: 0, living: 1 }) !== 0);
  // Living fluid off is 2D's pool: the ripple alone, the same at the wall, no climb and no tilt
  const t = (aW: number) => poolLift({ wx: 500, aW, aD: 0, phase: 0.3, amp: 2, slosh: 4, living: 0 });
  assert.equal(t(0), t(100)); assert.ok(Math.abs(t(0)) <= 2);
});

test('the effects are screen pixels: on a phone (0.6 px per 2D unit) the ripple, the climb and the feather are as many pixels as on a big screen (the first pass was a pixel each: "a flat muddy wash")', () => {
  const pxu = 0.6;
  assert.ok(rippleBoost(pxu) > 2.5 && rippleBoost(0.0001) <= 5 && rippleBoost(5) === 1, 'a small figure enlarges the ripple, a big one leaves 2D\'s own');
  const crest = Math.max(...Array.from({ length: 200 }, (_, i) => poolLift({ wx: 100 + i * 5, aW: 900, aD: 0, phase: 0, amp: 2, slosh: 0, living: 1, pxu }))) * pxu;
  assert.ok(crest > RIPPLE_PX * 0.55, `the ripple's crest is ${crest.toFixed(2)} px on a phone`);
  assert.ok(Math.abs(poolLift({ wx: 500, aW: 0, aD: 0, phase: 0, amp: 0, slosh: 0, living: 1, pxu }) * pxu - CLIMB_PX) < 1e-9, 'the climb is CLIMB_PX px');
  const off = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(poolLift({ wx: 100 + i * 5, aW: 900, aD: 0, phase: 0, amp: 2, slosh: 0, living: 0, pxu }))));
  assert.ok(off <= 2 + 1e-9, 'Living fluid off is 2D\'s ripple, whatever the screen');
  assert.match(HULL_VS, /uniform vec2 uRes;/); assert.match(HULL_VS, /projectionMatrix\[1\]\[1\] \* uRes\.y/);
  assert.match(HULL_FS, /varying float vPxu;/);
  assert.doesNotMatch(HULL_FS, /smoothstep\(0\.0, \d+\.0, vW\)/, 'no edge is left in 2D units');
  const a = new AscitesLayer(); const res = { value: { x: 390, y: 844 } } as never; a.bindRes(res);
  assert.equal(uni(a).uRes, res as never, 'the pool reads the scene\'s own canvas size');
  a.dispose();
});

test('the ripple is 2D\'s: two sines, amplitude from the volume', () => {
  const r = (wx: number, phase: number) => poolLift({ wx, aW: 500, aD: 0, phase, amp: 2, slosh: 0, living: 0 });
  assert.ok(Math.abs(r(100, 0) - (Math.sin(100 / 38) * 0.7 + Math.sin(100 / 23) * 0.3) * 2) < 1e-9);
  assert.match(HULL_VS, /sin\(wx \/ 38\.0 \+ uPhase\) \* 0\.7 \+ sin\(wx \/ 23\.0 - uPhase \* 1\.3\) \* 0\.3/);
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
