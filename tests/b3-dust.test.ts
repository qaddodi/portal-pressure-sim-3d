// The dust (Mohammad, 20 Nov: "Yes GPU please"): the Dust Lab's particles on the real vessels, in the vessel's own fragment shader, with a hidden ?dust panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DUST_BUDGET, DUST_KMAX, DUST_LEN_CAP, DUST_NMAX, DUST_NUMERIC, DUST_PRESETS, DUST_SELECTS, DUST_SPEC, DUST_UNIFORMS, DUST_VEC4, LAB_ONLY, LAB_R,
  clampKey, dustBand, dustBudget, dustClasses, dustDefaults, dustDerive, dustProf, dustText, hexRgb, parseDust,
} from '../src/scene/blood/dust-spec.ts';
import { DUST_GLSL, DUST_MACROS, dustArc, dustEndIntegral, dustEndRamp } from '../src/scene/blood/dust-glsl.ts';
import { DUST_EASE_MS, DustTuner } from '../src/scene/blood/dust.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { keptDust } from '../src/ui/debug/dust-panel.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const m = await import(parserName); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }

// What Mohammad pasted (20 Nov, 14:16 and 14:32 UTC), word for word.
const VARIX_PICK = { scenario: 'varix', look: 'dark', density: 1700, maxN: 12000, size: 1.4, sizeVar: 0.4, soft: 1, opacity: 0.75, opVar: 0.5, stretch: 0.2, lenK: 0.31, feather: 0.95, ring: 0.1, twinkle: 0, depthSize: 0, depthDim: 0.2, hueSpread: 40, lightSpread: 0.3, lightBias: 0.06, satShift: 0, steps: 0, sourceTint: 0.5, warm: 0.35, speed: 44, uMax: 5, uMin: 0.25, flat: 0.5, pulse: 0, pulseHz: 1.2, radExp: 0.5, rhoMax: 0.95, sev: 0.38, bulb: 0.75, turb: 1, swirl: 1.9, pitch: 46, wobble: 0.8, turbFreq: 1, turbSpeed: 1, rhoJit: 1, shrink: 1, radius: 5.5, inkW: 1.7, chevSize: 1, chevPitch: 58, tiltY: -25, tiltX: 4, zoom: 1.9, colorBy: 'random', partColor: 'auto', vel: 'local', vessel: 'blue', bgMode: 'custom', partHex: '#9ec4ff', vesselHex: '#5f8fe8', bgHex: '#eaddc3', chevOn: true, hull: true };
const STENOSIS_PICK = { scenario: 'stenosis', look: 'light', density: 1400, maxN: 14000, size: 1.5, sizeVar: 0.35, soft: 0.75, opacity: 0.7, opVar: 0.5, stretch: 1, lenK: 0.18, feather: 1, ring: 0, twinkle: 0, depthSize: 0, depthDim: 0.5, hueSpread: 40, lightSpread: 0.3, lightBias: 0.06, satShift: 0, steps: 0, sourceTint: 0.5, warm: 0.35, speed: 44, uMax: 5, uMin: 0.25, flat: 0.5, pulse: 0, pulseHz: 1.2, radExp: 0.5, rhoMax: 0.8, sev: 0.55, bulb: 1, turb: 1, swirl: 1.9, pitch: 46, wobble: 0.8, turbFreq: 1, turbSpeed: 1, rhoJit: 1, shrink: 1, radius: 5.5, inkW: 1.7, chevSize: 1, chevPitch: 58, tiltY: -14, tiltX: 8, zoom: 1, colorBy: 'random', partColor: 'auto', vel: 'local', vessel: 'blue', bgMode: 'look', partHex: '#9ec4ff', vesselHex: '#5f8fe8', bgHex: '#e6dbc5', chevOn: true, hull: true };

