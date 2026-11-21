// A stenosis (Mohammad, 20 Nov: "I did stenose the portal vein and the chevrons started flowing the other way, pointing in a different direction; the outline went away"): the narrowing is a smooth, LOCAL pinch of the vessel's drawn
// lumen, the same for every vessel that can be narrowed (the shared place: disease/clamps.ts for its profile, vessels/shaders.ts for how it is drawn). These pin the rules, over every stenosable vessel and not one of them:
//  1. the pinch is exactly nothing at both ends of its vessel (so the calibre either side is the vessel's own and no step stands against the next piece), symmetric, and falls off smoothly;
//  2. the shader's lumen radius (what the line, the flow marks, the dust and the tones are made from) is the PINCHED radius, and the outline's thinning is judged on the unpinched one (the line runs on through the waist);
//  3. the arrowheads are flat marks on the screen (labels/clamp-marks.ts), standing on the drawn waist at the pinched wall plus their gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3, type BufferAttribute } from 'three';
import { WAIST_MAX_SIG, WAIST_REACH, isClampable, markShown, waistNarrow, waistSigma } from '../src/scene/disease/clamps.ts';
import { MAPPED } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { UNITS_PER_SCENE as U } from '../src/scene/frame2d.ts';
import { VESSEL_VS, VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { CelScene } from '../src/scene/scene.ts';
import { MARK, MARK_PATH, markScale, placeMarks } from '../src/scene/labels/clamp-marks.ts';
import { readFileSync } from 'node:fs';
import { CHEV, CHEVRON_GLSL, CHEV_SHAPE, chevPolygon } from '../src/scene/blood/chevron-glsl.ts';

const STENOSABLE = MAPPED.filter((v) => isClampable(v.id));
const sigOf = (v: (typeof STENOSABLE)[number]): number => {
  const c = coursesOf(v, REST)[0]!, curve = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2])));
  return waistSigma(2 * v.radius * U, curve.getLength() * U);
};

test('the waist is exactly nothing at both ends of every stenosable vessel, and a smooth symmetric bell between', () => {
  assert.ok(STENOSABLE.length > 40, `${STENOSABLE.length} vessels can be narrowed`);
  for (const v of STENOSABLE) {
    const sig = sigOf(v);
    assert.ok(sig <= WAIST_MAX_SIG + 1e-12, `${v.id}: the bell fits inside the vessel`);
    for (const s of [0.3, 0.6, 0.95]) {
      assert.equal(waistNarrow(s, 0, sig), 0, `${v.id} start at ${s}`);
      assert.equal(waistNarrow(s, 1, sig), 0, `${v.id} end at ${s}`);
      assert.equal(waistNarrow(s, 0.5, sig), s, `${v.id} the middle takes the whole stenosis`);
      let prev = 0;
      for (let k = 0; k <= 200; k++) {
        const u = 0.5 - 0.5 * (1 - k / 200), n = waistNarrow(s, u, sig);   // (the start up to the middle)
        assert.ok(n >= prev - 1e-12, `${v.id}: rises to the middle (u ${u.toFixed(3)})`);
        assert.ok(Math.abs(waistNarrow(s, u, sig) - waistNarrow(s, 1 - u, sig)) < 1e-12, `${v.id}: symmetric`);
        prev = n;
      }
    }
  }
});

test('the bell ends with no slope at its reach (no kink where the pinch stops)', () => {
  const sig = 0.1, edge = 0.5 - WAIST_REACH * sig, h = 1e-4;
  assert.equal(waistNarrow(0.9, edge, sig), 0);
  assert.ok(waistNarrow(0.9, edge + h, sig) < 1e-6, 'a hair inside the reach it is still nothing');
  assert.ok(waistNarrow(0.9, edge - h, sig) === 0, 'and outside it is nothing');
  // 2D's own length where it fits: about 2.5 diameters, the Gaussian's centre untouched
  assert.ok(Math.abs(waistNarrow(0.6, 0.5 + 0.1, 0.1) - 0.6 * Math.exp(-1)) < 1e-9);
});

