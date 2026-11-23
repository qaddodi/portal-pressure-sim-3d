// THE LANE STREAKS (Mohammad, 23 Nov: "rebuild the dust/streak and keep options for me to edit under ?dust"): look B of blood/dust-glsl.ts, the new default. These pin what makes it cheap and smooth (a handful of
// candidates a segment instead of the scan's K x (2N + 1)), what keeps it inside its cell, and that the ?dust panel can switch it with the look easing like every other setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUST_GLSL, DUST_MACROS } from '../src/scene/blood/dust-glsl.ts';
import { DUST_KMAX, DUST_LANES_MAX, DUST_LANE_LOOK, DUST_NMAX, DUST_NUMERIC, DUST_PRESETS, DUST_SELECTS, DUST_UNIFORMS, dustDefaults, dustDerive, dustText, parseDust } from '../src/scene/blood/dust-spec.ts';
import { DUST_EASE_MS, DustTuner } from '../src/scene/blood/dust.ts';
import { SEG_MAX, SEG_MIN } from '../src/scene/blood/routes.ts';

const W = { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 };

test('B is the default and A stays one choice away: the look select, the eased weight, the uniforms and the rows the panel shows', () => {
  const d = dustDefaults();
  assert.equal(d.dustLook, 'b');
  const sel = DUST_SELECTS.find((r) => r[0] === 'dustLook')!;
  assert.deepEqual(sel[2].map((o) => o[0]), ['b', 'a']);
  assert.ok(DUST_PRESETS.some(([n, o]) => /lattice scan/i.test(n) && o.dustLook === 'a'), 'a preset puts the old look back');
  for (const k of ['lanes', 'cellLen', 'fill', 'laneJit', 'trains']) assert.ok(DUST_NUMERIC.some((r) => r[0] === k && r[6] === 'Lane streaks'), `${k} is a slider under Lane streaks`);
  for (const k of ['wLookB', 'lanes', 'laneJit', 'cellLen', 'fill', 'trains']) { assert.ok(DUST_UNIFORMS.includes(k as never), k); assert.ok(DUST_MACROS.includes(`#define D_${k} `), k); }
  // the lab's own `look` (its background) is not the app's: a lab paste still applies and leaves the look alone
  assert.equal(parseDust('{"look":"dark","density":1400}').dustLook, 'b');
  assert.equal(parseDust(dustText({ ...d, dustLook: 'a' })).dustLook, 'a', 'Copy settings carries the look and Apply restores it');
  const v = dustDerive({ ...d, lanes: 30, cellLen: 4 } as Record<string, number>, { ...W, lookB: 1 }, [0.6, 0.7, 1], { phone: false, devicePixels: 4.5e6 });
  assert.equal(v.wLookB, 1); assert.equal(v.lanes, 30); assert.equal(v.cellLen, 4);
  assert.equal(dustDerive(d as Record<string, number>, { ...W, lookB: 0 }, [0.6, 0.7, 1], { phone: true, devicePixels: 2e6 }).wLookB, 0);
});

test('switching the look eases: the weight glides, never snaps, and reports motion until it lands', () => {
  const t = new DustTuner(); t.snap();
  const ix = DUST_UNIFORMS.indexOf('wLookB');
  assert.equal(t.uniform.value[ix], 1);
  t.set({ dustLook: 'a' });
  const moving = t.step(DUST_EASE_MS / 2);
  assert.equal(moving, true); const mid = t.uniform.value[ix]!; assert.ok(mid > 0 && mid < 1, `mid-way: ${mid}`);
  let n = 0; while (t.step(100) && n++ < 200);
  assert.equal(t.uniform.value[ix], 0, 'settled on A');
  t.set({ dustLook: 'b' }); n = 0; while (t.step(100) && n++ < 200);
  assert.equal(t.uniform.value[ix], 1, 'and back on B');
});

