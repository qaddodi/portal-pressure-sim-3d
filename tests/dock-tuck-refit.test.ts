import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { lobuleShot } from '../src/scene/lobule/shots.ts';
import { sceneSource } from './helpers/scene-source.ts';

// Mohammad 21 Nov (iPhone, Circulation slide 5): tucking the data card up left the lobule small and the whole figure blurred.
// Root cause, one: the dock's room hint only panned the camera (a room change alone keeps the zoom), so the figure never grew into the room the card left.
// Root cause, two: the dive's blur and body fade measured "the lobule's framing" in the NEW room (targetRoom) while the camera still sat at the OLD fit, so the camera
// looked like it was part way into a dive for ever. Both read the one room the distance is fitted to (rig.fitRoom).
const small = { x: 0, y: 200, w: 390, h: 300 }, big = { x: 0, y: 60, w: 390, h: 640 };
const settle = (rig: CameraRig, from: number) => { let t = from; for (; t < from + 3000; t += 16) rig.update(t); return t; };
const dist = (rig: CameraRig) => rig.camera.position.distanceTo(new Vector3(...rig.pose.shot.target));

test('a refit room change grows the lobule into the room the tucked card left, and fitRoom says which room the distance is fitted to', () => {
  const rig = new CameraRig('play', small); rig.resize(390, 844);
  rig.goTo(lobuleShot('lobule'), small, 0); const t0 = settle(rig, 0);
  const dSmall = effectiveDistance(lobuleShot('lobule'), small, 844, 390), dBig = effectiveDistance(lobuleShot('lobule'), big, 844, 390);
  assert.ok(dBig < dSmall, 'a bigger room frames the lobule closer');
  assert.deepEqual({ w: rig.fitRoom.w, h: rig.fitRoom.h }, { w: small.w, h: small.h });

  // a room change alone (a card opening, a sheet) only pans: the zoom and the fitted room stay
  rig.setRoom(big, t0); const t1 = settle(rig, t0);
  assert.equal(rig.targetRoom.h, big.h);
  assert.equal(rig.fitRoom.h, small.h, 'the fit stays');

  // the dock's hint refits: the camera eases in to the bigger room's framing, and out again when the card comes back
  rig.setRoom(small, t1, undefined, false, true); const t2 = settle(rig, t1);
  rig.setRoom(big, t2, 400, false, true);
  const mid = (rig.update(t2 + 200), dist(rig));
  const t3 = settle(rig, t2 + 200);
  assert.equal(rig.fitRoom.h, big.h);
  assert.ok(Math.abs(dist(rig) - dBig) / dBig < 0.02, `landed at the big room's framing (${dist(rig)} vs ${dBig})`);
  assert.ok(mid > dist(rig) && mid < dSmall * 1.05, 'it eased, it did not snap');
  rig.setRoom(small, t3, 400, false, true); settle(rig, t3);
  assert.ok(Math.abs(dist(rig) - dSmall) / dSmall < 0.02, 'and out again when the card returns');
});

test('the dock glide refits the camera, and the dive\'s framing distance reads the fitted room, never the room the picture is merely centred in', () => {
  assert.match(readFileSync('src/ui/deck/scene-link.ts', 'utf8'), /frameRoom\(h\.free, h\.ms, easeArrive\)/);
  const scene = sceneSource();
  assert.match(scene, /lobuleRest\(\): number \{\s*const r = this\.rig\.fitRoom/);
});

test('a dock that lands with no glide (a drag let go fully shut or open) still refits: the link refits on any change of the dock the plan publishes, not only on a hint', () => {
  const link = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
  assert.match(link, /const dockMoved = dockShown !== dockWas; dockWas = dockShown;/);
  assert.match(link, /if \(dockMoved && !stepped\) frameRoom\(room, DOCK_MS, easeArrive\)/);
});

test('tuck, untuck, a reversal mid-glide and the landing sync all end at the framing a fresh fit in that room gives (zoom and pan, so the callouts keep their vessels)', () => {
  const open = { x: 8, y: 330, w: 374, h: 380 }, shut = { x: 8, y: 120, w: 374, h: 590 };
  const ease = (k: number) => 1 - Math.pow(1 - k, 3);
  const fresh = (room: typeof open) => { const r = new CameraRig('play', room); r.resize(390, 844); r.goTo('play', room, 0); settle(r, 0); return r; };
  const same = (a: CameraRig, b: CameraRig, why: string) => {
    assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-3, `${why}: camera`);
    assert.ok(Math.abs(a.camera.projectionMatrix.elements[5]! - b.camera.projectionMatrix.elements[5]!) < 1e-6, `${why}: lens`);
    assert.deepEqual([a.fitRoom.w, a.fitRoom.h, a.targetRoom.y], [b.fitRoom.w, b.fitRoom.h, b.targetRoom.y], `${why}: rooms`);
  };
  const refOpen = fresh(open), refShut = fresh(shut);
  let rig = fresh(open), t = 3000;
  rig.setRoom(shut, t, 300, false, true, ease); t = settle(rig, t); same(rig, refShut, 'tucked');
  rig.setRoom(open, t, 380, false, true, ease); t = settle(rig, t); same(rig, refOpen, 'untucked');
  // untuck while the tuck's glide is still going, then the landing sync (same room, no time)
  rig = fresh(open); t = 3000;
  rig.setRoom(shut, t, 300, false, true, ease); for (let u = 0; u < 120; u += 16) rig.update(t += 16);
  rig.setRoom(open, t, 380, false, true, ease); t = settle(rig, t);
  rig.setRoom(open, t); t = settle(rig, t); same(rig, refOpen, 'reversed mid-glide');
});

