// Tilt parallax (docs/approved/tilt-parallax.md, 28 Nov 2026): on a phone or tablet the figure turns the OPPOSITE way to the device, as if it stayed where it is behind the glass.
// Node only: the camera rig, the quaternion reading and a fake window; the picks are 1a (every body view, slides too), 2a (iOS asks on the first tap), 3a (3a, since made stronger: 5 degrees by 3.5 for the device).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { fullRoom } from '../src/scene/camera/room.ts';
import { installTilt, TURN_HOLD_MS } from '../src/scene/camera/tilt-input.ts';
import { DEVICE_CAP_DEG, FRAMING_TILT_DEG, DEVICE_BASE_TAU, DEVICE_DEAD, DEVICE_KNEE, DEVICE_RANGE, DeviceBase, DEVICE_PITCH_MAX, DEVICE_YAW_MAX, deviceQuat, deviceUnit, screenTurn, turnBetween, wakeStep } from '../src/scene/camera/tilt.ts';

const deg = (r: number) => (r * 180) / Math.PI;
type Q = readonly [number, number, number, number];
const axisQuat = (x: number, y: number, z: number, angleDeg: number): Q => { const h = (angleDeg * Math.PI) / 360, s = Math.sin(h); return [x * s, y * s, z * s, Math.cos(h)]; };
const mul = (a: Q, b: Q): Q => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
/** The screen's x and y axes in device coordinates when the screen is turned `angle`, the way screenTurn means it. */
const screenAxes = (angle: number) => { const a = (angle * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return { x: [c, -s] as const, y: [s, c] as const }; };

const turnOf = (b: DeviceBase, q: Q, angle: number) => { const d = b.readQuat(q, 16); return screenTurn(d.rx, d.ry, angle); };
const rigAt = (gate: CameraRig['tiltGate']) => {
  const rig = new CameraRig('title', fullRoom(800, 600), false);
  rig.resize(800, 600); rig.goTo('title', fullRoom(800, 600), 0); rig.tiltGate = gate; rig.update(0);
  return rig;
};
const settle = (rig: CameraRig, from = 16) => { let now = from; while (rig.update(now) && now < from + 20000) now += 16; return now; };
const open = { on: () => true, locked: () => false };
const frontAndBack = (rig: CameraRig) => {
  const t = rig.pose.shot.target;
  return { front: rig.project(new Vector3(t[0], t[1], t[2] + 0.3)), back: rig.project(new Vector3(t[0], t[1], t[2] - 0.3)) };
};

test('the device turns the figure 1:1 with its own turn (a window, owner 28 Nov) up to the cap, and the pointer keeps 3.5 and 2.5', () => {
  assert.ok(Math.abs(deg(DEVICE_YAW_MAX) - DEVICE_CAP_DEG) < 1e-9 && Math.abs(deg(DEVICE_PITCH_MAX) - DEVICE_CAP_DEG) < 1e-9);
});

test('direction: the figure holds still against the turn of the device, on each of the four screen turns and for a phone held upright or flat', () => {
  for (const held of [[30, 80, 5], [0, 45, -3], [200, 88, 10]] as [number, number, number][]) {
    for (const angle of [0, 90, 180, 270]) {
      const ax = screenAxes(angle), q0 = deviceQuat(...held);
      const rest = rigAt(open), rf = frontAndBack(rest);
      // the right edge goes away from the viewer by 8 degrees: the screen's y axis, turned positive
      let b = new DeviceBase(); b.readQuat(q0, 0);
      let t = turnOf(b, mul(q0, axisQuat(ax.y[0], ax.y[1], 0, 8)), angle);
      assert.ok(Math.abs(t.right - 8) < 0.05 && Math.abs(t.top) < 0.05, `held ${held} turn ${angle}: ${JSON.stringify(t)}`);
      let rig = rigAt(open); rig.tilt.set(deviceUnit(t.top, t.right), 'device'); settle(rig);
      let p = frontAndBack(rig);
      assert.ok(p.front.x < rf.front.x - 0.5 && p.back.x > rf.back.x + 0.5, `right edge away, held ${held} turn ${angle}: the near side moves toward the near (left) edge, the far side the other way: ${p.front.x - rf.front.x} ${p.back.x - rf.back.x}`);
      assert.ok(Math.abs(p.front.y - rf.front.y) < 0.01);
      // the top edge comes toward the viewer by 8 degrees: the screen's x axis, turned positive
      b = new DeviceBase(); b.readQuat(q0, 0);
      t = turnOf(b, mul(q0, axisQuat(ax.x[0], ax.x[1], 0, 8)), angle);
      assert.ok(Math.abs(t.top - 8) < 0.05 && Math.abs(t.right) < 0.05, `held ${held} turn ${angle}: ${JSON.stringify(t)}`);
      rig = rigAt(open); rig.tilt.set(deviceUnit(t.top, t.right), 'device'); settle(rig);
      p = frontAndBack(rig);
      assert.ok(p.front.y < rf.front.y - 0.5 && p.back.y > rf.back.y + 0.5, `top toward the viewer, held ${held} turn ${angle}: the near side rises, the far side drops: ${p.front.y - rf.front.y} ${p.back.y - rf.back.y}`);
      assert.ok(Math.abs(p.front.x - rf.front.x) < 0.01);
      // the opposite turns give the opposite moves
      rig = rigAt(open); rig.tilt.set(deviceUnit(-t.top, -t.right), 'device'); settle(rig);
      assert.ok(frontAndBack(rig).front.y > rf.front.y + 0.5);
    }
  }
});

test('the figure turns by exactly the device\'s own turn past the dead zone, up to the cap and never more', () => {
  const rig = rigAt(open); rig.tilt.set(deviceUnit(-90, 90), 'device'); settle(rig);
  assert.ok(Math.abs(rig.tilt.yaw - DEVICE_YAW_MAX) < 1e-9 && Math.abs(rig.tilt.pitch - DEVICE_PITCH_MAX) < 1e-9, `${rig.tilt.yaw} ${rig.tilt.pitch}`);
  assert.deepEqual(deviceUnit(0, DEVICE_DEAD * 0.9), { x: 0, y: 0 });
  assert.equal(deviceUnit(0, DEVICE_RANGE + DEVICE_DEAD).x, -1);
  const soft = deviceUnit(0, DEVICE_DEAD + 0.01).x;   // (no jump at the edge of the dead zone)
  assert.ok(soft < 0 && soft > -0.01);
});

test('the neutral pose: a held tilt is read at first and then fades away for good; a phone resting at any angle is straight', () => {
  const q0 = deviceQuat(40, 70, 2), b = new DeviceBase();
  assert.deepEqual(b.readQuat(q0, 0), { rx: 0, ry: 0 });
  const tilted = mul(q0, axisQuat(1, 0, 0, 8));
  assert.ok(Math.abs(b.readQuat(tilted, 16).rx - 8) < 0.05);
  let last = 8;
  for (let t = 1000; t <= 6 * DEVICE_BASE_TAU; t += 1000) { const r = b.readQuat(tilted, t).rx; assert.ok(r <= last + 1e-9); last = r; }
  assert.ok(last < 0.1, `settled ${last}`);
  b.reset();
  assert.deepEqual(b.readQuat(tilted, 99999), { rx: 0, ry: 0 });
});

test('near upright the reading is continuous: readings 0.5 degrees apart through beta 90, with alpha and gamma trading places, are 0.5 degrees apart', () => {
  let prev: Q | null = null, worst = 0;
  for (let beta = 85; beta <= 95; beta += 0.5) {
    // (the same physical turn through the Euler singularity: alpha and gamma swing as beta passes 90)
    const wobble = beta < 90 ? 0 : 37;
    const q = deviceQuat(wobble * 0 + 10, beta, 4);
    if (prev) { const d = turnBetween(prev, q); worst = Math.max(worst, Math.hypot(d.rx, d.ry)); }
    prev = q;
  }
  assert.ok(worst < 0.6, `largest step ${worst}`);
  assert.ok(turnBetween(deviceQuat(10, 90, 4), deviceQuat(10, 90.5, 4)).rx > 0.4);
});

// ---- the listeners, with a fake window ----------------------------------------------------------------------------------------------------

class Fake {
  private l = new Map<string, Set<(e: never) => void>>();
  addEventListener(t: string, f: (e: never) => void) { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)!).add(f); }
  removeEventListener(t: string, f: (e: never) => void) { this.l.get(t)?.delete(f); }
  count(t: string) { return this.l.get(t)?.size ?? 0; }
  fire(t: string, e: object = {}) { for (const f of [...(this.l.get(t) ?? [])]) f({ timeStamp: 0, ...e } as never); }
}
function fakeWindow(opts: { ios?: 'granted' | 'denied' | 'throw'; angle?: number } = {}) {
  const win = new Fake() as Fake & Record<string, unknown>;
  const asks: number[] = [];
  const doc = Object.assign(new Fake(), { hidden: false, documentElement: new Fake() });
  win.document = doc;
  win.screen = { orientation: Object.assign(new Fake(), { angle: opts.angle ?? 0 }) };
  win.performance = { now: () => clock.now };
  if (opts.ios) win.DeviceOrientationEvent = { requestPermission: () => { asks.push(clock.now); return opts.ios === 'throw' ? Promise.reject(Object.assign(new Error('gesture'), { name: 'NotAllowedError' })) : Promise.resolve(opts.ios); } };
  else win.DeviceOrientationEvent = {};
  return { win, asks, doc };
}
const clock = { now: 0 };
const envOf = (rig: CameraRig, o: { on?: boolean; reduced?: boolean } = {}) => {
  const wakes: string[] = [];
  return { wakes, env: { rig, wake: (t: string) => { wakes.push(t); }, on: () => o.on ?? true, reduced: () => o.reduced ?? false, onSwitch: () => () => undefined } };
};
const tick = () => new Promise<void>((r) => setImmediate(r));

