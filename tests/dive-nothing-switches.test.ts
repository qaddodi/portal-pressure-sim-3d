// The Anatomy <-> Lobule flicker (Mohammad, 26 Nov 2026: "zooming from anatomy to lobule ... some flickering happens"). Two things changed in ONE frame of the move, both ways, found by stepping the
// real scene in node and reading what each frame draws:
//   - the organ veil was switched by the view's name: off in the dive's first frame (every vessel in the liver lost the organ's tint at once) and back on in the landing frame of the way out; the
//     Circuit's change switched it the same way;
//   - the neighbours' ground (the dive frame's backdrop) was whole at the frame the dive frame is switched on (the body's first step under 1): the page behind and around the body turned to the
//     lobules' tone in one frame (dark look: 26 to 62 grey), and back in one frame on the way out.
// And the dark sheet that was left (Mohammad, 26 Nov, a screen recording: one frame of a straight-edged dark sheet across the screen 0.87 s into the dive, its mirror on the way out):
//   - the body was still a third drawn when the camera went through the liver's surface (a one-frame step from the liver's brown to the lobules' grey) and then through the right sinusoids'
//     bed (its wall cut by the near plane for a frame). The body is now gone before the camera reaches the figure's front plane: nothing the camera flies through is ever drawn.
// The rule pinned here is general: a switch on a view (the dive frame's visibility, the view's name) is never seen. Whatever the frame shows changes by a bounded step a frame along every move
//  between the
// body, the lobule and the Circuit, and the dive frame is switched only on a frame where nothing in it is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundStays, lobuleStays } from '../src/scene/micro3d/lobule3d.ts';
import { veilShare } from '../src/scene/organ-veil/config.ts';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Vector3, type Object3D } from 'three';
import { FIGURE_FRONT_Z } from '../src/scene/parts/shared.ts';

type Scene = {
  resize(w: number, h: number): void; setView(v: string, now: number): void; goTo(shot: unknown, room: unknown, now: number, ms?: number): void; update(now: number): boolean;
  buildMicroIdle: (u?: boolean) => void; microStep(): boolean; veilNow(dof?: boolean): [number, number];
  diveReady: { step(now: number): void }; dive: Object3D; fadeNow: number; circuit: { t: number };
  rig: { camera: { position: Vector3 } }; livePoint: Vector3; scene: Object3D;
  lobule: { fade: { detail: { value: number }; ground: { value: number } } };
};
const FRAME = 1000 / 60;
/** The biggest step a frame of anything the move fades (a share 0..1): about 6 frames for the whole way at the steepest, never one. */
const MAX_STEP = 0.2;

interface Frame { veil: number; see: number; ground: number; detail: number; dive: boolean; body: number; camZ: number }
const read = (s: Scene): Frame => {
  const [veil, see] = s.veilNow();
  return { veil, see, ground: s.dive.visible ? s.lobule.fade.ground.value : 0, detail: s.dive.visible ? s.lobule.fade.detail.value : 0, dive: s.dive.visible,
    body: s.fadeNow, camZ: s.rig.camera.position.z };
};

async function fly(size: [number, number], moves: [string, unknown, number][]): Promise<Frame[][]> {
  return (await flyScene(size, moves)).runs;
}
async function flyScene(size: [number, number], moves: [string, unknown, number][]): Promise<{ s: Scene; runs: Frame[][] }> {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { clock } = await import('../src/clock/frame.ts');
  const s = new CelScene() as unknown as Scene;
  s.resize(size[0], size[1]);
  const room = { x: 0, y: 0, w: size[0], h: size[1] };
  s.buildMicroIdle = () => {};
  while (!s.microStep()) { /* the micro views built and primed, as the slot does before any dive */ }
  let now = clock.now() + 1000;
  const runs: Frame[][] = [];
  for (const [view, shot, ms] of moves) {
    s.setView(view, now); s.goTo(shot, room, now, ms);
    const frames: Frame[] = [];
    for (let t = 0; t < ms + 600; t += FRAME) { now += FRAME; s.update(now); s.diveReady.step(now); frames.push(read(s)); }
    runs.push(frames);
  }
  return { s, runs };
}

function assertSmooth(name: string, frames: Frame[], start: Frame): void {
  let prev = start;
  for (const [i, f] of frames.entries()) {
    for (const k of ['veil', 'see', 'ground'] as const) assert.ok(Math.abs(f[k] - prev[k]) <= MAX_STEP, `${name}, frame ${i}: ${k} stepped ${prev[k].toFixed(2)} to ${f[k].toFixed(2)} in one frame`);
    // (the lobule's own detail dissolves by dropping pixels, so a step there is a few more dots, not a flash; it is still never switched in or out whole)
    // (the camera never flies through anything drawn: while any of the body is, the camera is in front of the figure's front plane)
    if (f.body > 0) assert.ok(f.camZ > FIGURE_FRONT_Z, `${name}, frame ${i}: the body is ${f.body.toFixed(3)} drawn with the camera at z ${f.camZ.toFixed(3)}, inside the figure`);
    if (f.dive !== prev.dive) assert.ok(f.ground < 0.01 && prev.ground < 0.01 && f.detail < 0.05 && prev.detail < 0.05, `${name}, frame ${i}: the dive frame was switched while its ground was drawn`);
    prev = f;
  }
}

