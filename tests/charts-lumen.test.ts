import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, PRESETS } from '../src/engine/hales/portal/scenario.js';
import { profileAt, geomOf, kindOf, endSiteOf } from '../src/engine/hales/portal/stent-geom.js';
import { STENT_SITES as SITE_U, edgeById } from '../src/engine/hales/portal/topology.js';
import { lumenOf, lumenWords, lumenShape, clotPoints, CLOT_POINTS, createFollow, FOLLOW_GLIDE_MS, lumenNameY, lumenNumOpacity, stentCut, lumenSite, lumenLabel, lumenFacts, pictureSize, wordSize, hasStent, kindOfVessel, pctI } from '../src/ui/charts/lumen/model.ts';
import { lumenFrame, lumenViewOf } from '../src/ui/charts/lumen/frame.ts';
import { compatible } from '../src/ui/charts/morph.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const params = (patch: Record<string, unknown>) => { const p = defaultParams() as Record<string, any>; for (const [k, v] of Object.entries(patch)) p[k] = { ...p[k], ...(v as object) }; return p; };
const preset = (id: string) => { const d = PRESETS.find((x: { id: string }) => x.id === id)!; return d.apply(defaultParams()) as Record<string, any>; };

test('the open share combines clot and narrowing as the engine does, and the words are EASL 2025\'s grades', () => {
  const L = lumenOf(params({ stenosis: { PV_TRUNK: 0.3 }, thrombus: { PV_TRUNK: 0.4 } }), 'PV_TRUNK');
  assert.ok(Math.abs(L.occlusion - (1 - 0.7 * 0.6)) < 1e-12);
  assert.ok(Math.abs(L.open + L.occlusion - 1) < 1e-12);
  assert.equal(lumenWords(lumenOf(preset('pvt-acute'), 'PV_TRUNK')), 'Completely occlusive');
  assert.equal(lumenWords(lumenOf(preset('healthy'), 'PV_TRUNK')), 'Open');
  assert.equal(lumenWords({ thrombus: 0.3, stenosis: 0, occlusion: 0.3, stent: false }), 'Minimally occlusive');
  assert.equal(lumenWords({ thrombus: 0.6, stenosis: 0, occlusion: 0.6, stent: false }), 'Partially occlusive');
  assert.equal(lumenWords({ thrombus: 0, stenosis: 0.4, occlusion: 0.4, stent: true }), 'Stent narrowed');
  assert.equal(lumenOf(null, 'PV_TRUNK').occlusion, 0);
  assert.equal(lumenFacts({ thrombus: 0.3, stenosis: 0.2 }, 8), '8 mm stent · Clot 30% · narrowing 20%');
});

test('the clot outline always has the same points, stays inside the lumen, and a full clot is the whole circle', () => {
  for (const [st, th] of [[0, 0], [0, 0.02], [0, 0.3], [0.2, 0.5], [0.4, 0.9], [0, 1], [0.6, 1]] as const) {
    const g = lumenShape({ stenosis: st, thrombus: th }), pts = clotPoints(g);
    assert.equal(pts.length, 2 * CLOT_POINTS);
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i]! - 50, pts[i + 1]! - 50);
      assert.ok(d <= g.ri + 1e-6, `${st},${th}: a point is ${d.toFixed(2)} from the centre, the lumen is ${g.ri.toFixed(2)}`);
    }
  }
  const full = lumenShape({ thrombus: 1 }), pts = clotPoints(full);
  for (let i = 0; i < pts.length; i += 2) assert.ok(Math.abs(Math.hypot(pts[i]! - 50, pts[i + 1]! - 50) - full.ri) < 1e-6);
});

test('the name rises before the number appears, and they never overlap at any share', () => {
  assert.equal(lumenNameY(0), 50);
  assert.equal(lumenNumOpacity(0), 0);
  for (let o = 0; o <= 1.0001; o += 0.005) {
    const y = lumenNameY(o), op = lumenNumOpacity(o);
    if (op > 0.01) assert.ok(y <= 35 + 0.5, `at ${o.toFixed(3)} the number shows (${op.toFixed(2)}) with the name at ${y.toFixed(1)}`);
  }
});

