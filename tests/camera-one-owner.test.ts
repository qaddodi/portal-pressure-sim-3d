// The camera has ONE owner per transition (Mohammad, 25 Nov: Circulation, slide 4 to 5, "zooms in slightly, zooms out, then all of a sudden zooms to the lobule").
// Root cause: a dive into the lobule waits for its 3D parts (scene.goTo holds it, rushing the build) and the body stands as it is meanwhile. But each card of the new slide that settled in the
// meantime told the camera its room, and the camera refitted the BODY to it (a slight zoom in, then out, once per card), then the dive started from that. The room now goes into the waiting dive
// only (scene.setRoom, the twin of goTo), the camera stands still, and the dive is the one move.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

type Room = { x: number; y: number; w: number; h: number };
type Priv = {
  figureView: string; diveHeld: boolean; microPrimedNow: boolean; moving: boolean;
  rig: { camera: { position: { x: number; y: number; z: number }; zoom: number }; isMoving: boolean; goTo: (...a: unknown[]) => void; setRoom: (...a: unknown[]) => void; pose: { shot: { target: number[] } } };
  livePoint: { x: number; y: number; z: number };
  buildMicroIdle(u?: boolean): void; microStep(): boolean; resize(w: number, h: number): void; update(now: number): boolean; dispose(): void;
  setView(v: string, now?: number): void; goTo(shot: unknown, room: Room, now: number, ms?: number): void; setRoom(room: Room, now: number, ms?: number, homeTurn?: boolean, refit?: boolean): void;
};
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
