// Plan 30b: tapping Lobule dives into the LIVER, not the middle of the belly. His path runs through the real functions (scene.setView, scene.goTo -> placeDive -> diveLook), on the real rig and the real rooms.
// Root cause of the old behaviour (plan 30): the liver's bounding box was taken for the liver, the ray went through the DESTINATION room's centre, and the old replay copied the function and used one room.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CelScene, lobuleCorners } from '../src/scene/scene.ts';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { DEFAULT_DIVE_PLACE, LIVER_POINT, LIVER_Z, SIN_POINT, lobuleWorld, resetDivePlace, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';
import { diveLook, insideInset, liverOutlineWorld, lookPoint, onScreen } from '../src/scene/lobule/dive-look.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { freeRoom, viewRoom } from '../src/ui/shell/room.ts';

const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
void ORGAN_MESHES;

const SIZES = [{ name: 'phone', w: 390, h: 780, safe: 34 }, { name: 'ipad', w: 820, h: 1180, safe: 20 }, { name: 'mac', w: 1440, h: 900, safe: 0 }];
type Priv = { rig: any; figureView: string; dive: { visible: boolean }; microStep(): boolean; microPrimedNow: boolean; resize(w: number, h: number): void; setView(v: string, n?: number): void; goTo(s: unknown, r: unknown, n: number, ms?: number): void; disease: { organs: { liverShown: { cirrhosis: number; congestion: number } } } };
const liverNow = (sc: Priv) => ({ cirrhosis: sc.disease.organs.liverShown.cirrhosis, congestion: sc.disease.organs.liverShown.congestion });

let scene: Priv | null = null, T = 0;   // (one scene for the file: building it takes half a minute in node)
function setup(s: (typeof SIZES)[number], hand = { k: 1, x: 0, y: 0 }) {
  resetDivePlace();
  const sc = (scene ??= (() => { const c = new CelScene() as unknown as Priv; while (!c.microStep()) { /* primed, as after the idle build */ } return c; })()), full = { w: s.w, h: s.h, safe: { top: s.safe && s.w < 500 ? 47 : 0, right: 0, bottom: s.safe, left: 0 } }, d = deviceClass(s.w, s.h);
  const free = freeRoom(full, d), lob = viewRoom('lobule', full, d);
  T += 100000; const t0 = T;
  sc.resize(s.w, s.h); sc.setView('body', t0); sc.rig.setHand({ k: 1, x: 0, y: 0 }); sc.rig.goTo('play', free, t0, 1); sc.rig.update(t0); sc.rig.update(t0 + 4000);
  sc.rig.setHand(hand); sc.rig.update(t0 + 4016);
  return { sc, free, lob, t0: t0 + 5000 };
}
const look = (sc: Priv, s: (typeof SIZES)[number]) => diveLook(sc.rig, s.w, s.h, liverNow(sc));

for (const s of SIZES) test(`${s.name}: an ordinary tap on Lobule (hand at home) goes to the liver's default place, and nothing snaps`, () => {
  const { sc, lob, t0 } = setup(s);
  // 9 points of the figure, spread over the screen
  const pts: Vector3[] = []; for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.25, 0.5, 0.75]) { const a = new Vector3(fx * 2 - 1, -(fy * 2 - 1), 0.5).unproject(sc.rig.camera), o = sc.rig.camera.position, t = (LIVER_Z - o.z) / (a.z - o.z); pts.push(new Vector3(o.x + (a.x - o.x) * t, o.y + (a.y - o.y) * t, LIVER_Z)); }
  const before = pts.map((p) => sc.rig.project(p));
  sc.setView('lobule', t0);
  sc.goTo(lobuleShot('lobule'), lob, t0, 1500);
  assert.deepEqual([...LIVER_POINT], [...DEFAULT_DIVE_PLACE], 'the default place, exactly');
  sc.rig.update(t0 + 16);
  pts.forEach((p, i) => { const q = sc.rig.project(p); assert.ok(Math.hypot(q.x - before[i]!.x, q.y - before[i]!.y) <= 0.5 + 0.02 * s.w, `body point ${i} first frame moved ${Math.hypot(q.x - before[i]!.x, q.y - before[i]!.y).toFixed(2)} px`); });
  assert.ok(insideInset({ x: LIVER_POINT[0], y: LIVER_POINT[1] }, liverOutlineWorld(liverNow(sc))), 'and it is inside the liver');
});

/** Hand states (zoom 2.5 to 4) that really have the room's centre on the liver and on screen, found by scanning the pan: the viewer is zoomed on the liver. */
function liverHands(s: (typeof SIZES)[number]) {
  const out: { k: number; x: number; y: number }[] = [];
  for (const k of [3, 2.2, 4]) for (let x = -480; x <= 480; x += 80) for (let y = -480; y <= 480; y += 80) {
    if (out.length >= 4) return out;
    const { sc } = setup(s, { k, x, y }), lk = lookPoint(sc.rig, s.w, s.h);
    if (lk && insideInset(lk, liverOutlineWorld(liverNow(sc))) && onScreen(sc.rig, lk, s.w, s.h) && (out.length === 0 || Math.hypot(x - out[out.length - 1]!.x, y - out[out.length - 1]!.y) > 150)) out.push({ k, x, y });
  }
  return out;
}
for (const s of SIZES) test(`${s.name}: zoomed on the liver the place is where he looks (the room he is looking at), inside the liver`, () => {
  const hands = liverHands(s);
  assert.ok(hands.length >= 2, `found hand states on the liver (${hands.length})`);
  for (const hand of hands) {
    const { sc } = setup(s, hand), lk = lookPoint(sc.rig, s.w, s.h)!, to = look(sc, s), poly = liverOutlineWorld(liverNow(sc));
    assert.ok(insideInset(to, poly), 'inside the inset outline');
    assert.ok(Math.hypot(to.x - lk.x, to.y - lk.y) < 1e-9, 'the look point itself');
    const q = sc.rig.project(new Vector3(to.x, to.y, LIVER_Z)), r = sc.rig.pose.room, cx = r.w > 1 ? r.x + r.w / 2 : s.w / 2, cy = r.h > 1 ? r.y + r.h / 2 : s.h / 2;
    assert.ok(Math.hypot(q.x - cx, q.y - cy) < 1, "under the current room's centre within a pixel");
  }
});