test('Anatomy to Lobule and back, on a Mac and a phone: nothing the frame shows steps in one frame, and the dive frame is switched only when nothing of it is drawn', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { DIVE_BODY_MS } = await import('../src/scene/camera/dive.ts');
  for (const size of [[1440, 900], [390, 844]] as [number, number][]) {
    const { s, runs } = await flyScene(size, [['body', 'play', 0], ['lobule', lobuleShot('lobule'), DIVE_BODY_MS], ['body', 'play', DIVE_BODY_MS]]);
    const [settle, inn, out] = runs;
    // the plane is the figure's own: no vessel or device of the body near the dive's line (0.3, wider than the view at the plane) stands in front of it (the organs: the last test)
    if (size[0] === 1440) {
      const v = new Vector3(), l = s.livePoint; let front = -Infinity, what = '';
      s.scene.updateMatrixWorld(true);
      s.scene.traverseVisible((o) => {
        const g = (o as { geometry?: { attributes?: { position?: { count: number } & Parameters<Vector3['fromBufferAttribute']>[0] } } }).geometry;
        const pos = g?.attributes?.position;
        if (!pos) return;
        for (let p: Object3D | null = o; p; p = p.parent) if (p === s.dive) return;
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
          if (Math.hypot(v.x - l.x, v.y - l.y) < 0.3 && v.z > front) { front = v.z; what = o.name || o.parent?.name || o.type; }
        }
      });
      assert.ok(front <= FIGURE_FRONT_Z, `the body's front by the dive's line is at z ${front.toFixed(3)} (${what}), behind the plane at ${FIGURE_FRONT_Z}`);
    }
    const rest = settle![settle!.length - 1]!;
    assert.ok(rest.veil > 0.9 && !rest.dive, `${size}: at the body's framing the veil is whole and the dive frame is off`);
    assertSmooth(`${size} in`, inn!, rest);
    const landed = inn![inn!.length - 1]!;
    assert.ok(landed.dive && landed.ground === 1 && landed.detail === 1 && landed.veil === 0 && landed.see === 0, `${size}: landed, the lobule is whole and the veil is gone`);
    assert.ok(inn!.some((f) => f.ground > 0 && f.ground < 1), `${size}: the ground came in over frames`);
    assertSmooth(`${size} out`, out!, landed);
    const home = out![out!.length - 1]!;
    assert.ok(Math.abs(home.veil - rest.veil) < 1e-9 && !home.dive, `${size}: home again, the same picture`);
  }
});

test('Anatomy to Circuit and back: the veil goes with the organs, over the change, not at its first frame', async () => {
  const [settle, there, back] = await fly([1000, 700], [['body', 'play', 0], ['circuit', 'play', 900], ['body', 'play', 900]]);
  const rest = settle![settle!.length - 1]!;
  assertSmooth('to the Circuit', there!, rest);
  assert.equal(there![there!.length - 1]!.veil, 0, 'on the map: no veil');
  assertSmooth('back to the body', back!, there![there!.length - 1]!);
});

test('the two curves: the ground is what the body leaves (no dip to the page); the veil is the organs\' own fade', () => {
  assert.equal(groundStays(1), 0); assert.ok(Math.abs(groundStays(0.5) - 0.45 / 0.95) < 1e-12); assert.equal(groundStays(0), 1); assert.ok(groundStays(0.98) < 0.003, 'next to none at the switch');
  let prev = 0;
  for (let i = 0; i <= 100; i++) { const g = groundStays(1 - i / 100); assert.ok(g >= prev - 1e-12, 'only grows as the body goes'); prev = g; }
  // what a pixel of the liver shows (organ at 0.72 of its layer over the ground over the page) never goes more than 0.03 toward the page from the straight blend of its two ends
  const L = 0.6, F = 0.24, P = 0.1;
  for (let i = 0; i <= 100; i++) {
    const body = 1 - i / 100, a = groundStays(body), o = 0.72 * body;
    const px = o * L + (1 - o) * (a * F + (1 - a) * P), ends = body * (0.72 * L + 0.28 * P) + (1 - body) * F;
    assert.ok(px >= ends - 0.03, `body ${body.toFixed(2)}: ${px.toFixed(3)} against ${ends.toFixed(3)}`);
  }
  // the lobule's own detail rule is unchanged: whole at the lobule, none with the whole body far out
  assert.equal(lobuleStays(0, 0), 1); assert.equal(lobuleStays(1, 1), 0);
  assert.equal(veilShare(1, 1), 1); assert.equal(veilShare(0.4, 1), 0.4); assert.ok(Math.abs(veilShare(1, 0.3) - 0.3) < 1e-12); assert.equal(veilShare(0, 0), 0);
});

test('the figure\'s front plane is the organs\' own: every organ by the dive\'s line lies behind it (the body is gone before the camera reaches it)', async () => {
  // (the organs as the page draws them: the baked file, decoded as the boot decodes it)
  const { decodeOrgans } = await import('../src/scene/organs/baked.ts');
  const { LIVER_POINT: [lx, ly] } = await import('../src/scene/lobule/frames.ts');
  const bin = gunzipSync(readFileSync(new URL('../public/anatomy/organs-baked.bin', import.meta.url)));
  const baked = decodeOrgans(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)!;
  let front = -Infinity, what = '';
  for (const [id, g] of baked.organs) {
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) if (Math.hypot(pos.getX(k) - lx, pos.getY(k) - ly) < 0.3 && pos.getZ(k) > front) { front = pos.getZ(k); what = id; }
  }
  assert.ok(front > 0.2 && front <= FIGURE_FRONT_Z, `the organs' front by the dive's line is at z ${front.toFixed(3)} (${what}), at or behind ${FIGURE_FRONT_Z}`);
});
