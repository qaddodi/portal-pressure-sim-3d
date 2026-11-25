// 23 Nov (owner): "the Anatomy -> Lobule zoom is still not zooming into the correct place, especially when I'm zoomed into a different area in Anatomy".
// Root cause: scene.placeDive chose the lobule's place from the camera (diveLook: the centre of the room he was looking at, else the nearest liver point on screen), then MOVED the lobule's frame
// (LIVER_POINT) there. Zoomed off the liver, "nearest on screen" is the liver's rim; zoomed on it, any spot at all (on a vein, on the edge), and the place changed with every hand state. The place is
// now the liver's one anchor (LIVER_2D, between the right portal vein and the IVC, owner 20 Nov), never chosen from the camera; only the camera's FLIGHT starts from where it is (rig.startDiveHand).
// This runs the real path (scene.setView, scene.goTo, the real rig and rooms) from many hand states and screen sizes, in and back out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { LIVER_2D, LIVER_POINT, LIVER_Z, lobuleWorld, placedLiverPoint } from '../src/scene/lobule/frames.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { freeRoom, viewRoom } from '../src/ui/shell/room.ts';

const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
void ORGAN_MESHES;

// (restated for the placed anatomy, the only one now: the liver's one anchor is found by name on the placed courses, placedLiverPoint, not the old 2D plate's LIVER_2D)
const ANCHOR = placedLiverPoint();
const SIZES = [{ name: 'phone', w: 390, h: 780, safe: 34 }, { name: 'ipad', w: 820, h: 1180, safe: 20 }, { name: 'mac', w: 1440, h: 900, safe: 0 }];
// the hand's zoom and pan: home, zoomed on the middle, and zoomed on other parts (stomach, colon, off the liver, far pans), the cases he reported
const HANDS = [{ k: 1, x: 0, y: 0 }, { k: 3, x: 0, y: 0 }, { k: 3, x: -400, y: 150 }, { k: 2.2, x: 500, y: -250 }, { k: 6, x: 900, y: 300 }, { k: 4, x: 600, y: -300 }, { k: 5, x: -900, y: 500 }];
type Priv = { rig: any; resize(w: number, h: number): void; setView(v: string, n?: number): void; goTo(s: unknown, r: unknown, n: number, ms?: number): void; microStep(): boolean };
let scene: Priv | null = null, T = 0;   // (one scene for the file: building it takes half a minute in node)
const get = (): Priv => (scene ??= (() => { const c = new CelScene() as unknown as Priv; while (!c.microStep()) { /* primed, as after the idle build */ } return c; })());

function fromHand(s: (typeof SIZES)[number], hand: { k: number; x: number; y: number }) {
  const sc = get(), full = { w: s.w, h: s.h, safe: { top: s.safe && s.w < 500 ? 47 : 0, right: 0, bottom: s.safe, left: 0 } }, d = deviceClass(s.w, s.h);
  const free = freeRoom(full, d), lob = viewRoom('lobule', full, d);
  T += 100000; const t0 = T;
  sc.resize(s.w, s.h); sc.setView('body', t0); sc.rig.setHand({ k: 1, x: 0, y: 0 }); sc.rig.goTo('play', free, t0, 1); sc.rig.update(t0); sc.rig.update(t0 + 4000);
  sc.rig.setHand(hand); sc.rig.update(t0 + 4016);
  return { sc, free, lob, t0: t0 + 5000 };
}

for (const s of SIZES) for (const hand of HANDS) test(`${s.name}: Lobule from the hand at zoom ${hand.k} (${hand.x}, ${hand.y}) goes to the liver's one place, framed in the room, in one smooth way`, () => {
  const { sc, lob, t0 } = fromHand(s, hand);
  const head = lobuleShot('lobule'), at = new Vector3(...ANCHOR), before = { ...sc.rig.project(at) };
  sc.setView('lobule', t0); sc.goTo(head, lob, t0, 1500);
  assert.deepEqual([...LIVER_POINT], ANCHOR, 'the lobule stands at the liver anchor, not where the camera was');
  assert.deepEqual([...lobuleShot('lobule').target], [...head.target], 'and so does its shot');
  const c = new Vector3(...lobuleWorld([0, 0, 0])), pts: { x: number; y: number }[] = [];
  for (let t = t0 + 16; t <= t0 + 1900; t += 16) { sc.rig.update(t); pts.push({ ...sc.rig.project(c) }); }
  // (the first frame is where the picture stood: the room's centring is not lost in the hand's zoom, rig.stepDiveHand)
  assert.ok(Math.hypot(pts[0]!.x - before.x, pts[0]!.y - before.y) < 2.5, `no jump on the first frame: ${before.x.toFixed(1)},${before.y.toFixed(1)} -> ${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`);
  const r = sc.rig.pose.room, cx = r.x + r.w / 2, cy = r.y + r.h / 2, end = pts[pts.length - 1]!;
  assert.ok(Math.hypot(end.x - cx, end.y - cy) < 0.5, `lands framed in the room: ${end.x.toFixed(1)},${end.y.toFixed(1)} against ${cx.toFixed(1)},${cy.toFixed(1)}`);
  assert.deepEqual([sc.rig.handView.k, sc.rig.handView.x, sc.rig.handView.y], [1, 0, 0], 'the hand has come home with it');
  // smooth: the place only ever comes closer to where it lands, and never leaves the way it travels by more than a single turn
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x - end.x, p.y - end.y);
  for (let i = 1; i < pts.length; i++) assert.ok(dist(pts[i]!) <= dist(pts[i - 1]!) + 1.5, `frame ${i}: moved away from where it lands (${dist(pts[i - 1]!).toFixed(1)} -> ${dist(pts[i]!).toFixed(1)} px)`);
});

test('the place is the same whichever way it is entered: after a dive from a zoomed hand, back out, and in again from home', () => {
  const s = SIZES[2]!;
  for (const hand of [HANDS[3]!, HANDS[1]!, HANDS[0]!]) {
    const { sc, free, lob, t0 } = fromHand(s, hand);
    sc.setView('lobule', t0); sc.goTo(lobuleShot('lobule'), lob, t0, 1500); for (let t = t0 + 16; t <= t0 + 1900; t += 16) sc.rig.update(t);
    sc.setView('body', t0 + 2000); sc.goTo('play', free, t0 + 2000, 1500); for (let t = t0 + 2016; t <= t0 + 4000; t += 16) sc.rig.update(t);
    assert.deepEqual([...LIVER_POINT], ANCHOR, 'out again: the place is where it was');
  }
});
