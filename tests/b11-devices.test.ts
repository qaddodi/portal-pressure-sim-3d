// B11 scene devices: the Doppler probe, the FibroScan probe and the endoscope with its ligator cap and EUS needle (src/scene/devices/probes/). Numbers are the 2D app's, copied by script; here: the copy is
// current (when a 2D checkout is named), the geometry keeps the 2D app's rules (the Doppler angle, the gate, the stations' order), the devices ease in and out and leave with the Circuit, and the Tests card drives them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { PROBE, awayFromProbe } from '../src/scene/devices/probes/copied/dop-probe.copied.js';
import { SCAN } from '../src/scene/devices/probes/copied/scan-probe.copied.js';
import { EUS_STATIONS } from '../src/scene/devices/probes/copied/eus-scope.copied.js';
import { dopplerPose, gateFraction, DopplerProbe } from '../src/scene/devices/probes/doppler-probe.ts';
import { fibroPlace, waveSpeed, FibroProbe } from '../src/scene/devices/probes/fibro-probe.ts';
import { scopeWay, workD, EndoScope, SCOPE_SPEED } from '../src/scene/devices/probes/scope.ts';
import { ProbeLayer } from '../src/scene/devices/probes/layer.ts';
import { useProbes } from '../src/scene/devices/probes/state.ts';
import { bindTests } from '../src/scene/devices/probes/bind-tests.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { len3 } from '../src/scene/frame2d.ts';

const deg = (r: number) => (r * 180) / Math.PI;

test('the copies of the 2D probe, scope and FibroScan files are current (run with PPS_2D_REPO set to a 2D checkout)', { skip: !process.env.PPS_2D_REPO || !existsSync(`${process.env.PPS_2D_REPO}/src/ui/dop-probe.js`) }, () => {
  execFileSync('node', ['scripts/copy-b11-devices.mjs', '--from', process.env.PPS_2D_REPO!, '--check'], { stdio: 'pipe' });
});

test('the FibroScan numbers are the 2D app\'s: tip, arc, pace, turns and the place on each organ', () => {
  assert.deepEqual(SCAN.TIP, [66, 48]); assert.equal(SCAN.SPAN, 150); assert.equal(SCAN.HALF, 0.5);
  assert.equal(SCAN.TURN.liver, 45); assert.equal(SCAN.TURN.spleen, 135);
  assert.deepEqual(SCAN.AT.liver, [0.13, 0.09]); assert.deepEqual(SCAN.AT.spleen, [0.8, 0.16]);
  // 35 px/s at 5 kPa, steeper than linear: about 280 at 25 and capped from 40
  assert.equal(Math.round(waveSpeed(5)), 35);
  assert.ok(waveSpeed(25) > 250 && waveSpeed(25) < 300, String(waveSpeed(25)));
  assert.equal(waveSpeed(60), waveSpeed(40));
  assert.equal(waveSpeed(null), waveSpeed(5));
});

test('the FibroScan probe stands on the organ\'s upper outer edge and points down into it (the liver from the left, the spleen from the right)', () => {
  const box = new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2));
  const l = fibroPlace(box, 'liver'), s = fibroPlace(box, 'spleen', { tip: new Vector3(), dir: new Vector3() });
  assert.ok(Math.abs(l.tip.x - (-1 + 2 * 0.13)) < 1e-9 && Math.abs(l.tip.y - (0.5 - 1 * 0.09)) < 1e-9);
  assert.ok(Math.abs(s.tip.x - (-1 + 2 * 0.8)) < 1e-9 && Math.abs(s.tip.y - (0.5 - 1 * 0.16)) < 1e-9);
  assert.ok(l.dir.x > 0 && l.dir.y < 0, 'the liver\'s beam goes down and to the right');
  assert.ok(s.dir.x < 0 && s.dir.y < 0, 'the spleen\'s goes down and in (to the left)');
  assert.ok(Math.abs(l.dir.length() - 1) < 1e-9);
});