test('iOS permission: never asked on load, asked inside the first touch tap, once, and a refusal adds no listener (pick 2a)', async () => {
  const rig = rigAt(open);
  for (const answer of ['granted', 'denied'] as const) {
    const { win, asks } = fakeWindow({ ios: answer });
    const { env } = envOf(rig);
    const off = installTilt(env, win as unknown as Window);
    assert.equal(asks.length, 0, 'not on load');
    assert.equal(win.count('deviceorientation'), 0);
    win.fire('click', { pointerType: 'mouse' });
    assert.equal(asks.length, 0, 'a mouse click does not ask');
    win.fire('pointerup', { pointerType: 'touch' });
    win.fire('click', { pointerType: 'touch' });
    win.fire('pointerup', { pointerType: 'touch' });
    assert.equal(asks.length, 1, 'asked once');
    await tick();
    assert.equal(win.count('deviceorientation'), answer === 'granted' ? 1 : 0);
    win.fire('pointerup', { pointerType: 'touch' });
    assert.equal(asks.length, 1, 'not asked again');
    off();
  }
});

test('iOS permission: not asked with the switch off or with Reduce Motion on', async () => {
  for (const o of [{ on: false }, { reduced: true }]) {
    const { win, asks } = fakeWindow({ ios: 'granted' });
    const off = installTilt(envOf(rigAt(open), o).env, win as unknown as Window);
    win.fire('pointerup', { pointerType: 'touch' }); win.fire('click', { pointerType: 'touch' });
    assert.equal(asks.length, 0);
    off();
  }
});