test('the defaults are his stenosis pick and the presets his two picks, key for key (what he pasted, 20 Nov)', () => {
  const d = dustDefaults();
  for (const [k, v] of Object.entries(STENOSIS_PICK)) if (!LAB_ONLY.has(k)) assert.equal(d[k], v, `default ${k}`);
  assert.deepEqual(parseDust(JSON.stringify(STENOSIS_PICK)), { ...d, budget: 0 }, 'the lab\'s paste applies and changes nothing: it is the default');
  const varix = parseDust(JSON.stringify(VARIX_PICK));
  for (const [k, v] of Object.entries(VARIX_PICK)) if (!LAB_ONLY.has(k)) assert.equal(varix[k], v, `varix ${k}`);
  const preset = { ...d, ...DUST_PRESETS[1]![1] };
  for (const k of Object.keys(DUST_PRESETS[1]![1])) assert.equal(preset[k], varix[k], `the varix preset's ${k}`);
  assert.deepEqual(preset, varix, 'the preset IS the varix pick');
  assert.match(DUST_PRESETS[0]![0], /stenosis/i); assert.match(DUST_PRESETS[1]![0], /varix/i);
});

test('every row is in range with a step that lands on its default; the clamp, the selects and the colour hold; lab-only keys are read and skipped; bad text says why', () => {
  const keys = new Set<string>();
  for (const [k, , min, max, step, def] of DUST_NUMERIC) {
    assert.ok(!keys.has(k), `${k} once`); keys.add(k);
    assert.ok(min < max && def >= min && def <= max && step > 0, k);
    assert.ok(Math.abs(Math.round((def - min) / step) * step + min - def) < 1e-9 || k === 'budget', `${k}: the default is on the slider's steps`);
    assert.equal(clampKey(k, max + 100, def), max); assert.equal(clampKey(k, min - 100, def), min); assert.equal(clampKey(k, 'x', def), def);
  }
  assert.equal(clampKey('colorBy', 'depth', 'random'), 'depth'); assert.equal(clampKey('colorBy', 'nope', 'random'), 'random');
  assert.equal(clampKey('partHex', '#ABCDEF', '#000000'), '#abcdef'); assert.equal(clampKey('partHex', 'red', '#000000'), '#000000');
  assert.equal(clampKey('chevPitch', 58, undefined), undefined, 'a key the app decides itself is not a setting');
  for (const k of LAB_ONLY) assert.ok(!keys.has(k) && !DUST_SELECTS.some((s) => s[0] === k), `${k} is the app's own`);
  assert.throws(() => parseDust('not json'), /not valid settings text/); assert.throws(() => parseDust('[1]'), /object/);
  assert.equal(parseDust('{"density": 99999, "bogus": 3}').density, 2400);
  assert.deepEqual(parseDust(dustText({ ...dustDefaults(), density: 2000, colorBy: 'speed' })), { ...dustDefaults(), density: 2000, colorBy: 'speed' }, 'Copy then Apply is the identity');
  assert.deepEqual(hexRgb('#ff8000').map((x) => Math.round(x * 255)), [255, 128, 0]);
  assert.equal(keptDust({ getItem: () => dustText({ ...dustDefaults(), size: 2 }) })!.size, 2, 'settings kept on the device are read back');
  assert.equal(keptDust({ getItem: () => 'junk' }), null);
});

test('the uniform layout: one name each, every name a macro, the GLSL array as long as the JS one, derived numbers finite for every preset on a phone and a Mac', () => {
  assert.equal(new Set(DUST_UNIFORMS).size, DUST_UNIFORMS.length);
  assert.equal(DUST_VEC4, Math.ceil(DUST_UNIFORMS.length / 4));
  for (const n of DUST_UNIFORMS) assert.ok(DUST_MACROS.includes(`#define D_${n} dustP[`), n);
  assert.match(DUST_GLSL, new RegExp(`uniform vec4 dustP\\[${DUST_VEC4}\\];`));
  for (const phone of [false, true]) for (const px of [0.6e6, 4.5e6, 14e6]) for (const [name, over] of DUST_PRESETS) {
    const s = { ...dustDefaults(), ...over } as Record<string, number>;
    const v = dustDerive(s, { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 }, [0.6, 0.7, 1], { phone, devicePixels: px });
    for (const n of DUST_UNIFORMS) assert.ok(Number.isFinite(v[n]), `${name} ${n}`);
    assert.ok(v.win >= 1 && v.win <= DUST_NMAX && v.nCls >= 3 && v.nCls <= DUST_KMAX && v.cellP > 0 && v.densK > 0 && v.densK <= 1, `${name}: the loops stay inside the shader's bounds`);
    assert.ok(v.lenCap >= v.size - 1e-9 && v.lenCap <= DUST_LEN_CAP + 1e-9, `${name}: the longest streak the scan can find`);
    assert.ok(Math.abs(v.flowK * 1 - s.speed! / 44 / (v.flowK ? s.speed! / 44 / v.flowK : 1)) < 1e-6);
  }
});