test('the Doppler probe keeps the monitor\'s angle to the flow: 50 degrees where the flow comes toward it, 130 where it runs away (the hepatic veins and the IVC)', () => {
  for (const id of ['PV_TRUNK', 'PVH_R', 'SV_CONF', 'A_HEP', 'RHV_IVC', 'MHV_IVC', 'IVCS_RA']) {
    const p = dopplerPose(id, null);
    assert.ok(p, `${id} has a pose`);
    const ang = deg(Math.acos(Math.max(-1, Math.min(1, p!.s.dot(p!.flow)))));
    const want = awayFromProbe(id) ? 180 - PROBE.ANGLE : PROBE.ANGLE;
    assert.ok(Math.abs(ang - want) < 0.6, `${id}: ${ang.toFixed(1)} vs ${want}`);
    // the face stands PROBE.GAP px off the vessel's wall, along the line of sight
    const d = p!.face.distanceTo(p!.gate);
    assert.ok(Math.abs(d - len3(p!.rPx + PROBE.GAP)) < 1e-9);
    assert.ok(Math.abs(p!.s.length() - 1) < 1e-9);
  }
  assert.equal(dopplerPose('NOT_A_VESSEL', null), null);
});

test('the Doppler gate stands where 2D puts it: the vessel\'s middle, the hepatic artery four fifths along, a stent at its proximal, middle or distal third', () => {
  assert.equal(gateFraction('PV_TRUNK', null), null);
  assert.equal(gateFraction('A_HEP', null), 0.8);
  assert.ok(gateFraction('TIPS', 'proximal')! < gateFraction('TIPS', 'mid')! && gateFraction('TIPS', 'mid')! < gateFraction('TIPS', 'distal')!);
  const a = dopplerPose('TIPS', 'proximal'), b = dopplerPose('TIPS', 'distal');
  assert.ok(a && b && a.gate.distanceTo(b.gate) > 0.01, 'two thirds of a stent are two places');
});

test('the scope\'s way runs in at the top, down the esophagus and through the cardia: the band\'s place, the hepatic vein\'s station, the cardia, the portal vein\'s station, in that order', () => {
  const w = scopeWay();
  assert.ok(w.total > 400);
  assert.ok(workD('band', 'pv') < workD('eus', 'hv'), 'the lowest band is above the hepatic vein\'s station');
  assert.ok(workD('scope', 'pv') < w.cardiaD && workD('scope', 'pv') < workD('eus', 'hv') && workD('scope', 'pv') < workD('eus', 'pv'), 'the plain scope stops in the oesophagus, above the cardia (owner, 20 Nov 2026)');
  assert.equal(workD('eus', 'pv'), w.total);
  const end = w.at(w, w.total).p, st = EUS_STATIONS.pv.at;
  assert.ok(Math.hypot(end[0] - st[0], end[1] - st[1]) < 1.5, 'the route ends on the portal vein\'s station');
});

test('devices are off until the Tests card shows their instrument, ease in, and ease out when it moves on', () => {
  const layer = new ProbeLayer(createShared(), { organBox: () => new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2)), kpa: () => 8 });
  for (const p of Object.values(PALETTES).slice(0, 1)) layer.applyPalette(p);
  assert.equal(layer.active, false);
  let now = 0;
  const run = (ms: number) => { for (let t = 0; t < ms; t += 16) { now += 16; layer.update(now); } };
  run(100);
  assert.equal(layer.doppler.shown, 0); assert.equal(layer.fibro.shown, 0); assert.equal(layer.scope.d, 0);
  useProbes.getState().setDoppler({ on: true, edge: 'PV_TRUNK' });
  useProbes.getState().setFibro({ on: true, organ: 'liver' });
  useProbes.getState().setEndoscope({ on: true, mode: 'scope' });
  run(800);
  assert.equal(layer.doppler.shown, 1); assert.equal(layer.fibro.shown, 1);
  assert.ok(layer.scope.d > 0, 'the scope is on its way');
  run(4000);
  assert.ok(Math.abs(layer.scope.d - workD('scope', 'pv')) < 1e-6, 'and arrives at the cardia');
  assert.ok(layer.doppler.placed, 'the probe is placed on its vessel');
  // the Circuit takes the devices away; the card closing does too
  const upd = (away: boolean, ms: number) => { for (let t = 0; t < ms; t += 16) { now += 16; layer.update(now, away); } };
  upd(true, 4000);
  assert.equal(layer.doppler.shown, 0); assert.equal(layer.fibro.shown, 0); assert.equal(layer.scope.d, 0);
  useProbes.getState().setDoppler({ on: false }); useProbes.getState().setFibro({ on: false }); useProbes.getState().setEndoscope({ on: false });
  upd(false, 200);
  assert.equal(layer.active, false);
  layer.dispose();
});

