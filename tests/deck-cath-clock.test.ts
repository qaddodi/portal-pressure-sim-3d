// The deck's HVPG catheter on the 2D app's one clock (hvpg-clock.js), and a procedure guided by Next, one step a press (2D presenter.js procNext / procBack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { T, legMs, ROUTE_LEN, BALLOON_IN_MS, BALLOON_OUT_MS, balloonAt, cruise, k01 } from '../src/scene/procedures/copied/hvpg-clock.js';
import { STEP_T } from '../src/ui/talk/hvpg-plan.ts';
import { makeStepClock, stepClock, aim, landed, BACK_SPEED, rateOf } from '../src/scene/procedures/step-clock.ts';
import { makeCathClock, aimCath, stepCath, poseAt, targetT, FREE_T, WEDGE_T, RESULT_T, rankOf, ARRIVE_MS } from '../src/ui/deck/cath-clock.ts';
import { procKey, stopOf, specFor, type ProcCursor } from '../src/ui/deck/procs-plan.ts';
import { tipCloseShot, closeUpOf } from '../src/ui/deck/cath-shot.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { CelScene } from '../src/scene/scene.ts';
import { OSTIUM_U } from '../src/scene/procedures/ostium.ts';

/** Run the clock to where it lands (16 ms frames); returns the first time each part moved and finished, ms from the start. */
function run(c: ReturnType<typeof makeCathClock>, watch: (t: number, ms: number) => void, cap = 60000): number {
  let ms = 0;
  while (stepCath(c, 16) && ms < cap) { ms += 16; watch(c.clk.t, ms); }
  return ms;
}

test('the step clock lands exactly on a stop, and turns round without a jump of position or of speed', () => {
  const c = makeStepClock(0);
  aim(c, 1000);
  let ms = 0;
  while (!landed(c) && ms < 5000) { stepClock(c, 16); ms += 16; }
  assert.equal(c.t, 1000);
  assert.ok(ms >= 984 && ms <= 1016, `1000 ms of the sequence takes 1000 ms forward (${ms})`);
  // turned round mid-way: position and velocity are continuous
  const d = makeStepClock(0);
  aim(d, 1000);
  for (let i = 0; i < 20; i++) stepClock(d, 16);
  const t0 = d.t, v0 = d.v;
  aim(d, 0);
  stepClock(d, 16);
  assert.ok(Math.abs(d.t - t0) < 20, 'the position moved on by a frame, not by a jump');
  assert.ok(Math.abs(d.v - v0) < 2 * 1.6 * 16 / 120 * 1.1, 'the speed slewed over a few frames, it did not flip sign at once');
  while (!landed(d)) stepClock(d, 16);
  assert.equal(d.t, 0);
  assert.equal(rateOf(makeStepClock(5)), 0);
  assert.ok(BACK_SPEED > 1);
});

test('the cath states stand where the tracing card reads its readings, and its numbers are 2D\'s own', () => {
  assert.equal(FREE_T, STEP_T.free);
  assert.equal(WEDGE_T, STEP_T.wedge);
  assert.equal(RESULT_T, STEP_T.result);
  assert.equal(targetT(null), 0);
  assert.equal(targetT('route'), T.travel1);
  // the way in is 2D's route time at its travel speed
  assert.equal(T.travel1 - T.travel0, legMs(ROUTE_LEN.hvpg));
  assert.ok(ARRIVE_MS > T.travel0 && ARRIVE_MS < T.travel1);
  assert.ok(Math.abs(poseAt(ARRIVE_MS).advance - OSTIUM_U) < 1e-3, 'the blocked vein\'s tip stands at the ostium');
  assert.ok([null, 'route', 'free', 'wedge', 'result'].every((s, i, a) => i === 0 || rankOf(s as never) > rankOf(a[i - 1] as never)));
});

