// The camera has ONE owner per transition (Mohammad, 25 Nov: Circulation, slide 4 to 5, "zooms in slightly, zooms out, then all of a sudden zooms to the lobule").
// Root cause: a dive into the lobule waits for its 3D parts (scene.goTo holds it, rushing the build) and the body stands as it is meanwhile. But each card of the new slide that settled in the
// meantime told the camera its room, and the camera refitted the BODY to it (a slight zoom in, then out, once per card), then the dive started from that. The room now goes into the waiting dive
// only (scene.setRoom, the twin of goTo), the camera stands still, and the dive is the one move.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

type Room = { x: number; y: number; w: number; h: number };
type Priv = {
  figureView: string; diveHeld: boolean; microPrimedNow: boolean; moving: boolean;
  rig: {
    camera: { position: { x: number; y: number; z: number }; zoom: number }; isMoving: boolean; chaseLeaving: boolean; setChase(p: ChasePose | null): void;
    goTo: (...a: unknown[]) => void; setRoom: (...a: unknown[]) => void; pose: { shot: { target: number[] } };
  };
  livePoint: { x: number; y: number; z: number };
  buildMicroIdle(u?: boolean): void; microStep(): boolean; resize(w: number, h: number): void; update(now: number): boolean; dispose(): void;
  setView(v: string, now?: number): void; goTo(shot: unknown, room: Room, now: number, ms?: number): void;
  setRoom(room: Room, now: number, ms?: number, homeTurn?: boolean, refit?: boolean, ease?: ((k: number) => number) | null): void;
};
type ChasePose = { yaw: number; pitch: number; dist: number; fov: number; target: [number, number, number] };
const W = 1440, H = 900;
// the cards of slide 4 (the profile chart on the left), then the rooms slide 5's cards leave as they settle one after the other (the data card's height lands a beat late)
const ROOM_4: Room = { x: 480, y: 60, w: 940, h: 780 };
const ROOM_5: Room[] = [{ x: 420, y: 60, w: 1000, h: 780 }, { x: 420, y: 60, w: 1000, h: 640 }, { x: 440, y: 60, w: 980, h: 600 }];
const pos = (s: Priv) => { const p = s.rig.camera.position; return [p.x, p.y, p.z, s.rig.camera.zoom]; };
const distTo = (s: Priv) => { const p = s.rig.camera.position, q = s.livePoint; return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); };

// (one scene for the file: building it is the slow part. The first test needs the micro views unbuilt, so it runs first and the later ones find them primed)
let shared: Priv | null = null;
after(() => shared?.dispose());
async function slide4(): Promise<Priv> {
  if (!shared) {
    const { CelScene } = await import('../src/scene/scene.ts');
    shared = new CelScene() as unknown as Priv;
    shared.resize(W, H);
  }
  const s = shared;
  // (a test's stubs are taken off, and the camera is back on slide 4's body framing, settled)
  for (const k of ['goTo', 'setRoom'] as const) delete (s.rig as unknown as Record<string, unknown>)[k];
  delete (s as unknown as Record<string, unknown>).buildMicroIdle;
  s.setView('body', 0);
  s.rig.goTo('play', ROOM_4, 0); s.update(0);
  s.goTo('play', ROOM_4, 0, 10);
  for (let t = 16; t < 400; t += 16) s.update(t);
  return s;
}

test('while the dive waits for its parts the camera stands still: every card that settles only moves the room into the waiting dive', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const s = await slide4();
  s.buildMicroIdle = () => {};   // (the build is driven by hand below, as the slot would run it)
  const calls: string[] = [];
  const goTo = s.rig.goTo.bind(s.rig), setRoom = s.rig.setRoom.bind(s.rig);
  s.rig.goTo = (...a) => { calls.push('goTo'); goTo(...a); };
  s.rig.setRoom = (...a) => { calls.push('setRoom'); setRoom(...a); };
  const before = pos(s);
  let t = 500;
  s.setView('lobule', t);
  s.goTo(lobuleShot('lobule:fit'), ROOM_5[0]!, t, 1500);
  assert.equal(s.diveHeld, true);
  for (const room of ROOM_5) {
    for (let i = 0; i < 20; i++) { t += 16; s.update(t); assert.deepEqual(pos(s), before, `the body stays framed as slide 4 left it (t ${t})`); assert.equal(s.rig.isMoving, false); }
    s.setRoom(room, t, undefined, false, true);   // (a card settled: the deck's frameRoom refits)
    for (let i = 0; i < 20; i++) { t += 16; s.update(t); assert.deepEqual(pos(s), before, `a card's room does not refit the body (t ${t})`); }
  }
  assert.deepEqual(calls, [], 'the rig was told nothing while the dive waited: no competing target');
  while (!s.microStep()) { /* the micro views' steps */ }
  assert.equal(s.diveHeld, false);
  assert.deepEqual(calls, ['goTo'], 'the dive is the one move, started once the parts are ready');
  s.update(t += 16);
  const first = pos(s);
  assert.ok(Math.hypot(first[0]! - before[0]!, first[1]! - before[1]!, first[2]! - before[2]!) < 0.05, 'and it starts from the framing the body stood in: no snap');
  let last = distTo(s);
  for (let i = 0; i < 140; i++) {
    t += 16; s.update(t);
    const d = distTo(s);
    assert.ok(d <= last * 1.0005, `one way in, never back out (frame ${i}: ${last.toExponential(3)} -> ${d.toExponential(3)})`);
    last = d;
  }
  assert.equal(s.rig.isMoving, false, 'landed');
});