test('iOS permission: a refusal because the call was outside a gesture is tried again at the next tap, not given up on', async () => {
  const { win, asks } = fakeWindow({ ios: 'throw' });
  const off = installTilt(envOf(rigAt(open)).env, win as unknown as Window);
  win.fire('pointerup', { pointerType: 'touch' }); await tick();
  win.fire('click', { pointerType: 'touch' }); await tick();
  assert.equal(asks.length, 2);
  off();
});

/** One reading of the device held in `q0` and turned by `top` and `right` degrees about its own axes, at time `ms`, as the browser would send it (Euler angles). */
function reading(win: Fake, alpha: number, beta: number, gamma: number, ms: number) { clock.now = ms; win.fire('deviceorientation', { alpha, beta, gamma, timeStamp: ms }); }

test('frames: a hand\'s tremor (0.6 degrees, 60 Hz, 10 s) wakes the clock no more than the first reading; a 10 degree tilt, a hold and the way back wake it while the figure moves and settles, then it stops', () => {
  const rig = rigAt(open), { env, wakes } = envOf(rig);
  const { win } = fakeWindow();
  const off = installTilt(env, win as unknown as Window);
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 1.2;
  let ms = 1000;
  const [a, b, g] = [20, 62, 3];
  for (let i = 0; i < 600; i++, ms += 1000 / 60) reading(win, a, b + rnd(), g + rnd(), ms);
  assert.ok(wakes.length <= 1, `tremor woke the clock ${wakes.length} times`);
  const n0 = wakes.length;
  // tilt by 10 degrees over half a second, hold, and come back over half a second
  let woken = 0, lastWake = 0;
  for (let i = 0; i < 720; i++, ms += 1000 / 60) {
    const k = i < 30 ? i / 30 : i < 150 ? 1 : i < 180 ? 1 - (i - 150) / 30 : 0;
    const before = wakes.length;
    reading(win, a, b + 10 * k + rnd(), g + rnd(), ms);
    if (wakes.length > before) { woken++; lastWake = i; }
  }
  assert.ok(woken > 0 && woken < 400 && wakes.length > n0, `woken ${woken} readings of 720`);
  assert.ok(lastWake < 480, `the last wake was at reading ${lastWake}`);
  off();
});

