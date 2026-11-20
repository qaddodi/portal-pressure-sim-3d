// The streak audit (round 3, Mohammad 20 Nov: "the streaks of blood need a lot of work... stagnant sometimes... branches of portal veins not all have chevrons or streaks"). It walks EVERY vessel tube def of the network (the feeders, the branch tubes of
// the portal and hepatic veins, included; a feeder wears its host's stream: lensId) at the default fit of a phone (390 wide) and a Mac (800 wide), against the REAL stream numbers of three presets, with the JS twins of the shader's maths, and pins what the
// audit found:
//   stagnant     the wall lane ran at 0.15 of the middle's (0.35 of the stream's mean on 3 lanes, 0.3 on 5: a crawl of a few px a second), the 1 px strips were dotted by a smoothstep edge thinner than a pixel, and a pattern moves a few tenths of a px a frame
//   missing      a streak had its own gate (rCss from 1.75, a flow gate in the wrong unit) beside the chevrons' (from 1.5): a thin branch showed one and not the other; a standing vessel (no flow at all) is the only one with none
//   pale slabs   the chevron lattice's second octave was drawn translucent (a ghost between the dark heads), now it shrinks and goes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFor } from './b3-frames.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { Streams } from '../src/scene/blood/streams.ts';
import { edgeIndex } from '../src/scene/lenses/model.ts';
import { CHEV, chevAlphaJs, chevSizeJs } from '../src/scene/blood/chevron-glsl.ts';
import { STREAK, laneSpeed, lanesForPx, streakBoxJs, streakCoverage, streakDCap, streakToneJs } from '../src/scene/blood/streak-glsl.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

const FITS: [string, number][] = [['phone', 390], ['Mac', 800]];
const px = (w: number): number => w / (2 * 1.32);   // CSS px to a scene unit at the default fit (the width is the binding side on a phone and in a Mac pane's 4:3)
const h = await frameFor('healthy');
const PRESETS = ['healthy', 'cirr-decomp', 'cirr-comp'];
const frames = new Map<string, Awaited<ReturnType<typeof frameFor>>>([['healthy', h]]);
for (const p of PRESETS.slice(1)) frames.set(p, await frameFor(p));

/** The stream texture of a preset, settled (past the 3 s mean and the reversal hold). */
function settled(preset: string): Float32Array {
  const s = new Streams(); s.setHealthy(h.healthy as never); s.onFrame(frames.get(preset)!.frame as never);
  for (let t = 0; t < 9000; t += 100) s.step(t);
  const d = Float32Array.from(s.texture.image.data as Float32Array); s.texture.dispose(); return d;
}
const lanePace = (lanes: number, k: number): number => (lanes === 1 ? 1 : laneSpeed(k, (lanes - 1) / 2));

test('every tube of the network, every preset, phone and Mac: where the flow is not none and the tube is 3 px across or more it carries filaments at the chevrons\' gate, the wall lane runs at 0.7 of the stream\'s mean or more, and the same tubes carry chevrons', () => {
  assert.equal(STREAK.MIN_R_PX, CHEV.MIN_R_PX, 'one gate: a tube shows a streak exactly where it shows a head');
  assert.match(VESSEL_FS, /smoothstep\(1\.5, 2\.1, rCss\)/, 'the dust opens at the chevrons\' gate');
  assert.match(VESSEL_FS, /smoothstep\(0\.0, 2\.0, abs\(smS\.y\)\)/);
  const report: string[] = [];
  let carrying = 0, none = 0;
  for (const preset of PRESETS) {
    const tex = settled(preset);
    for (const v of NETWORK) {
      const k = edgeIndex.get(v.lensId);
      assert.ok(k != null, `${v.id}: ${v.lensId} has a stream`);
      const vd = tex[k! * 4 + 1]!;
      for (const [name, w] of FITS) {
        const R = v.radius * px(w);
        const lanes = lanesForPx(R);
        const flows = Math.abs(vd) >= STREAK.FLOW_ON;
        if (lanes === 0) { none++; continue; }   // (under 3 px across: neither a head nor a streak)
        if (!flows) { assert.ok(Math.abs(vd) < STREAK.FLOW_ON, `${preset} ${v.id}`); continue; }
        carrying++;
        // the pattern moves at the stream's speed: px a second of the middle and the wall lanes
        const pxPerUnit = px(w) / UNITS_PER_SCENE, mean = Math.abs(vd) * pxPerUnit;
        const wall = lanes === 1 ? mean : mean * lanePace(lanes, 0), mid = lanes === 1 ? mean : mean * lanePace(lanes, (lanes - 1) / 2);
        assert.ok(wall >= 0.7 * mean - 1e-9, `${preset} ${v.id} (${name}): wall lane ${wall.toFixed(1)} px/s of a mean ${mean.toFixed(1)}`);
        assert.ok(wall >= 0.5 * mid - 1e-9, `${preset} ${v.id} (${name}): wall ${wall.toFixed(1)} against the middle's ${mid.toFixed(1)}`);
        assert.ok(streakCoverage(R, lanes) > 0.005, `${preset} ${v.id} (${name}): streaks cover ${streakCoverage(R, lanes).toFixed(3)} of the face`);
        if (name === 'phone' && preset === 'healthy') report.push(`${v.id}${v.feeder ? '*' : ''}:${lanes}L:${wall.toFixed(0)}-${mid.toFixed(0)}px/s`);
      }
    }
  }
  assert.ok(carrying > 100, `${carrying} tube-fits carry streaks`);
  assert.ok(none > 0, 'the thinnest (under 3 px) carry none, as they carry no head');
  assert.ok(report.length > 20, report.join(' '));
});

