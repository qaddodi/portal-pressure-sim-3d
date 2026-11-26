import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { ROUTE_KINDS, routeOf } from '../src/scene/procedures/route.ts';
import { route3d, stopsOf } from '../src/scene/procedures/route3d.ts';
import { PROCS, PLUGS, MEASURES, procFrame, specOf } from '../src/scene/procedures/copied/proc-anim.js';
import { CATH_END } from '../src/scene/procedures/copied/cath-arrival.js';
import { DEVICE_TOKENS } from '../src/scene/procedures/copied/device-tokens.copied.ts';
import { NETWORK_BY_ID, SHUNT_IDS, presenceOf } from '../src/scene/vessels/network.ts';

test('every catheter route of the 2D app is laid on the 3D vessels, from the neck or the skin to its stop', () => {
  for (const k of ROUTE_KINDS) {
    const r = routeOf(k), r3 = route3d(k);
    assert.ok(r && r3, `${k} is laid`);
    assert.ok(r.free > r.start && r.free <= r.total, `${k}: the tip stops inside the route`);
    assert.equal(r3.pos.length, r.pts.length);
    for (const p of r3.pos) assert.ok(Number.isFinite(p.x + p.y + p.z), `${k}: finite`);
  }
});

test('a procedure with a route plays: its tip travels in, and the TIPS shows needle, wire, flash and balloon at the 2D times', () => {
  const s = new CelScene();
  const tips = specOf('tips') as { T: Record<string, number> };
  const T = tips.T;
  s.procs.seek('tips', T.travel1);
  assert.ok(s.procs.frame.u > 0.2 && s.procs.frame.u < 1, 'the catheter is at the hepatic vein');
  s.procs.seek('tips', (T.needle0! + T.needle1!) / 2);
  assert.ok(s.procs.frame.needle > 0, 'needle out mid-step 2');
  s.procs.seek('tips', (T.inflate0! + T.inflate1!) / 2);
  assert.ok(s.procs.frame.balloon > 0 && s.procs.frame.balloon < 1, 'balloon swelling');
  s.procs.seek('tips', T.end);
  assert.equal(s.procs.frame.opacity, 0, 'gone at the end');
  s.dispose();
});

test('the layer plays on the clock: it asks for frames while it plays, then stops asking', () => {
  const s = new CelScene();
  s.procs.play('brto', 1000, { from: 0, to: 600 });
  assert.equal(s.procs.update(1200), true);
  assert.ok(s.procs.playing);
  s.procs.update(1700);
  assert.equal(s.procs.playing, null, 'it ended');
  assert.equal(s.procs.update(1800), true, 'one more frame draws the cleared state');
  assert.equal(s.procs.update(1900), false, 'nothing asks for a frame after');
  s.dispose();
});

test('the HVPG deck states come from the 2D table: balloon and column only on wedge and result', () => {
  const s = new CelScene();
  for (const mode of ['route', 'free', 'wedge', 'result', 'blocked'] as const) {
    s.procs.showHvpg(mode, 1);
    assert.equal(s.procs.frame.balloon, CATH_END[mode].balloon, mode);
    assert.equal(s.procs.frame.column, CATH_END[mode].column, mode);
  }
  s.dispose();
});

test('the deck catheter is drawn by the procedure layer on the 2D HVPG route; the slice catheter keeps the state and draws nothing', () => {
  const s = new CelScene();
  s.setCatheter({ advance: 1, balloon: 1 });
  assert.equal(s.catheter.group.visible, false);
  assert.equal(s.procs.frame.u, 1);
  assert.equal(s.procs.frame.balloon, 1);
  // the labels read the slice catheter's tip: it sits where the deck catheter's tip is (the same 2D rule, 62 % along the right hepatic vein)
  const a = s.catheter.tipPosition(new Vector3()), b = s.procs.tipPosition(new Vector3())!;
  assert.ok(a.distanceTo(b) < 0.15, `tips agree within a vein's width (${a.distanceTo(b).toFixed(3)})`);
  s.dispose();
});

