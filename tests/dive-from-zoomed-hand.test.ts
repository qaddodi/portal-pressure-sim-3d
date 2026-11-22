import test from 'node:test';
import assert from 'node:assert/strict';

// 22 Nov (owner): zoomed in on another part of the Anatomy, tapping Lobule made the camera swing and "a lot of lobules sweep across the screen". Root cause: the hand's zoom and pan came home on the
// clock (lerpView on the move's time) while the dive's aim and distance run on the distance's share, so the place dived to started anywhere (even off screen) and swung across the picture.
// Now the hand's offset runs out with the dive's own share: the place goes one way, from where the viewer had it to the middle of the room, and only grows.
const full = { x: 0, y: 0, w: 1000, h: 700 };

async function trace(out: boolean, hand: { k: number; x: number; y: number }) {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { Vector3 } = await import('three');
  const lob = lobuleShot('lobule');
  const rig = new CameraRig('play', full); rig.resize(1000, 700);
  const p = new Vector3(...lob.target), q = new Vector3(lob.target[0] + 0.0005, lob.target[1], lob.target[2]);
  if (out) { rig.goTo(lob, full, 0); rig.update(0); rig.update(5000); }
  else { rig.goTo('play', full, 0); rig.update(0); }
  rig.setHand(hand);
  rig.goTo(out ? 'play' : lob, full, 6000, 1500);
  const pts: { x: number; y: number; s: number }[] = [];
  for (let t = 6016; t <= 7600; t += 16) {
    rig.update(t);
    const a = rig.project(p), b = rig.project(q);
    pts.push({ x: a.x, y: a.y, s: Math.hypot(b.x - a.x, b.y - a.y) });
  }
  return { pts, rig };
}

for (const out of [false, true]) {
  for (const hand of [{ k: 3, x: -400, y: 150 }, { k: 2.2, x: 500, y: -250 }, { k: 6, x: 900, y: 300 }]) {
    test(`a dive ${out ? 'out of' : 'into'} the lobule from the hand at zoom ${hand.k}: the place dived to goes one way and only grows`, async () => {
      const { pts, rig } = await trace(out, hand);
      assert.ok(pts.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.s)));
      const end = pts[pts.length - 1]!, start = pts[0]!;
      const plain = (await trace(out, { k: 1, x: 0, y: 0 })).pts;
      const d0 = Math.hypot(start.x - plain[0]!.x, start.y - plain[0]!.y);
      assert.ok(d0 > 50, `the hand really moved the place (${d0.toFixed(0)} px)`);
      // in: the hand's offset is gone with the dive's own aim, before the close part (the neighbours never sweep past); out: it shrinks with the picture, so it is never bigger than it was
      for (const [i, a] of pts.entries()) {
        const off = Math.hypot(a.x - plain[i]!.x, a.y - plain[i]!.y);
        // (plan 30: no front-loaded lurch. The path is one eased share of the way: never further off than it started, and only ever closer, a few percent of the screen a frame at most; scene.placeDive makes the usual case travel not at all)
        if (!out) { assert.ok(off <= d0 + 3, `frame ${i}: ${off.toFixed(0)} px off the plain dive (in)`); if (i > 0) assert.ok(off <= Math.hypot(pts[i - 1]!.x - plain[i - 1]!.x, pts[i - 1]!.y - plain[i - 1]!.y) + 1, `frame ${i}: only comes closer`); }
        if (out) assert.ok(off <= d0 + 3, `frame ${i}: ${off.toFixed(0)} px off the plain dive (out)`);
      }
      assert.ok(Math.hypot(end.x - plain[plain.length - 1]!.x, end.y - plain[plain.length - 1]!.y) < 0.5, 'it lands where the plain dive lands');
      // sideways it never wanders: the way it travels is at most 1.8 times the way it nets (one turn at most, never a zigzag)
      for (const axis of ['x', 'y'] as const) {
        let path = 0;
        for (let i = 1; i < pts.length; i++) path += Math.abs(pts[i]![axis] - pts[i - 1]![axis]);
        const net = Math.abs(end[axis] - start[axis]);
        assert.ok(path <= net * 1.8 + 6, `${axis}: travelled ${path.toFixed(0)} px for a net ${net.toFixed(0)}`);
      }
      for (let i = 1; i < pts.length; i++) assert.ok(out ? pts[i]!.s <= pts[i - 1]!.s * 1.0005 : pts[i]!.s >= pts[i - 1]!.s * 0.9995, `size ${out ? 'shrinks' : 'grows'} every frame (${i})`);
      // it lands with the hand home
      const h = rig.handView;
      assert.deepEqual([h.k, h.x, h.y], [1, 0, 0]);
      assert.ok(start.s > 0);
    });
  }
}

test('a dive with the hand on the fit is the same as it was (the hand state stays identity throughout)', async () => {
  const { CameraRig } = await import('../src/scene/camera/rig.ts');
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const rig = new CameraRig('play', full); rig.resize(1000, 700);
  rig.goTo('play', full, 0); rig.update(0);
  rig.goTo(lobuleShot('lobule'), full, 100, 1500);
  for (let t = 116; t < 1700; t += 16) { rig.update(t); assert.deepEqual([rig.handView.k, rig.handView.x, rig.handView.y], [1, 0, 0]); }
});