test('Next from the way in to the free reading to the wedge: the route takes the 2D time, the balloon fills over BALLOON_IN_MS on easeMove, the column after it, and the trace reads the same time', () => {
  const c = makeCathClock();
  aimCath(c, 'route');
  let moved = -1;
  const ms1 = run(c, (t, ms) => { const p = poseAt(t); if (moved < 0 && p.advance > 0.002) moved = ms; });
  const arrived = ms1;
  assert.ok(Math.abs(ms1 - T.travel1) <= 20, `the catheter is in after ${T.travel1} ms (${ms1})`);
  assert.ok(moved >= T.travel0 && Math.abs(arrived - T.travel1) <= 20, `the leg runs from ${T.travel0} to ${T.travel1}, legMs(274) (${moved} to ${arrived})`);
  assert.equal(poseAt(c.clk.t).balloon, 0);
  aimCath(c, 'free');
  run(c, () => {});
  assert.equal(c.clk.t, FREE_T);
  assert.equal(poseAt(c.clk.t).balloon, 0, 'free: the balloon is down');
  // one Next more: the balloon fills over its own time and the column and the pill come after it
  aimCath(c, 'wedge');
  let up0 = -1, up1 = -1, col0 = -1, colEarly = false;
  const ms2 = run(c, (t, ms) => {
    const p = poseAt(t);
    assert.equal(p.balloon, balloonAt(t), 'the figure\'s balloon is the clock\'s balloonAt of the time the trace reads');
    if (p.column > 0 && p.balloon < 1) colEarly = true;
    if (up0 < 0 && p.balloon > 0.001) up0 = ms;
    if (up1 < 0 && p.balloon >= 1) up1 = ms;
    if (col0 < 0 && p.column > 0.001) col0 = ms;
  });
  assert.equal(c.clk.t, WEDGE_T);
  assert.ok(Math.abs(up1 - up0 - BALLOON_IN_MS) < 90, `the balloon fills over BALLOON_IN_MS (${up1 - up0})`);
  assert.ok(!colEarly && col0 > up1, 'the column fills after the balloon is up');
  assert.ok(ms2 >= WEDGE_T - FREE_T - 20, 'the plateau runs at the script\'s own pace (the trace\'s callouts follow it)');
  assert.equal(poseAt(c.clk.t).column, 1);
});

test('Back from the wedge lets the balloon down over BALLOON_OUT_MS, and a Back pressed mid-fill turns it round without a jump', () => {
  const c = makeCathClock();
  c.clk.t = WEDGE_T; c.clk.goal = WEDGE_T;
  aimCath(c, 'free');
  let inBand = 0;
  run(c, (t) => { if (t > T.inflate && t < T.wedge) inBand += 16; });
  assert.equal(poseAt(c.clk.t).balloon, 0);
  assert.ok(Math.abs(inBand - BALLOON_OUT_MS) < 60, `the balloon lets down over BALLOON_OUT_MS (${inBand})`);
  // mid-fill, turned round
  const d = makeCathClock();
  d.clk.t = FREE_T; d.clk.goal = FREE_T;
  aimCath(d, 'wedge');
  for (let i = 0; i < 50; i++) stepCath(d, 16);
  const b0 = poseAt(d.clk.t).balloon;
  assert.ok(b0 > 0 && b0 < 1);
  aimCath(d, 'free');
  stepCath(d, 16);
  assert.ok(Math.abs(poseAt(d.clk.t).balloon - b0) < 0.08, 'no jump in the balloon when it turns');
});

test('a jump of more than one step runs the quiet stretches fast, and lands on the same place', () => {
  const slow = makeCathClock(), fast = makeCathClock();
  aimCath(slow, 'result', false); aimCath(fast, 'result', true);
  const a = run(slow, () => {}), b = run(fast, () => {});
  assert.equal(slow.clk.t, RESULT_T); assert.equal(fast.clk.t, RESULT_T);
  assert.ok(b < a / 2, `a jump is quicker (${b} against ${a})`);
});