test('a jump glides over the card time, a stream of small steps is followed straight and ends with the model, nothing overshoots', () => {
  const f = createFollow();
  f.snap(0, 0);
  assert.equal(f.goal(0, 0.8, 1000), true);
  assert.equal(f.glide, true);
  assert.equal(f.ms, FOLLOW_GLIDE_MS);
  let prev = 0;
  for (let t = 1000; t <= 1000 + FOLLOW_GLIDE_MS; t += 16) { f.at(t); assert.ok(f.b >= prev - 1e-12 && f.b <= 0.8 + 1e-12); prev = f.b; }
  f.at(1000 + FOLLOW_GLIDE_MS + 1);
  assert.equal(f.b, 0.8);
  assert.equal(f.moving, false);
  // a time-lapse: a step of 2% every 33 ms
  const s = createFollow(); s.snap(0, 0.1);
  let now = 5000, v = 0.1;
  for (let i = 0; i < 20; i++) { v += 0.02; now += 33; s.goal(0, v, now); if (i > 2) assert.equal(s.glide, false, 'a stream is not a glide'); s.at(now + 16); }
  assert.ok(s.ms <= 300);
  s.at(now + 400);
  assert.ok(Math.abs(s.b - v) < 1e-12);
  // the same value again changes nothing
  assert.equal(s.goal(0, v, now + 500), false);
});

test('a stent is cut where the slide says (or at its tightest narrowing): the end stenosis at its end, the waist mid stent, open elsewhere', () => {
  const p = params({ stenosis: { TIPS: 0.5 } });
  const kind = kindOf(edgeById('TIPS'));
  assert.ok(kind);
  const g = geomOf(p, 'TIPS', kind, null);
  const want = (site: 'proximal' | 'mid' | 'distal') => 1 - profileAt(g, 0.5, (SITE_U as Record<string, number>)[endSiteOf(p, 'TIPS')]!, (SITE_U as Record<string, number>)[site]!);
  for (const s of ['proximal', 'mid', 'distal'] as const) assert.ok(Math.abs(stentCut(p, 'TIPS', s) - want(s)) < 1e-9, s);
  assert.ok(stentCut(p, 'TIPS', 'distal') > stentCut(p, 'TIPS', 'proximal'), 'the end stenosis is at the distal end by default');
  assert.equal(lumenSite(p, 'TIPS', 'proximal'), 'proximal');
  assert.equal(lumenSite(p, 'TIPS', null), 'distal');
  assert.equal(lumenLabel('TIPS', null, 'distal'), 'Distal TIPS');
  assert.equal(lumenLabel('PV_TRUNK'), 'Portal vein');
  assert.equal(lumenLabel('PV_TRUNK', ' Main PV '), 'Main PV');
  assert.equal(stentCut(params({ stenosis: { PV_TRUNK: 0.25 } }), 'PV_TRUNK', 'mid'), 0.25);
  assert.ok(hasStent('TIPS', null) && hasStent('RHV_IVC', ['RHV_IVC']) && !hasStent('PV_TRUNK', []));
  assert.equal(kindOfVessel('RHV_IVC'), 'systemic');
  assert.equal(kindOfVessel('A_HEP'), 'artery');
  assert.equal(pictureSize(300), 176);
  assert.equal(pictureSize(160), 100);
  assert.ok(wordSize(1) === 12 && wordSize(2) === 9);
  assert.equal(pctI(0.305), 31);
});

test('every look, device and state: the picture is sound, its words are at least 12 px, and a frame pairs with the next so a state glides', () => {
  const states = [
    { vessel: 'PV_TRUNK', stenosis: 0, thrombus: 0, stent: false },
    { vessel: 'PV_TRUNK', stenosis: 0, thrombus: 0.3, stent: false },
    { vessel: 'PV_TRUNK', stenosis: 0.3, thrombus: 0.7, stent: false },
    { vessel: 'PV_TRUNK', stenosis: 0, thrombus: 1, stent: false },
    { vessel: 'TIPS', stenosis: 0.4, thrombus: 0, stent: true, site: 'distal' as const },
    { vessel: 'RHV_IVC', stenosis: 0.5, thrombus: 0, stent: true, name: 'Right HV' },
  ];
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d), frames = states.map((s) => lumenFrame(s, c));
      for (const f of frames) { judge(f, look, { onCard: false }); assert.equal(f.h, pictureSize(w)); }
      for (let i = 1; i < frames.length; i++) assert.ok(compatible(frames[i - 1]!, frames[i]!), `${look}: state ${i - 1} does not pair with ${i}`);
    }
  });
  const v = lumenViewOf(preset('pvt-acute'), 'PV_TRUNK', null);
  assert.equal(v.target.thrombus, 1);
  assert.equal(v.stent, false);
  assert.equal(lumenViewOf(preset('cirr-decomp-tips'), 'TIPS', null).stent, true);
});
