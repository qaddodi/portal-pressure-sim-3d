// The 3D stent's lens colour runs ALONG it as the IR card's graph does (Mohammad, 26 Nov: "the velocity lens inside the TIPS is not showing similar to the graph, it has a speeding section in the middle").
// Root cause: a vessel's lens colour was its two ends' (and a third and two thirds along), so a stent under the velocity lens was one colour end to end, and under the pressure lens a straight blend of
// its ends, while the card's strip and graph run along the lumen's own profile (the waist's fast section, the pressure's dip and recovery). The stent now carries a PROFILE of colours in the lens texture,
// read from the card's own numbers through one function (scene/lenses/stent-lens.ts), which the card's strip draws with too. This pins it for any waist, taper, stenosis and lens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, NODES, STENT_SITES, stentReadsOf } from '../src/engine/hales/portal/topology.js';
import { geomOf, profileAt } from '../src/engine/hales/portal/stent-geom.js';
import { LENS_EDGE_COUNT, PROFILE_N, PROFILE_ROW0, computeLens, edgeIndex, edgeNodes, newLensData, samplerFor, type LensContext, type LensId } from '../src/scene/lenses/model.ts';
import { STENT_PROFILE_LENSES, stentColourAt, stentPressureAt, stentVelocityAt, traceAt, writeStentProfiles } from '../src/scene/lenses/stent-lens.ts';
import { openVelocity, scanK, stentNormal, stentState, traceFor, traceIn, velPos, type StentState } from '../src/ui/charts/stent/model.ts';
import { tipsFigureFrame } from '../src/ui/tests/ir/tips-figure.ts';
import { TRACE_N } from '../src/engine/hales/portal/stent-trace.js';
import { LENS_OF_AT_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { ctxOf } from './charts-helpers.ts';
import { readFileSync } from 'node:fs';

const NE = LENS_EDGE_COUNT, K = edgeIndex.get('TIPS')!;
/** The card's fingerprint of a TIPS (the numbers it draws from), with a waist, a taper and an end stenosis as asked. */
const fp = (g: { len?: number; waist?: number; trans?: number; red?: number; stn?: number; site?: string } = {}) => ({
  ppg: 11.8, ivc: 4.5, tipsFlow: 1.5, tipsDp: 5.6, tipsG0: 126, tipsG1: 188, tipsG2: 301, tipsTract: 1.1, tipsWall: 0.9, tipsEnds: 1, tipsJet: 2.6, tipsLumen: 5, tipsVel: 301, tipsD: 10,
  tipsLen: g.len ?? 8, tipsWaistLen: g.waist ?? 3, tipsTrans: g.trans ?? 1, tipsRed: g.red ?? 0.2, tipsStn: g.stn ?? 0, tipsStnSite: g.site ?? 'distal',
});
/** A frame for the lens model: the engine's arrays (a stent 10 mm open, nodes at their own pressures) carrying the card's numbers. */
function frame(g?: Parameters<typeof fp>[0]) {
  const P = new Float32Array(NODES.length), Q = new Float32Array(EDGES.length), D = new Float32Array(EDGES.length);
  const [a, b] = edgeNodes(K); P[a] = 16.3; P[b] = 4.5; Q[K] = 25; D[K] = 10;
  return { P, Q, D, ...fp(g) };
}
const NO_CTX: LensContext = { healthy: null, ref: null };
function lensOf(lens: LensId, g?: Parameters<typeof fp>[0], ctx = NO_CTX) {
  const f = frame(g), out = computeLens(lens, f as never, 'light', ctx, newLensData());
  const wrote = writeStentProfiles(out, lens, f as never, 'light', ctx, null);
  return { f, out, wrote, st: stentState(f, 'TIPS', null) };
}
const row = (d: { grad: Float32Array }, r: number, k = K): [number, number, number, number] => { const i = (r * NE + k) * 4; return [d.grad[i]!, d.grad[i + 1]!, d.grad[i + 2]!, d.grad[i + 3]!]; };
const near = (a: ArrayLike<number>, b: ArrayLike<number>, m: string, e = 1e-6) => { for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i]! - b[i]!) < e, `${m}: ${Array.from(a).slice(0, 3)} vs ${Array.from(b).slice(0, 3)}`); };
const dist = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

