// The tamponade rework (22 Nov 2026, the variceal-bleed audit area C: items 2, 3, 9a): the tube follows the PROCEDURE's clock (the "Tube in" step draws the tube, the balloon fills and is drawn up in step 2),
// the gastric balloon is glass that lies along the cardia / EG junction as it is drawn up, the tube is light and fine-marked, and the bleeding jet never runs through a seated balloon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { gasShape, clearance } from '../src/scene/procedures/copied/balloon-gas.js';
import { sectionsOf, tamponadeAt } from '../src/scene/devices/balloons/tamponade-shape.ts';
import { INSTRUMENT_SPECS } from '../src/scene/procedures/instrument-specs.ts';
import { SEAT_STOPS_JET } from '../src/scene/disease/bleed.ts';

const SPEC = INSTRUMENT_SPECS.tamponade!;

test('the tube and balloon on the procedure clock: the tube in by the first stop, the balloon full by the model\'s change, held after', () => {
  const [s0] = SPEC.stops, ap = SPEC.T.apply;
  assert.deepEqual(tamponadeAt(0), { adv: 0, gas: 0 });
  assert.equal(tamponadeAt(s0! / 2).adv, 0.5);
  assert.deepEqual(tamponadeAt(s0!), { adv: 1, gas: 0 }, 'step 1 ends with the tube in and nothing inflated');
  assert.ok(tamponadeAt((s0! + ap) / 2).gas > 0.4 && tamponadeAt((s0! + ap) / 2).gas < 0.6);
  assert.deepEqual(tamponadeAt(ap), { adv: 1, gas: 1 }, 'the balloon is full and drawn up when the model seals');
  assert.deepEqual(tamponadeAt(SPEC.stops[1]!), { adv: 1, gas: 1 }, 'held at the stop');
});

test('a driven tamponade run draws the tube in step 1 although the model has no balloon yet, and follows the clock back', () => {
  const sc = new CelScene(), t = sc.procs.tamponade;
  sc.procs.syncTamponade({ balloonGas: false }, true);
  sc.procs.drive('tamponade', 0);
  sc.procs.aimAt(SPEC.stops[0]!);
  let now = 0, sawMid = false;
  for (let i = 0; i < 400 && (sc.procs.driven?.moving ?? false); i++) {
    sc.procs.update((now += 16));
    if (t.state.adv > 0.2 && t.state.adv < 0.8) sawMid = true;
  }
  for (let i = 0; i < 5; i++) sc.procs.update((now += 16));   // (the device reads the run's clock one frame behind; the frame that lands asks for the next)
  assert.ok(sawMid, 'the tube slides in with the clock');
  assert.equal(t.state.adv, 1); assert.equal(t.state.gas, 0);
  assert.equal(t.tube.group.visible, true, 'step 1 shows the tube');
  assert.equal(t.gas.wanted, false, 'and no balloon');
  sc.procs.aimAt(SPEC.stops[1]!);
  for (let i = 0; i < 600; i++) sc.procs.update((now += 16));
  assert.equal(t.state.gas, 1); assert.ok(t.seat > 0.99, 'drawn up against the cardia');
  // Back to step 1: the balloon goes down with the clock, the tube stays
  sc.procs.aimAt(SPEC.stops[0]!);
  for (let i = 0; i < 600; i++) sc.procs.update((now += 16));
  assert.equal(t.state.gas, 0); assert.equal(t.state.adv, 1);
  // the run is over: the params say again (no model balloon: the tube comes out)
  sc.procs.stop();
  for (let i = 0; i < 400; i++) sc.procs.update((now += 16));
  assert.equal(t.following, false);
  assert.equal(t.state.adv, 0);
  sc.dispose();
});

test('the balloon lies along the cardia / EG junction when drawn up: its rings come from the outline pressed on the wall, inside the wall', () => {
  for (const [k, q] of [[1, 1], [1, 0.5], [1, 0], [0.5, 0.2]] as const) {
    const g = gasShape(k, q, 40) as unknown as { outline: [number, number][]; raw: [number, number][]; p0: [number, number]; dir: [number, number] };
    const sec = sectionsOf(g.outline, g.p0, g.dir, 64, 0.8), nx = -g.dir[1], ny = g.dir[0];
    for (const s of sec) for (const sg of [-1, 1]) {
      const pt: [number, number] = [g.p0[0] + g.dir[0] * s.a + nx * (s.c + sg * s.r), g.p0[1] + g.dir[1] * s.a + ny * (s.c + sg * s.r)];
      assert.ok(clearance(pt) >= 0, `k ${k} q ${q}: a ring edge is through the stomach's wall (${clearance(pt).toFixed(2)})`);
    }
  }
  // drawn up, the shoulder is wider than the free pear's, and off the tube's line (it spreads across the junction); let go, it is the free pear
  const up = gasShape(1, 1, 40) as unknown as { outline: [number, number][]; raw: [number, number][]; p0: [number, number]; dir: [number, number] };
  const a = sectionsOf(up.outline, up.p0, up.dir, 64, 0.8), b = sectionsOf(up.raw, up.p0, up.dir, 64, 0.8);
  const gain = Math.max(...a.map((s, i) => s.r - b[i]!.r)), shift = Math.max(...a.map((s) => Math.abs(s.c)));
  assert.ok(gain > 1.5 && shift > 3, `pressed shoulder gains ${gain.toFixed(1)} and shifts ${shift.toFixed(1)}`);
  const free = gasShape(0.5, 0, 40) as unknown as typeof up;
  const f = sectionsOf(free.outline, free.p0, free.dir, 64, 0.8), fr = sectionsOf(free.raw, free.p0, free.dir, 64, 0.8);
  assert.ok(Math.max(...f.map((s, i) => Math.abs(s.r - fr[i]!.r))) < 0.3, 'a balloon clear of the wall is the free pear');
});

test('the balloons are glass (a faint body, a firm rim) and the tube is pale with fine marks', () => {
  const sc = new CelScene(), t = sc.procs.tamponade;
  sc.procs.syncTamponade({ balloonGas: true, balloonEso: true }, true);
  for (let i = 0; i < 60; i++) sc.procs.update(i * 16);
  for (const b of [t.gas, t.eso]) {
    assert.ok((b.toon.uniforms.rimFill!.value as number) > 0, 'glass: firmer toward the rim');
    assert.ok((b.toon.uniforms.alpha!.value as number) <= 0.45, `translucent (${b.toon.uniforms.alpha!.value})`);
    assert.ok((b.ink.uniforms.rimOnly!.value as number) > 0, 'its outline is the rim only');
  }
  assert.ok((t.tube.toon.uniforms.stripeP!.value as number) > 0, 'fine cm marks on the tube');
  sc.dispose();
});

test('a seated balloon stops the jet (it drains, easing) and a balloon let go lets it run again', () => {
  const sc = new CelScene(), b = sc.disease.bleed;
  const on = { active: true, site: 'VAR' as const, rate: 90, total: 400 };
  for (let i = 0; i < 100; i++) b.set(on, 0.016);
  assert.equal(b.group.visible, true);
  b.seat = SEAT_STOPS_JET + 0.1;
  b.set(on, 0.016); assert.equal(b.group.visible, true, 'it drains, it does not pop');
  for (let i = 0; i < 600; i++) b.set(on, 0.016);
  assert.equal(b.group.visible, false, 'the jet never runs through a seated balloon');
  b.seat = 0;
  for (let i = 0; i < 60; i++) b.set(on, 0.016);
  assert.equal(b.group.visible, true, 'let go, it runs again');
  sc.dispose();
});
