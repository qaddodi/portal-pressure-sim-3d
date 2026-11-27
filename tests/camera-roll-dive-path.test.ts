// The dive between scales is ONE direct move: the place dived to travels a straight line on the screen (never out and back), however the picture is rolled on the way (24 Nov 2026, Mohammad: "zooming from lobule
// to sinusoid the camera is going to crazy places before landing"). Root cause: on a portrait screen the sinusoid's shot carries a quarter-turn camera roll, and the roll turns the picture about the AIM (the room's
// middle) while the aim is still far from the sinusoid (it settles only as the distance closes), so the sinusoid swung round the middle in an arc (iPhone: 50 px up and out, then back). blendDive now turns the
// aim's offset the other way by the roll, and (inside the liver) lets the offset go as one eased screen glide. Node only: the rig is pure numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { SHOTS, type Shot } from '../src/scene/camera/shots.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { DIVE_THROUGH_MS } from '../src/scene/camera/dive.ts';

const DEVICES = [
  { name: 'Mac', w: 1440, h: 900, room: { x: 420, y: 0, w: 1020, h: 900 }, portrait: false },
  { name: 'iPhone', w: 390, h: 844, room: { x: 0, y: 60, w: 390, h: 520 }, portrait: true },
  { name: 'iPad portrait', w: 768, h: 1024, room: { x: 0, y: 0, w: 768, h: 560 }, portrait: true },
  { name: 'iPad', w: 1024, h: 768, room: { x: 0, y: 0, w: 1024, h: 768 }, portrait: false },
] as const;

/** Runs a move frame by frame; returns the place's screen path. */
function path(d: (typeof DEVICES)[number], from: Shot | 'play', to: Shot, ms: number, p: Vector3): { x: number; y: number }[] {
  const rig = new CameraRig('play', d.room); rig.resize(d.w, d.h);
  rig.goTo(from, d.room, 0); rig.update(0);
  rig.goTo(to, d.room, 0, ms);
  const out: { x: number; y: number }[] = [];
  for (let t = 16; t <= ms + 200; t += 16) { rig.update(t); out.push({ ...rig.project(p) }); }
  return out;
}
/** The widest the path strays from the straight line between its two ends (px), and whether progress along that line ever turns back. */
function straightness(pts: { x: number; y: number }[]): { dev: number; back: number; len: number } {
  const a = pts[0]!, b = pts[pts.length - 1]!, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let dev = 0, back = 0, last = 0;
  for (const q of pts) {
    const along = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len;
    dev = Math.max(dev, Math.abs(((q.x - a.x) * dy - (q.y - a.y) * dx) / len));
    back = Math.max(back, last - along); last = along;
  }
  return { dev, back, len };
}

for (const d of DEVICES) {
  const sin = sinusoidShot(d.portrait, d.portrait ? d.room.w : d.room.h);
  const lob = lobuleShot('lobule:fit');
  const place = new Vector3(...sinusoidWorld([0, 0, 0]));
  for (const [label, from, to] of [['lobule -> sinusoid', lob, sin], ['sinusoid -> lobule', sin, lob]] as const) {
    test(`${d.name}: ${label}: the sinusoid keeps one straight line on screen (no arc round the middle, no turning back)`, () => {
      const s = straightness(path(d, from, to, 1800, place));
      assert.ok(s.len > 5, `the move goes somewhere (${s.len.toFixed(1)} px)`);
      assert.ok(s.dev <= Math.max(3, s.len * 0.03), `strays ${s.dev.toFixed(1)} px from the straight line of ${s.len.toFixed(1)} px`);
      assert.ok(s.back < 1, `turns back ${s.back.toFixed(1)} px`);
    });
  }
  test(`${d.name}: body -> sinusoid: the sinusoid reaches the middle without an arc`, () => {
    const s = straightness(path(d, 'play' as never, sin, DIVE_THROUGH_MS, place).slice(4));   // (its first frames, off the figure's far edge, are out of range of the picture)
    assert.ok(s.back < 1 || s.dev <= Math.max(3, s.len * 0.03), `strays ${s.dev.toFixed(1)} px of ${s.len.toFixed(1)}, back ${s.back.toFixed(1)}`);
  });
}
void SHOTS;