test('under the velocity lens the stent carries a profile: its middle (the waist) is not its ends\' colour, as the card\'s strip is not', () => {
  const { out, wrote, st } = lensOf('velocity', { waist: 3, red: 0.45, trans: 1 });
  assert.deepEqual(wrote, ['TIPS']);
  assert.equal(row(out, PROFILE_ROW0)[3], 1, 'the first profile row says the vessel carries one');
  const mid = row(out, PROFILE_ROW0 + (PROFILE_N - 1) / 2), start = row(out, PROFILE_ROW0 + 4), end = row(out, PROFILE_ROW0 + PROFILE_N - 5);
  assert.ok(dist(mid, start) > 0.15 && dist(mid, end) > 0.15, 'the fast section at the waist is a different colour from the open stent either side');
  // the waist is the fastest section, and the profile's colour there is the velocity ramp at the velocity the card's graph reads there
  const norm = stentNormal('TIPS', st.d), ramp = samplerFor('light', 'velocity');
  near(mid, ramp.at(velPos(stentVelocityAt(st, 0.5), norm)), 'mid stent');
  assert.ok(stentVelocityAt(st, 0.5) > 1.2 * stentVelocityAt(st, 0.05));
});

test('the profile is the graph: along the stent its velocity is the chart\'s own trace, and the Doppler gates read within the engine\'s usual spread of it, for any waist, taper and stenosis', () => {
  const geoms = [{ len: 8, waist: 3, trans: 1, red: 0.2 }, { len: 8, waist: 2, trans: 1, red: 0.35 }, { len: 6, waist: 1, trans: 2, red: 0.5 }, { len: 10, waist: 4, trans: 0, red: 0.6 }, { len: 8, waist: 0, trans: 1, red: 0 }, { len: 4, waist: 3, trans: 2, red: 0.6 }];
  for (const g of geoms) for (const [stn, site] of [[0, 'distal'], [0.5, 'distal'], [0.6, 'proximal']] as const) {
    const st = stentState(fp({ ...g, stn, site }), 'TIPS', null), trace = traceFor(traceIn(st)), kd = scanK('TIPS'), tag = `${JSON.stringify(g)} stn ${stn} ${site}`;
    // (the chart's line is the trace's mean velocity times the scanner's factor; the lumen's profile gives the same velocity at every place along the stent but its two ends, where the trace steps in from the vein)
    for (let i = 0; i <= TRACE_N; i++) {
      const u = trace.x[i]! / st.sh.len;
      if (u < 0.03 || u > 0.97) continue;
      const graph = trace.v[i]! * kd, mine = stentVelocityAt(st, u);
      assert.ok(Math.abs(mine - graph) <= 0.02 * Math.max(graph, mine) + 1, `${tag} u ${u.toFixed(3)}: the stent's ${mine.toFixed(1)} vs the graph's ${graph.toFixed(1)} cm/s`);
    }
    // the card's three gates (the engine's, with its working stent's slow portal end and fast middle) are within that spread of the profile
    const params = { tips: { on: true, d: 10 }, stentGeom: { TIPS: g }, stenosis: { TIPS: stn } }, factors = stentReadsOf(params, 'TIPS', 1, [1, 1, 1] as never) as unknown as ArrayLike<number>;
    const v0 = openVelocity(st.flow, st.d, 'TIPS'), u = [STENT_SITES.proximal, STENT_SITES.mid, STENT_SITES.distal] as number[];
    if (stn === 0) for (let q = 0; q < 3; q++) assert.ok(Math.abs(stentVelocityAt(st, u[q]!) / v0 / factors[q]! - 1) < 0.12, `${tag} gate ${q}`);
    // the fastest place along the profile is where the lumen is narrowest
    let narrow = 0, fast = 0;
    for (let i = 0; i <= 96; i++) { const x = i / 96; if (profileAt(st.sh, st.s, st.site, x) < profileAt(st.sh, st.s, st.site, narrow)) narrow = x; if (stentVelocityAt(st, x) > stentVelocityAt(st, fast)) fast = x; }
    assert.equal(fast, narrow, `${tag}: fastest where narrowest`);
  }
});

test('every rule row but the ends is the stent\'s own colour along it, under each lens that varies along a stent; the ends are the junction\'s', () => {
  const refs = new Float32Array(NODES.length).fill(6);
  for (const lens of ['velocity', 'pressure', 'heat', 'delta', 'since'] as LensId[]) {
    const { out, wrote, st } = lensOf(lens, { waist: 3, red: 0.45, trans: 1, stn: 0.4 }, { healthy: null, ref: refs });
    assert.deepEqual(wrote, ['TIPS'], lens);
    const trace = traceFor(traceIn(st)), [a, b] = edgeNodes(K), r: [number, number] = [refs[a]!, refs[b]!];
    near(row(out, PROFILE_ROW0), row(out, 0), `${lens}: the upstream end is the vessel's`);
    near(row(out, PROFILE_ROW0 + PROFILE_N - 1), row(out, 1), `${lens}: the downstream end is the vessel's`);
    for (let i = 1; i < PROFILE_N - 1; i++) near(row(out, PROFILE_ROW0 + i), stentColourAt(lens, 'light', st, trace, i / (PROFILE_N - 1), r)!, `${lens} row ${i}`);
    near(row(out, 2), row(out, PROFILE_ROW0 + (PROFILE_N - 1) / 3), `${lens}: a third along`);
  }
  assert.deepEqual([...STENT_PROFILE_LENSES].sort(), ['delta', 'heat', 'pressure', 'since', 'velocity']);
});

