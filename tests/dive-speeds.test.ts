// The dives keep one pace (Mohammad, 27 Nov 2026: "diving from anatomy to lobule the camera is faster to zoom than from anatomy to sinusoid???"). Three causes, each pinned here:
//   - Anatomy -> Sinusoid took the two dives' times added (3.3 s): one glide of 14 doublings spread evenly over it, at the lobule's depth at 2.0 s where Anatomy -> Lobule has landed at 1.5 s,
//     at two thirds of its top speed. It is DIVE_THROUGH_MS (2.4 s): at the lobule's depth about when the short dive lands, at nearly its top speed.
//   - the gentler cubic ease of Lobule -> Sinusoid was judged on the move before (rig.ts goTo read this.from/this.to before setting them), most often the plunge in from the body, so it
//     almost never ran: the quintic packed the sinusoid's crossfade into a quarter of the move.
//   - a slide gave every dive 1.5 s (rig.slideMs), so a slide's Anatomy -> Sinusoid ran 14 doublings in it; a slide that changes view now takes the dive's own time (api.ts showShot, diveMs).
// The real scene, stepped in node, on a Mac and an iPhone.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Vector3 } from 'three';
import type { Room } from '../src/scene/camera/room.ts';
import { DIVE_BODY_MS, DIVE_SINUSOID_MS, DIVE_THROUGH_MS, diveMs } from '../src/scene/camera/dive.ts';

type S = {
  resize(w: number, h: number): void; update(t: number): boolean; dispose(): void; microStep(): boolean; setView(v: string, now?: number): void; buildMicroIdle: () => void;
  goTo(shot: unknown, room: Room, now: number, ms?: number): void; rig: { isMoving: boolean; camera: { position: Vector3 } };
};
type View = 'body' | 'lobule' | 'sinusoid';
const FRAME = 16;
let shared: S | null = null, t = 1000;
after(() => shared?.dispose());
async function scene(): Promise<S> {
  if (shared) return shared;
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene() as unknown as S;
  s.resize(1440, 900);
  s.buildMicroIdle = () => {};
  while (!s.microStep()) { /* built */ }
  shared = s;
  return s;
}
async function shotOf(v: View, W: number, H: number) {
  const { lobuleShot, sinusoidShot } = await import('../src/scene/lobule/shots.ts');
  const { shortSide } = await import('../src/scene/sinusoid/portrait.ts');
  const portrait = W < H * 0.95;
  return v === 'body' ? 'play' : v === 'lobule' ? lobuleShot('lobule') : sinusoidShot(portrait, shortSide(portrait, { w: W, h: H }));
}
/** From rest on Anatomy (and on `a`, reached by its own dive from there, as a person gets there), the dive to `b` at the view buttons' time: the camera's distance to `b`'s place each frame. */
async function dive(W: number, H: number, a: View, b: View): Promise<number[]> {
  const s = await scene();
  s.resize(W, H);
  const room = { x: 0, y: 0, w: W, h: H };
  s.setView('body', t); s.goTo('play', room, t, 0);
  for (let i = 0; i < 20; i++) s.update((t += FRAME));
  if (a !== 'body') { s.setView(a, t); s.goTo(await shotOf(a, W, H), room, t, diveMs('body', a)); for (let i = 0; i < 260 && (i < 2 || s.rig.isMoving); i++) s.update((t += FRAME)); }
  // (the distance to the deeper end's place, the one the zoom closes on or opens from)
  const deep = b === 'body' || (a === 'sinusoid' && b === 'lobule') ? a : b;
  const to = await shotOf(b, W, H), tg = ((await shotOf(deep, W, H)) as { target: [number, number, number] }).target;
  const cam = s.rig.camera.position, place = cam.clone().set(tg[0], tg[1], tg[2]);
  s.setView(b, t); s.goTo(to, room, t, diveMs(a, b));
  const ds: number[] = [];
  for (let i = 0; i < 400; i++) { s.update((t += FRAME)); ds.push(cam.distanceTo(place)); if (!s.rig.isMoving) break; }
  return ds;
}
/** The top zoom speed (doublings a second) and the average over the move. */
function pace(ds: number[]): { peak: number; avg: number } {
  let peak = 0;
  for (let i = 1; i < ds.length; i++) peak = Math.max(peak, Math.abs(Math.log2(ds[i]! / ds[i - 1]!)) / (FRAME / 1000));
  return { peak, avg: Math.abs(Math.log2(ds.at(-1)! / ds[0]!)) / ((ds.length * FRAME) / 1000) };
}

test('the dives\' own times: Anatomy <-> Sinusoid is its own, shorter than the two added', () => {
  assert.equal(diveMs('body', 'sinusoid'), DIVE_THROUGH_MS); assert.equal(diveMs('sinusoid', 'body'), DIVE_THROUGH_MS);
  assert.ok(DIVE_THROUGH_MS < DIVE_BODY_MS + DIVE_SINUSOID_MS && DIVE_THROUGH_MS > DIVE_BODY_MS);
});

for (const [W, H] of [[1440, 900], [393, 852]] as const) {
  test(`${W}x${H}: Anatomy -> Sinusoid is at the lobule's depth about when Anatomy -> Lobule lands, at nearly its top speed`, async () => {
    const short = await dive(W, H, 'body', 'lobule'), long = await dive(W, H, 'body', 'sinusoid');
    const lobuleAt = short.at(-1)!, reach = long.findIndex((d) => d <= lobuleAt) * FRAME;
    const landed = short.length * FRAME;
    assert.ok(Math.abs(reach - landed) <= 200, `at the lobule's depth at ${reach} ms; the short dive lands at ${landed} ms`);
    const a = pace(short), b = pace(long);
    assert.ok(b.peak >= 0.8 * a.peak, `top speed ${b.peak.toFixed(1)} against the short dive's ${a.peak.toFixed(1)} doublings a second`);
  });
  test(`${W}x${H}: Lobule -> Sinusoid, reached from Anatomy, runs its gentler cubic ease (top speed 1.5 times the average, not the quintic's 1.875)`, async () => {
    for (const [a, b] of [['lobule', 'sinusoid'], ['sinusoid', 'lobule']] as const) {
      const p = pace(await dive(W, H, a, b));
      assert.ok(p.peak / p.avg < 1.65, `${a} -> ${b}: top ${p.peak.toFixed(2)}, average ${p.avg.toFixed(2)} doublings a second`);
    }
  });
}

test('a slide that changes view through the liver takes the dive\'s own time, as the view buttons do', () => {
  const api = readFileSync(new URL('../src/scene/api.ts', import.meta.url), 'utf8');
  assert.match(api, /const dive = slide && from !== v \? diveMs\(from, v\) : undefined;/);
  assert.match(api, /const glide = dive \?\? \(slide \? cel\.rig\.slideMs\(to\) : undefined\);/);
});