test('a new vessel eases the probe out and in at its new place; a new organ does the same for the FibroScan probe', () => {
  const sh = createShared();
  const d = new DopplerProbe(sh), f = new FibroProbe(sh);
  const box = () => new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2));
  for (let i = 0; i < 60; i++) { d.update(16, true, 'PV_TRUNK', null); f.update(16, i * 16, true, 'liver', box, 5); }
  const first = d.placed!.gate.clone(), tip = f.placement.tip.clone();
  d.update(16, true, 'RHV_IVC', null); f.update(16, 2000, true, 'spleen', box, 5);
  f.update(16, 2016, true, 'spleen', box, 5);   // (2D's ease starts at the clock of the change: one frame on, it has begun)
  assert.ok(d.shown < 1 && d.shown > 0, 'it starts to leave, it does not jump');
  assert.ok(f.shown < 1 && f.shown > 0);
  for (let i = 0; i < 120; i++) { d.update(16, true, 'RHV_IVC', null); f.update(16, 3000 + i * 16, true, 'spleen', box, 5); }
  assert.equal(d.shown, 1); assert.equal(f.shown, 1);
  assert.ok(d.placed!.gate.distanceTo(first) > 0.05, 'the probe is on the other vein');
  assert.ok(f.placement.tip.distanceTo(tip) > 0.5, 'the FibroScan probe is on the other side of the box');
  d.dispose(); f.dispose();
});

test('the EUS scope bends to aim, fans its sector and puts the needle out, in that order, and the station changes pull it back first', () => {
  const sc = new EndoScope(createShared());
  const step = (ms: number, mode: 'scope' | 'band' | 'eus' = 'eus', station: 'pv' | 'hv' = 'pv') => { for (let t = 0; t < ms; t += 16) sc.update(16, true, mode, station); };
  step(Math.ceil((scopeWay().total / SCOPE_SPEED) * 1000) + 400);
  assert.ok(Math.abs(sc.d - scopeWay().total) < 1e-6);
  assert.ok(sc.aim > 0, 'the bend has begun');
  step(2000);
  assert.equal(sc.aim, 1); assert.equal(sc.fan > 0, true);
  step(2500);
  assert.equal(sc.fan, 1); assert.equal(sc.needle, 1);
  // the needle's end is at the target when it is fully out
  assert.ok(sc.pose.needleEnd.length() > 0);
  step(60, 'eus', 'hv');
  assert.ok(sc.needle < 1, 'a new station draws the needle in first');
  sc.dispose();
});

test('the band ligator\'s cap goes on only in the band job', () => {
  const sc = new EndoScope(createShared());
  for (let t = 0; t < 6000; t += 16) sc.update(16, true, 'band', 'pv');
  assert.equal(sc.cap, 1);
  assert.ok(Math.abs(sc.d - workD('band', 'pv')) < 1e-6);
  for (let t = 0; t < 6000; t += 16) sc.update(16, true, 'scope', 'pv');
  assert.equal(sc.cap, 0);
  sc.dispose();
});

test('the Tests card drives the devices: Doppler, FibroScan (with the exam\'s organ) and Endoscopy put theirs on the figure, and closing the card takes it off', () => {
  const off = bindTests();
  const T = useTests.getState();
  T.close();
  T.show('doppler');
  assert.equal(useProbes.getState().doppler.on, true); assert.equal(useProbes.getState().fibro.on, false);
  T.show('fibroscan'); useTests.getState().setFibro('spleen');
  assert.equal(useProbes.getState().doppler.on, false);
  assert.equal(useProbes.getState().fibro.on, true); assert.equal(useProbes.getState().fibro.organ, 'spleen');
  T.show('endoscopy');
  assert.equal(useProbes.getState().endoscope.on, true); assert.equal(useProbes.getState().fibro.on, false);
  useTests.getState().close();
  assert.equal(useProbes.getState().endoscope.on, false);
  off();
});

// ── the devices keep clear of the cards (2D stage-doppler.js, stage-scan.js), and wear their readings ──
import { basisAt, toPlate, toScreen, newBasis, type Box, type ScreenEnv } from '../src/scene/devices/probes/screen.ts';
import { scanTilt, scanBody, headCovered, scanTurnOf } from '../src/scene/devices/probes/fibro-place.ts';
import { probeCards, CARD_PAD } from '../src/scene/devices/probes/cards.ts';
import { scanText, scanTransform, scanFlips } from '../src/scene/labels/probe-labels.ts';
import { beginLabelBoxes, addLabelBox, probeAvoid } from '../src/scene/labels/probe-boxes.ts';
import { useUi } from '../src/ui/ui-store.ts';
import { BAR } from '../src/ui/layout/plan.ts';

