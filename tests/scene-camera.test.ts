import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig, blendPose, dragToOrbit, easeInOutCubic, lerpAngle } from '../src/scene/camera/rig.ts';
import { SHOTS, SHOT_MS, ORBIT_LIMIT, FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance, fitDistance, fullRoom, viewOffset } from '../src/scene/camera/room.ts';

test('the camera goes straight from any shot to any shot: halfway is the plain average, no fit waypoint', () => {
  const a = { shot: SHOTS.title, room: fullRoom(800, 600) };
  const b = { shot: SHOTS.wedge, room: { x: 480, y: 60, w: 300, h: 500 } };
  const m = blendPose(a, b, 0.5);
  assert.ok(Math.abs(m.shot.r - (a.shot.r + b.shot.r) / 2) < 1e-9);
  assert.ok(Math.abs(m.shot.target[1] - (a.shot.target[1] + b.shot.target[1]) / 2) < 1e-9);
  assert.ok(Math.abs(m.room.x - 240) < 1e-9);
  // and at every step the distance stays between the two ends (it never pulls out to fit everything first)
  for (let k = 0; k <= 1; k += 0.1) {
    const p = blendPose(a, b, k);
    assert.ok(p.shot.r <= Math.max(a.shot.r, b.shot.r) + 1e-9 && p.shot.r >= Math.min(a.shot.r, b.shot.r) - 1e-9);
  }
});

test('turning takes the short way round', () => {
  assert.ok(Math.abs(lerpAngle(3.0, -3.0, 0.5) - Math.PI) < 0.2 || Math.abs(lerpAngle(3.0, -3.0, 0.5) + Math.PI) < 0.2);
  assert.ok(Math.abs(lerpAngle(0.1, 0.3, 0.5) - 0.2) < 1e-9);
});

test('ease in-out cubic, 950 ms', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(easeInOutCubic(0.25) < 0.25 && easeInOutCubic(0.75) > 0.75);
  assert.equal(SHOT_MS, 950);
});

test('a move lasts 950 ms and the rig says so while it moves, then goes quiet', () => {
  const rig = new CameraRig('title');
  rig.resize(800, 600);
  rig.update(0);
  rig.goTo('title', fullRoom(800, 600), 0);   // the first shot is put in place; every one after it flies
  rig.goTo('free', fullRoom(800, 600), 1000);
  assert.equal(rig.update(1000), true);
  assert.equal(rig.update(1500), true);
  assert.equal(rig.update(1949), true);
  assert.equal(rig.update(1950), false);
  assert.equal(rig.isMoving, false);
  assert.ok(Math.abs(rig.pose.shot.r - SHOTS.free.r) < 1e-9 || rig.pose.shot.r > 0);
  assert.equal(rig.update(2000), false);
});

test('a new move mid-flight starts from where the camera is, not from the old shot', () => {
  const rig = new CameraRig('title');
  rig.resize(800, 600);
  rig.goTo('title', fullRoom(800, 600), 0);
  rig.goTo('free', fullRoom(800, 600), 0);
  rig.update(475);
  const mid = rig.pose.shot.r;
  rig.goTo('wedge', fullRoom(800, 600), 475);
  rig.update(475);
  assert.ok(Math.abs(rig.pose.shot.r - mid) < 1e-9);
});

test('room first: a smaller free room pulls the camera back so the subject still fits, never closer than the shot', () => {
  const big = fullRoom(1280, 800);
  const small = { x: 0, y: 0, w: 330, h: 300 };
  const s = SHOTS.free;
  assert.ok(effectiveDistance(s, small, 800) > effectiveDistance(s, big, 800));
  assert.ok(effectiveDistance(s, big, 800) >= s.r);
  assert.ok(fitDistance(s.half, small, 800) > fitDistance(s.half, big, 800));
});

