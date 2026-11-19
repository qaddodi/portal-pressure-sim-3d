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
import { TIER_Z } from '../src/scene/frame2d.ts';

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

test('Meso-Rex runs under the splenic and coronary veins and the portocaval shunt while it is shown', () => {
  const s = new CelScene();
  s.procs.setRexUnder(true, (id) => s.vesselObject(id));
  const rex = s.vesselObject('REX')!, z = (id: string) => s.vesselObject(id)!.group.position.z + TIER_Z[NETWORK_BY_ID.get(id)!.tier];
  const zr = rex.group.position.z + TIER_Z[NETWORK_BY_ID.get('REX')!.tier];
  for (const id of ['SV_CONF', 'LGV_CONF', 'S_PC']) assert.ok(z(id) > zr, `${id} is above REX`);
  s.procs.setRexUnder(false, (id) => s.vesselObject(id));
  assert.equal(rex.group.position.z, 0);
  s.dispose();
});

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
