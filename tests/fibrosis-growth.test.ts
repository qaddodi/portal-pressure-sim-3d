// Plan 25b (Mohammad 22 Nov: "when I'm changing the degree of fibrosis I want it to grow organically in steps ... and falling back"): the collagen is painted once at full strength with an arrival time per pixel, and a growth p per channel
// reveals it on the GPU. Gates of the plan, measured in node with the painter's raster twin (tests/helpers/raster-ctx.ts: it judges coverage and colour, not antialiasing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { PLATE_BOX, PLATE_PX, PLATE_S, LOBULE_PLATE_FS, paintPlateWorld, plateInput, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenInput, paintCollagenWorld, septaBands } from '../src/scene/lobule/collagen-paint.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { tractReveal } from './helpers/tract-front.ts';
import { tractFrontPx } from '../src/scene/lobule/collagen-edge.ts';
import { GROW_H, GROW_RATE, NEVER, TAU_LO, TAU_SPAN, easeGrow, front, growGoal, septaStrength } from '../src/scene/lobule/growth.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens, bandGeomInto } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';

const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
const look = 'light' as never, L = lookColours(look);
useTokens((n: string, a?: number | string) => L.tk(n, a));
const N = 512, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), cv = DISC_R.cv;
const H = { congU: 0, septU: 0, fibSin: 0, act: 0, fibPre: 0, fibPost: 0 }, FULL = { ...H, septU: 1, fibPre: 1, fibPost: 1 };
const tau = collagenTau(shape, cv * PLATE_S, N, B), tractAt = tractReveal(N, B);   // (the septa's times are texels; the tracts' disc is analytic about the corners, Plan 47)
const rasterOf = (s: typeof H) => { const r = rasterCtx(N); r.skipFills(2); paintPlateWorld(r.ctx, N, sc, -B, -B, { ...plateInput(shape, sins, cv, s, look), zonesOn: false }); return r; };
const layer = (() => { const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'tracts'); return r; })();
const layerS = (() => { const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'septa'); return r; })();

test('the collagen layer over the tissue with none of it equals today\'s one-pass painting at both ends (within 2/255 on 99.5 % of pixels)', () => {
  const one = rasterOf(FULL), tissue = rasterOf(H), none = rasterOf(H);
  const cmp = (a: { alpha: Float32Array; rgb: Float32Array }, b: { alpha: Float32Array; rgb: Float32Array }, over: typeof layer | null) => {
    let ok = 0, bad = 0; const worst = { d: 0, at: 0 };
    for (let i = 0; i < a.alpha.length; i++) {
      if (tau[4 * i] !== NEVER) { ok++; continue; }   // (Plan 31 widened and doubled the septa on purpose: the pixels they reach are judged by septa-dominant.test.ts; every other pixel is still 2D's painting)
      const ca = over ? over.alpha[i]! : 0, ba = b.alpha[i]! * (1 - ca) + ca;
      let d = Math.abs(a.alpha[i]! - ba) * 255;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.rgb[3 * i + c]! - (b.rgb[3 * i + c]! * (1 - ca) + (over ? over.rgb[3 * i + c]! : 0))));
      if (d <= 2) ok++; else { bad++; if (d > worst.d) { worst.d = d; worst.at = i; } }
    }
    return { share: ok / a.alpha.length, bad, worst };
  };
  const full = cmp(one, tissue, layer), zero = cmp(none, tissue, null);
  console.log(`# ends: all channels 1: ${(full.share * 100).toFixed(2)} % within 2/255 (${full.bad} px beyond, worst ${full.worst.d.toFixed(1)}/255 at px ${full.worst.at % N},${Math.floor(full.worst.at / N)}); all channels 0: ${(zero.share * 100).toFixed(2)} %`);
  assert.ok(full.share >= 0.995, `at 1 the composite is today's painting (${(full.share * 100).toFixed(2)} %)`);
  assert.equal(zero.share, 1, 'at 0 the tissue plate alone is the healthy painting');
});

/** The visible collagen of a channel at growth p (the shader's own rule on the layer's alpha). */
const visible = (ch: number, p: number, i: number): boolean => (ch === 0 ? layerS.alpha[i]! * front(tau[4 * i]!, p) * septaStrength(p) : layer.alpha[i]! * tractAt(i, p)) > 0.05;

