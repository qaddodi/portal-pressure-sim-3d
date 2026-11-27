// The lobule out to the anatomy is ONE move whatever the patient does meanwhile (Mohammad, 27 Nov, the Sites deck, Next from the lobule to the next slide's case card: "the zoom is so glitchy and
// laggy and doesn't follow the normal lobule to anatomy zoom, it pans somewhere else"). Root cause: a case card's patient loads as the camera goes, so the ascites' water came in the middle of the dive
// out and parts/camera.ts followWhole (keep the whole-figure Fit on what is drawn) started a second move from the middle of the first: a new 1.5 s from where the camera stood, to a new landing.
// The fit now follows only from rest. Every screen shape and every moment the water can come: the dive out is the same path frame for frame, then the fit follows once, a glide.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import { wholeShot } from '../src/scene/camera/whole.ts';
import type { Shot } from '../src/scene/camera/shots.ts';
import type { Room } from '../src/scene/camera/room.ts';

type S = {
  resize(w: number, h: number): void; update(t: number): boolean; dispose(): void; microStep(): boolean; setView(v: string, now?: number): void;
  goTo(shot: unknown, room: Room, now: number, ms?: number): void; disease: object; moving: boolean;
  rig: { isMoving: boolean; camera: { position: Vector3 }; pose: { shot: Shot }; goTo: (...a: unknown[]) => void };
};
const SCREENS = [
  { name: 'Mac', vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, thumb: false },
  { name: 'iPhone', vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, thumb: true },
  { name: 'iPad', vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, thumb: true },
] as const;
const DIVE_MS = 1500, WATER_ML = 4000;

let shared: S | null = null, ml = 0, t = 0;
after(() => shared?.dispose());
async function scene(): Promise<S> {
  if (shared) return shared;
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene() as unknown as S;
  Object.defineProperty(s.disease, 'fluidGoalMl', { get: () => ml });
  s.resize(1440, 900);
  while (!s.microStep()) { /* the micro views are built: the dive goes straight through */ }
  shared = s;
  return s;
}

/** In the lobule at rest in `room`, then Next to a body slide (a case card): the dive out, with the water arriving at frame `water` (never: -1). Returns every frame's eye and the calls the rig was given. */
async function diveOut(vp: { w: number; h: number }, room: Room, water: number) {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const s = await scene();
  s.resize(vp.w, vp.h);
  ml = 0;
  s.setView('body', t); s.goTo('play', room, t, 10);
  for (let i = 0; i < 40; i++) s.update((t += 16));
  s.setView('lobule', t); s.goTo(lobuleShot('lobule:fit'), room, t, DIVE_MS);
  for (let i = 0; i < 140; i++) s.update((t += 16));
  assert.equal(s.rig.isMoving, false, 'in the lobule at rest');
  const calls: unknown[][] = [], goTo = s.rig.goTo.bind(s.rig);
  s.rig.goTo = (...a) => { calls.push(a); goTo(...a); };
  s.setView('body', t); s.goTo('play', room, t, DIVE_MS);
  const eyes: Vector3[] = [], moving: boolean[] = [];
  for (let i = 0; i < 220; i++) {
    if (i === water) { ml = WATER_ML; s.moving = true; }
    s.update((t += 16));
    eyes.push(s.rig.camera.position.clone()); moving.push(s.rig.isMoving);
  }
  delete (s.rig as unknown as Record<string, unknown>).goTo;
  return { eyes, moving, calls, end: s.rig.pose.shot };
}

for (const { name, vp, thumb } of SCREENS) {
  test(`${name}: the water arriving during the lobule's dive out starts no second move; the dive is the same path, then the fit follows once`, async () => {
    const room = freeRoom(vp as never, layoutClass(thumb));
    const clean = await diveOut(vp, room, -1);
    assert.equal(clean.calls.length, 1, 'with no water coming the dive is the one move');
    const landed = clean.moving.indexOf(false);
    assert.ok(landed > 80 && landed < 110, `the dive lands in its own 1.5 s (frame ${landed})`);
    for (const water of [3, 20, 45, 70, landed - 3]) {
      const run = await diveOut(vp, room, water);
      // (the one move: from rest, the rig is asked once while the dive flies; the fit's glide is the second, after it landed)
      const during = run.calls.length;
      assert.equal(during, 2, `water at frame ${water}: the dive, then one glide to the fit (${during} moves)`);
      for (let k = 0; k < landed; k++) {
        assert.ok(run.eyes[k]!.distanceTo(clean.eyes[k]!) < 1e-6, `water at frame ${water}: the dive's own path, frame ${k}`);
      }
      assert.ok(Math.abs(run.end.target[1] - wholeShot(WATER_ML).target[1]) < 1e-6, `water at frame ${water}: it ends on the fit of what is drawn`);
      // (and that glide starts only from rest: it never begins while the dive moves)
      assert.equal(run.moving.slice(0, landed).every(Boolean), true, `water at frame ${water}: the dive moves until it lands`);
    }
  });
}
