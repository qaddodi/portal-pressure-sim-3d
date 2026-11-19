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
  assert.ok(workD('eus', 'hv') <= workD('scope', 'pv') + 1e-6 && workD('scope', 'pv') < workD('eus', 'pv'));
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