/** A stand-in camera: the figure's plane drawn at `k` px per 2D px, centred in a stage of 1000 by 700, the cards given. */
const stageEnv = (cards: Box[] = [], k = 1.5, presenting = false): ScreenEnv => ({
  project: (p, out) => { out.x = 500 + (p.x / len3(1)) * k; out.y = 350 - (p.y / len3(1)) * k; return out; },
  size: () => ({ w: 1000, h: 700 }),
  cards: () => cards,
  presenting: () => presenting,
});
const hits = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

test('the screen map: a screen offset is a plate offset and back, and a length in px is a length in scene units', () => {
  const env = stageEnv([], 1.5), B = basisAt(env, new Vector3(0.2, -0.1, 0), newBasis());
  assert.ok(Math.abs(B.sc - 1.5 / len3(1)) < 1e-6, 'the scale is px per scene unit');
  const back = toScreen(B, ...(() => { const v = toPlate(B, 30, -12, new Vector3()); return [v.x, v.y] as [number, number]; })(), { x: 0, y: 0 });
  assert.ok(Math.abs(back.x - 30) < 1e-6 && Math.abs(back.y + 12) < 1e-6);
  assert.ok(B.d < 0, 'the screen runs down where the plate runs up');
});

test('the FibroScan probe tilts 45 degrees in the open, steeper where its body would leave the left edge, flatter under the top bar, and away from a slide\'s card', () => {
  assert.equal(scanTilt(400, 300, false, 1000, []), 45);
  assert.ok(scanTilt(60, 300, false, 1000, []) > 45 && scanTilt(60, 300, false, 1000, []) <= 80, 'steeper against the left edge');
  assert.ok(scanTilt(400, 30, false, 1000, []) < 45, 'flatter at the top');
  // the spleen is the same tilt from the right edge, its turn the other way round
  assert.equal(scanTilt(940, 300, true, 1000, []), scanTilt(60, 300, false, 1000, []));
  assert.equal(scanTurnOf(45, true), 135); assert.equal(scanTurnOf(45, false), 45);
  // a card over its default body turns it to the nearest angle that clears
  const cx = 400 - 70 * Math.cos(Math.PI / 4), cy = 300 - 70 * Math.sin(Math.PI / 4), card: Box = { x0: cx - 12, y0: cy - 12, x1: cx + 12, y1: cy + 12 };
  assert.ok(hits(scanBody(400, 300, 45), card), 'the card is across the default body');
  const d = scanTilt(400, 300, false, 1000, [card]);
  assert.ok(d !== 45 && !hits(scanBody(400, 300, d), card), `the probe turned to ${d}`);
  assert.equal(headCovered(400, 300, 45, [card]), true); assert.equal(headCovered(400, 300, 45, []), false);
});

test('the cards the devices keep off: the slide\'s boxes, the Tests card and the bars, each grown by 6 px', () => {
  const vp = useUi.getState().vp;
  const out = probeCards({ x: 100, y: 120, w: 300, h: 200 });
  const t = out.find((b) => b.x0 === 100 - CARD_PAD)!;
  assert.deepEqual(t, { x0: 94, y0: 114, x1: 406, y1: 326 });
  assert.ok(out.some((b) => b.y1 === vp.safe.top + BAR && b.x0 < 0 && b.x1 > vp.w), 'the top bar is one');
  assert.equal(probeCards(null).some((b) => b.x0 === 94), false);
});