test('the shader: B finds a streak by its lane and its cell, a handful of candidates, never the scan; the look is a weight, and only the looks that show are drawn', () => {
  const src = DUST_GLSL;
  assert.match(src, /vec4 dustTubeB\(DFrame F, vec3 lit, vec3 ink, float rev\)/); assert.match(src, /vec4 dustSkinB\(DFrame F0, DFrame F1, float w1, vec3 lit, vec3 ink, float rev\)/);
  assert.match(src, /vec4 dustTubeA\(DFrame F/); assert.match(src, /vec4 dustSkinA\(DFrame F0/);
  const b = src.slice(src.indexOf('vec4 dustTubeB('), src.indexOf('vec4 dustTube(DFrame F, vec3 lit'));
  assert.doesNotMatch(b, /for \(int kk|for \(int n = -N|dCell\(|dPart\(/, 'B has no ring loop, no cell scan and none of the lattice\'s particle');
  assert.equal((b.match(new RegExp(`for \\(int q = 0; q < ${DUST_LANE_LOOK}; q\\+\\+\\)`, 'g')) ?? []).length, 2, 'one lane loop in the tube and one in the skin, each bounded');
  assert.ok(DUST_LANE_LOOK <= 12 && DUST_LANE_LOOK * 2 < DUST_KMAX * (2 * DUST_NMAX + 1) * 2, 'the most lanes a pixel looks at a segment is a third of the scan\'s cells');
  assert.match(src, /float cy = \(li \+ 0\.5 \+ \(lj - 0\.5\) \* D_laneJit\) \/ nL \* 2\.0 - 1\.0;/, 'a lane\'s centre across the root\'s section, jittered by hash');
  assert.match(src, /float jj = floor\(\(se - flowFig \* prof \* D_flowK\) \/ Pf \+ ph\);/, 'the cell: the lane\'s own speed (the lab\'s flat profile) carries it along the root\'s stream');
  assert.match(src, /P\.alive = clamp\(\(D_densK \* D_fill - dHash\(sd\)\) \* 12\.0, 0\.0, 1\.0\);/, 'density thins by a threshold: single streaks fade, nothing pops');
  assert.match(src, /cf = 0\.5 \+ \(P\.h1 - 0\.5\) \* 0\.4;/); assert.match(src, /P\.se = \(jj - ph \+ cf\) \* Pf \+ flowFig \* prof \* D_flowK;/, 'the streak is centred in its cell');
  assert.equal((src.match(/M\.len = min\(M\.len, max\(2\.0 \* dCellExt\(F, g, cf\), M\.dia\)\);/g) ?? []).length, 1, 'the tube cuts the length to its cell');
  assert.match(src, /Mb\.len = min\(Mb\.len, max\(2\.0 \* dCellExt\(Fb, gb, cf\), Mb\.dia\)\);/, 'and so does the skin, in both frames');
  assert.match(src, /return min\(cf, 1\.0 - cf\) \* max\(D_cellLen \* g\.rLat \* F\.U, 1e-4\) \/ \(abs\(Bs\) \* max\(F\.vRc, 1e-5\)\);/, 'the room a cell leaves: its length over this vessel\'s speed ratio and lumen');
  assert.match(src, /vec4 a = wB < 0\.999 \? dustTubeA\(F, lit, ink, rev\) : vec4\(0\.0\);\s+vec4 b = wB > 0\.001 \? dustTubeB\(F, lit, ink, rev\) : vec4\(0\.0\);\s+return a \* \(1\.0 - wB\) \+ b \* wB;/);
  assert.match(src, /vec4 a = wB < 0\.999 \? dustSkinA\(F0, F1, w1, lit, ink, rev\) : vec4\(0\.0\);/);
  // the shared parts are shared: the same section frame, strip map, wall rule and tones
  for (const shared of ['dMember(g, P.yl)', 'dPlace(F, g, mb.x, P)', 'dDraw(M, P, t0, t1, t2, t3, ink, rev)']) assert.ok(b.includes(shared), shared);
  assert.ok(DUST_LANES_MAX >= 48 && b.includes(`${DUST_LANES_MAX}.0)`), 'the lane count is bounded');
});

test('the lane table gives up fewer lanes: more segments a vessel and finer slivers (real figure: 3 to 5 vessels of about 50 gave lanes away)', () => {
  assert.ok(SEG_MAX >= 8, `${SEG_MAX}`); assert.ok(SEG_MIN <= 0.006, `${SEG_MIN}`);
});