test('rotating the screen holds the tilt square until it settles, then takes the held pose again', () => {
  const rig = rigAt(open), { env } = envOf(rig);
  const { win } = fakeWindow();
  const off = installTilt(env, win as unknown as Window);
  for (let i = 0; i < 60; i++) reading(win, 20, 60 + (i > 30 ? 12 : 0), 3, 1000 + i * 16);
  assert.ok(rig.tilt.unit && rig.tilt.unit.y !== 0, 'tilted');
  clock.now = 3000; win.fire('resize');
  reading(win, 20, 100, 40, 3000 + TURN_HOLD_MS - 50);   // (the swing during the turn)
  assert.equal(rig.tilt.unit, null, 'square while the screen turns');
  reading(win, 20, 100, 40, 3000 + TURN_HOLD_MS + 20);   // (the first reading after the hold is the new held pose)
  assert.deepEqual(rig.tilt.unit, { x: 0, y: 0 });
  off();
});

test('locks: a finger, the catheter chase and a view other than the body bring the device tilt to square; a slide\'s camera move and a talk do not (the pointer is off in a talk)', () => {
  let locked = false, talk = false;
  const gate = { on: () => true, locked: () => locked, pointerLocked: () => talk };
  // a talk: the device keeps leaning, the pointer does not
  let rig = rigAt(gate); rig.tilt.set({ x: -1, y: -1 }, 'device'); talk = true; settle(rig);
  assert.ok(Math.abs(rig.tilt.yaw) > 0.05);
  rig = rigAt(gate); rig.tilt.set({ x: -1, y: -1 }, 'pointer'); settle(rig, 16);
  assert.equal(rig.tilt.yaw, 0, 'the Mac\'s pointer never moves a slide');
  talk = false;
  // the finger down (the gesture controller), or another view
  rig = rigAt(gate); rig.tilt.set({ x: -1, y: -1 }, 'device'); settle(rig);
  locked = true; settle(rig, 30000);
  assert.equal(rig.tilt.yaw, 0); locked = false;
  // the catheter chase in the picture
  rig = rigAt(gate); rig.tilt.set({ x: -1, y: -1 }, 'device'); settle(rig);
  assert.ok(rig.tilt.yaw !== 0);
  rig.setChase({ yaw: 0, pitch: 0, dist: 3, fov: 20, target: [0, 0, 0] }); settle(rig, 30000);
  assert.equal(rig.tilt.yaw, 0, 'no tilt while measuring');
  rig.setChase(null); settle(rig, 60000);
  assert.ok(rig.tilt.yaw !== 0, 'and back when the chase has left');
});

