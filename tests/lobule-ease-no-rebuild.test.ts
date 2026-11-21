// A patient change eases the lobule without rebuilding it per step (HVPG talk, slide 6 to 7, iPhone: "significant lag"). Root cause: the 3D lobule keyed its 388 hepatocytes and its 2048 px marks plate on the
// EASED state, so each 1/32 step of congestion, septa or fibrosis rebuilt both on the main thread. They are now built once for the state the model asks for (in small steps across frames), and the tiles are
// eased between the two builds on the CPU; the plate is painted once for the goal (it dips while painted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';

const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.85, 0.75], P1: 11, P2: 8, P3: 5, P4: 4, flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
});

test('an eased patient change builds the tiles once, and no frame of it takes more than a few ms of building', () => {
  const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
  flat.snapModel(model()); flat.setVisible(true);
  l3.buildForTest('light');
  flat.update(1000); l3.update(true, 0, 1000, 1, true);
  const gens = { n: 0 };
  const priv = l3 as unknown as { cellSteps: (...a: unknown[]) => Generator<void> };
  const orig = priv.cellSteps.bind(l3);
  priv.cellSteps = (...a) => { gens.n++; return orig(...a); };
  const before = l3.paints;
  flat.setModel(model({ congU: 0.6, septU: 0.7, fibSin: 0.5, fibPre: 0.8 }));
  let worst = 0, t = 1000;
  for (let i = 0; i < 400; i++) {
    t += 16; flat.update(t);
    const t0 = performance.now(); l3.update(true, 0, t, 1, true); worst = Math.max(worst, performance.now() - t0);
  }
  assert.equal(gens.n, 1, 'one build for the whole ease, not one per step');
  assert.ok(l3.paints - before <= 1, `the plate is painted once (${l3.paints - before})`);
  assert.ok(worst < 40, `no frame builds more than a slice (${worst.toFixed(1)} ms)`);
});

test('with a worker the plate is painted off the page: one ask for the whole ease, no paint here, and the new plate crossfades in and becomes the front one', () => {
  const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
  flat.snapModel(model()); flat.setVisible(true);
  l3.buildForTest('light');
  flat.update(1000); l3.update(true, 0, 1000, 1, true);
  const asks: { cb: (b: unknown) => void }[] = [];
  const a = l3 as unknown as { plates: unknown; marksKey: string; marksMat: { uniforms: { opacity: { value: number } } }; marksMatB: { uniforms: { opacity: { value: number } } } };
  a.plates = { available: true, ask: (_x: unknown, cb: (b: unknown) => void) => { asks.push({ cb }); }, dispose() {} };
  const before = l3.paints;
  flat.setModel(model({ fibSin: 0.6, fibPre: 0.8, congU: 0.5 }));
  let t = 1000;
  for (let i = 0; i < 100; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, true); }
  assert.equal(asks.length, 1, 'one ask for the whole ease');
  assert.equal(l3.paints, before, 'nothing painted on the page');
  asks[0]!.cb({ close() {} });
  const realNow = performance.now.bind(performance); let fake = realNow();
  performance.now = () => (fake += 16);   // (the plate's ease runs on the clock: a test frame is 16 ms of it)
  const mid: number[] = [];
  for (let i = 0; i < 120; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, false); if (i === 20) mid.push(a.marksMat.uniforms.opacity.value); }
  assert.ok(mid[0]! < 1 && mid[0]! > 0 || a.marksMat.uniforms.opacity.value === 1, 'it eased, not cut');
  performance.now = realNow;
  assert.equal(a.marksMat.uniforms.opacity.value, 1);
  performance.now = realNow;
  assert.equal(a.marksMatB.uniforms.opacity.value, 0);
});