test('the subject really fits the room it was fitted to (projected extent <= 92% of the room)', () => {
  const rig = new CameraRig('free');
  rig.resize(852, 393);
  const room = { x: 405, y: 20, w: 388, h: 353 };
  rig.goTo('free', room, 0, 0);
  rig.update(0);
  const shot = SHOTS.free;
  const c = new Vector3(...shot.target);
  const right = new Vector3(1, 0, 0).applyQuaternion(rig.camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
  const px = (v: Vector3) => rig.project(v);
  const o = px(c);
  const e = px(c.clone().addScaledVector(right, shot.half[0]));
  const u = px(c.clone().addScaledVector(up, shot.half[1]));
  assert.ok(Math.abs(e.x - o.x) <= room.w / 2, `width ${Math.abs(e.x - o.x)} vs ${room.w / 2}`);
  assert.ok(Math.abs(u.y - o.y) <= room.h / 2, `height ${Math.abs(u.y - o.y)} vs ${room.h / 2}`);
  // and the subject centre sits in the middle of the room
  assert.ok(Math.abs(o.x - (room.x + room.w / 2)) < 1 && Math.abs(o.y - (room.y + room.h / 2)) < 1, `centre ${o.x},${o.y}`);
});

test('the projection shift moves the picture centre to the room centre', () => {
  const off = viewOffset({ x: 400, y: 0, w: 400, h: 600 }, 800, 600);
  assert.deepEqual(off, { x: -200, y: 0 });
});

test('orbit is limited to 25 degrees either way and the lens is long\'', () => {
  const rig = new CameraRig('free');
  rig.setOrbit(10);
  assert.equal(rig.orbitAngle, ORBIT_LIMIT);
  rig.setOrbit(-10);
  assert.equal(rig.orbitAngle, -ORBIT_LIMIT);
  assert.ok(Math.abs(ORBIT_LIMIT - 0.4363) < 1e-3);
  assert.equal(FOV, 14);   // the long lens (owner's decision B, 19 Nov)
});

test('a new shot always starts square on: the orbit eases back to centre with the move', () => {
  const rig = new CameraRig('free');
  rig.resize(800, 600);
  rig.setOrbit(0.3);
  rig.goTo('wedge', fullRoom(800, 600), 0);
  rig.update(950);
  assert.ok(Math.abs(rig.orbitAngle) < 1e-9);
});

test('a card opening (the room alone changes) leaves the turn the viewer chose; a new shot still starts square on', () => {
  const rig = new CameraRig('free');
  rig.resize(800, 600);
  rig.goTo('free', fullRoom(800, 600), 0, 0); rig.update(0);
  rig.setOrbit(0.3);
  rig.setRoom({ x: 0, y: 0, w: 500, h: 600 }, 100);
  rig.update(100); rig.update(600); rig.update(1100);
  assert.equal(rig.orbitAngle, 0.3, 'the room moved, the turn did not');
  rig.goTo('wedge', { x: 0, y: 0, w: 500, h: 600 }, 2000);
  rig.update(3000);
  assert.ok(Math.abs(rig.orbitAngle) < 1e-9, 'a new shot eases the turn home with the move');
});

test('a guided step that asks for the shot the camera is already on still brings the turn home (a slide or a catheter step), while a plain card change does not', () => {
  const room = { x: 0, y: 0, w: 500, h: 600 };
  const rig = new CameraRig('free');
  rig.resize(800, 600);
  rig.goTo('free', fullRoom(800, 600), 0, 0); rig.update(0);
  rig.setOrbit(0.3);
  rig.setRoom(room, 100);                                  // a card opened: the turn stays
  rig.update(100); rig.update(2000);
  assert.equal(rig.orbitAngle, 0.3);
  rig.setRoom(room, 3000, undefined, true);                // the next slide, same shot: the turn goes home with the move
  rig.update(3000 + SHOT_MS / 2);
  assert.ok(rig.orbitAngle > 0 && rig.orbitAngle < 0.3, 'on its way');
  rig.update(3000 + SHOT_MS);
  assert.equal(rig.orbitAngle, 0);
  assert.equal(rig.update(5000), false, 'and quiet');
});

test('dragging turns the figure with the finger: a drag to the right moves the figure\'s front to the right on screen', () => {
  const room = fullRoom(800, 600);
  const shot = SHOTS.free;
  const front = new Vector3(...shot.target).add(new Vector3(0, 0, 1)); // a point on the near side of the figure, toward the viewer
  const rig = new CameraRig('free');
  rig.resize(800, 600);
  rig.goTo('free', room, 0, 0);
  rig.update(0);
  const x0 = rig.project(front).x;
  rig.setOrbit(dragToOrbit(0, 100)); // 100 px to the right
  rig.update(1);
  assert.ok(rig.project(front).x > x0, 'front moves right');
  rig.setOrbit(dragToOrbit(0, -100)); // 100 px to the left
  rig.update(2);
  assert.ok(rig.project(front).x < x0, 'front moves left');
});

test('one drag rule: right is negative orbit, left is positive, and it composes from where the figure already is', () => {
  assert.ok(dragToOrbit(0, 50) < 0);
  assert.ok(dragToOrbit(0, -50) > 0);
  assert.equal(dragToOrbit(0.2, 0), 0.2);
  assert.ok(Math.abs(dragToOrbit(0, 100) + 0.6) < 1e-9, '100 px is 0.6 rad before the ±25° limit');
});

test('the figure turns only through dragToOrbit (no second, opposite rule for another input)', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f: string) => readFileSync(new URL(`../src/scene/${f}`, import.meta.url), 'utf8');
  const ctl = read('gesture/controller.ts');
  assert.equal([...ctl.matchAll(/dragToOrbit\(/g)].length, 1, 'one place turns the figure by a drag');
  assert.doesNotMatch(read('Stage.tsx'), /setOrbit\([^)]*\*/, 'Stage does no orbit maths of its own');
});

