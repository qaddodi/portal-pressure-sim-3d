// A view the camera only passes through never comes into focus (Mohammad, 26 Nov 2026: "going from anatomy to sinusoid, the lobule view should NOT come into focus and stay blurred until we get
// to the sinusoid view; same coming out"). Root cause: the dive's whole-screen blur (post-dof.ts diveBlur) and the field's softness (camera/dive.ts fieldSoft) were functions of the camera's
// distance alone, so they let go at the lobule's framing on every move that crossed it, landing there or not; the sinusoid's own focus pull only began further in. The move's two ends now
// decide which views it only passes through (camera/dive.ts passedThrough, every pair of views), and over those the blur and the softness are held until the far view's own focus takes over,
// both ways, the real scene stepped in node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passedThrough, type DiveView } from '../src/scene/camera/dive.ts';
import { diveBlur, DOF_DIVE_PEAK, DOF_PASS_PEAK } from '../src/scene/post-dof.ts';
import { DIVE_IN, DIVE_OUT } from '../src/scene/parts/shared.ts';
import type { Vector3 } from 'three';

const VIEWS: DiveView[] = ['body', 'circuit', 'lobule', 'sinusoid'];

test('every pair of views: only Anatomy or Circuit <-> Sinusoid passes a view (the lobule), both ways', () => {
  for (const a of VIEWS) for (const b of VIEWS) {
    const outside = (v: DiveView) => v === 'body' || v === 'circuit';
    const want = (outside(a) && b === 'sinusoid') || (a === 'sinusoid' && outside(b)) ? ['lobule'] : [];
    assert.deepEqual(passedThrough(a, b), want, `${a} -> ${b}`);
  }
});

test('held, the blur stays at its peak from where the body is gone all the way in; not held, it lets go at the lobule as before', () => {
  const rest = 0.009, gone = Math.max(DIVE_IN, 2 * rest);
  for (let i = 0; i <= 200; i++) {
    const d = 0.0005 * Math.pow(gone / 0.0005, i / 200);
    assert.ok(Math.abs(diveBlur(d, rest, gone, DIVE_OUT, 1) - DOF_PASS_PEAK) < 1e-12, `held at ${d}`);
  }
  assert.equal(diveBlur(rest, rest, gone, DIVE_OUT, 0), 0, 'a move that lands on the lobule: sharp there');
  assert.equal(diveBlur(DIVE_OUT, rest, gone, DIVE_OUT, 1), 0, 'the body whole: sharp, held or not');
  assert.ok(Math.abs(diveBlur(rest, rest, gone, DIVE_OUT, 0.5) - (DOF_DIVE_PEAK + 0.5 * (DOF_PASS_PEAK - DOF_DIVE_PEAK)) / 2) < 1e-12, 'a hold easing in or out is a blend, never a step');
  assert.ok(DOF_PASS_PEAK > DOF_DIVE_PEAK * 1.5, 'over a lobule only passed through the blur is clearly stronger than the landing dive\'s (Mohammad, 27 Nov)');
});

type Scene = {
  resize(w: number, h: number): void; setView(v: string, now: number): void; goTo(shot: unknown, room: unknown, now: number, ms?: number): void; update(now: number): boolean;
  buildMicroIdle: (u?: boolean) => void; microStep(): boolean; diveReady: { step(now: number): void }; passHold: { step(now: number): void; value: number };
  focusNow(): { band: number; whole: number }; micro: { sinus: { focusOpen: number } }; dive: { visible: boolean }; lobule: { field: { softNow: number } };
  rig: { camera: { position: Vector3 } }; livePoint: Vector3; lobuleRest(): number;
};
interface Frame { k: number; open: number; lobule: boolean; soft: number; d: number }
const FRAME = 1000 / 60;
/** What the frame blurs over the whole screen: the band draws the stronger of the two at its uniform level (render.ts), and the uniform pass the dive's own blur when the band is off. */
const read = (s: Scene): Frame => {
  const f = s.focusNow();
  return { k: f.band > 0 ? Math.max(f.band, f.whole) : f.whole, open: f.band > 0 ? s.micro.sinus.focusOpen : 0, lobule: s.dive.visible, soft: s.lobule.field.softNow,
    d: s.rig.camera.position.distanceTo(s.livePoint) };
};

async function fly(size: [number, number], moves: [string, number, number?][]): Promise<{ s: Scene; runs: Frame[][] }> {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { clock } = await import('../src/clock/frame.ts');
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { shortSide } = await import('../src/scene/sinusoid/portrait.ts');
  const s = new CelScene() as unknown as Scene;
  s.resize(size[0], size[1]);
  const room = { x: 0, y: 0, w: size[0], h: size[1] }, portrait = size[0] < size[1] * 0.95;
  const shot = (v: string) => v === 'body' ? 'play' : v === 'sinusoid' ? sinusoidShot(portrait, shortSide(portrait, room)) : lobuleShot('lobule');
  s.buildMicroIdle = () => {};
  while (!s.microStep()) { /* the micro views built and primed, as the slot does before any dive */ }
  let now = clock.now() + 1000;
  const runs: Frame[][] = [];
  for (const [view, ms, cut] of moves) {
    s.setView(view, now); s.goTo(shot(view), room, now, ms);
    const frames: Frame[] = [];
    // (`cut`: the move is turned after that many ms, by the next entry, mid-flight)
    for (let t = 0; t < (cut ?? ms + 600); t += FRAME) { now += FRAME; s.update(now); s.diveReady.step(now); s.passHold.step(now); frames.push(read(s)); }
    runs.push(frames);
  }
  return { s, runs };
}

