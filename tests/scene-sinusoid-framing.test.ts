// The sinusoid's framing as the camera really lands it (CameraRig, the projection itself, no GPU): px per µm on the screen against 2D's own rule
// (sinusoid-view.js ensureGeo: VW.tk = clamp(short / across, 3, 14), across = lerp(40, 54, smooth(380, 720, short))), on the phone in portrait first (390 x 844).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { LOBULE_SCALE, SIN_SCALE, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { U, diveShare } from '../src/scene/sinusoid/view.ts';
import { acrossUm, isPortrait, shortSide } from '../src/scene/sinusoid/portrait.ts';
import { sinusoidRoom, figureRoomInputs } from '../src/ui/shell/room.ts';

const twoD = (short: number) => Math.min(14, Math.max(3, short / acrossUm(short)));
const pxPerUm = (rig: CameraRig, turn: number): number => {
  const o = new Vector3(...sinusoidWorld([0, 0, 0])), p = new Vector3(...sinusoidWorld([10 * U * Math.cos(turn), 10 * U * Math.sin(turn), 0]));
  const a = rig.project(o), b = rig.project(p);
  return Math.hypot(b.x - a.x, b.y - a.y) / 10;
};
const land = (W: number, H: number, room: { x: number; y: number; w: number; h: number }, from: 'lobule' | null = 'lobule') => {
  const rig = new CameraRig('title', room); rig.resize(W, H);
  const portrait = isPortrait(W, H), short = shortSide(portrait, room);
  let now = 0;
  if (from) { rig.goTo(lobuleShot('lobule'), room, now, 0); rig.update(now += 10); }
  rig.goTo(sinusoidShot(portrait, short), room, now, 1100);
  const shares: number[] = [];
  for (let t = 0; t <= 1600; t += 16) { rig.update(now + t); shares.push(diveShare(rig.pose.shot.r, 2.5 * LOBULE_SCALE, 3 * SIN_SCALE)); }
  return { rig, shares, portrait, short };
};

test('on an iPhone held upright the sinusoid lands at 2D\'s own scale, whole screen, and the dive ends at 1', () => {
  for (const [W, H] of [[390, 844], [393, 852], [430, 932], [375, 667]] as const) {
    const room = sinusoidRoom({ w: W, h: H, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, figureRoomInputs({ w: W, h: H, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, 'phone-portrait'));
    const { rig, shares, portrait, short } = land(W, H, room);
    assert.ok(portrait, 'a phone upright runs the sinusoid top to bottom');
    const k = pxPerUm(rig, -Math.PI / 2);
    assert.ok(Math.abs(k - twoD(short)) < 0.02, `${W}x${H}: ${k.toFixed(2)} px/µm, 2D's ${twoD(short).toFixed(2)}`);
    assert.ok(k > 8, `${W}x${H}: close in, the lumen and its walls large (${k.toFixed(2)} px/µm)`);
    assert.equal(shares[shares.length - 1], 1, 'landed: the dive share is 1');
    assert.equal(rig.isMoving, false, 'landed: the camera has stopped');
  }
});

test('a big screen is held to 14 px per µm, as 2D clamps it (never closer in than that)', () => {
  const room = { x: 12, y: 80, w: 1416, h: 700 };
  const { rig, short } = land(1440, 900, room);
  assert.ok(Math.abs(pxPerUm(rig, 0) - twoD(short)) < 0.02);
  assert.ok(pxPerUm(rig, 0) <= 14.001, `${pxPerUm(rig, 0).toFixed(2)} px/µm`);
});

test('the dive share moves with the flight and is 1 only at the landing, so a landed camera is never dim', () => {
  const room = { x: 12, y: 90, w: 366, h: 640 };
  const { shares } = land(390, 844, room);
  assert.ok(shares[0]! < 0.05 && shares.every((s, i) => i === 0 || s >= shares[i - 1]! - 1e-9), 'rises, never back');
  assert.equal(shares[shares.length - 1], 1);
});
