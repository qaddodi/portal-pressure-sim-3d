// The Anatomy <-> Lobule flicker (Mohammad, 26 Nov 2026: "zooming from anatomy to lobule ... some flickering happens"). Two things changed in ONE frame of the move, both ways, found by stepping the
// real scene in node and reading what each frame draws:
//   - the organ veil was switched by the view's name: off in the dive's first frame (every vessel in the liver lost the organ's tint at once) and back on in the landing frame of the way out; the
//     Circuit's change switched it the same way;
//   - the neighbours' ground (the dive frame's backdrop) was whole at the frame the dive frame is switched on (the body's first step under 1): the page behind and around the body turned to the
//     lobules' tone in one frame (dark look: 26 to 62 grey), and back in one frame on the way out.
// The rule pinned here is general: a switch on a view (the dive frame's visibility, the view's name) is never seen. Whatever the frame shows changes by a bounded step a frame along every move
//  between the
// body, the lobule and the Circuit, and the dive frame is switched only on a frame where nothing in it is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundStays, lobuleStays } from '../src/scene/micro3d/lobule3d.ts';
import { veilShare } from '../src/scene/organ-veil/config.ts';

type Scene = {
  resize(w: number, h: number): void; setView(v: string, now: number): void; goTo(shot: unknown, room: unknown, now: number, ms?: number): void; update(now: number): boolean;
  buildMicroIdle: (u?: boolean) => void; microStep(): boolean; veilNow(dof?: boolean): [number, number];
  diveReady: { step(now: number): void }; dive: { visible: boolean }; fadeNow: number; circuit: { t: number };
  lobule: { fade: { detail: { value: number }; ground: { value: number } } };
};
const FRAME = 1000 / 60;
/** The biggest step a frame of anything the move fades (a share 0..1): about 6 frames for the whole way at the steepest, never one. */
const MAX_STEP = 0.2;

interface Frame { veil: number; see: number; ground: number; detail: number; dive: boolean }
const read = (s: Scene): Frame => {
  const [veil, see] = s.veilNow();
  return { veil, see, ground: s.dive.visible ? s.lobule.fade.ground.value : 0, detail: s.dive.visible ? s.lobule.fade.detail.value : 0, dive: s.dive.visible };
};

async function fly(size: [number, number], moves: [string, unknown, number][]): Promise<Frame[][]> {
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
  return runs;
}

function assertSmooth(name: string, frames: Frame[], start: Frame): void {
  let prev = start;
  for (const [i, f] of frames.entries()) {
    for (const k of ['veil', 'see', 'ground'] as const) assert.ok(Math.abs(f[k] - prev[k]) <= MAX_STEP, `${name}, frame ${i}: ${k} stepped ${prev[k].toFixed(2)} to ${f[k].toFixed(2)} in one frame`);
    // (the lobule's own detail dissolves by dropping pixels, so a step there is a few more dots, not a flash; it is still never switched in or out whole)
    if (f.dive !== prev.dive) assert.ok(f.ground < 0.01 && prev.ground < 0.01 && f.detail < 0.05 && prev.detail < 0.05, `${name}, frame ${i}: the dive frame was switched while its ground was drawn`);
    prev = f;
  }
}

test('Anatomy to Lobule and back, on a Mac and a phone: nothing the frame shows steps in one frame, and the dive frame is switched only when nothing of it is drawn', async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { DIVE_BODY_MS } = await import('../src/scene/camera/dive.ts');
  for (const size of [[1440, 900], [390, 844]] as [number, number][]) {
    const [settle, inn, out] = await fly(size, [['body', 'play', 0], ['lobule', lobuleShot('lobule'), DIVE_BODY_MS], ['body', 'play', DIVE_BODY_MS]]);
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

test('the two curves: the ground is none while the body is whole and all of it by half-way (no dip to the page); the veil is the organs\' own fade', () => {
  assert.equal(groundStays(1), 0); assert.equal(groundStays(0.5), 1); assert.equal(groundStays(0), 1);
  let prev = 0;
  for (let i = 0; i <= 100; i++) { const g = groundStays(1 - i / 100); assert.ok(g >= prev - 1e-12, 'only grows as the body goes'); prev = g; }
  // what a pixel of the liver shows (organ at 0.72 of its layer over the ground over the page) never goes further toward the page than the straight blend of its two ends
  const L = 0.6, F = 0.24, P = 0.1;
  for (let i = 0; i <= 100; i++) {
    const body = 1 - i / 100, a = groundStays(body), o = 0.72 * body;
    const px = o * L + (1 - o) * (a * F + (1 - a) * P), ends = body * (0.72 * L + 0.28 * P) + (1 - body) * F;
    assert.ok(px >= Math.min(ends, F) - 0.03, `body ${body.toFixed(2)}: ${px.toFixed(3)} against ${ends.toFixed(3)}`);
  }
  // the lobule's own detail rule is unchanged: whole at the lobule, none with the whole body far out
  assert.equal(lobuleStays(0, 0), 1); assert.equal(lobuleStays(1, 1), 0);
  assert.equal(veilShare(1, 1), 1); assert.equal(veilShare(0.4, 1), 0.4); assert.ok(Math.abs(veilShare(1, 0.3) - 0.3) < 1e-12); assert.equal(veilShare(0, 0), 0);
});