test('a card settling during a dive that is flying retargets that one move: the camera only ever goes in, with no jump', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const s = await slide4();
  while (!s.microStep()) { /* primed: the dive goes straight through */ }
  const calls: string[] = [];
  const goTo = s.rig.goTo.bind(s.rig);
  s.rig.goTo = (...a) => { calls.push('goTo'); goTo(...a); };
  let t = 500;
  s.setView('lobule', t);
  s.goTo(lobuleShot('lobule:fit'), ROOM_5[0]!, t, 1500);
  assert.equal(s.diveHeld, false);
  let last = distTo(s), lastPos = pos(s);
  const at = new Map([[10, 1], [22, 2]]);
  for (let i = 1; i < 140; i++) {
    t += 16;
    if (at.has(i)) s.setRoom(ROOM_5[at.get(i)!]!, t, undefined, false, true);
    s.update(t);
    const d = distTo(s), p = pos(s);
    assert.ok(d <= last * 1.0005, `the dive only closes (frame ${i}: ${last.toExponential(3)} -> ${d.toExponential(3)})`);
    assert.ok(Math.hypot(p[0]! - lastPos[0]!, p[1]! - lastPos[1]!, p[2]! - lastPos[2]!) < Math.max(1, last) * 0.35, `no jump in the eye (frame ${i})`);
    last = d; lastPos = p;
  }
  assert.deepEqual(calls, ['goTo'], 'the room change retargeted the move in flight, it never started a second one');
});

test('a room change with no dive waiting still goes straight to the rig (a card opening on the body pans it)', async () => {
  const s = await slide4();
  const seen: unknown[][] = [];
  const setRoom = s.rig.setRoom.bind(s.rig);
  s.rig.setRoom = (...a) => { seen.push(a); setRoom(...a); };
  s.setRoom(ROOM_5[1]!, 1000, undefined, false, true);
  assert.equal(seen.length, 1);
  assert.equal(s.moving, true);
});

test('the dock gliding while a dive flies (slide 4 has a data card, slide 5 has none) never restarts the dive: it lands when it was going to, one way, no rush at its end', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { easeArrive } = await import('../src/clock/tween.ts');
  const s = await slide4();
  while (!s.microStep()) { /* primed */ }
  let t = 500;
  s.setView('lobule', t);
  s.goTo(lobuleShot('lobule:fit'), ROOM_5[0]!, t, 1500);
  const t0 = t;
  let last = distTo(s), lastPos = pos(s), landed = -1;
  for (let i = 1; i < 160; i++) {
    t += 16;
    // (the data card goes: the deck tells the camera the room it leaves, in the dock's 300 ms and its curve, at the 12th and the 40th frame)
    if (i === 12 || i === 40) s.setRoom(ROOM_5[i === 12 ? 1 : 2]!, t, 300, false, true, easeArrive);
    s.update(t);
    const d = distTo(s), p = pos(s);
    assert.ok(d <= last * 1.0005, `the dive only closes (frame ${i}: ${last.toExponential(3)} -> ${d.toExponential(3)})`);
    assert.ok(Math.hypot(p[0]! - lastPos[0]!, p[1]! - lastPos[1]!, p[2]! - lastPos[2]!) < Math.max(1, last) * 0.35, `no jump in the eye (frame ${i})`);
    if (landed < 0 && !s.rig.isMoving) landed = t - t0;
    last = d; lastPos = p;
  }
  assert.ok(landed >= 1400 && landed <= 1700, `landed with the dive's own 1500 ms, not the dock's 300 (${landed} ms)`);
});