test('the wake step is half a pixel of the figure\'s largest move, and the Stage no longer locks the tilt for a talk', () => {
  assert.ok(wakeStep(390, 844) > wakeStep(1440, 900) - 1e-9 && wakeStep(1440, 900) >= 0.01 && wakeStep(390, 844) <= 0.06);
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  const gate = stage.match(/rig\.tiltGate = \{[^\n]*\};/)![0];
  assert.ok(/locked: \(\) => [^,}]*/.test(gate) && !/locked: \(\) => [^,]*talkOn/.test(gate) && /pointerLocked: \(\) => talkOn\(\)/.test(gate), gate);
});

test('worked example, portrait and both landscapes: tipping the screen\'s top edge away raises the camera so he sees more of the figure\'s top, and tipping its right edge away moves the camera right so he sees more of its right side (owner, 28 Nov: "Turn it round")', () => {
  for (const angle of [0, 90, 270]) {
    const ax = screenAxes(angle), q0 = deviceQuat(15, 65, 2), rest = rigAt(open).camera.position.clone();
    const b = new DeviceBase(); b.readQuat(q0, 0);
    // the top edge goes away by 8 degrees: the screen's x axis turned the negative way
    const t = turnOf(b, mul(q0, axisQuat(ax.x[0], ax.x[1], 0, -8)), angle);
    assert.ok(t.top < -7.9, `screen turn ${angle}: top ${t.top}`);
    const rig = rigAt(open); rig.tilt.set(deviceUnit(t.top, t.right), 'device'); settle(rig);
    assert.ok(rig.camera.position.y > rest.y + 0.01 && Math.abs(rig.camera.position.x - rest.x) < 1e-6, `screen turn ${angle}: the camera rises`);
    // the right edge goes away by 8 degrees
    const b2 = new DeviceBase(); b2.readQuat(q0, 0);
    const r = turnOf(b2, mul(q0, axisQuat(ax.y[0], ax.y[1], 0, 8)), angle);
    const rig2 = rigAt(open); rig2.tilt.set(deviceUnit(r.top, r.right), 'device'); settle(rig2);
    assert.ok(rig2.camera.position.x > rest.x + 0.01 && Math.abs(rig2.camera.position.y - rest.y) < 1e-6, `screen turn ${angle}: the camera moves right`);
  }
});

test('the cap is 7.5 degrees both ways (owner, 28 Nov: "Just cap it at 7.5 degree both ways") and the slides are framed for exactly that', () => {
  assert.equal(DEVICE_CAP_DEG, 7.5);
  assert.equal(FRAMING_TILT_DEG, DEVICE_CAP_DEG);
});

// ── 28 Nov, the iPhone review (owner's pick 2: "Also settle back to square"): the stop never holds the figure, the stop is cushioned, a rolled phone reads
// the right axes, and the figure eases back to square once the phone is still. Each rule is checked on both axes and on the four turns of the screen.
const FRAME = 1000 / 60;
/** How far the figure answers a reading (degrees, signed as the device's own turn: top and right), as the listener computes it without its filter. */
const figureOf = (b: DeviceBase, q: Q, ms: number, angle: number) => {
  const d = b.readQuat(q, ms), s = screenTurn(d.rx, d.ry, angle), u = deviceUnit(s.top, s.right);
  return { top: -u.y * DEVICE_CAP_DEG, right: -u.x * DEVICE_CAP_DEG };
};
/** The two tilt axes of the screen and the four turns, with the device held three ways. */
const CASES = [0, 90, 180, 270].flatMap((angle) => (['top', 'right'] as const).flatMap((axis) =>
  ([[30, 80, 5], [0, 45, -3], [200, 5, 10]] as [number, number, number][]).map((held) => ({ angle, axis, held }))));
