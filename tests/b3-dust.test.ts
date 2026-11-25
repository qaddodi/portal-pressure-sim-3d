// The dust (Mohammad, 20 Nov: "Yes GPU please"): the Dust Lab's particles on the real vessels, in the vessel's own fragment shader, with a hidden ?dust panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DUST_BUDGET, DUST_KMAX, DUST_LEN_CAP, DUST_NMAX, DUST_NUMERIC, DUST_PRESETS, DUST_SELECTS, DUST_SPEC, DUST_UNIFORMS, DUST_VEC4, LAB_ONLY, LAB_R,
  clampKey, dustBand, dustBudget, dustClasses, dustDefaults, dustDerive, dustProf, dustText, hexRgb, parseDust,
} from '../src/scene/blood/dust-spec.ts';
import { DUST_GLSL, DUST_MACROS, dustArc, dustFrameJs, dustStrip, dustTwist } from '../src/scene/blood/dust-glsl.ts';
import { DUST_EASE_MS, DustTuner } from '../src/scene/blood/dust.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { keptDust } from '../src/ui/debug/dust-panel.ts';
import { sceneSource } from './helpers/scene-source.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const m = await import(parserName); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }

// What Mohammad pasted (20 Nov, 14:16 and 14:32 UTC), word for word.
const VARIX_PICK = { scenario: 'varix', look: 'dark', density: 1700, maxN: 12000, size: 1.4, sizeVar: 0.4, soft: 1, opacity: 0.75, opVar: 0.5, stretch: 0.2, lenK: 0.31, feather: 0.95, ring: 0.1, twinkle: 0, depthSize: 0, depthDim: 0.2, hueSpread: 40, lightSpread: 0.3, lightBias: 0.06, satShift: 0, steps: 0, sourceTint: 0.5, warm: 0.35, speed: 44, uMax: 5, uMin: 0.25, flat: 0.5, pulse: 0, pulseHz: 1.2, radExp: 0.5, rhoMax: 0.95, sev: 0.38, bulb: 0.75, turb: 1, swirl: 1.9, pitch: 46, wobble: 0.8, turbFreq: 1, turbSpeed: 1, rhoJit: 1, shrink: 1, radius: 5.5, inkW: 1.7, chevSize: 1, chevPitch: 58, tiltY: -25, tiltX: 4, zoom: 1.9, colorBy: 'random', partColor: 'auto', vel: 'local', vessel: 'blue', bgMode: 'custom', partHex: '#9ec4ff', vesselHex: '#5f8fe8', bgHex: '#eaddc3', chevOn: true, hull: true };
const STENOSIS_PICK = { scenario: 'stenosis', look: 'light', density: 1400, maxN: 14000, size: 1.5, sizeVar: 0.35, soft: 0.75, opacity: 0.7, opVar: 0.5, stretch: 1, lenK: 0.18, feather: 1, ring: 0, twinkle: 0, depthSize: 0, depthDim: 0.5, hueSpread: 40, lightSpread: 0.3, lightBias: 0.06, satShift: 0, steps: 0, sourceTint: 0.5, warm: 0.35, speed: 44, uMax: 5, uMin: 0.25, flat: 0.5, pulse: 0, pulseHz: 1.2, radExp: 0.5, rhoMax: 0.8, sev: 0.55, bulb: 1, turb: 1, swirl: 1.9, pitch: 46, wobble: 0.8, turbFreq: 1, turbSpeed: 1, rhoJit: 1, shrink: 1, radius: 5.5, inkW: 1.7, chevSize: 1, chevPitch: 58, tiltY: -14, tiltX: 8, zoom: 1, colorBy: 'random', partColor: 'auto', vel: 'local', vessel: 'blue', bgMode: 'look', partHex: '#9ec4ff', vesselHex: '#5f8fe8', bgHex: '#e6dbc5', chevOn: true, hull: true };

// What Mohammad pasted on 23 Nov (the message that made look A the default again), key for key: the shipped defaults.
const LATEST_PICK = { density: 750, size: 1, sizeVar: 0.35, soft: 0, opacity: 0.75, opVar: 0, stretch: 1, lenK: 0.5, feather: 0.5, ring: 0, twinkle: 0, depthSize: 0, depthDim: 0.5, hueSpread: 22, lightSpread: 0.5, lightBias: 0.05, satShift: 0, steps: 0, warm: 0.5, speed: 44, uMax: 5, uMin: 0.3, flat: 0.5, radExp: 0.5, rhoMax: 0.8, lanes: 8, cellLen: 3.2, fill: 0.8, trains: 2, laneJit: 0.4, turb: 1, swirl: 2, pitch: 60, wobble: 0.8, turbFreq: 1, turbSpeed: 1, rhoJit: 1, shrink: 0.7, budget: 0 };