test('the HVPG chase and a dive never share the picture: the dive waits for the chase to ease out; a chase asked for during a dive waits for the landing', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const s = await slide4();
  while (!s.microStep()) { /* primed */ }
  const chase: ChasePose = { yaw: 0, pitch: 0, dist: 2.4, fov: 20, target: [0.1, 0.4, 0.3] };
  s.rig.setChase(chase);
  let t = 500;
  for (let i = 0; i < 80; i++) { t += 16; s.update(t); }
  const inChase = pos(s);
  // the slide goes on to the lobule: the deck turns the chase off and asks for the dive in the same call
  s.rig.setChase(null);
  const calls: string[] = [];
  const goTo = s.rig.goTo.bind(s.rig);
  s.rig.goTo = (...a) => { calls.push('goTo'); goTo(...a); };
  s.setView('lobule', t);
  s.goTo(lobuleShot('lobule:fit'), ROOM_5[0]!, t, 1500);
  assert.equal(s.diveHeld, true, 'the dive waits for the chase to be out of the picture');
  assert.equal(s.rig.chaseLeaving, true);
  let lastPos = inChase;
  for (let i = 0; i < 120 && s.diveHeld; i++) {
    t += 16; s.update(t);
    const p = pos(s);
    assert.ok(Math.hypot(p[0]! - lastPos[0]!, p[1]! - lastPos[1]!, p[2]! - lastPos[2]!) < 0.6, `the chase eases out without a jump (frame ${i})`);
    lastPos = p;
  }
  assert.equal(s.diveHeld, false, 'released once the chase is out');
  assert.equal(s.rig.chaseLeaving, false);
  assert.deepEqual(calls, ['goTo']);
  let last = distTo(s);
  for (let i = 0; i < 140; i++) {
    t += 16; s.update(t);
    const d = distTo(s), p = pos(s);
    assert.ok(d <= last * 1.0005, `one way in (frame ${i}: ${last.toExponential(3)} -> ${d.toExponential(3)})`);
    assert.ok(Math.hypot(p[0]! - lastPos[0]!, p[1]! - lastPos[1]!, p[2]! - lastPos[2]!) < Math.max(1, last) * 0.35, `no jump in the eye (frame ${i})`);
    last = d; lastPos = p;
  }
  assert.equal(s.rig.isMoving, false);
  // and the way out onto a catheter slide: the chase is asked for with the dive out and comes in only once it has landed (no aim pulled across a picture of the lobule's scale)
  s.setView('body', t);
  s.goTo('play', ROOM_4, t, 1500);
  s.rig.setChase(chase);
  last = distTo(s); lastPos = pos(s);
  let landedAt = -1;
  for (let i = 0; i < 200; i++) {
    t += 16; s.update(t);
    const d = distTo(s), p = pos(s);
    const flying = (s.rig as unknown as { active: boolean }).active;
    if (flying) assert.ok(d >= last * 0.9995, `one way out while the dive flies (frame ${i})`);
    else if (landedAt < 0) landedAt = i;
    assert.ok(Math.hypot(p[0]! - lastPos[0]!, p[1]! - lastPos[1]!, p[2]! - lastPos[2]!) < Math.max(1, last) * 0.5, `no jump in the eye (frame ${i})`);
    last = d; lastPos = p;
  }
  assert.ok(landedAt > 0 && s.rig.isMoving === false, 'the chase came in after the dive and settled');
});

test('a card settling at any moment of a dive (early, late, near the landing) never makes the zoom step: the distance changes smoothly from frame to frame', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { lobuleCorners } = await import('../src/scene/scene.ts');
  const { Vector3 } = await import('three');
  const rooms = [{ x: 420, y: 60, w: 1000, h: 780 }, { x: 420, y: 60, w: 1000, h: 640 }, { x: 440, y: 60, w: 980, h: 600 }];
  for (const at of [[10, 22], [40, 60], [70, 85], [30], [75]]) {
    const rig = new CameraRig('play', ROOM_4); rig.resize(W, H); rig.setSubject(lobuleCorners());
    rig.goTo('play', ROOM_4, 0); rig.update(0);
    const shot = lobuleShot('lobule:fit'), p = new Vector3(...shot.target);
    rig.goTo(shot, rooms[0]!, 0, 1500);
    let t = 0, last = 0, lastStep = 0;
    for (let i = 1; i < 120; i++) {
      t += 16;
      const k = at.indexOf(i);
      if (k >= 0) rig.setRoom(rooms[k + 1]!, t, undefined, false, true);
      rig.update(t);
      const c = rig.camera.position, d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
      if (i > 1) {
        const step = Math.log(d / last);
        assert.ok(Math.abs(step - lastStep) < 0.05, `rooms at ${JSON.stringify(at)}: the zoom's speed jumped at frame ${i} (${lastStep.toFixed(3)} -> ${step.toFixed(3)})`);
        lastStep = step;
      }
      last = d;
    }
  }
});
