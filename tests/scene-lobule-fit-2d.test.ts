// The lobule's framing is 2D's: lobule-zoom.js fitInto fits a frame box (frameBox: a phone's 1.05 R by 1.02 R, a laptop's or iPad's 1.52 R by 1.04 R) whole into the free room,
// so on a phone the hexagon is nearly the room's width and the neighbours show above and below it (19 Nov: the build opened on the central vein at 3 to 5 times that).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOV, NARROW_STAGE } from '../src/scene/camera/shots.ts';
import { FILL, effectiveDistance } from '../src/scene/camera/room.ts';
import { blendPose } from '../src/scene/camera/rig.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { RS0, SIN_NARROW } from '../src/scene/lobule/geometry.ts';
import { RS_N, disseRadius, sinRadius } from '../src/scene/lobule/widths.ts';
import { lobuleRoom } from '../src/ui/shell/room.ts';

/** What the camera shows at rest: the hexagon's width and height in CSS px on a screen W x H whose free room is `room`. */
function hexOn(W: number, H: number, room: { x: number; y: number; w: number; h: number }, cam: 'lobule' | 'lobule:central' = 'lobule') {
  const D = effectiveDistance(lobuleShot(cam), room, H, W);
  const pxPerWorld = H / (2 * Math.tan((FOV * Math.PI) / 360)) / D;
  const w = 2 * LOBULE_R * LOBULE_SCALE * pxPerWorld;
  return { w, h: w * 0.866, shareW: w / room.w, shareH: (w * 0.866) / room.h };
}
const roomOf = (W: number, H: number) => lobuleRoom({ w: W, h: H, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, { topSafe: 47 + 44, cmpH: 0, pzT: 0, pzB: 0, pzL: 0, pzR: 0, botOcc: 34 + 150, presenting: false });

test('on a phone held upright the whole hexagon is about 2D\'s share of the free room\'s width, never the central vein alone', () => {
  const room = roomOf(390, 844), h = hexOn(390, 844, room);
  // 2D's phone box is 1.05 R a side (the hexagon 95 % of the room), but the corners' dots and the tract glow reach 1.12 R and were cut at the screen's edge (capture af1c51a0, 25 Nov): the box is the lobule's own
  // bounds, k = room.w / (2.24 R), the hexagon (2 R wide) 2 / 2.24 = 89 % of the room
  assert.ok(Math.abs(h.shareW - 2 / 2.24) < 0.005, `phone hexagon ${(h.shareW * 100).toFixed(1)} % of the room's width`);
  assert.ok(h.shareW * 1.12 <= 1.0001, 'the corners\' dots and glow (1.12 R each side) are inside the room');
  assert.ok(h.shareH < 1, 'and fits the room\'s height');
});

test('on a laptop or an iPad the whole lobule (corners and tract glow: 1.12 R by 0.98 R) is fitted into the free room (24 Nov: more zoomed in, the entire lobule fills the space)', () => {
  for (const [W, H] of [[1440, 900], [1024, 768], [844, 390], [1180, 820]] as const) {
    const room = roomOf(W, H), h = hexOn(W, H, room);
    assert.ok(W >= NARROW_STAGE);
    const k = Math.min(room.w / (2 * 1.12), room.h / (2 * 0.98));   // px per R, the lobule's own bounds fitted whole
    const want = 2 * k;   // the hexagon is 2 R wide
    assert.ok(Math.abs(h.w - want) / want < 0.005, `${W}x${H}: hexagon ${h.w.toFixed(0)} px wide, the fit's ${want.toFixed(0)}`);
    assert.ok(h.w < room.w && h.h < room.h, `${W}x${H} whole in the room`);
  }
});

test('the deck and free-play cameras are one shot; the central vein station stays twice the fit', () => {
  const fit = lobuleShot('lobule'), cv = lobuleShot('lobule:central');
  assert.deepEqual(lobuleShot('lobule:fit'), fit);
  assert.ok(fit.halfNarrow && cv.halfNarrow);
  assert.ok(Math.abs(cv.halfNarrow[0] * 2 - LOBULE_R * 1.05 * FILL * LOBULE_SCALE) < 1e-15, 'the central vein station keeps 2D\'s phone box at twice the zoom');
  assert.ok(Math.abs(fit.halfNarrow[0] - LOBULE_R * 1.12 * FILL * LOBULE_SCALE) < 1e-15, 'the whole lobule on a phone is the lobule\'s own bounds wide');
  // FILL is the room solver's share; the shot's extents are 2D's frame box times it
  assert.ok(Math.abs(fit.half[1] - LOBULE_R * 0.98 * FILL * LOBULE_SCALE) < 1e-15);
});

test('a blend of two poses keeps a narrow extent that only one of them has', () => {
  const room = { x: 0, y: 0, w: 390, h: 600 };
  const a = { shot: { ...lobuleShot('lobule'), halfNarrow: undefined }, room }, b = { shot: lobuleShot('lobule'), room };
  delete (a.shot as { halfNarrow?: unknown }).halfNarrow;
  assert.ok(blendPose(a, b, 0.5).shot.halfNarrow, 'the lobule\'s own phone frame survives the blend');
  assert.deepEqual(blendPose(a, b, 1).shot.halfNarrow, b.shot.halfNarrow);
});

test('the space of Disse shows only a rim beside its sinusoid: 2D\'s width (the sinusoid and 0.12 to 0.54 of a lumen radius beyond), at most 0.0054 R wider', () => {
  for (const rho of [0.08, 0.2, 0.5, 0.8, 1]) {
    const sin = RS_N * (sinRadius('s0', rho) / RS_N), rim = disseRadius(rho) - sin;
    assert.ok(rim > 0.0009 && rim < 0.0055, `rho ${rho}: rim ${rim.toFixed(4)} R`);
  }
  assert.ok(RS0 * SIN_NARROW === RS_N);
});