test('the first shot is where the camera starts: no fly-in from the title shot, and nothing is drawn before it', () => {
  const room = { x: 300, y: 80, w: 480, h: 420 };
  const rig = new CameraRig('title');
  assert.equal(rig.placed, false);
  rig.goTo('play', room, 0);
  assert.equal(rig.placed, true);
  assert.equal(rig.isMoving, false, 'no move to run');
  assert.equal(rig.update(0), false);
  assert.deepEqual(rig.pose.room, room);
  assert.equal(rig.pose.shot.r, SHOTS.play.r);
  rig.resize(800, 600);
  rig.update(16);
  assert.deepEqual(rig.pose.room, room, 'a size arriving later does not move it');
  rig.goTo('wedge', room, 100);
  assert.equal(rig.isMoving, true, 'the second shot flies');
});

test('a call with no real room yet (the cards not measured) does not place the camera', () => {
  const rig = new CameraRig('title');
  rig.goTo('play', { x: 0, y: 0, w: 0, h: 0 }, 0);
  assert.equal(rig.placed, false);
});

test('the scene draws only the background until the camera is placed, then the figure', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const s = new CelScene();
  const calls: string[] = [];
  const gl = { autoClear: true, setClearColor: () => {}, render: () => { calls.push('render'); }, clear: () => { calls.push('clear'); }, clearDepth: () => { calls.push('depth'); }, clearStencil: () => {}, getDrawingBufferSize: (v: { set(x: number, y: number): void }) => v.set(800, 600), setRenderTarget: (t: unknown) => { calls.push(t ? 'into texture' : 'to canvas'); } } as never;
  s.resize(800, 600);
  s.render(gl);
  s.goTo('play', { x: 300, y: 80, w: 480, h: 420 }, 0);
  s.update(0);
  s.render(gl);
  assert.deepEqual(calls, ['clear', 'into texture', 'render', 'depth', 'render', 'to canvas', 'render'], 'into the texture: the organs, then the depth cleared, then the vessels over them; then the canvas takes the filtered picture');
});

test('every shot looks at the 2D figure\'s own places (frame2d.ts), not at the old plate\'s', async () => {
  const { x3, y3 } = await import('../src/scene/frame2d.ts');
  const { SHOTS: S } = await import('../src/scene/camera/shots.ts');
  const inFigure = (t: readonly number[]) => t[0]! >= x3(0) && t[0]! <= x3(1400) && t[1]! >= y3(1000) && t[1]! <= y3(-100);
  for (const [name, s] of Object.entries(S)) assert.ok(inFigure(s.target), `${name} target ${s.target}`);
  // the hepatic-vein shots are centred on the right hepatic vein's own place (2D x 500 to 620, y 206 to 246), on the viewer's left of the trunk
  for (const n of ['free', 'wedge', 'hvpg'] as const) {
    assert.ok(S[n].target[0] < x3(620) && S[n].target[0] > x3(440), n);
    assert.ok(Math.abs(S[n].target[1] - y3(240)) < 0.4, n);
  }
  // the whole-figure shots take in the figure's own extent
  assert.ok(S.play.half[1] * 2 >= y3(60) - y3(960), 'play keeps the whole bed');
  assert.ok(S.title.half[0] >= 1.9);
});

test('anchors sit on the vessels they name', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { courseOf } = await import('../src/scene/vessels/network.ts');
  const s = new CelScene();
  const near = (name: 'ra' | 'ivc' | 'rhv' | 'pv' | 'spleen', id: string) => {
    const a = s.anchor(name);
    return Math.min(...courseOf(id).map((p) => Math.hypot(p[0] - a.x, p[1] - a.y, p[2] - a.z)));
  };
  assert.ok(near('ra', 'SVC_RA') < 1e-6);
  assert.ok(near('ivc', 'IVC_IS') < 1e-6);
  assert.ok(near('rhv', 'RHV_IVC') < 1e-6);
  assert.ok(near('pv', 'PV_TRUNK') < 1e-6);
  assert.ok(near('spleen', 'V_SPL') < 1e-6);
  s.dispose();
});