const about = (c: (typeof CASES)[number], degs: number): Q => {
  const ax = screenAxes(c.angle), v = c.axis === 'top' ? ax.x : ax.y;
  return axisQuat(v[0], v[1], 0, degs);
};

test('the cushion: 1:1 until one degree short of the cap, then a smooth slowing that meets the cap with no speed left; never a step', () => {
  const f = (a: number) => -deviceUnit(0, a).x * DEVICE_CAP_DEG;
  for (let a = DEVICE_DEAD; a <= DEVICE_DEAD + DEVICE_CAP_DEG - DEVICE_KNEE; a += 0.25) assert.ok(Math.abs(f(a) - (a - DEVICE_DEAD)) < 1e-9, `1:1 at ${a}`);
  assert.equal(DEVICE_RANGE, DEVICE_CAP_DEG + DEVICE_DEAD + DEVICE_KNEE);
  assert.ok(Math.abs(f(DEVICE_RANGE) - DEVICE_CAP_DEG) < 1e-9 && f(DEVICE_RANGE + 20) === DEVICE_CAP_DEG);
  let last = f(0), lastSlope = 0;
  for (let a = 0.01; a <= DEVICE_RANGE + 1; a += 0.01) {
    const v = f(a), slope = (v - last) / 0.01;
    assert.ok(slope >= -1e-9 && slope <= 1 + 1e-9, `slope ${slope} at ${a}`);
    // the slope itself never jumps but at the dead zone's edge (the soft dead zone of the sheet)
    if (a > DEVICE_DEAD + 0.02) assert.ok(Math.abs(slope - lastSlope) < 0.011, `the slope jumps at ${a}: ${lastSlope} to ${slope}`);
    last = v; lastSlope = slope;
  }
  assert.ok(lastSlope < 1e-9, 'no speed left at the cap');
  assert.equal(f(-5), -f(5));
});

test('the stop never holds the figure: after a change of grip of 30 degrees, turning back moves it from the first degree', () => {
  for (const c of CASES) {
    const q0 = deviceQuat(...c.held), b = new DeviceBase();
    b.readQuat(q0, 0);
    let ms = 0, fig = { top: 0, right: 0 };
    for (let i = 1; i <= 60; i++) { ms += FRAME; fig = figureOf(b, mul(q0, about(c, i / 2)), ms, c.angle); }
    assert.ok(Math.abs(fig[c.axis] - DEVICE_CAP_DEG) < 1e-6, `${JSON.stringify(c)}: at the cap, ${fig[c.axis]}`);
    const back1 = figureOf(b, mul(q0, about(c, 29)), ms + 1, c.angle)[c.axis], back2 = figureOf(b, mul(q0, about(c, 28)), ms + 2, c.angle)[c.axis];
    assert.ok(back1 < DEVICE_CAP_DEG - 0.2 && back2 < DEVICE_CAP_DEG - 0.9, `${JSON.stringify(c)}: one degree back ${back1}, two ${back2}`);
  }
});