test('every moving tube has a filament on it at any moment: the lane period never runs past a short tube', () => {
  for (const v of NETWORK) {
    const lenPx = v.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0]! - v.pts[i - 1]![0]!, p[1]! - v.pts[i - 1]![1]!) : 0), 0) * px(390);
    const R = v.radius * px(390);
    if (lanesForPx(R) === 0) continue;
    const span = lenPx / R * STREAK.FIELD_AT_R;   // the tube's length in the field's units (a radius is FIELD_AT_R of them)
    const period = Math.min(STREAK.FIELD_PERIOD[0], Math.max(span, 1.3 * (STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1])));
    assert.ok(span >= period - 1e-9 || span < 1.3 * (STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1]) + 1, `${v.id}: a period of ${period.toFixed(0)} on a tube of ${span.toFixed(0)} field units`);
  }
});

test('no wagon wheel: at 60 Hz no pattern moves more than a quarter of its period a frame, whatever the flow rate; below the cap the streak distance is the chevrons\' D', () => {
  const cap = streakDCap();
  assert.ok(cap > 100 && cap < 400, `cap ${cap.toFixed(0)} display units a second`);
  // every tube at the fastest stream any preset has, at the cap, with the thinnest tube's field scale and the fastest lane
  for (const preset of PRESETS) {
    const tex = settled(preset);
    for (const v of NETWORK) {
      const k = edgeIndex.get(v.lensId)!, vd = Math.min(cap, Math.abs(tex[k * 4 + 1]!)), rFix = v.radius * UNITS_PER_SCENE;
      const sc = STREAK.FIELD_AT_R / rFix;
      const fastest = Math.max(...[1, 3, 5].map((l) => (l === 1 ? 1 : lanePace(l, (l - 1) / 2)))) * (1 + STREAK.SPEED_JITTER);
      const step = vd * sc * fastest / STREAK.FRAME_HZ;
      // (a tube thinner than SC_MAX's radius is not drawn with filaments: under 3 px across none)
      if (rFix < STREAK.FIELD_AT_R / STREAK.SC_MAX) continue;
      assert.ok(step <= STREAK.MAX_STEP * STREAK.FIELD_PERIOD[0] + 1e-9, `${preset} ${v.id}: ${step.toFixed(1)} field units a frame`);
    }
  }
  // the streams: at a flow rate far over 1 the streak distance runs at the cap, D does not
  const s = new Streams(); s.setHealthy(h.healthy as never); s.onFrame(frames.get('healthy')!.frame as never);
  for (let t = 0; t < 6000; t += 100) s.step(t);
  const k = edgeIndex.get('PV_TRUNK')!, at = () => { const d = s.texture.image.data as Float32Array; return [d[k * 4]!, d[k * 4 + 3]!]; };
  const [d0, w0] = at();
  s.step(6100, 1);
  const [d1, w1] = at();
  assert.ok(Math.abs((d1! - d0!) - (w1! - w0!)) < 1e-4, 'at the normal rate the streak distance moves as D does');
  const [d2, w2] = at();
  s.step(6200, 60);
  const [d3, w3] = at();
  assert.ok(Math.abs(w3! - w2!) <= cap * 0.1 + 1e-4, `the streak distance ran ${(w3! - w2!).toFixed(1)} in a step`);
  assert.ok(Math.abs(d3! - d2!) > Math.abs(w3! - w2!), 'D itself is not capped (the chevrons are not the streaks)');
});

test('the wall lane is never under half the middle lane (the stream\'s mean stands), on 3, 5 and 7 lanes, and the stream does not stop a lane', () => {
  assert.ok(STREAK.WALL_SPEED >= 0.5);
  for (const lanes of [3, 5, 7]) {
    const hh = (lanes - 1) / 2;
    let mean = 0;
    for (let k = -hh; k <= hh; k++) mean += laneSpeed(k, hh) / lanes;
    assert.ok(Math.abs(mean - 1) < 1e-9, `${lanes} lanes: the mean stands (${mean})`);
    assert.ok(laneSpeed(hh, hh) >= 0.5 * laneSpeed(0, hh) - 1e-9, `${lanes} lanes: wall ${laneSpeed(hh, hh).toFixed(2)} of the middle ${laneSpeed(0, hh).toFixed(2)}`);
    assert.ok(laneSpeed(hh, hh) >= 0.65, `${lanes} lanes: the wall's pace over the mean ${laneSpeed(hh, hh).toFixed(2)}`);
  }
});