test('the FibroScan probe on a screen: it turns, fades its head under a card (the waves stay), and its reading eases to the model\'s', () => {
  const f = new FibroProbe(createShared());
  const box = () => new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2));
  let env = stageEnv([], 1.5, true), now = 0;
  const run = (ms: number) => { for (let t = 0; t < ms; t += 16) { now += 16; f.update(16, now, true, 'liver', box, 12, env); } };
  run(1200);
  assert.equal(f.shown, 1); assert.equal(f.screenAt.headOp, 1);
  assert.ok(f.reading != null && Math.abs(f.reading - 12) < 0.5, 'the reading reached the model\'s number');
  const open = f.deg, at = { x: f.screenAt.x, y: f.screenAt.y };
  // a card over the body: the probe turns to clear it, or fades its head where nothing clears
  const q = scanBody(at.x, at.y, f.screenAt.turn);
  env = stageEnv([{ x0: q.x0 - 3, y0: q.y0 - 3, x1: q.x1 + 3, y1: q.y1 + 3 }], 1.5, true);
  run(2500);
  assert.ok(f.deg !== open || f.screenAt.headOp < 1, 'it made way');
  // a slide not presenting leaves the turn alone but still fades the head under a card
  const f2 = new FibroProbe(createShared());
  env = stageEnv([{ x0: 0, y0: 0, x1: 1000, y1: 700 }], 1.5, false);
  for (let t = 0; t < 2000; t += 16) { now += 16; f2.update(16, now, true, 'liver', box, 12, env); }
  assert.equal(f2.deg, 45); assert.ok(f2.screenAt.headOp < 0.01, 'the head is gone under a card over everything');
  f.dispose(); f2.dispose();
});

test('the Doppler probe on a screen keeps its body out from under the cards it can clear', () => {
  const d = new DopplerProbe(createShared());
  let env = stageEnv([], 1.5), now = 0;
  const run = (ms: number, edge = 'PV_TRUNK') => { for (let t = 0; t < ms; t += 16) { now += 16; d.update(16, true, edge, null, env, now); } };
  run(2500);
  assert.equal(d.shown, 1);
  const first = { ...d.bodyBox };
  assert.ok(d.gateAtScreen.x > 0 && d.gateAtScreen.y > 0, 'the gate has a place on the screen');
  // a card across where the body stood: on its next place the body is out from under it
  const card: Box = { x0: first.x0 - 4, y0: first.y0 - 4, x1: first.x1 + 4, y1: first.y1 + 4 };
  env = stageEnv([card], 1.5);
  run(4000);
  assert.ok(!hits(d.bodyBox, card) || d.stand.headOff, 'the body made way, or its head left');
  d.dispose();
});

test('the readings the devices wear: the probe\'s screen number, turned with its body and flipped where it points left (2D draws nothing on the Doppler probe)', () => {
  assert.equal(scanText(5), '5.0'); assert.equal(scanText(null), '—'); assert.equal(scanText(12.34), '12.3');
  assert.equal(scanFlips(45), false); assert.equal(scanFlips(135), true);
  assert.ok(scanTransform(100, 50, 135).includes('rotate(180deg)') && !scanTransform(100, 50, 45).includes('rotate(180deg)'));
  // nothing on screen takes a label's box away
  beginLabelBoxes(); addLabelBox(1, 2, 3, 4);
  assert.deepEqual(probeAvoid(), [{ x0: 1, y0: 2, x1: 4, y1: 6 }]);
  beginLabelBoxes(); assert.equal(probeAvoid().length, 0);
});