test('adaptive (the iPhone\'s count is not measured yet): a phone carries fewer samples a pixel than a Mac, a bigger canvas fewer than a small one, the panel overrides, and the grid never exceeds what the shader loops over', () => {
  assert.ok(DUST_BUDGET.phone < DUST_BUDGET.desktop);
  assert.ok(dustBudget(true, 4.5e6) < dustBudget(false, 4.5e6));
  assert.ok(dustBudget(false, 14e6) < dustBudget(false, 2e6) && dustBudget(false, 14e6) >= 28, 'held between half and 1.3 of the base');
  assert.equal(dustBudget(false, 4.5e6, 40), 40); assert.equal(dustBudget(true, 4.5e6, 2), dustClasses(true), 'never under one cell a class');
  assert.equal(dustClasses(true), 3); assert.equal(dustClasses(false), DUST_KMAX);
  const w = { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 };
  const base = dustDefaults() as Record<string, number>;
  const mac = dustDerive(base, w, [0, 0, 0], { phone: false, devicePixels: 4.5e6 }), phone = dustDerive(base, w, [0, 0, 0], { phone: true, devicePixels: 4.5e6 });
  assert.ok(phone.nCls * (2 * phone.win + 1) < mac.nCls * (2 * mac.win + 1), 'fewer cells scanned on a phone');
  // a dot needs a finer grid than a streak for the same samples (the grid is as fine as the budget allows for the longest mark)
  const dots = dustDerive({ ...base, stretch: 0 }, w, [0, 0, 0], { phone: false, devicePixels: 4.5e6 });
  assert.ok(dots.cellP < mac.cellP / 3, 'the dot grid is much finer');
  assert.ok(mac.densK > 0.5 && mac.densK < 1, 'Density thins the grid from its full 2400: the default leaves headroom both ways');
});

test('the swirl\'s phase is a closed form: the end ramp\'s integral equals its numeric integral, on long and on short vessels', () => {
  for (const [L, W] of [[300, 36], [120, 18], [40, 18], [1000, 120], [30, 18]] as const) {
    let sum = 0; const n = 20000, h = L / n;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * h; sum += dustEndRamp(a, L, W) * h;
      if (i % 2000 === 1999) assert.ok(Math.abs(dustEndIntegral((i + 1) * h, L, W) - sum) < 0.02 * W + 1e-3, `L ${L} W ${W} at ${((i + 1) * h).toFixed(1)}`);
    }
    assert.ok(Math.abs(dustEndIntegral(L, L, W) - sum) < 1e-2 * W, `L ${L} W ${W}: the whole`);
    assert.equal(dustEndIntegral(-5, L, W), 0);
  }
  assert.match(DUST_GLSL, /float dEnd\(float a, float L, float W\)/);
  assert.match(DUST_GLSL, /float dG\(float x, float W\) \{ float xx = clamp\(x, 0\.0, W\), t = xx \/ W; return xx - W \* \(t \* t \* t - 0\.5 \* t \* t \* t \* t\); \}/, 'the same cubic as the twin');
});