test('the route is the cruise curve: the tip does not start or stop with a jerk', () => {
  assert.equal(cruise(k01(T.travel0, T.travel0, T.travel1)), 0);
  assert.equal(poseAt(T.travel1).advance, 1);
  assert.ok(poseAt(T.travel0 + 100).advance < 0.01);
});

// ── the camera: the tip close up, the balloon in it ──
test('the free, wedge and result steps frame the tip and the balloon close up: far tighter than the wide wedge shot they used, and centred on the tip and the vein ahead', () => {
  const s = tipCloseShot('tip')!, w = SHOTS.wedge;
  assert.ok(s);
  assert.ok(s.half[0] < w.half[0] / 3 && s.half[1] < w.half[1] / 3, `half ${s.half} against ${w.half}`);
  const r3 = route3d('hvpg')!, tip = r3.point(r3.tipD(1));
  assert.ok(Math.abs(s.target[0] - tip.x) < s.half[0] && Math.abs(s.target[1] - tip.y) < s.half[1], 'the tip is inside the frame');
  // the balloon (behind the tip) and the vein ahead (where the WHVP hangs) are inside the frame too
  const R = r3.lumen(r3.route.free) * 300, back = r3.point(r3.tipD(1) - R * 4), ahead = r3.point(r3.tipD(1) + R * 6.4);
  for (const p of [back, ahead]) assert.ok(Math.abs(p.x - s.target[0]) <= s.half[0] && Math.abs(p.y - s.target[1]) <= s.half[1], 'balloon and vein ahead are in the frame');
  assert.equal(tipCloseShot('tip'), s, 'one shot kept: a step on to a slide on the same shot does not fly the camera again');
  assert.ok(tipCloseShot('ostium'));
  assert.equal(closeUpOf('route'), null);
  assert.equal(closeUpOf('wedge'), 'tip');
  assert.equal(closeUpOf('blocked'), 'ostium');
});

test('the point ahead of the HVPG tip is 2D\'s (6.4 of the vein\'s radii on), not the tip again', () => {
  const sc = new CelScene();
  sc.procs.showHvpgState(1, 1, 'wedge', 0, 1);
  const tip = new Vector3(), ahead = new Vector3();
  assert.ok(sc.procs.tipPosition(tip) && sc.procs.aheadPosition(ahead));
  const r3 = route3d('hvpg')!, R = r3.lumen(r3.route.free);
  // (the drawn vein ends a little short of 6.4 radii past the tip, so the point is held to the vein's own end; it is never the tip again)
  assert.ok(tip.distanceTo(ahead) > R * 2 && tip.distanceTo(ahead) <= R * 6.4 + 1e-6, `${tip.distanceTo(ahead)} against ${R * 6.4}`);
  sc.dispose();
});

test('the still column fills after the balloon and the WHVP pill\'s "wedged" waits for it', () => {
  const sc = new CelScene();
  sc.setCatheter({ advance: 1, balloon: 1, column: 0.2 });
  assert.ok(sc.catheter.current.balloon < 0.999, 'balloon up, column still filling: not wedged yet');
  sc.setCatheter({ advance: 1, balloon: 1, column: 1 });
  assert.ok(sc.catheter.current.balloon >= 0.999);
  sc.setCatheter({ advance: 1, balloon: 0.5 });
  assert.equal(sc.catheter.current.balloon, 0.5, 'a caller with no column keeps the balloon as it was');
  sc.dispose();
});

test('a ring on the HVPG catheter keeps drawing frames with the clock on, so it goes on pulsing', () => {
  const sc = new CelScene();
  sc.procs.keptRing = 'wedge';
  sc.procs.showHvpgState(1, 1, null, 0, 1);
  sc.procs.update(100);
  assert.equal(sc.procs.update(200), true, 'a ring asks for the next frame');
  sc.procs.keptRing = null;
  sc.procs.update(300);
  assert.equal(sc.procs.update(400), false, 'with none it stops asking');
  sc.dispose();
});