// Mohammad 22 Nov (iPhone, Circulation slide 5): the slide arriving with the instrument card up framed the lobule larger (cropped by the cards, two names) than the same slide after a tuck and an untuck (whole, five names).
// Root cause: two ways of giving the camera a room. The slide's move fits the zoom to the room it is sent; the cards of the slide settle after it (the data card's height lands a beat late), and that room change only
// panned, so the zoom stayed fitted to the earlier, larger room. Tuck and untuck refit. The names are a pure function of the projection (lobule/captions.ts), so one framing is one set of names.
test('a slide that arrives into a room the cards then shrink ends framed exactly as a fresh fit (and an untuck) in that final room; the talk has one way to give the camera a room', () => {
  const early = { x: 8, y: 120, w: 374, h: 590 }, final = { x: 8, y: 330, w: 374, h: 380 };
  const rig = (room: typeof early) => { const r = new CameraRig('play', room); r.resize(390, 844); return r; };
  const shot = lobuleShot('lobule');
  const arrived = rig(early); arrived.goTo(shot, early, 0); let t = settle(arrived, 0);
  arrived.setRoom(final, t, undefined, false, true); settle(arrived, t);   // (frameRoom: the cards settled)
  const fresh = rig(final); fresh.goTo(shot, final, 0); settle(fresh, 0);
  assert.ok(arrived.camera.position.distanceTo(fresh.camera.position) < 1e-3, 'same camera');
  assert.ok(Math.abs(arrived.camera.projectionMatrix.elements[5]! - fresh.camera.projectionMatrix.elements[5]!) < 1e-6, 'same lens');
  const stale = rig(early); stale.goTo(shot, early, 0); t = settle(stale, 0); stale.setRoom(final, t); settle(stale, t);
  assert.ok(stale.camera.position.distanceTo(fresh.camera.position) > 1e-3 || Math.abs(stale.camera.projectionMatrix.elements[5]! - fresh.camera.projectionMatrix.elements[5]!) > 1e-6 || stale.fitRoom.h !== fresh.fitRoom.h, 'a pan-only room change (the old behaviour) frames it differently: this is the bug');
  const link = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
  assert.equal((link.match(/sceneApi\.setRoom\(/g) ?? []).length, 1, 'only frameRoom calls sceneApi.setRoom in the talk');
  assert.match(link, /sceneApi\.setRoom\(room, ms, homeTurn, true, ease\)/);
});

// ...and the room the slide is fitted to must be the FINAL one (coordinator, 22 Nov: a second ease right after arrival is a visible double move). The data card is measured whole, then stepped down or fitted
// (pair-ladder, fitMap), so a room published at an earlier step was not the room the slide keeps. The plan is published only once final, stamped with its stop, and the camera's slide move waits for it.
test('the plan reaches the camera only when final, stamped with its slide; the slide\'s move waits for its own room', async () => {
  const layer = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(layer, /const final = settled && fonts && !growing && \(measuredNow \|\| late === pagesKey\);/);
  assert.match(layer, /if \(final\) publishPlan\(plan, pos\.stop\)/);
  const link = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
  assert.match(link, /if \(boxes\.stop != null && boxes\.stop !== pos\.stop\) \{ owed = owed \|\| stepped; return; \}/);
  assert.match(link, /s\.boxes\.stop !== prev\.boxes\.stop/);
  const { useUi } = await import('../src/ui/ui-store.ts');
  const plan = { cards: [], strip: null, free: { x: 0, y: 100, w: 390, h: 400 }, docked: false } as never;
  useUi.getState().publishPlan(plan, 4);
  assert.equal(useUi.getState().boxes.stop, 4);
  const was = useUi.getState().boxes;
  useUi.getState().publishPlan(plan, 4);
  assert.equal(useUi.getState().boxes, was, 'the same room for the same slide is not a change');
  useUi.getState().publishPlan(plan, 5);
  assert.equal(useUi.getState().boxes.stop, 5, 'the same room for a new slide still tells the camera it has come');
});