test('the defaults are his latest pick, key for key, and the presets keep his two earlier picks (what he pasted, 20 Nov)', () => {
  const d = dustDefaults();
  for (const [k, v] of Object.entries(LATEST_PICK)) assert.equal(d[k], v, `default ${k}`);
  assert.deepEqual(parseDust(JSON.stringify(LATEST_PICK)), d, 'the paste applies and changes nothing: it is the default');
  assert.deepEqual(DUST_PRESETS[0]![1], {}, 'the first preset is the default');
  for (const [i, pick] of [[1, STENOSIS_PICK], [2, VARIX_PICK]] as const) {
    const pasted = parseDust(JSON.stringify(pick));
    for (const [k, v] of Object.entries(pick)) if (!LAB_ONLY.has(k)) assert.equal(pasted[k], v, `pick ${i} ${k}`);
    const preset = { ...d, ...DUST_PRESETS[i]![1] };
    for (const k of Object.keys(pick)) if (!LAB_ONLY.has(k) && k !== 'maxN') assert.equal(preset[k], pasted[k], `preset ${i}'s ${k}`);
  }
  assert.match(DUST_PRESETS[0]![0], /default/i); assert.match(DUST_PRESETS[1]![0], /stenosis/i); assert.match(DUST_PRESETS[2]![0], /varix/i);
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
  assert.ok(dustBudget(false, 14e6) < dustBudget(false, 2e6) && dustBudget(false, 14e6) >= 14, 'held between half and 1.3 of the base');
  assert.equal(dustBudget(false, 4.5e6, 40), 40); assert.equal(dustBudget(true, 4.5e6, 2), dustClasses(true), 'never under one cell a class');
  assert.equal(dustClasses(true), 3); assert.equal(dustClasses(false), DUST_KMAX);
  const w = { random: 1, speed: 0, depth: 0, radius: 0, source: 0, custom: 0, local: 1 };
  const base = dustDefaults() as Record<string, number>;
  const mac = dustDerive(base, w, [0, 0, 0], { phone: false, devicePixels: 4.5e6 }), phone = dustDerive(base, w, [0, 0, 0], { phone: true, devicePixels: 4.5e6 });
  assert.ok(phone.nCls * (2 * phone.win + 1) < mac.nCls * (2 * mac.win + 1), 'fewer cells scanned on a phone');
  // a dot needs a finer grid than a streak for the same samples (the grid is as fine as the budget allows for the longest mark)
  const dots = dustDerive({ ...base, stretch: 0 }, w, [0, 0, 0], { phone: false, devicePixels: 4.5e6 });
  assert.ok(dots.cellP < mac.cellP / 3, 'the dot grid is much finer');
  assert.ok(mac.densK > 0.25 && mac.densK <= 1, 'Density thins the grid from its full 2400: his 23 Nov pick (750) keeps about a third of it');
});