test('a 1 px filament is never dotted: the area it covers is the same at every sub-pixel position and every footprint, so it neither pulses nor crawls as it moves', () => {
  for (const W of [0.85, 1, 1.1]) for (const pw of [1, 1.2, 1.41, 2]) {
    let lo = Infinity, hi = -Infinity;
    for (let off = 0; off < 1; off += 0.05) {
      let sum = 0;
      for (let row = -6; row <= 6; row++) sum += streakBoxJs((row - off) * pw, W, pw) * pw;   // (rows a footprint apart: each row's share x its footprint is the length of the strip it holds)
      lo = Math.min(lo, sum); hi = Math.max(hi, sum);
    }
    assert.ok(Math.abs(lo - W) < 1e-9 && Math.abs(hi - W) < 1e-9, `W ${W} footprint ${pw}: ${lo} to ${hi}`);
  }
  // the strip never vanishes between two pixel rows: some row holds at least half of it at any offset (for a footprint of one pixel)
  for (let off = 0; off < 1; off += 0.05) { const peak = Math.max(...[-1, 0, 1].map((r) => streakBoxJs(r - off, 1, 1))); assert.ok(peak >= 0.5 - 1e-9, `offset ${off}: peak ${peak}`); }
  assert.match(VESSEL_FS, /dust = dustField\(/, 'the tube draws the dust (its marks are capsules with a soft edge, not a 1 px filament); the lobule and sinusoid still draw the filament');
  assert.match(MICRO_FS, /streakField\(vAux, /);
});

test('the chevron lattice\'s second octave is never translucent: a head leaves by shrinking and is fully inked until the last of its keep', () => {
  for (let k = 0; k <= 1.0001; k += 0.01) {
    const a = chevAlphaJs(Math.min(1, k)), sz = chevSizeJs(Math.min(1, k));
    assert.ok(a === 0 || a === 1 || k < CHEV.ALPHA_KEEP + 1e-9, `keep ${k.toFixed(2)}: alpha ${a.toFixed(2)} is a ghost`);
    assert.ok(sz >= CHEV.SIZE_MIN - 1e-9 && sz <= 1 + 1e-9);
  }
  assert.equal(chevAlphaJs(0), 0); assert.equal(chevAlphaJs(1), 1); assert.equal(chevSizeJs(1), 1); assert.equal(chevSizeJs(0), CHEV.SIZE_MIN);
});

test('streaks are SEEN at the default fit, not only present (the eyes, 20 Nov: faint smears on the trunk and a smooth fill on the portal and hepatic branches; the audit only asked for 0.5 percent of the face): a tube 4 px of radius or more shows filaments over at least 5 percent of its face (it was 3 to 4 percent: the pre-20-Nov-07:00 numbers), and the average streak is a clear step lighter than the body', () => {
  for (let r = 4; r <= 12; r += 0.5) {
    const l = lanesForPx(r);
    assert.ok(streakCoverage(r, l) >= 0.055, `a lumen of ${r} px radius: streaks cover ${streakCoverage(r, l).toFixed(3)} of the face`);
  }
  const lit = [0.29, 0.5, 0.82], lum = (c: number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  assert.ok(lum(streakToneJs(lit, [1, 1, 1], 0.5, 0.5, 0.5)) - lum(lit) >= 0.08, 'the average streak is at least 0.08 lighter in luminance (the tone itself stays within the 1.12 to 1.8:1 the owner set)');
  assert.ok(streakToneJs(lit, [1, 1, 1], 0, 0.5, 0)[0]! > lit[0]!, 'the faintest streak is still lighter than the body');
  assert.ok(STREAK.WALL_SPEED >= 0.7, 'the wall lane keeps up with the blood: it is not a crawl beside the chevrons');
});

test('a streak\'s share of the face does not depend on the width of the tube (root cause of the branches reading as a smooth fill beside the trunk, 20 Nov: with 3 lanes from 4 to 6 px of radius the face was 8 to 9 percent streaks, with 5 lanes 15 percent, so the branches showed none where the trunk showed some)', () => {
  const at: number[] = [];
  for (let R = 3; R <= 12; R += 0.25) at.push(streakCoverage(R, lanesForPx(R)));
  const lo = Math.min(...at), hi = Math.max(...at);
  assert.ok(lo >= 0.1, `the sparsest width carries ${lo.toFixed(3)} of its face`);
  assert.ok(hi / lo <= 1.7, `the densest is ${(hi / lo).toFixed(2)} x the sparsest (${lo.toFixed(3)} to ${hi.toFixed(3)})`);
});