test('under the pressure lens the stent shows the pressure along it (the trace\'s dip and recovery), not a straight blend of its ends', () => {
  const { out, st } = lensOf('pressure', { waist: 3, red: 0.5, trans: 1 }), trace = traceFor(traceIn(st));
  // the trace's pressure at the waist is lower than the straight line between the stent's ends (the velocity head), so the colours differ from the blend
  const lineAt = (u: number) => stentPressureAt(st, trace, 0) + (stentPressureAt(st, trace, 1) - stentPressureAt(st, trace, 0)) * u;
  assert.ok(lineAt(0.5) - stentPressureAt(st, trace, 0.5) > 0.2, 'the pressure along the stent leaves the straight line');
  const ramp = samplerFor('light', 'pressure');
  near(row(out, PROFILE_ROW0 + (PROFILE_N - 1) / 2), ramp.at(stentPressureAt(st, trace, 0.5)), 'mid stent is the pressure there');
});

test('the lenses whose colour does not change along a stent keep one colour: no profile is written for them', () => {
  for (const lens of ['flow', 'direction', 'drop', 'system', 'oxygen', 'origin', 'firstpass'] as LensId[]) {
    const { out, wrote } = lensOf(lens);
    assert.deepEqual(wrote, [], lens);
    assert.equal(row(out, PROFILE_ROW0)[3], 0, `${lens}: the first profile row says none`);
  }
});

test('a stent with nothing open or placed carries no profile, and a vein never does', () => {
  const f = frame(); (f.D as Float32Array)[K] = 1;   // (shut: narrower than a stent reads as)
  const out = computeLens('velocity', f as never, 'light', NO_CTX, newLensData());
  assert.deepEqual(writeStentProfiles(out, 'velocity', f as never, 'light', NO_CTX, null), []);
  const { out: o2 } = lensOf('velocity');
  const other = [...edgeIndex.entries()].filter(([id]) => id !== 'TIPS' && id !== 'DIPS').map(([, k]) => k);
  assert.ok(other.every((k) => row(o2, PROFILE_ROW0, k)[3] === 0), 'no other vessel carries a profile');
});

test('the card\'s strip is drawn with the same colours: every slice of its lumen is the stent\'s colour at that place, under both of its lenses', () => {
  for (const lens of ['velocity', 'pressure'] as const) {
    const st: StentState = stentState(fp({ waist: 3, red: 0.45 }), 'TIPS', null), c = ctxOf('light', 330), f = tipsFigureFrame(st, c, { lens, labels: true, chart: false });
    const fills = f.shapes.flatMap((s) => (s.k === 'path' && s.fill && s.fill[3] === 1 ? [s.fill] : []));
    const trace = traceFor(traceIn(st));
    const n = 96;
    for (let q = 0; q < 64; q++) {
      // (a slice is one or two of the lumen's 96 samples: the strip's own rule)
      const a = Math.round((q * n) / 64), b = Math.max(a + 1, Math.round(((q + 1) * n) / 64)), u = (a + b) / (2 * n), want = stentColourAt(lens, 'light', st, trace, u)!;
      assert.ok(fills.some((p) => dist(p, want) < 0.02), `${lens}: slice ${q} is the lens colour at ${u.toFixed(3)}`);
    }
  }
});

test('the vessel, the junction skin and the blood read the profile through one shader function', () => {
  assert.match(LENS_OF_AT_GLSL, /vec4 lensProfileAt\(sampler2D grad, int e, float u\)/, 'the shared lens function defines it');
  assert.match(LENS_OF_AT_GLSL, /lensProfileAt\(grad, int\(lensIx\), u\)/, 'the tube and the skin read it through lensOfAt');
  const cells = readFileSync('src/scene/blood/cells/shader.ts', 'utf8');
  assert.match(cells, /\$\{LENS_PROFILE_GLSL\}/); assert.match(cells, /lensProfileAt\(grad, e, u\)/);
});