test('the pinched geometry carries no narrowing at a vessel\'s two ends, on any stenosable vessel in the scene', () => {
  const s = new CelScene();
  for (const v of STENOSABLE) {
    const obj = s.vesselObject(v.id);
    if (!obj) continue;
    s.disease.clamps.set({ [v.id]: 0.95 }, () => 1, 0.016, true);
    const g = obj.toonMesh.geometry, nar = g.getAttribute('narrow') as BufferAttribute, uv = g.getAttribute('uv') as BufferAttribute;
    let mid = 0;
    for (let i = 0; i < nar.count; i++) {
      const u = uv.getX(i);
      if (u < 1e-6 || u > 1 - 1e-6) assert.equal(nar.getX(i), 0, `${v.id}: no pinch at u ${u}`);
      mid = Math.max(mid, nar.getX(i));
    }
    assert.ok(mid > 0, `${v.id} is pinched somewhere`);
    s.disease.clamps.set({}, () => 1, 0.016, true);
  }
  s.dispose?.();
});

test('the vessel shader draws everything from the PINCHED lumen: the line, the flow marks, the dust (the outline and the chevrons followed the unpinched one)', () => {
  // the one lumen radius the fragment stage reads is the pinched one
  assert.match(VESSEL_VS, /float narrowK = 1\.0 - clamp\(narrow, 0\.0, 0\.97\);/);
  assert.match(VESSEL_VS, /vR = radius \* rkE \* swell \* narrowK \* vU;/);
  // the geometry is pinched by that same factor (no second formula)
  assert.match(VESSEL_VS, /radius \* rkE \* \(swell \* narrowK - 1\.0\)/);
  assert.match(VESSEL_VS, /float lumenW = radius \* rkE \* swell \* narrowK;/);
  assert.doesNotMatch(VESSEL_VS, /\(1\.0 - narrow\)/, 'no stray copy of the pinch that the lumen radius does not see');
  // the outline's thinning for a hairline is judged on the vessel's own radius: a pinch keeps its line
  assert.match(VESSEL_VS, /rCssV \/ narrowK\);/);
  // and the fragment stage's marks are made from vR (the pinched one) and nothing else
  assert.match(VESSEL_FS, /float R = max\(vR, 0\.3\)/);
  assert.match(VESSEL_FS, /float rDevAx = vR \//);
});

test('the arrowheads are flat marks on the screen, never geometry in the scene, and stand on the drawn waist of every stenosable vessel', () => {
  const s = new CelScene();
  assert.equal((s.disease.clamps as unknown as { group?: unknown }).group, undefined, 'the clamp layer has no 3D group any more');
  for (const v of STENOSABLE) {
    const obj = s.vesselObject(v.id);
    if (!obj) continue;
    const cur = 0.8;
    s.disease.clamps.set({ [v.id]: cur }, () => 1, 0.016, true);
    const m = s.disease.clamps.marks().find((x) => x.id === v.id)!;
    assert.ok(m, `${v.id}: one mark`);
    const curve = new CatmullRomCurve3(coursesOf(v, REST)[0]!.pts.map((p) => new Vector3(p[0], p[1], p[2]))), at = curve.getPointAt(0.5);
    assert.ok(m.at.distanceTo(at) < 1e-9, `${v.id}: the mark stands at the drawn waist's middle`);
    assert.ok(Math.abs(Math.hypot(m.nx, m.ny) - 1) < 1e-9 && Math.abs(m.radius - v.radius) < 1e-12 && m.cur === cur);
    assert.equal(m.shown, 1);
    s.disease.clamps.set({}, () => 1, 0.016, true);
    assert.equal(s.disease.clamps.marks().length, 0, `${v.id}: gone with the narrowing`);
  }
  s.dispose?.();
});

test('a mark eases in with the narrowing and goes with the body\'s dissolve (never pops)', () => {
  assert.equal(markShown(0), 0);
  assert.equal(markShown(0.003), 0);
  assert.equal(markShown(0.5), 1);
  let was = 0;
  for (let c = 0; c <= 0.1; c += 0.002) { const v = markShown(c); assert.ok(v >= was && v - was < 0.12, `eases at ${c}`); was = v; }
  const s = new CelScene();
  s.disease.clamps.set({ IVCS_RA: 0.6 }, () => 1, 0.016, true);
  s.disease.clamps.setFade(0.5);
  assert.equal(s.disease.clamps.marks()[0]!.shown, 0.5);
  s.disease.clamps.setFade(0);
  assert.equal(s.disease.clamps.marks().length, 0);
  s.dispose?.();
});