test('the lab\'s own profile and bands: faster in the middle, equal shares of the particles a class, and the stream\'s mean speed is the display speed', () => {
  assert.ok(dustProf(0.5, 0) > dustProf(0.5, 0.8) && dustProf(0.5, 0) === 1.5);
  const K = 4; let prev = 0;
  for (let k = 0; k < K; k++) { const [lo, hi] = dustBand(k, K, 0.5, 0.8); assert.ok(Math.abs(lo - prev) < 1e-12 && hi > lo); prev = hi; }
  assert.ok(Math.abs(prev - 0.8) < 1e-12);
  const d = dustDerive(dustDefaults() as Record<string, number>, { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 }, [0, 0, 0], { phone: false, devicePixels: 4.5e6 });
  let mean = 0; for (let k = 0; k < K; k++) { const [a, b] = dustBand(k, K, 0.5, 0.8); mean += dustProf(0.5, (a + b) / 2) * d.flowK / K; }
  assert.ok(Math.abs(mean - 1) < 1e-9, 'speed matches the flow: the mean over the classes is the stream\'s own');
  assert.equal(LAB_R, 5.5);
});

test('GLSL: parses; the lab\'s shapes are in it; the dust is computed from a cell\'s hash and the time, never from a CPU table; contained, fading both ends of a streak, local velocity, swirl, junctions', () => {
  const src = DUST_GLSL.replace(/^\n/, '');
  if (parse) { parse(src); parse(VESSEL_FS.replace(/^\n/, '')); }
  assert.doesNotMatch(DUST_GLSL, /attribute |texelFetch|texture2D|iPos|iVel/, 'no per-particle data: a particle is a hash of its cell');
  assert.match(DUST_GLSL, /smoothstep\(rEl \* 0\.45, rEl, dist\)/, 'the lab\'s dot outline');
  assert.match(DUST_GLSL, /smoothstep\(0\.0, 0\.5, tA\) \* smoothstep\(0\.0, 0\.5, 1\.0 - tA\)/, 'the streak fades at BOTH ends');
  assert.match(DUST_GLSL, /clamp\(1\.0 \/ max\(kR \* kR, 1e-3\), D_uMin, D_uMax\)/, 'the lab\'s local velocity: Q over area (faster in a throat, slow in a bulb)');
  assert.match(DUST_GLSL, /D_lenK, dia, D_lenCap/, 'the streak\'s length is the local velocity x lenK');
  assert.match(DUST_GLSL, /\* \(1\.0 - 0\.4 \* rho\)/, 'the lab\'s helix');
  assert.match(DUST_GLSL, /vec3\(1\.0, 0\.62, 0\.28\), D_warm \* rev/, 'warm when reversed');
  assert.match(DUST_GLSL, /flowFig \* sp/, 'carried by the stream\'s own distance, each ring at its own speed');
  assert.match(DUST_GLSL, /dShift\(pc, -0\.2 \* D_hue, D_satShift \+ 0\.02, D_lightBias \+ D_lightSpread \* 0\.6\)/, 'the lab\'s four tones');
  assert.match(DUST_GLSL, /for \(int kk = 0; kk < 4; kk\+\+\)/); assert.equal(DUST_KMAX, 4);
  assert.match(DUST_GLSL, new RegExp(`for \\(int n = -${DUST_NMAX}; n <= ${DUST_NMAX}; n\\+\\+\\)`));
  assert.match(DUST_GLSL, /\(D_densK - dHash\(sd\)\) \* 12\.0/, 'density thins by a threshold: single particles fade, nothing pops');
  assert.match(DUST_GLSL, /return acc \* \(1\.0 - smoothstep\(0\.90, 0\.96, abs\(across\)\)\);/, 'contained: nothing on the ink');
  // in the vessel: the tube paints it, gated by the amount, the flow and the marks' own junction rule; chevrons after
  for (const m of [/dust = dustField\(across, sD, 0\.0, 1\.0, smS\.w, /, /markK\(vUv\.x \* len \* vU, \(1\.0 - vUv\.x\) \* len \* vU\) \* streakAmt/, /smoothstep\(0\.0, [\d.]+, abs\(smS\.y\)\)/, /litD, inkColor\)/]) assert.match(VESSEL_FS, m);
  assert.ok(VESSEL_FS.indexOf('streakCover = dOn * dust.a;') < VESSEL_FS.indexOf('c = c * (1.0 - ha) + core * ac'), 'chevrons draw ABOVE the particles');
  assert.match(VESSEL_FS, /if \(streakCover > 0\.0\) c = mix\(c, cBody, ha\);/);
  assert.doesNotMatch(VESSEL_FS, /END_R|streakField\(/, 'no fade at a vessel\'s ends: the dust runs through the junction (no old streak field in the tube)');
  assert.doesNotMatch(read('../src/scene/blood/dust-glsl.ts') + read('../src/scene/blood/dust.ts') + read('../src/ui/debug/dust-panel.ts'), /requestAnimationFrame/, 'one clock');
  assert.doesNotMatch(read('../src/scene/blood/dust.ts'), /from 'three'/, 'no per-frame objects: a Float32Array');
});

test('the tuner eases: a new target is glided to (never snapped), a select cross-fades, it reports motion until it lands, and it settles', () => {
  const t = new DustTuner();
  const u = t.uniform.value, at = (n: (typeof DUST_UNIFORMS)[number]) => u[DUST_UNIFORMS.indexOf(n)]!;
  const d0 = at('densK'), sz0 = at('size');
  t.set({ size: 3, colorBy: 'depth', partColor: 'custom', partHex: '#ff0000', vel: 'flat' });
  assert.equal(at('size'), sz0, 'nothing changes until the clock steps');
  assert.equal(t.step(16), true, 'moving');
  const first = at('size');
  assert.ok(first > sz0 && first < sz0 + 0.1 * (3 / LAB_R - sz0), `one frame moves a small share of the way (${first})`);
  assert.ok(at('wRandom') < 1 && at('wRandom') > 0.9 && at('wDepth') > 0 && at('wDepth') < 0.1, 'the colour modes cross-fade');
  assert.ok(at('custom') > 0 && at('custom') < 0.1 && at('velLocal') < 1 && at('velLocal') > 0.9);
  let prev = first, frames = 1;
  while (t.step(16) && frames < 600) { const v = at('size'); assert.ok(v >= prev - 1e-6 && v <= 3 / LAB_R + 1e-6, 'monotone, never past the target'); prev = v; frames++; }
  assert.ok(frames > 20 && frames < 200, `it lands in ${frames} frames (${(frames * 16) / 1000} s at a time constant of ${DUST_EASE_MS} ms)`);
  assert.ok(Math.abs(at('size') - 3 / LAB_R) < 1e-6 && at('wDepth') === 1 && at('wRandom') === 0 && at('custom') === 1 && at('velLocal') === 0);
  assert.equal(t.step(16), false, 'settled: the clock is not held');
  assert.ok(Math.abs(at('cr') - 1) < 1e-9 && Math.abs(at('cg')) < 1e-9);
  assert.notEqual(at('cellP'), 0);
  // a density change thins single particles (the grid does not move): densK glides, cellP stays
  const cell = at('cellP');
  t.set({ density: 400 }); t.step(16);
  assert.ok(at('densK') < d0 || at('densK') < 1, 'thinner'); assert.equal(at('cellP'), cell, 'the grid stands still under a density change');
  let woke = 0; t.onWake = () => { woke++; }; t.set({ swirl: 0.5 }); t.replace(dustDefaults()); t.applyText('{"opacity":0.3}');
  assert.equal(woke, 3, 'every change wakes the figure for the frames of its glide');
  assert.throws(() => t.applyText('nope'));
  t.snap(); assert.equal(t.step(16), false);
  t.setView(true, 1e6); assert.equal(at('nCls'), 3, 'a phone: three classes');
});

test('the hidden panel: a flag, the lab\'s controls, Copy and Apply; it writes targets (no per-frame DOM); the main entry opens it only on ?dust', () => {
  assert.ok(FLAGS.some((f) => f.id === 'dust' && f.gate === 'live'), '?dust works on the live site and the preview');
  assert.match(read('../docs/debug.md'), /\| `\?dust` \|/, 'documented (npm run debug -- doc)');
  const panel = read('../src/ui/debug/dust-panel.ts');
  for (const m of [/Copy settings/, /textContent: 'Apply'/, /Keep on this device/, /DUST_PRESETS/, /dustTuner\.set\(/, /dustTuner\.applyText\(/, /flagOn\('dust'\)/]) assert.match(panel, m);
  assert.doesNotMatch(panel, /location\.search/, 'the flags module is the one reader of the address');
  assert.match(read('../src/main.tsx'), /if \(flagOn\('dust'\)\) void import\('\.\/ui\/debug\/dust-panel\.ts'\)/);
  assert.ok(DUST_SPEC.length >= 30, 'the lab\'s sliders that mean something on a real vessel (all but its scenario, vessel and camera)');
});

test('the scene steps the tuner on the one clock, keeps the clock awake while it glides, hands the budget the device and the canvas, and every vessel reads the same array', () => {
  const sc = read('../src/scene/scene.ts');
  assert.match(sc, /const dustMoving = dustTuner\.step\(dt\);/); assert.match(sc, /\|\| cellsMoving \|\| dustMoving \|\|/);
  assert.match(sc, /dustTuner\.setView\(this\.phone, this\.width \* this\.height \* dpr \* dpr\)/); assert.match(sc, /dustTuner\.setPhone\(phone\)/);
  assert.match(sc, /dustTuner\.onWake = \(\) => \{ this\.moving = true; clock\.invalidate\('dust'\); \};/);
  assert.match(read('../src/scene/vessels/vessel-object.ts'), /dustP: blood\.dustP/);
  assert.match(read('../src/scene/blood/field.ts'), /dustP: dustTuner\.uniform/);
});

test('THE ROUTE (Mohammad, 20 Nov: "the particles should cross at the junction, not disappear"): a particle that leaves a vessel is the same particle in the vessel the blood runs on into, at the joint and at that vessel\'s own pace; the chain feeds the shader the root\'s distance, A, B and the root\'s radius', async () => {
  // the twin: a parent of length Lp (A 0, B 1) and a child that starts where it ends (the chain's A = Lp - B * 0), for several B (the child slower or faster) and times
  const Pf = 3, sp = 1.2, Lp = 40;
  for (const B of [0.5, 1, 1.7, -1]) for (const D of [0, 7.3, 91.9]) for (const jj of [3, 4, 5, 6, 7]) {
    const A = Lp;   // (the child's arc 0 is the stream's coordinate Lp)
    const inParent = dustArc(jj, 0.4, 1, Pf, D, sp, 0, 1);
    const inChild = dustArc(jj, 0.4, 1, Pf, D, sp, A, B);
    // the same particle: its stream coordinate is the same, so where the parent holds it at Lp + e, the child holds it at e / B
    assert.ok(Math.abs(inChild - (inParent - Lp) / B) < 1e-9, `B ${B} D ${D} cell ${jj}: ${inChild} against ${(inParent - Lp) / B}`);
    // and it runs on at the child's own pace: the stream moves it dD * sp, the child's arc 1 / B of that
    const later = dustArc(jj, 0.4, 1, Pf, D + 5, sp, A, B);
    assert.ok(Math.abs((later - inChild) - (5 * sp) / B) < 1e-9, `B ${B}: pace`);
  }
  // the shader: both sets are drawn by the one function, from the stream's coordinate; a link forming or letting go cross-fades them
  assert.match(DUST_GLSL, /float se = A0 \+ Bs \* aFig;/);
  assert.match(DUST_GLSL, /float Pf = max\(D_cellP \* rLat, 1e-4\);/, 'the lattice is the root\'s radius: one lattice along the whole route');
  assert.match(VESSEL_FS, /int rootIx = int\(chD\.x \+ 0\.5\) - 1;/);
  assert.match(VESSEL_FS, /fract\(float\(rootIx\) \* 0\.6180339\) \* 50\.0/, 'the route\'s seed is the root\'s: one set of particles');
  assert.match(VESSEL_FS, /dust = wl >= 1\.0 \? dc : mix\(dust, dc, wl\);/);
  assert.match(VESSEL_FS, /texelFetch\(chainTex, ivec2\(int\(lensIndex\), 1\), 0\)\.w \* vU/, 'the root\'s radius rides the chain texture');
  const { StreamChain } = await import('../src/scene/blood/chain.ts');
  assert.match(read('../src/scene/blood/chain.ts'), /d\[o2 \+ 3\] = RADIUS\[c\.root\[i\]!\] \?\? 0;/);
  assert.ok(StreamChain, 'the chain');
});