test('settle to square: a held tilt stays for a second, then eases back; within half a degree of square 4 s after the hand stops, and nothing jumps', () => {
  for (const c of CASES) for (const size of [7, 30]) {
    const q0 = deviceQuat(...c.held), b = new DeviceBase();
    b.readQuat(q0, 0);
    let ms = 0, fig = 0, last = 0, at1s = 0, at4s = NaN, biggest = 0;
    const move = 400;
    for (let i = 1; ms < move + 6000; i++) {
      ms = i * FRAME;
      fig = figureOf(b, mul(q0, about(c, size * Math.min(1, ms / move))), ms, c.angle)[c.axis];
      if (ms > move) biggest = Math.max(biggest, Math.abs(fig - last));
      last = fig;
      if (ms <= move + 1000) at1s = fig;
      if (Number.isNaN(at4s) && ms >= move + 4000) at4s = fig;
    }
    const start = Math.min(size - DEVICE_DEAD, DEVICE_CAP_DEG);
    assert.ok(at1s > start * 0.9, `${JSON.stringify(c)} ${size}: held for a second, ${at1s} of ${start}`);
    assert.ok(Math.abs(at4s) < 0.5, `${JSON.stringify(c)} ${size}: ${at4s} degrees 4 s after the hand stopped`);
    assert.ok(fig === 0, `${JSON.stringify(c)} ${size}: square in the end, ${fig}`);
    // the return eases: under 0.12 degrees in any one frame (7 degrees a second at its quickest, from the full range)
    assert.ok(biggest < 0.12, `${JSON.stringify(c)} ${size}: the biggest step of the return was ${biggest} degrees`);
  }
});

test('settle to square waits for a still hand: a rocking phone keeps its full swing, and a trembling or noisy hand still settles', () => {
  for (const c of CASES) for (const hz of [0.2, 0.5, 1]) {
    const q0 = deviceQuat(...c.held), b = new DeviceBase();
    b.readQuat(q0, 0);
    let lo = 0, hi = 0;
    for (let i = 1; i * FRAME < 20000; i++) {
      const ms = i * FRAME, f = figureOf(b, mul(q0, about(c, 5 * Math.sin((2 * Math.PI * hz * ms) / 1000))), ms, c.angle)[c.axis];
      if (ms > 20000 - 1000 / hz) { lo = Math.min(lo, f); hi = Math.max(hi, f); }
    }
    assert.ok(hi > 3.8 && lo < -3.8, `${JSON.stringify(c)} at ${hz} Hz: the figure swings ${lo} to ${hi} (4 each way with no settle)`);
  }
  let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 1.2;
  for (const c of CASES) {
    const q0 = deviceQuat(...c.held), b = new DeviceBase();
    b.readQuat(q0, 0);
    let f = 0;
    for (let i = 1; i * FRAME < 6000; i++) {
      const ms = i * FRAME, wobble = 0.15 * Math.sin((2 * Math.PI * 9 * ms) / 1000) + 0.4 * Math.sin((2 * Math.PI * 0.3 * ms) / 1000) + rnd() * 0.5;
      f = figureOf(b, mul(q0, about(c, 5 * Math.min(1, ms / 300) + wobble)), ms, c.angle)[c.axis];
    }
    assert.ok(Math.abs(f) < 0.5, `${JSON.stringify(c)}: a trembling hand settles, ${f}`);
  }
});

test('a phone rolled about its screen (rotation lock, lying on the side) reads each tilt on its own axis, at any roll', () => {
  for (const held of [[30, 80, 5], [0, 45, -3], [200, 5, 10]] as [number, number, number][]) for (const roll of [20, 45, 90, 135, 180, -90]) {
    const q0 = deviceQuat(...held), rolled = mul(q0, axisQuat(0, 0, 1, roll)), b = new DeviceBase();
    b.readQuat(q0, 0);
    const still = b.readQuat(rolled, FRAME);
    assert.ok(Math.abs(still.rx) < 1e-6 && Math.abs(still.ry) < 1e-6, `held ${held} roll ${roll}: a roll is no tilt`);
    const d = b.readQuat(mul(rolled, axisQuat(1, 0, 0, 5)), 2 * FRAME);
    assert.ok(Math.abs(d.rx - 5) < 0.01 && Math.abs(d.ry) < 0.01, `held ${held} roll ${roll}: ${JSON.stringify(d)}`);
    const b2 = new DeviceBase();
    b2.readQuat(q0, 0); b2.readQuat(rolled, FRAME);
    const e = b2.readQuat(mul(rolled, axisQuat(0, 1, 0, -5)), 2 * FRAME);
    assert.ok(Math.abs(e.ry + 5) < 0.01 && Math.abs(e.rx) < 0.01, `held ${held} roll ${roll}: ${JSON.stringify(e)}`);
  }
});