test('the swirl (real flow, Mohammad 20 Nov): a whole number of turns over a vessel, so at both ends every particle is back on its lane (a joint can never move it across a branch\'s dividing line), at rest there, its rate the angle\'s own slope', () => {
  for (const [L, n] of [[300, 3], [120, 1], [40, 2], [1000, 8]] as const) {
    const [a0, r0] = dustTwist(0, L, n), [a1, r1] = dustTwist(L, L, n);
    assert.equal(a0, 0); assert.ok(Math.abs(a1 - 2 * Math.PI * n) < 1e-9 && Math.abs(Math.sin(a1)) < 1e-9 && Math.abs(Math.cos(a1) - 1) < 1e-9, `L ${L}: whole turns`);
    assert.equal(r0, 0); assert.ok(Math.abs(r1) < 1e-12, 'no twist rate at an end: the marks are not tilted at a joint');
    const h = L / 4000; let sum = 0;
    for (let i = 0; i < 4000; i++) sum += dustTwist((i + 0.5) * h, L, n)[1] * h;
    assert.ok(Math.abs(sum - a1) < 1e-4 * a1, 'the rate is the slope of the angle');
  }
  assert.match(DUST_GLSL, /return vec2\(6\.2831853 \* turns \* u \* u \* \(3\.0 - 2\.0 \* u\), 6\.2831853 \* turns \* 6\.0 \* u \* \(1\.0 - u\) \/ max\(Lw, 1e-3\)\);/, 'the same curve as the twin');
  assert.match(DUST_GLSL, /float T = clamp\(D_turb \* TcRaw, 0\.0, 1\.3\) \* smoothstep\(0\.0, 0\.5 \* Wd, d\);/, 'the wobble (it moves with time) is held to nothing at the ends');
  // the strip: the root's lane on the wall stays on the wall, a lane carried whole is the identity, and the depth never leaves the section
  for (const [yr, zr] of [[0.3, 0.5], [-0.7, 0.1], [0, -0.79]] as const) {
    const [y, z] = dustStrip(yr, zr, yr / 0.8, 0.8); assert.ok(Math.abs(y - yr) < 1e-9 && Math.abs(z - zr) < 1e-9, 'one to one');
    for (const yc of [-0.9, 0, 0.6]) { const [y2, z2] = dustStrip(yr, zr, yc, 0.8); assert.ok(y2 * y2 + z2 * z2 <= 0.8 * 0.8 + 1e-9, 'inside the section'); }
  }
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
  assert.doesNotMatch(DUST_GLSL, /attribute |texture2D|iPos|iVel/, 'no per-particle data: a particle is a hash of its cell');
  for (const m of DUST_GLSL.matchAll(/texelFetch\((\w+)/g)) assert.ok(m[1] === 'routeTex' || m[1] === 'streamTex', `only the route table and the streams are read, never a particle: ${m[1]}`);
  assert.match(DUST_GLSL, /smoothstep\(rEl \* 0\.45, rEl, dist\)/, 'the lab\'s dot outline');
  assert.match(DUST_GLSL, /smoothstep\(0\.0, 0\.5, tA\) \* smoothstep\(0\.0, 0\.5, 1\.0 - tA\)/, 'the streak fades at BOTH ends');
  assert.match(DUST_GLSL, /clamp\(1\.0 \/ max\(kR \* kR, 1e-3\), D_uMin, D_uMax\)/, 'the lab\'s local velocity: Q over area (faster in a throat, slow in a bulb)');
  assert.match(DUST_GLSL, /D_speed \* M\.spd \* D_lenK, M\.dia, D_lenCap/, 'the streak\'s length is the local velocity x lenK');
  assert.match(DUST_GLSL, /float th = th0 - tw\.x \+ wob;/, 'the lab\'s helix, as whole turns over the vessel (dTwist)');
  assert.match(DUST_GLSL, /vec3\(1\.0, 0\.62, 0\.28\), D_warm \* rev/, 'warm when reversed');
  assert.match(DUST_GLSL, /flowFig \* P\.prof \* D_flowK/, 'carried by the stream\'s own distance, each ring at its own speed');
  assert.match(DUST_GLSL, /dShift\(pc, -0\.2 \* D_hue, D_satShift \+ 0\.02, D_lightBias \+ D_lightSpread \* 0\.6\)/, 'the lab\'s four tones');
  assert.match(DUST_GLSL, /for \(int kk = 0; kk < K; kk\+\+\)/); assert.equal(DUST_KMAX, 4);
  assert.match(DUST_GLSL, /for \(int n = -N; n <= N; n\+\+\)/);
  assert.match(DUST_GLSL, new RegExp(`int K = min\\(int\\(D_nCls \\+ 0\\.5\\), ${DUST_KMAX}\\), N = min\\(int\\(D_win \\+ 0\\.5\\), ${DUST_NMAX}\\);`), 'the loops stay inside their bounds');
  assert.match(DUST_GLSL, /\(D_densK - dHash\(sd\)\) \* 12\.0/, 'density thins by a threshold: single particles fade, nothing pops');
  assert.match(DUST_GLSL, /return clamp\(dSafe\(acc\), 0\.0, 1\.0\) \* keepT \* dWall\(F\.across\);/, 'contained: nothing on the ink (the wall rule, dWall, written once: the skin gates by it too)');
  assert.match(DUST_GLSL, /float dWall\(float e\) \{ return 1\.0 - smoothstep\(0\.9, 0\.96, abs\(e\)\); \}/);
  // in the vessel: the tube paints it, gated by the amount, the flow and the marks' own junction rule; chevrons after
  for (const m of [/vec4 dust = dustTube\(F, lit, inkColor, rev\);/, /return streakAmt \* smoothstep/, /smoothstep\(0\.0, [\d.]+, abs\(smS\.y\)\)/, /\* markK\(skinCut\.x >= 0\.0 \? 1e6 : sD, skinCut\.y <= 1\.0 \? 1e6 : \(1\.0 - vUv\.x\) \* len \* vU\)/]) assert.match(VESSEL_FS, m);
  assert.ok(VESSEL_FS.indexOf('streakCover = fd.a;') < VESSEL_FS.indexOf('c = c * (1.0 - hd.a) + hd.rgb;'), 'chevrons draw ABOVE the particles');
  assert.match(VESSEL_FS, /if \(streakCover > 0\.0\) c = mix\(c, cBody, hd\.a\);/);
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
  assert.ok(FLAGS.some((f) => f.id === 'dust' && f.gate === 'local'), '?dust works on the preview and a local run, not the live site (tests/live-no-debug.test.ts)');
  assert.match(read('../docs/debug.md'), /\| `\?dust` \|/, 'documented (npm run debug -- doc)');
  const panel = read('../src/ui/debug/dust-panel.ts');
  for (const m of [/Copy settings/, /textContent: 'Apply'/, /Keep on this device/, /DUST_PRESETS/, /dustTuner\.set\(/, /dustTuner\.applyText\(/, /flagOn\('dust'\)/]) assert.match(panel, m);
  assert.doesNotMatch(panel, /location\.search/, 'the flags module is the one reader of the address');
  assert.match(read('../src/main.tsx'), /if \(DEBUG && flagOn\('dust'\)\) void import\('\.\/ui\/debug\/dust-panel\.ts'\)/);
  assert.ok(DUST_SPEC.length >= 30, 'the lab\'s sliders that mean something on a real vessel (all but its scenario, vessel and camera)');
});

test('the scene steps the tuner on the one clock, keeps the clock awake while it glides, hands the budget the device and the canvas, and every vessel reads the same array', () => {
  const sc = sceneSource();
  assert.match(sc, /\{ id: 'lens\+dust', step: \(\{ now, dt \}\) => anyMoving\(this\.lens\.step\(now\), this\.twin \? false : dustTuner\.step\(dt\)\) \}/);   // (the tuner is stepped by a named system of the frame, whose answer the runner ORs into "needs another frame")
  assert.match(sc, /dustTuner\.setView\(this\.phone, this\.width \* this\.height \* dpr \* dpr\)/); assert.match(sc, /dustTuner\.setPhone\(phone\)/);   // (a twin figure leaves the page's tuner alone: `if \(!this\.twin\)`)
  assert.match(sc, /dustTuner\.onWake = \(\) => \{ this\.moving = true; clock\.invalidate\('dust'\); \}; dustTuner\.setPhone\(this\.phone\); \}/);
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
  // the shader: every lane segment of the route table (blood/routes.ts) draws its root's particles from the root's stream coordinate; a layout changing cross-fades the two tables
  assert.match(DUST_GLSL, /float se = g\.A \+ Bs \* F\.a;/);
  assert.match(DUST_GLSL, /float Pf = max\(D_cellP \* g\.rLat \* F\.U, 1e-4\)/, 'the lattice is the root\'s radius: one lattice along the whole route');
  assert.match(DUST_GLSL, /fract\(root \* 0\.6180339\) \* 50\.0/, 'the route\'s seed is the root\'s: one set of particles');
  assert.match(DUST_GLSL, /float wSet = set == 0 \? hd\.y : 1\.0 - hd\.y;/, 'the old layout fades out as the new one fades in');
  assert.match(read('../src/scene/blood/routes.ts'), /d\[o \+ 3\] = radius\(g\.root\);/, 'the root\'s radius rides the route table');
});

test('the Blood menu has the streaks switch under Moving blood, in the chevrons\' own row, on the one setting (Mohammad, 20 Nov), and the dust eases in and out', async () => {
  const { STREAKS_ROW, DEPTH_ROWS } = await import('../src/ui/settings/depth-rows.ts');
  const menu = read('../src/ui/shell/FigureMenu.tsx');
  assert.equal(STREAKS_ROW.key, 'particles');
  assert.equal(STREAKS_ROW.label, 'Blood streaks');
  assert.ok(STREAKS_ROW.hint.length > 10 && STREAKS_ROW.hint.length < 48, 'one short caption');
  assert.ok(DEPTH_ROWS.some((r) => r.key === STREAKS_ROW.key), 'Settings keeps its row: the same setting, so the two agree');
  assert.match(menu, /kind === 'blood' && sec === 'Moving blood' && <><StreaksSwitch \/><KeyStreaksSwitch \/><\/>/, 'under the chevrons, in Moving blood, with Key streaks only under it');
  assert.match(menu, /role="switch" className="sh-row" aria-checked=\{on\} onClick=\{\(\) => useSettings\.getState\(\)\.set\(STREAKS_ROW\.key, !on\)\}/, 'the chevrons\' row: icon, title, switch, caption');
  assert.match(menu, /<Icon n=\{STREAKS_ROW\.icon\} \/><span className="sh-t">\{STREAKS_ROW\.label\}<\/span><span className="sh-sw" aria-hidden="true" \/><span className="sh-d">/);
  assert.match(read('../src/ui/shell/icons.tsx'), /\bdust: 'M/, 'the icon exists');
  assert.match(read('../src/scene/blood/cells/cells.ts'), /this\.amount = easeAmount\(this\.amount, goal, dtMs, FADE_MS\)/, 'the amount that scales the dust eases');
  assert.match(read('../src/scene/blood/cells/cells.ts'), /streakAmt\.value = drawn \? this\.amount/, 'and is what the vessels read');
});

// Root cause of the green and dark blue specks on the joints (Mohammad, 20 Nov): dustFrame normalised a skin arm's heading, which is zero on some pixels; normalize(0) is NaN on a GPU and a NaN particle is drawn as a speck of any colour.
test('the dust frame is finite and unit for every heading, the degenerate ones included (no NaN specks)', () => {
  const cases: [number, number, number][] = [[0, 0, 0], [0, 0, 1], [0, 0, -1e-9], [1, 0, 0], [0.3, -0.7, 0.2], [1e-7, 0, 0]];
  const sides: [number, number, number][] = [[1, 0, 0], [0, 0, 1], [0, 0, 0]];
  for (const T of cases) for (const Z of [[0, 0, 1], [0, 0, 0], T] as [number, number, number][]) for (const side of sides) {
    const f = dustFrameJs(T, Z, [0, 0, 1], side);
    assert.ok(f.every(Number.isFinite), `finite for T ${T}, Z ${Z}, side ${side}: ${f}`);
    assert.ok(Math.hypot(f[0], f[1]) <= 1 + 1e-9 && Math.hypot(f[2], f[3]) <= 1 + 1e-9, 'never past unit');
  }
  assert.doesNotMatch(DUST_GLSL, /vec3 t = normalize\(T\)/, 'no unguarded normalize of the heading');
  assert.match(DUST_GLSL, /if \(tl < 1e-6\) return vec4\(1\.0, 0\.0, 0\.0, 1\.0\)/);
  assert.match(DUST_GLSL, /\/ \(g\.c1 < 0\.0 \? min\(g\.c1, -1e-4\) : max\(g\.c1, 1e-4\)\)/, 'a strip of no width never divides 0 by 0');
  assert.equal((DUST_GLSL.match(/return clamp\(dSafe\(acc\), 0\.0, 1\.0\)/g) ?? []).length, 4, 'tube and skin dust, of both looks, stay inside 0 .. 1 premultiplied');
  assert.match(DUST_GLSL, /if \(!dNear\(Fa, g, ma\.x, P\) && \(fb\.x < 0\.0 \|\| !dNear\(Fb, gb, fb\.y, P\)\)\) continue;/, 'the skin culls a particle out of reach in both frames');
});

// Healthy blood is laminar (Mohammad, 20 Nov: "the blood streaks seem to think there is stenoses everywhere"): the swirl and the wobble came from the vessel's SPEED and from every joint as well as from a narrowing,
// so a fast healthy portal vein turned several times and its front and back particles were drawn as crossing slashes. Only a narrowing swirls or stirs the blood now.
test('a healthy vessel, however fast, has no swirl, no turns and no wobble: calm lanes along the wall; a narrowed one keeps them', async () => {
  const { swirlHc, turnsFor } = await import('../src/scene/blood/routes.ts');
  for (const vd of [0, 10, 30, 60, 200]) {
    assert.equal(swirlHc(1, vd, 1, 1, 0.9, 0.5), 0, `healthy at speed ${vd}`);
    assert.equal(turnsFor(swirlHc(1, vd, 1, 1, 0.9, 0.5), 2000, 10), 0, 'no turns over a long healthy vessel');
  }
  assert.ok(swirlHc(0.4, 30, 1, 1, 0.9, 0.5) > 0.5, 'a tight narrowing swirls');
  assert.doesNotMatch(DUST_GLSL, /T_FLOW|smoothstep\(25\.0, 45\.0, abs\(F\.vd\)\)/, 'no turbulence from speed');
  assert.doesNotMatch(DUST_GLSL, /wEnd/, 'no turbulence from a joint');
  assert.match(DUST_GLSL, /float TcRaw = clamp\([\d.]+ \* \(1\.0 - smoothstep\(0\.5, 0\.85, F\.nar\)\), 0\.0, 1\.0\);/);
});

// Brown flecks in the faded vessels (Mohammad, 20 Nov): the hue of a near-grey base is noise, and the lab's saturation added to it painted an arbitrary hue (organ-brown). The tones keep the vessel's hue family.
test('the dust tones keep the vessel\'s hue family: a grey base stays grey, a blue one stays blue (no arbitrary hue from a faded tone)', async () => {
  const { dustShiftJs } = await import('../src/scene/blood/dust-glsl.ts');
  const shifts: Array<[number, number, number]> = [[-0.2 * 40 / 360, 0.02, 0.24], [0.5 * 40 / 360, 0.04, 0.1], [-0.55 * 40 / 360, 0, 0.06], [0, 0.03, -0.14]];
  for (const grey of [[0.5, 0.5, 0.5], [0.52, 0.5, 0.49], [0.5, 0.505, 0.5], [0.6, 0.601, 0.6], [0.45, 0.45, 0.452]]) {
    for (const [dh, ds, dl] of shifts) {
      const o = dustShiftJs(grey, dh, ds, dl);
      assert.ok(Math.max(...o) - Math.min(...o) < 0.05, `grey ${grey} -> ${o.map((x) => x.toFixed(3))}: a tone of a grey base has a hue`);
    }
  }
  for (const [dh, ds, dl] of shifts) {
    const o = dustShiftJs([0.58, 0.76, 0.95], dh, ds, dl);
    assert.ok(o[2]! > o[1]! && o[1]! >= o[0]!, `a blue base keeps blue tones (${o.map((x) => x.toFixed(2))})`);
  }
  assert.match(DUST_GLSL, /float k = dShiftK\(c\);/, 'the shader holds the same rule');
  assert.match(DUST_GLSL, /max\(c\.r, max\(c\.g, c\.b\)\) - min\(c\.r, min\(c\.g, c\.b\)\)/, 'by the base\'s chroma, not its HSL saturation');
  // the pale joints (Mohammad, 20 Nov: yellow, periwinkle and white specks at the confluence): a near-WHITE base has a large HSL saturation but no colour; its tones stay colourless, however the lightness moves
  for (const pale of [[0.93, 0.94, 0.97], [0.97, 0.97, 0.99], [0.95, 0.96, 0.94], [0.9, 0.9, 0.93], [0.12, 0.12, 0.15]]) {
    for (const [dh, ds, dl] of shifts) {
      const o = dustShiftJs(pale, dh, ds, dl);
      assert.ok(Math.max(...o) - Math.min(...o) < 0.06, `pale ${pale} -> ${o.map((x) => x.toFixed(3))}: a tone of a colourless base has a colour`);
    }
  }
});

// Violet specks on the pale cava and confluence (Mohammad, 21 Nov): a dark tone of a PALE coloured base kept its HSL saturation (large near white) and came out vivid. The tone keeps the base's chroma.
test('the dust tones never carry much more chroma than the base, however pale the base and however dark the tone', async () => {
  const { dustShiftJs } = await import('../src/scene/blood/dust-glsl.ts');
  const shifts: Array<[number, number, number]> = [[-0.2 * 40 / 360, 0.02, 0.24], [0.5 * 40 / 360, 0.04, 0.1], [-0.55 * 40 / 360, 0, 0.06], [0, 0.03, -0.14], [0, 0.03, -0.3]];
  for (const pale of [[0.72, 0.82, 0.93], [0.78, 0.86, 0.95], [0.8, 0.88, 0.96], [0.66, 0.76, 0.9]]) {
    const c0 = Math.max(...pale) - Math.min(...pale);
    for (const [dh, ds, dl] of shifts) {
      const o = dustShiftJs(pale, dh, ds, dl), c1 = Math.max(...o) - Math.min(...o);
      assert.ok(c1 <= c0 + 0.12, `pale ${pale} -> ${o.map((x) => x.toFixed(3))}: chroma ${c1.toFixed(2)} against the base's ${c0.toFixed(2)}`);
    }
  }
  assert.match(DUST_GLSL, /ch0 \/ max\(1\.0 - abs\(2\.0 \* l1 - 1\.0\), 0\.08\)/, 'the shader holds the same rule');
});