// ── a procedure guided by Next ──
const cur = (o: Partial<ProcCursor> = {}): ProcCursor => ({ phase: 'wait', run: false, at: -1, n: 4, moving: false, ...o });

test('the keys: the first Next puts the device in, each Next plays one step, the Next after the last moves on; Back takes one step back and from the first leaves the slide as it was', () => {
  assert.deepEqual(procKey(cur(), 1), { act: 'start' });
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 0 }), 1), { act: 'aim', at: 1 });
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 2 }), 1), { act: 'aim', at: 3 });
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 3, moving: true }), 1), { act: 'rush' }, 'the last step still playing: this Next plays it out, the slide stays');
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 3, moving: false }), 1), { act: 'pass' }, 'the last step played: the slide moves on');
  assert.deepEqual(procKey(cur({ phase: 'done' }), 1), { act: 'pass' });
  assert.deepEqual(procKey(cur({ phase: 'between', at: 3 }), 1), { act: 'then' });
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 2 }), -1), { act: 'aim', at: 1 });
  assert.deepEqual(procKey(cur({ phase: 'run', run: true, at: 0 }), -1), { act: 'rewind' });
  assert.deepEqual(procKey(cur(), -1), { act: 'pass' }, 'not started: Back goes back a slide');
  assert.deepEqual(procKey(cur({ phase: 'done' }), -1), { act: 'pass' }, 'played through and gone: Back goes back a slide');
  assert.deepEqual(procKey(cur({ phase: 'done', run: true, at: 4, n: 5, moving: false }), -1), { act: 'aim', at: 3 }, 'a held last frame (the glue slide\'s scope) goes back a step');
});

test('every step of every procedure has a stop of its own, in order, and the last is where the sequence ends or holds', () => {
  for (const kind of ['tips', 'brto', 'bato', 'eus', 'eusglue', 'hvpgcath', 'brtoC6', 'tipscoil']) {
    const sp = specFor(kind)!;
    assert.equal(sp.stops.length, sp.steps.length, kind);
    const stops = sp.steps.map((_, k) => stopOf(kind, k)!);
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i]! > stops[i - 1]!, `${kind} stops rise`);
    assert.ok(stops[stops.length - 1]! <= sp.T.end, kind);
  }
});

test('the layer plays a driven procedure to a stop and holds there, runs the step back, and ends rewound at the start', () => {
  const sc = new CelScene();
  const sp = specFor('brto')!, ends: string[] = [], arrived: number[] = [];
  sc.procs.drive('brto', 1000, { keep: false, onArrive: (t) => arrived.push(t), onEnd: (e) => ends.push(e.rewound ? 'rewound' : e.done ? 'done' : '?') });
  sc.procs.aimAt(sp.stops[0]!);
  let now = 1000, steps = 0;
  while (sc.procs.driven && sc.procs.update(now)) { now += 16; if (++steps > 4000) break; }
  assert.deepEqual(arrived, [sp.stops[0]], 'it came to rest at step 1\'s stop');
  assert.equal(sc.procs.driven?.t, sp.stops[0], 'and holds there');
  assert.equal(sc.procs.update(now + 16), false, 'nothing asks for frames while it stands at a stop');
  // one more step, then back past the first
  sc.procs.aimAt(sp.stops[1]!);
  for (let i = 0; i < 20; i++) sc.procs.update((now += 16));
  const mid = sc.procs.driven!.t;
  assert.ok(mid > sp.stops[0]! && mid < sp.stops[1]!, 'one Next plays toward step 2 only');
  sc.procs.aimAt(0);
  steps = 0;
  while (sc.procs.driven && steps++ < 8000) sc.procs.update((now += 16));
  assert.deepEqual(ends, ['rewound']);
  assert.equal(sc.procs.driven, null);
  sc.dispose();
});