/** From where the body is gone until the sinusoid's own band begins to open, the lobule (whenever drawn) is never in focus: the blur stays at its peak and the neighbours stay soft. */
function assertHeld(name: string, frames: Frame[]): void {
  let held = 0;
  for (const [i, f] of frames.entries()) {
    if (f.open > 1e-3) continue;   // (the sinusoid's band is opening: the sinusoid coming into focus, the lobule standing aside under it)
    if (f.d > DIVE_IN) continue;   // (out where the body is drawn: the dive blur's own rise and fall)
    assert.ok(f.k >= DOF_PASS_PEAK - 1e-6, `${name}, frame ${i}: the blur fell to ${f.k.toFixed(3)} with the camera ${f.d.toFixed(4)} from the place dived to`);
    if (f.lobule) assert.ok(f.soft > 0.999, `${name}, frame ${i}: the lobule's neighbours resolved (soft ${f.soft.toFixed(3)})`);
    held++;
  }
  assert.ok(held > 10, `${name}: the camera passed the lobule (${held} frames)`);
}
/** The biggest step a frame of the blur: the dive's own rise as the body dissolves takes about 7 frames to its peak (0.06 a frame at the steepest); a step is anything sharper than 5. */
const MAX_STEP = DOF_PASS_PEAK / 5;
function assertSmooth(name: string, frames: Frame[], start: number): void {
  let prev = start;
  for (const [i, f] of frames.entries()) { assert.ok(Math.abs(f.k - prev) <= MAX_STEP, `${name}, frame ${i}: the blur stepped ${prev.toFixed(3)} to ${f.k.toFixed(3)}`); prev = f.k; }
}

test('Anatomy -> Sinusoid and back, on a Mac and a phone: the lobule is passed in one blur, and nothing steps', async () => {
  const { DIVE_BODY_MS, DIVE_SINUSOID_MS } = await import('../src/scene/camera/dive.ts');
  const ms = DIVE_BODY_MS + DIVE_SINUSOID_MS;
  for (const size of [[1440, 900], [390, 844]] as [number, number][]) {
    const { runs: [settle, inn, out] } = await fly(size, [['body', 0], ['sinusoid', ms], ['body', ms]]);
    const tag = `${size[0]}x${size[1]}`;
    assertHeld(`${tag} in`, inn!);
    assertHeld(`${tag} out`, [...out!].reverse());
    assertSmooth(`${tag} in`, inn!, settle!.at(-1)!.k);
    assertSmooth(`${tag} out`, out!, inn!.at(-1)!.k);
    assert.equal(out!.at(-1)!.k, 0, `${tag}: back on the body, sharp`);
  }
});

test('a move that lands on the lobule still brings it into focus, and the lobule <-> sinusoid move is as it was', async () => {
  const { DIVE_BODY_MS, DIVE_SINUSOID_MS } = await import('../src/scene/camera/dive.ts');
  const { s, runs: [, inn, deeper, back] } = await fly([1440, 900], [['body', 0], ['lobule', DIVE_BODY_MS], ['sinusoid', DIVE_SINUSOID_MS], ['lobule', DIVE_SINUSOID_MS]]);
  assert.equal(inn!.at(-1)!.k, 0, 'landed on the lobule: sharp');
  assert.ok(inn!.at(-1)!.soft < 1e-3, 'its neighbours resolved');
  assert.equal(s.passHold.value, 0);
  assert.equal(back!.at(-1)!.k, 0, 'back on the lobule: sharp');
  for (const f of [...deeper!, ...back!]) if (f.open === 0 && f.k > 0) assert.ok(f.k <= DOF_DIVE_PEAK + 1e-9, 'only the sinusoid\'s own focus pull, no held blur');
});

test('a move turned mid-flight never steps its blur: Anatomy -> Sinusoid turned to the lobule, and Anatomy -> Lobule turned to the sinusoid', async () => {
  const { DIVE_BODY_MS, DIVE_SINUSOID_MS } = await import('../src/scene/camera/dive.ts');
  const ms = DIVE_BODY_MS + DIVE_SINUSOID_MS;
  {
    const { runs: [settle, a, b] } = await fly([1440, 900], [['body', 0], ['sinusoid', ms, 0.75 * ms], ['lobule', DIVE_SINUSOID_MS]]);
    assertSmooth('turned to the lobule', [...a!, ...b!], settle!.at(-1)!.k);
    assert.equal(b!.at(-1)!.k, 0, 'landed on the lobule: sharp');
  }
  {
    const { runs: [settle, a, b] } = await fly([1440, 900], [['body', 0], ['lobule', DIVE_BODY_MS, 0.6 * DIVE_BODY_MS], ['sinusoid', ms]]);
    assertSmooth('turned to the sinusoid', [...a!, ...b!], settle!.at(-1)!.k);
    assertHeld('turned to the sinusoid', b!);
  }
});