test('nested by construction: each channel\'s collagen at p is a subset of its collagen at any larger p (101 steps, pixel by pixel), and it grows (the vein is not in this layer: cv-band.ts)', () => {
  for (const ch of [0, 1]) {
    let prev = new Uint8Array(N * N), last = 0, first = -1;
    for (let k = 0; k <= 100; k++) {
      const p = k / 100, cur = new Uint8Array(N * N); let n = 0;
      for (let i = 0; i < N * N; i++) if (visible(ch, p, i)) { cur[i] = 1; n++; if (!prev[i] && 0) n = n; }
      for (let i = 0; i < N * N; i++) if (prev[i] && !cur[i]) assert.fail(`channel ${ch}: a pixel visible at ${(k - 1) / 100} is gone at ${p}`);
      assert.ok(n >= last, `channel ${ch}: coverage never falls (${last} to ${n} at ${p})`);
      if (first < 0 && n > 0) first = p;
      prev = cur; last = n;
    }
    assert.ok(last > 1000, `channel ${ch} has collagen at 1 (${last} px)`);
    assert.ok(first >= 0 && first <= 0.15, `channel ${ch} starts growing early (first at ${first})`);
  }
});

test('the same both ways: easing up to p and easing down to p end at exactly p, and the layer shows the same pixels (≤ 0.1 %)', () => {
  const cover = (p: number) => { let n = 0; for (let ch = 0; ch < 3; ch++) for (let i = 0; i < N * N; i += 3) if (visible(ch, p, i)) n++; return n; };
  for (let k = 0; k <= 100; k += 5) {
    const goal = k / 100; let up = 0, down = 1;
    for (let f = 0; f < 1200; f++) { up = easeGrow(up, goal, 1 / 60); down = easeGrow(down, goal, 1 / 60); }
    assert.equal(up, goal); assert.equal(down, goal);
    assert.ok(Math.abs(cover(up) - cover(down)) <= 0.001 * Math.max(1, cover(up)));
  }
});

test('no pop: at the eased rate and 60 fps no pixel\'s alpha changes by more than 0.08 in a frame', () => {
  assert.ok(TAU_LO >= GROW_H && TAU_LO + TAU_SPAN <= 1 - GROW_H, 'every pixel hidden at 0 and whole at 1');
  let p = 0, worst = { d: 0, byte: 0, p: 0 }, frames = 0;
  for (; p < 1 && frames < 2000; frames++) {
    const n = easeGrow(p, 1, 1 / 60);
    assert.ok(n - p <= GROW_RATE / 60 + 1e-12, 'never faster than the fixed rate');
    for (let b = 0; b < NEVER; b++) {
      const d = Math.max(Math.abs(front(b, n) - front(b, p)), Math.abs(front(b, n) * septaStrength(n) - front(b, p) * septaStrength(p)));
      if (d > worst.d) worst = { d, byte: b, p };
    }
    assert.ok(tractFrontPx(n) - tractFrontPx(p) <= 1, 'the tracts\' crisp edge glides less than one plate px a frame (it never jumps)');
    p = n;
  }
  console.log(`# no pop: largest per-frame alpha change ${worst.d.toFixed(4)} at stored time ${(worst.byte / 254).toFixed(3)} when p = ${worst.p.toFixed(3)}; a full change takes ${(frames / 60).toFixed(2)} s`);
  assert.ok(worst.d <= 0.08, `largest change ${worst.d}`);
  assert.ok(frames / 60 > 2.5 && frames / 60 < 4, 'a whole change takes about 3 s');
});

test('the hex-edge bridges\' fronts meet in the middle at septU 0.29 (± 0.02), from both tracts, and the portal-central bridges and spurs come after', () => {
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  const at = (x: number, y: number) => { const px = Math.floor((x + B) * sc), py = Math.floor((y + B) * sc); return tau[4 * (py * N + px)]! / 254; };
  let hexMid = 0;
  for (const b of septaBands(shape)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const mid = at(g.P[26]!, g.P[27]!), near = at(g.P[2]!, g.P[3]!), end = at(g.P[50]!, g.P[51]!);
    if (b.kind === 'hex') { assert.ok(Math.abs(mid - 0.29) <= 0.02, `a hex edge's middle shows at ${mid.toFixed(3)}`); assert.ok(near < mid && end < mid, 'from both tracts towards the middle'); hexMid = mid; }
    if (b.kind === 'pc') assert.ok(near < hexMid + 0.1 && end > hexMid, 'a portal-central bridge creeps from the tract to the vein, after the hex edges meet');
    if (b.kind === 'spur') assert.ok(end > hexMid, 'spurs push in last');
  }
});