test('zoomed OFF the liver (stomach, colon): the place is in the liver and on screen, at the nearest such point', () => {
  const s = SIZES[2]!; let judged = 0;
  for (const hand of [{ k: 4, x: -700, y: -50 }, { k: 4, x: 600, y: -300 }, { k: 4, x: 0, y: 700 }, { k: 5, x: -900, y: 500 }]) {
    const { sc } = setup(s, hand), lk = lookPoint(sc.rig, s.w, s.h)!, poly = liverOutlineWorld(liverNow(sc)), to = look(sc, s);
    const valid = (p: { x: number; y: number }) => insideInset(p, poly) && onScreen(sc.rig, p, s.w, s.h);
    if (valid(lk)) continue;
    judged++;
    const isDefault = Math.abs(to.x - DEFAULT_DIVE_PLACE[0]) < 1e-12 && Math.abs(to.y - DEFAULT_DIVE_PLACE[1]) < 1e-12;
    if (isDefault) { // no liver on screen: nothing valid anywhere
      for (let i = 0; i <= 40; i++) for (let j = 0; j <= 30; j++) assert.ok(!valid({ x: -1.2 + (i / 40) * 1.8, y: 0.05 + (j / 30) * 1.25 }), 'no valid liver point was on screen');
      continue;
    }
    assert.ok(valid(to), 'inside the liver and on screen');
    const d = Math.hypot(to.x - lk.x, to.y - lk.y);
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 45; j++) { const p = { x: -1.2 + (i / 60) * 1.8, y: 0.05 + (j / 45) * 1.25 }; if (valid(p)) assert.ok(Math.hypot(p.x - lk.x, p.y - lk.y) >= d - 0.03, 'no valid point is clearly nearer'); }
  }
  assert.ok(judged > 0, 'at least one hand state looked off the liver');
});

test('two dives in a row: zoomed then unzoomed; the second goes to the default, and the subject follows the place', () => {
  const s = SIZES[2]!, { sc, free, lob, t0 } = setup(s, { k: 3, x: 40, y: 20 });
  sc.setView('lobule', t0); sc.goTo(lobuleShot('lobule'), lob, t0, 1500);
  for (let t = t0 + 16; t <= t0 + 2000; t += 16) sc.rig.update(t);
  const moved = LIVER_POINT[0] !== DEFAULT_DIVE_PLACE[0] || LIVER_POINT[1] !== DEFAULT_DIVE_PLACE[1];
  void moved;
  assert.deepEqual(sc.rig.subjectCorners ?? lobuleCorners(), lobuleCorners());
  sc.setView('body', t0 + 3000); sc.goTo('play', free, t0 + 3000, 1500);
  for (let t = t0 + 3016; t <= t0 + 5000; t += 16) sc.rig.update(t);
  sc.rig.setHand({ k: 1, x: 0, y: 0 }); sc.rig.update(t0 + 5016);
  sc.setView('lobule', t0 + 6000); sc.goTo(lobuleShot('lobule'), lob, t0 + 6000, 1500);
  assert.deepEqual([...LIVER_POINT], [...DEFAULT_DIVE_PLACE]);
  const c = lobuleCorners(), w = lobuleWorld([0, 0, 0]);
  assert.ok(Math.abs(w[0] - LIVER_POINT[0]) < 1e-12 && c.every((p) => Number.isFinite(p[0])), 'corners are at the new place');
  assert.ok(sinusoidWorld([0, 0, 0])[0] === SIN_POINT[0]);
});

test('the apparent scale around the place never falls during the dive (zoomed and unzoomed)', () => {
  const s = SIZES[0]!;
  for (const hand of [{ k: 1, x: 0, y: 0 }, { k: 3, x: 0, y: 0 }]) {
    const { sc, lob, t0 } = setup(s, hand);
    sc.setView('lobule', t0); sc.goTo(lobuleShot('lobule'), lob, t0, 1500);
    const p = new Vector3(LIVER_POINT[0], LIVER_POINT[1], LIVER_POINT[2]), q = new Vector3(LIVER_POINT[0] + 0.0005, LIVER_POINT[1], LIVER_POINT[2]);
    let last = 0;
    for (let t = t0; t <= t0 + 1600; t += 1000 / 60) { sc.rig.update(t); const a = sc.rig.project(p), b = sc.rig.project(q), sc2 = Math.hypot(b.x - a.x, b.y - a.y); assert.ok(sc2 >= last * 0.999, `scale fell at ${t}: ${sc2} < ${last}`); last = sc2; }
  }
});