test('the echoendoscope follows the EUS-PPG\'s procedure frame: the way in, the port, the transducer, the bevelled needle, the hit\'s rings and the reading\'s ripples', () => {
  const sc = new EndoScope(createShared());
  const w = scopeWay(), drive = { u: 1, tgt: 0, aim: 1, fan: 1, needle: 0, flash: 0, read: 0 };
  const priv = sc as unknown as { parts_: { port: { group: { visible: boolean } }; face: { group: { visible: boolean } }; needle: { group: { visible: boolean } } }; needleBuf: { rings: { r: number }[] }; flashRings: { group: { visible: boolean } }[]; rippleRings: { group: { visible: boolean } }[] };
  let now = 0;
  const run = (n = 1) => { for (let i = 0; i < n; i++) { now += 16; sc.update(16, true, 'eus', 'pv', undefined, undefined, drive, now); } };
  run();
  assert.ok(Math.abs(sc.d - w.total) < 1e-9, 'the frame puts the scope at the portal vein\'s station at once (no pace of its own)');
  assert.ok(priv.parts_.face.group.visible, 'the transducer\'s face is on the scope');
  assert.ok(priv.parts_.port.group.visible, 'the port opens with the aim');
  assert.equal(priv.parts_.needle.group.visible, false, 'no needle until it is out');
  assert.equal(priv.flashRings[0]!.group.visible, false); assert.equal(priv.rippleRings[0]!.group.visible, false);
  // the needle out: steel to a bevelled point (the last rings narrow to a fifth of the width), its end on the line from the port
  drive.needle = 1; run();
  const rs = priv.needleBuf.rings, full = rs[0]!.r;
  assert.ok(priv.parts_.needle.group.visible);
  assert.ok(Math.abs(rs[rs.length - 1]!.r / full - 0.2) < 1e-6, `the point is a fifth: ${rs[rs.length - 1]!.r / full}`);
  assert.ok(rs[rs.length - 2]!.r < full && rs[rs.length - 2]!.r > rs[rs.length - 1]!.r, 'it narrows over the bevel');
  assert.ok(sc.pose.needleEnd.length() > 0);
  // the hit: two rings; the reading: two ripples
  drive.flash = 0.3; run();
  assert.ok(priv.flashRings.every((r) => r.group.visible));
  drive.flash = 0; drive.read = 1; run();
  assert.ok(priv.rippleRings.every((r) => r.group.visible) && priv.flashRings.every((r) => !r.group.visible));
  // the hepatic vein's station: the scope is pulled back to the cardia's, as the frame's tgt says
  drive.tgt = 1; drive.read = 2; run();
  assert.ok(Math.abs(sc.d - w.hvD) < 1e-9);
  // the frame gone: the needle, rings and ripples go with it
  now += 16; sc.update(16, true, 'eus', 'pv', undefined, undefined, null, now);
  assert.equal(sc.needle, 0); assert.equal(sc.flash, 0); assert.equal(sc.read, 0);
  sc.dispose();
});

// ── a measurement's reading cards and the names standing aside (2D proc-anim.js `labels`, `quiet`) ──
import { cardsOf, toneOfCls } from '../src/scene/labels/proc-cards.ts';
import { useLabels, type ProcCards } from '../src/scene/labels/store.ts';
import { LabelController, NO_STATE } from '../src/scene/labels/controller.ts';
import { specOf, READS } from '../src/scene/procedures/copied/proc-anim.js';

const blankCards = (): ProcCards => ({ kinds: [], sig: '', kickers: { f: '', w: '', h: '' }, tones: { f: 'free', w: 'wedge' }, text: { f: '', w: '', h: '', hv: null }, points: () => false });

test('the EUS-PPG\'s cards: PV at the portal target while the needle reads, HV after it, then the summary with their difference, in the veins\' own tones', () => {
  const spec = specOf('eus') as { T: Record<string, number>; labels(t: number, rd: unknown, f: unknown, out: unknown[]): unknown[]; markT: number[] };
  const rd = (READS as unknown as { eus: Record<string, number> }).eus, T = spec.T, out: unknown[] = [], cards = blankCards();
  rd.pv = 14.2; rd.hv = 6.1; rd.ppg = 8.1;
  assert.deepEqual(cardsOf(spec.labels(T.pvRead0! - 10, rd, null, out) as never, cards).kinds, [], 'nothing before the needle reads');
  let r = cardsOf(spec.labels(T.pvRead0! + 50, rd, null, out) as never, cards);
  assert.deepEqual(r.kinds, ['w']); assert.equal(cards.kickers.w, 'PV'); assert.equal(cards.tones.w, 'pv');
  r = cardsOf(spec.labels(T.hvRead0! + 50, rd, null, out) as never, cards);
  assert.deepEqual(r.kinds, ['w', 'f']); assert.equal(cards.kickers.f, 'HV'); assert.equal(cards.tones.f, 'free');
  r = cardsOf(spec.labels(spec.markT[3]! + 50, rd, null, out) as never, cards);
  assert.deepEqual(r.kinds, ['s']);
  assert.equal(cards.kickers.h, 'EUS-PPG'); assert.equal(cards.text.h, cards.text.h.trim()); assert.ok(Math.abs((cards.text.hv ?? NaN) - 8.1) < 1e-9, 'the result stands as the difference');
  assert.ok(cards.text.w.includes('14') && cards.text.f.includes('6'), 'the rows carry the readings');
  // the names and tones are part of the card's signature: a change of them is a new solve
  const a = cardsOf(spec.labels(T.pvRead0! + 50, rd, null, out) as never, cards).sig;
  assert.notEqual(a, r.sig);
  assert.equal(toneOfCls('result danger', 'free'), 'danger'); assert.equal(toneOfCls('ivc', 'free'), 'ivc'); assert.equal(toneOfCls(undefined, 'wedge'), 'wedge');
});