test('the placing: the tip stands a gap off the pinched wall on each side, the head points at the waist, on any view of any vessel', () => {
  for (const [ax, ay, sx, sy] of [[100, 100, 100, 112], [50, 80, 61, 75], [0, 0, -9, 0.2], [10, 10, 10.0, 10.5]] as const) {
    for (const cur of [0.2, 0.5, 0.8, 0.95]) {
      const pl = placeMarks({ x: ax, y: ay }, { x: sx, y: sy }, cur)!, r = Math.hypot(sx - ax, sy - ay), sc = markScale(r);
      assert.ok(pl);
      for (const p of pl) {
        const d = Math.hypot(p.x - ax, p.y - ay);
        assert.ok(Math.abs(d - (r * (1 - cur) + MARK.gap * sc)) < 1e-9, `tip ${d.toFixed(3)} from the axis`);
        // the mark's +x (its tail) runs away from the axis, so its head points at the waist
        assert.ok(((p.x - ax) * Math.cos(p.angle) + (p.y - ay) * Math.sin(p.angle)) > 0, 'the tail leads away from the waist');
        assert.ok(Math.abs((p.x - ax) * Math.sin(p.angle) - (p.y - ay) * Math.cos(p.angle)) < 1e-9, 'on the line through the waist, across the vessel');
      }
      assert.ok(Math.abs(pl[0].x + pl[1].x - 2 * ax) < 1e-9 && Math.abs(pl[0].y + pl[1].y - 2 * ay) < 1e-9, 'one each side');
    }
  }
  assert.equal(placeMarks({ x: 5, y: 5 }, { x: 5, y: 5 }, 0.5), null, 'a vessel seen end-on has no side to mark');
  assert.ok(markScale(1) === 0.95 && markScale(100) === 1.25);
});

test('the marks are the blood chevron with the labels\' own outline, drawn by the label layer in the tags phase with transform and opacity only', () => {
  const dom = readFileSync(new URL('../src/scene/labels/clamp-marks.ts', import.meta.url), 'utf8');
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  assert.match(layer, /clampMarks\.paint\(cel\.disease\.clamps\.marks\(\)\)/);
  assert.doesNotMatch(dom, /style\.(left|top|width|height|display)\b/, 'no layout property is written in a frame');
  assert.doesNotMatch(dom, /requestAnimationFrame/);
  // the shape is chevD's, from the one set of shares the shader reads
  const poly = chevPolygon(MARK.hw), L = 2 * CHEV.LEN_OF_W * MARK.hw;
  assert.deepEqual(poly[0], [0, 0], 'the point at the origin');
  assert.ok(Math.abs(poly[1]![0] - L) < 1e-9 && poly[1]![1] === MARK.hw && poly[3]![1] === -MARK.hw && poly[1]![0] === poly[3]![0], 'the back: one length behind the point, a full half width either side');
  assert.ok(Math.abs(poly[2]![0] - (CHEV_SHAPE.TIP + CHEV_SHAPE.BACK - CHEV_SHAPE.NOTCH) * L) < 1e-9 && poly[2]![1] === 0, 'the notched back');
  assert.match(CHEVRON_GLSL, new RegExp(`tip = ${CHEV_SHAPE.TIP} \\* L, back = -${CHEV_SHAPE.BACK} \\* L, notch = ${CHEV_SHAPE.NOTCH} \\* L`), 'the shader reads the same shares');
  assert.ok(MARK_PATH.startsWith('M0 0L') && MARK_PATH.endsWith('Z') && !MARK_PATH.includes('C'), 'a filled polygon');
  // the outline is the labels': their halo's colour and width, drawn under the fill
  const lb = css.match(/\.lb > span \{[^}]*\}/)![0], cm = css.match(/\.cm path \{[^}]*\}/)![0];
  assert.match(lb, /-webkit-text-stroke: var\(--lb-halo-w\) var\(--lb-halo\); paint-order: stroke fill/);
  assert.match(cm, /fill: var\(--lb-val\); stroke: var\(--lb-halo\); stroke-width: var\(--lb-halo-w\); paint-order: stroke fill/);
  assert.doesNotMatch(css, /\.cm::(before|after)|cm-halo|cm-ink/, 'no hairline, no second halo');
});