test('deterministic: the same layout gives the same arrival times, byte for byte', () => {
  const hash = (a: Uint8Array) => createHash('sha1').update(a).digest('hex');
  const again = collagenTau(shape, cv * PLATE_S, N, B);
  assert.equal(hash(again), hash(tau));
  { let n = 0; for (let i = 0; i < N * N; i++) { if (tau[4 * i] !== NEVER) n++; assert.equal(tau[4 * i + 3], 255, 'alpha whole, so an upload never premultiplies the times away'); } assert.ok(n > 500, 'the septa have times'); }
});

test('the layer and the times at the plate\'s size, in bytes (an iPhone paints the same 2048 px plate)', () => {
  const layerBytes = PLATE_PX * PLATE_PX * 4, mips = Math.round(layerBytes * 4 / 3), tauRGBA = PLATE_PX * PLATE_PX * 4, tauRGB = PLATE_PX * PLATE_PX * 3;
  console.log(`# memory: collagen layer ${(layerBytes / 1048576).toFixed(1)} MB (${(mips / 1048576).toFixed(1)} MB with mips), arrival times ${(tauRGB / 1048576).toFixed(1)} MB as RGB (${(tauRGBA / 1048576).toFixed(1)} MB held as RGBA); about ${((mips + tauRGBA) / 1048576).toFixed(1)} MB in all`);
  assert.equal(layerBytes, 16 * 1048576, 'each plate of the collagen atlas (Plan 31: the tracts and the vein, the septa)');
});

test('no repaint: easing the model from healthy to cirrhosis 100 % and fibrosis, and back, asks the worker for no tissue plate and paints none on the page', async () => {
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { LobuleView } = await import('../src/scene/lobule/view.ts');
  const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts');
  const model = (o: object = {}) => ({
    zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
    lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
  }) as never;
  const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
  flat.snapModel(model()); flat.setVisible(true);
  l3.buildForTest('light');
  flat.update(1000); l3.update(true, 0, 1000, 1, true);
  let asked = 0;
  const a = l3 as unknown as { plates: unknown; grow: number[] };
  a.plates = { available: true, ask: () => { asked++; }, dispose() {} };
  const before = l3.paints, realNow = performance.now.bind(performance); let fake = realNow(), t = 1000;
  performance.now = () => (fake += 16);
  const run = (n: number) => { for (let i = 0; i < n; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, false); } };
  try {
    run(10);
    flat.setModel(model({ s: 1, septU: 1, fibPre: 1, fibPost: 1 }));
    run(20);   // (a test frame reads the fake clock three times: about 48 ms of it)
    const mid = [...a.grow];
    assert.ok(mid.every((v) => v > 0 && v < 1), `growing, not jumped (${mid.map((v) => v.toFixed(2))})`);
    run(200);
    assert.deepEqual([...a.grow].map((v) => Math.round(v * 100) / 100), [1, 0.35, 0.3], 'fully grown (Plan 31: the tracts and the vein yield to the septa)');
    flat.setModel(model());
    run(20);
    assert.ok(a.grow.every((v) => v > 0 && v < 1), 'and falling back the same way');
    run(200);
    assert.deepEqual([...a.grow], [0, 0, 0]);
  } finally { performance.now = realNow; }
  assert.equal(asked, 0, 'no tissue plate asked for');
  assert.equal(l3.paints, before, 'nothing painted on the page');
});

test('the growth goals come from the lobule\'s own values with the painter\'s onsets', () => {
  assert.deepEqual(growGoal({ septU: 0.5, fibPre: 0.03, fibPost: 0.05 }), [0.5, 0, 0]);
  const g = growGoal({ septU: 1, fibPre: 1, fibPost: 1 });
  assert.deepEqual(g.map((v) => Math.round(v * 1000) / 1000), [1, 0.35, 0.3], 'Plan 31: at full cirrhosis the tracts and the vein yield to the septa');
  assert.deepEqual(growGoal({ septU: 0, fibPre: 1, fibPost: 1 }), [0, 1, 1], 'and with no cirrhosis (schisto, SOS) nothing changes');
});

test('GLSL: the plate shader parses and carries the growth rule', async () => {
  assert.match(LOBULE_PLATE_FS, new RegExp(`const float GROW_H = ${GROW_H.toFixed(3)};`));
  assert.match(LOBULE_PLATE_FS, /smoothstep\(t - GROW_H, t \+ GROW_H, p\)/);
  assert.match(LOBULE_PLATE_FS, /0\.75 \+ 0\.25 \* uP\.x/, 'the septa\'s strength (Plan 31)');
  let parse: ((s: string) => unknown) | null = null;
  const name = '@shaderfrog/glsl-parser';
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  assert.ok(parse, 'the parser is installed');
  parse!(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''));
});
