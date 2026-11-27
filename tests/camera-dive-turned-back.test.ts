// A dive turned back before it lands goes back along its own line (Mohammad, 27 Nov 2026: "zooming into the lobule and then clicking anatomy to zoom out before the zoom is done, does NOT
// take the same path out, but instead it like pans to the portal vein area.. this issue is persistant"). Root cause: a move retargeted in flight carried its speed on a Hermite curve over the
// aim and the zoom (camera/rig.ts goTo `hv`), and that curve took over a dive's own path (blendDive: the aim tied to the zoom). Turned back, the speed in ran out first: the camera went on
// zooming in and slid toward where it had been heading (the place 470 px off the middle on a Mac, from 130 px at the start), then swung back. A dive, the one in flight or the new one, now
// never takes the carried curve. Every dive (Anatomy <-> Lobule, Lobule <-> Sinusoid, Anatomy -> Sinusoid), turned at several points, on a Mac, an iPhone and an iPad: after the turn the
// camera never goes further in, and the place dived to never strays past where it stood on the screen when the dive began.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Vector3 } from 'three';
import type { Room } from '../src/scene/camera/room.ts';
import type { Shot } from '../src/scene/camera/shots.ts';

type S = {
  resize(w: number, h: number): void; update(t: number): boolean; dispose(): void; microStep(): boolean; setView(v: string, now?: number): void; buildMicroIdle: () => void;
  goTo(shot: unknown, room: Room, now: number, ms?: number): void; width: number; height: number;
  rig: { isMoving: boolean; camera: { position: Vector3; updateMatrixWorld(): void } & object };
};
const SCREENS = [[1440, 900], [393, 852], [820, 1180]] as const;
const FRAME = 16;

let shared: S | null = null, t = 1000;
after(() => shared?.dispose());
async function scene(): Promise<S> {
  if (shared) return shared;
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene() as unknown as S;
  s.resize(1440, 900);
  s.buildMicroIdle = () => {};
  while (!s.microStep()) { /* the micro views are built: the dive goes straight through */ }
  shared = s;
  return s;
}

type View = 'body' | 'lobule' | 'sinusoid';
async function shotOf(v: View, W: number, H: number): Promise<'play' | Shot> {
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { shortSide } = await import('../src/scene/sinusoid/portrait.ts');
  const room = { x: 0, y: 0, w: W, h: H }, portrait = W < H * 0.95;
  return v === 'body' ? 'play' : v === 'lobule' ? lobuleShot('lobule') : sinusoidShot(portrait, shortSide(portrait, room));
}

/** At rest on `a`, a dive to `b` turned back to `a` after `cut` of its time. Returns the place dived to's distance from the screen's middle (px) when the dive began and the most it
 *  reached after the turn, and the camera's distance to it at the turn and the least after. */
async function turned(W: number, H: number, a: View, b: View, ms: number, cut: number) {
  const s = await scene();
  s.resize(W, H);
  const room = { x: 0, y: 0, w: W, h: H };
  if (a !== 'body') { s.setView('body', t); s.goTo('play', room, t, 0); for (let i = 0; i < 10; i++) s.update((t += FRAME)); }
  s.setView(a, t); s.goTo(await shotOf(a, W, H), room, t, 0);
  for (let i = 0; i < 40; i++) s.update((t += FRAME));
  const to = await shotOf(b, W, H);
  const { SHOTS } = await import('../src/scene/camera/shots.ts');
  const tg = (to === 'play' ? SHOTS.play : to).target;
  const cam = s.rig.camera as unknown as { position: Vector3; updateMatrixWorld(): void };
  const place = cam.position.clone().set(tg[0], tg[1], tg[2]);
  const off = () => { const p = place.clone().project(s.rig.camera as never); return Math.hypot((p.x * W) / 2, (p.y * H) / 2); };
  s.setView(b, t); s.goTo(to, room, t, ms);
  s.update((t += FRAME));
  const start = off();
  for (let i = 0; i < Math.round((cut * ms) / FRAME); i++) s.update((t += FRAME));
  const atTurn = cam.position.distanceTo(place);
  s.setView(a, t); s.goTo(await shotOf(a, W, H), room, t, ms);
  let worst = 0, nearest = atTurn, frames = 0;
  while (frames++ < 400) { s.update((t += FRAME)); worst = Math.max(worst, off()); nearest = Math.min(nearest, cam.position.distanceTo(place)); if (!s.rig.isMoving) break; }
  return { start, worst, atTurn, nearest };
}

test('a dive turned back goes back along its own line: never further in, the place never past where it stood (every dive, every device, several points)', async () => {
  const { DIVE_BODY_MS, DIVE_SINUSOID_MS, DIVE_THROUGH_MS } = await import('../src/scene/camera/dive.ts');
  const DIVES: [View, View, number][] = [['body', 'lobule', DIVE_BODY_MS], ['lobule', 'sinusoid', DIVE_SINUSOID_MS], ['body', 'sinusoid', DIVE_THROUGH_MS]];
  for (const [W, H] of SCREENS) for (const [a, b, ms] of DIVES) for (const cut of [0.2, 0.45, 0.7]) {
    const tag = `${W}x${H} ${a} -> ${b} turned at ${cut * 100} %`;
    const r = await turned(W, H, a, b, ms, cut);
    assert.ok(r.nearest >= r.atTurn * 0.999, `${tag}: went on in after the turn (${r.atTurn.toFixed(4)} to ${r.nearest.toFixed(4)})`);
    assert.ok(r.worst <= r.start + 4, `${tag}: the place went ${r.worst.toFixed(0)} px off the middle, from ${r.start.toFixed(0)} px`);
  }
});