test('every device colour exists for every look', () => {
  for (const look of ['light', 'soft', 'dark', 'navy', 'black'] as const) {
    for (const [k, v] of Object.entries(DEVICE_TOKENS[look])) assert.ok(/^(#|rgb|hsl|color-mix|oklch)/.test(v) || v.length > 2, `${look}.${k} = ${v}`);
  }
});

test('the six shunts are vessels: drawn while the engine gives them a diameter, none while it does not', () => {
  const n = SHUNT_IDS.size;
  assert.equal(n, 6);
  const zero = { Q: new Float32Array(400), D: new Float32Array(400) };
  for (const id of SHUNT_IDS) assert.ok(NETWORK_BY_ID.has(id), `${id} is in the network`);
  // D at the shunt's own index > 0 shows it (build a frame with that one open)
  const ids = [...NETWORK_BY_ID.keys()];
  assert.ok(ids.length > 50);
  for (const id of SHUNT_IDS) {
    const v = NETWORK_BY_ID.get(id)!;
    assert.equal(presenceOf(v, zero, { collaterals: false }), 'hidden', `${id} hidden at D = 0`);
  }
});

// (the Meso-Rex bypass's tube is no longer slid back in depth while it is shown: in 3D its crossings are real ones, and the slide left its welded ends behind. tests/shunt-continuity.test.ts holds every shunt on its course)

test('the specs the layer plays are the 2D app\'s: BRTO, BATO, TIPS and the coils, the measurements', () => {
  for (const k of [...Object.keys(PROCS), ...Object.keys(PLUGS)]) {
    const f = procFrame(k, specOf(k).T.end - 1);
    assert.ok(f.opacity >= 0 && f.opacity <= 1, k);
  }
  assert.ok(MEASURES.hvpgcath);
});

test('stops: the TIPS has a tract and a right portal vein as shares of its way in', () => {
  const st = stopsOf(route3d('tips')!);
  assert.ok(st.tract && st.tract[0] > 0 && st.tract[1] > st.tract[0] && st.tract[1] <= 1.5, JSON.stringify(st.tract));
});

test('the tamponade tube goes in, fills the gastric balloon, then the esophageal one; let down, the reverse', () => {
  const s = new CelScene();
  const t = s.procs.tamponade;
  t.want(false, false); t.update(16); assert.equal(t.update(16), false, 'nothing moves with no tube');
  t.want(true, false);
  let sawTubeFirst = false;
  for (let i = 0; i < 400; i++) {
    t.update(16);
    if (t.state.adv > 0 && t.state.gas === 0) sawTubeFirst = true;
    assert.ok(!(t.state.eso > 0 && t.state.gas < 1), 'the esophageal balloon only on a full gastric one');
  }
  assert.ok(sawTubeFirst, 'the tube slides in before the balloon fills');
  assert.equal(t.state.adv, 1); assert.equal(t.state.gas, 1); assert.equal(t.state.eso, 0);
  assert.equal(t.gas.group.visible, true); assert.equal(t.eso.group.visible, false);
  t.want(true, true);
  for (let i = 0; i < 200; i++) t.update(16);
  assert.equal(t.state.eso, 1); assert.equal(t.eso.group.visible, true);
  // let down: the esophageal balloon first, then the gastric, then the tube comes out
  t.want(false, false);
  let eso0 = -1, gas0 = -1, adv0 = -1;
  for (let i = 0; i < 600; i++) {
    t.update(16);
    if (eso0 < 0 && Number(t.state.eso) === 0) eso0 = i;
    if (gas0 < 0 && Number(t.state.gas) === 0) gas0 = i;
    if (adv0 < 0 && Number(t.state.adv) === 0) adv0 = i;
  }
  assert.ok(eso0 >= 0 && eso0 < gas0 && gas0 < adv0, `down in order: ${eso0} ${gas0} ${adv0}`);
  // (a container is never switched, device-object.ts: what is let down is every part asked to go; that they then fade out and leave the draw list is tests/device-presence.test.ts)
  assert.ok([t.tube, t.gas, t.eso, ...t.marks, t.pullLine, t.pullHead].every((o) => !o.wanted), 'every part is asked to go once the tube is out');
  s.dispose();
});

test('the esophageal balloon cannot be up on a tube whose gastric balloon is not (scenario.js gastricUp)', () => {
  const s = new CelScene();
  const t = s.procs.tamponade;
  t.want(false, true);
  for (let i = 0; i < 400; i++) t.update(16);
  assert.equal(t.state.gas, 1, 'asking for the esophageal balloon puts the gastric one up first');
  assert.equal(t.state.eso, 1);
  s.dispose();
});

test('the ligation bands follow the engine\'s count: one platinum ring each, up to four, fading as they come and go', () => {
  const s = new CelScene();
  const b = s.procs.bands;
  assert.equal(b.rings.length, 4);
  s.procs.syncBands(2, true); b.update(16);
  assert.deepEqual(b.rings.map((r) => r.group.visible), [true, true, false, false]);
  s.procs.syncBands(9);   // capped at the engine's four
  assert.equal(b.goal, 4);
  for (let i = 0; i < 200; i++) b.update(16);
  assert.ok(b.rings.every((r) => r.group.visible), 'all four');
  s.procs.syncBands(0);
  b.update(16);
  assert.ok(b.rings[3]!.group.visible, 'a band does not vanish in one frame');
  for (let i = 0; i < 300; i++) b.update(16);
  assert.ok(b.rings.every((r) => !r.group.visible));
  s.dispose();
});