test('the IR pressures\' cards stand at the tip: the IVC, then the portal vein, then the gradient in its band', () => {
  const iv = specOf('irivc') as { T: Record<string, number>; labels(t: number, rd: unknown, f: unknown, out: unknown[]): unknown[] };
  const pv = specOf('irpv') as { T: Record<string, number>; labels(t: number, rd: unknown, f: unknown, out: unknown[]): unknown[] };
  const r = READS as unknown as Record<string, Record<string, number>>, out: unknown[] = [], cards = blankCards();
  r.irivc!.iv = 9; r.irpv!.pv = 21; r.irpv!.iv = 9; r.irpv!.ppg = 12;
  assert.deepEqual(cardsOf(iv.labels(iv.T.read0! + 20, r.irivc, { metrics: { ivc: 9 } }, out) as never, cards).kinds, ['f']);
  assert.equal(cards.kickers.f, 'IVC'); assert.equal(cards.tones.f, 'ivc');
  assert.deepEqual(cardsOf(pv.labels(pv.T.read0! + 20, r.irpv, { metrics: { pv: 21 } }, out) as never, cards).kinds, ['w']);
  assert.equal(cards.kickers.w, 'PORTAL VEIN');
  assert.deepEqual(cardsOf(pv.labels(pv.T.res0! + 20, r.irpv, null, out) as never, cards).kinds, ['f']);
  assert.equal(cards.kickers.f, 'PPG'); assert.ok(['ok', 'caution', 'danger'].includes(cards.tones.f), 'the gradient takes its band\'s colour');
});

test('quiet: the figure\'s names stand aside while a measurement plays, and a procedure\'s cards replace the catheter\'s', () => {
  const ctl = new LabelController({ now: () => 0, project: (_p: unknown, out: { x: number; y: number }) => out, cameraMoving: () => false, free: () => ({ x0: 0, y0: 0, x1: 800, y1: 600 }), view: () => ({ x0: 0, y0: 56, x1: 800, y1: 600 }), blockers: () => [],
    measure: (t: string, s: number) => t.length * s * 0.55, vp: () => ({ w: 800, h: 600, safe: { top: 0, bottom: 0, left: 0, right: 0 } }), words: () => null, reversed: () => false, pressure: () => 10, reading: () => 10, hidden: () => false, cathere: () => 0 } as unknown as ConstructorParameters<typeof LabelController>[0]);
  ctl.setState({ ...NO_STATE, named: new Set(['LHV']), quiet: false });
  const some = ctl.active().length;
  ctl.setState({ ...NO_STATE, named: new Set(['LHV']), quiet: true });
  assert.ok(some > 0 && ctl.active().length === 0, 'quiet takes the names away (they fade, 2D cathHid)');
  const pc = blankCards(); pc.text.f = '5.0'; pc.text.w = '9.0';
  ctl.setState({ ...NO_STATE, proc: pc });
  assert.equal(ctl.cathText(), pc.text, 'the cards print the procedure\'s own words');
  assert.equal(useLabels.getState().quiet, false);
});

test('a step\'s callouts become the figure\'s own mark cards, under ids of their own, and go away again', async () => {
  const { markCards, setProcMarks } = await import('../src/scene/labels/proc-marks.ts');
  const { useFigure } = await import('../src/scene/labels/store.ts');
  const c = markCards([{ edges: ['PV_TRUNK'], label: '1 Needle in', kind: 'treat', num: '1', word: 'Needle in' }, { edges: [], label: 'nowhere' }]);
  assert.equal(c.length, 1); assert.equal(c[0]!.kind, 'mark'); assert.equal(c[0]!.tone, 'treat'); assert.deepEqual(c[0]!.anchor, { edge: 'PV_TRUNK' });
  useFigure.getState().set({ cards: [{ id: 'slide:1', kind: 'mark', text: 'Clot', tone: 'block', anchor: { edge: 'PV_TRUNK' } }] });
  setProcMarks([{ edges: ['PV_TRUNK'], label: '2 Stent', kind: 'treat' }]);
  assert.deepEqual(useFigure.getState().cards.map((x) => x.id), ['slide:1', 'proc:0']);
  setProcMarks([]);
  assert.deepEqual(useFigure.getState().cards.map((x) => x.id), ['slide:1'], 'the slide\'s own card stays');
  useFigure.getState().set({ cards: [] });
});