// ── the cavernoma's hubs (Mohammad, 20 Nov: "the collaterals fan out from faceted star hubs"): the six channels meet at the two nodes, each ending in a fine tip, never a widened, collared, round-capped end ──
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { TIP_K, buildTubes } from '../src/scene/vessels/tubes.ts';
import { tubularOf } from '../src/scene/vessels/shape.ts';
test('every cavernoma channel narrows to a tip at both ends: no widened end, collar or ball where they meet', () => {
  const v = NETWORK_BY_ID.get('C8')!, cs = coursesOf(v, { ...REST, rec: 1, strandsOn: true });
  assert.ok(cs.length > 2);
  const b = buildTubes(cs, tubularOf(v, 16), v.radius), rk = b.geometry.getAttribute('rk') as BufferAttribute;
  cs.slice(1).forEach((c, i) => {
    assert.deepEqual(c.point, [true, true], `channel ${i}`);
    assert.equal(c.flare, undefined, `channel ${i}: no collar`);
    assert.equal(c.clamp, undefined);
    const run = b.runs[i + 1]!;
    for (const k of [0, run.tubular]) {
      const r = rk.getX(run.tubeStart + k * (run.radial + 1)) * v.radius;
      assert.ok(r <= c.radius * (TIP_K + 0.02), `channel ${i}: the end ring is ${(r / c.radius).toFixed(3)} of its radius`);
    }
    // the round caps are the same tip, not balls the width of the channel
    for (const cap of [run.capStart, run.capStart + run.capCount]) assert.ok(rk.getX(cap) * v.radius <= c.radius * (TIP_K + 0.02), `channel ${i}: a cap is a point`);
    // and it widens smoothly from the tip to its own width: monotone over the end stretch
    let last = 0;
    for (let k = 0; k <= Math.floor(run.tubular / 4); k++) { const r = rk.getX(run.tubeStart + k * (run.radial + 1)); assert.ok(r >= last - 1e-9, `channel ${i}: widens monotonically from its tip`); last = r; }
  });
});

// ── every junction (Mohammad, 20 Nov: "this junction should be smooth. I thought you smoothened every junction": a dilated vein ended in a round cap against the thin collateral it feeds) ──
import { RUN_ONS } from '../src/scene/vessels/network.ts';
import { SMOOTH } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { radiusAtU } from '../src/scene/vessels/tubes.ts';
import { bundleShare } from '../src/scene/vessels/shape.ts';
test('every vessel that carries on into another (the 2D run-on rule), collateral or not, is mated to it, has no cap at the join, and meets it at one radius', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  try {
    const endR = (id: string, end: 0 | 1): number => {
      let best = 0;
      const cs = coursesOf(NETWORK_BY_ID.get(id)!, REST).filter((c) => c.radius > 0);
      // (a varix's n strands land on one point and together make the trunk's width there, each 1/sqrt(n) of it: shape.ts bundleShare, 21 Nov; their end is read as the width they make together)
      for (const c of cs) { const len = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2]))).getLength(); best = Math.max(best, radiusAtU(c, end, len) / bundleShare(c.sewn?.[end], cs.length)); }
      return best;
    };
    assert.ok(RUN_ONS.length > 20);
    let collateralPairs = 0;
    for (const r of RUN_ONS) {
      const a = NETWORK_BY_ID.get(r.a), b = NETWORK_BY_ID.get(r.b);
      if (!a || !b || (a.tone === 'artery') !== (b.tone === 'artery')) continue;
      if (a.kind === 'collateral' && b.kind === 'collateral') continue;   // (two collaterals: both open and close by themselves, each keeps its own end)
      if (a.kind === 'collateral' || b.kind === 'collateral') collateralPairs++;
      assert.equal(SMOOTH.get(r.a)!.mate[r.ia], r.b, `${r.a} is mated to ${r.b} (its live width eases to it)`);
      assert.equal(SMOOTH.get(r.b)!.mate[r.ib], r.a, `${r.b} is mated to ${r.a}`);
      const ra = endR(r.a, r.ia), rb = endR(r.b, r.ib);
      assert.ok(Math.max(ra, rb) / Math.min(ra, rb) < 1.15, `${r.a} and ${r.b} meet at one radius, not ${(ra * 300).toFixed(1)} against ${(rb * 300).toFixed(1)}`);
      if (SMOOTH.get(r.a)!.joined[r.ia]) assert.ok(SMOOTH.get(r.b)!.joined[r.ib], `${r.a}|${r.b}: a join is capless on both sides`);
    }
    assert.ok(collateralPairs >= 1, 'the coronary vein into the varices is one');
    const lgv = SMOOTH.get('LGV_CONF')!;
    assert.equal(lgv.joined[0], true, 'the coronary vein has no round cap where the varices begin');
  } finally { setSmoothJoins(was); }
});
