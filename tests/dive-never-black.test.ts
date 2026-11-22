// The black first dive (22 Nov 2026, iPhone): the camera flew into the liver and the body dissolved by distance alone while the 3D lobule and sinusoid were still unbuilt, so nothing was drawn
// at all. The rule now: a dive is never begun toward something that cannot be drawn (scene.goTo holds it until the micro views are primed, rushing their build), and the body never dissolves
// further than the dive's parts can replace it (fadeBody's `diveReady`). These pin both guards, and the slot's part (a rushed job runs under holds, in longer slices).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQuiet, RUSH_BUDGET_MS, type QuietEnv } from '../src/clock/idle.ts';

type Priv = {
  figureView: string; hideLeftBehind: boolean; fadeNow: number; microReady: boolean; microPrimedNow: boolean; diveHeld: boolean;
  dive: { visible: boolean }; livePoint: unknown; rig: { camera: { position: { copy(v: unknown): void } }; goTo: (...a: unknown[]) => void };
  diveReady: { step(now: number): void; value: number }; fadeBody(): void; buildMicro(): void; microStep(): boolean; buildMicroIdle(u?: boolean): void;
  goTo(shot: unknown, room: unknown, now: number, ms?: number): void; holdRoom(r: unknown): void;
  micro: { sinus: { prepareShapeStep(): boolean } };
};
const room = { x: 0, y: 0, w: 800, h: 600 };

test('a dive into the lobule waits for its 3D parts: the camera does not move until they are built and primed, then the held move starts (newest room)', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const sc = new CelScene() as unknown as Priv;
  const moves: unknown[][] = [];
  sc.rig.goTo = (...a: unknown[]) => { moves.push(a); };
  let asked = 0; sc.buildMicroIdle = () => { asked++; };   // (the slot is driven by hand below)
  sc.figureView = 'lobule';
  sc.goTo('lobule', room, 0, 1200);
  assert.equal(moves.length, 0, 'no dive toward nothing');
  assert.equal(sc.diveHeld, true);
  assert.ok(asked > 0, 'and the build is asked for, urgently');
  const late = { x: 0, y: 0, w: 500, h: 600 };
  sc.holdRoom(late);
  while (!sc.microStep()) { /* the micro views' steps, as the slot would run them */ }
  assert.equal(sc.microPrimedNow, true);
  assert.equal(moves.length, 1, 'the held dive starts the moment they are ready');
  assert.equal(moves[0]![0], 'lobule'); assert.deepEqual(moves[0]![1], late); assert.equal(moves[0]![3], 1200);
  assert.equal(sc.diveHeld, false);
  sc.goTo('lobule:triad', room, 0);
  assert.equal(moves.length, 2, 'once ready, moves go straight through');
});

test('a held dive is dropped when the view changes back before the parts are ready', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const sc = new CelScene() as unknown as Priv;
  const moves: unknown[][] = [];
  sc.rig.goTo = (...a: unknown[]) => { moves.push(a); };
  sc.buildMicroIdle = () => {};
  sc.figureView = 'lobule'; sc.goTo('lobule', room, 0);
  sc.figureView = 'body'; sc.goTo('play', room, 0);
  assert.equal(moves.length, 1); assert.equal(moves[0]![0], 'play');
  while (!sc.microStep()) { /* ready later */ }
  assert.equal(moves.length, 1, 'the old dive does not start behind the user');
});

test('the body never dissolves into nothing: unbuilt parts keep it whole, built ones take over on an ease, never at once', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const { clock } = await import('../src/clock/frame.ts');
  const sc = new CelScene() as unknown as Priv;
  // the camera at the lobule's own place, as at the end of a dive: distance alone would dissolve the body completely (bodyFade(0) = 0)
  sc.rig.camera.position.copy(sc.livePoint); sc.figureView = 'lobule'; sc.hideLeftBehind = true;
  assert.equal(sc.microReady, false);
  sc.fadeBody();
  assert.equal(sc.fadeNow, 1, 'the body stays while the dive has nothing to draw');
  assert.equal(sc.dive.visible, false);
  sc.buildMicro(); while (!sc.micro.sinus.prepareShapeStep()) { /* shapes */ }
  assert.equal(sc.microReady, true);
  sc.fadeBody();
  assert.ok(sc.fadeNow > 0.99, 'ready, the hand-over begins: no pop');
  sc.diveReady.step(clock.now() + 175); sc.fadeBody();
  assert.ok(sc.fadeNow > 0 && sc.fadeNow < 1, `half way the body is part dissolved (${sc.fadeNow})`);
  assert.equal(sc.dive.visible, true, 'the lobule comes in under it');
  sc.diveReady.step(clock.now() + 2000); sc.fadeBody();
  assert.equal(sc.fadeNow, 0, 'handed over');
});

test('every camera move goes through the one gate, and a dead micro job is made again', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const src = strip(readFileSync('src/scene/scene.ts', 'utf8'));
  assert.equal((src.match(/this\.rig\.goTo\(/g) ?? []).length, 1, 'scene.goTo is the only caller of rig.goTo');
  for (const f of ['src/scene/api.ts', 'src/ui/shell/view-actions.ts', 'src/ui/talk/controls-run.ts']) assert.doesNotMatch(strip(readFileSync(f, 'utf8')), /rig\.goTo\(/, `${f} moves the camera through cel.goTo`);
  assert.match(src, /if \(this\.microJob\?\.done\) this\.microJob = null;/);
  assert.match(src, /else this\.hold\(null\);/, 'leaving the micro views drops a waiting dive');
  assert.match(src, /!this\.circuit\.moving && !this\.heldDive\) this\.settleViews\(\)/, 'a waiting dive has not landed: the views do not settle on it');
  assert.match(src, /if \(urgent\) this\.microJob\.rush\(\);/);
  assert.doesNotMatch(readFileSync('src/scene/Stage.tsx', 'utf8'), /buildMicroIdle\(true\)/, 'the boot build is background work, not urgent');
});

test('a rushed job runs under a live hold, in slices of at least RUSH_BUDGET_MS', () => {
  let t = 0, held = 1;
  const timers: { at: number; fn: () => void }[] = [], posts: (() => void)[] = [];
  const env: QuietEnv = {
    now: () => t, held: () => held, onCalm: () => () => {}, after: (fn, ms) => { timers.push({ at: t + ms, fn }); return timers.length; }, cancel: () => {},
    post: (fn) => { posts.push(fn); }, input: { last: () => -1e9, down: () => false },
  };
  const q = createQuiet(env);
  const ran: number[] = [];
  const h = q.whenQuiet(() => { ran.push(t); t += 1; return ran.length >= 40; }, { tag: 'micro', budgetMs: 4 });
  while (posts.length) posts.shift()!();
  assert.equal(ran.length, 0, 'unrushed: nothing under the hold');
  h.rush();
  while (posts.length) posts.shift()!();
  assert.ok(ran.length >= RUSH_BUDGET_MS, `one rushed slice took ${ran.length} 1 ms steps`);
  held = 0;
});
