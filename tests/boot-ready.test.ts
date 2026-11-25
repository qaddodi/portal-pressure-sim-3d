// The splash stays until the app is ready (first frame drawn and the labels it places), then goes once (owner, 20 Nov: keep the splash until everything is loaded, then fade in).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = { documentElement: { dataset: {} as Record<string, string> } };
(globalThis as { document?: unknown }).document = doc;
const { holdSplash, figureDrawn, labelsShown, release, compileDone, programsCompiled, setRevealHooks, watchStall, BOOT_STALL_MS, REVEAL_MS, REVEAL_DELAY_MS, REVEAL_ZOOM } = await import('../src/boot/ready.ts');
const { stamp, resetTimeline } = await import('../src/boot/timeline.ts');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('held: nothing lifts the cover before a frame is drawn; the drawn frame and the next one (labels placed) lift it, once', async () => {
  let lifted = 0;
  holdSplash(() => { lifted++; });
  assert.equal(doc.documentElement.dataset.boot, 'wait');
  await wait(60); assert.equal(lifted, 0, 'no frame yet');
  figureDrawn(); figureDrawn(); await wait(200);
  assert.equal(lifted, 0, 'a frame before the programs are compiled does not count (L3): the cover never lifts on a figure that would still compile in front of the viewer');
  assert.equal(programsCompiled(), false);
  compileDone(); assert.equal(programsCompiled(), true);
  figureDrawn(); figureDrawn();
  assert.equal(lifted, 0, 'the frame is not enough: the labels are placed in the next one');
  await wait(200);
  assert.equal(lifted, 0, 'and placed is not enough either: they must be fully faded in (labelsShown), or the figure would fade in with labels still coming');
  labelsShown(); await wait(200);
  assert.equal(lifted, 1); assert.equal(doc.documentElement.dataset.boot, undefined);
  assert.equal(doc.documentElement.dataset.reveal, undefined, 'no CSS zoom flag any more: the settle is the camera\'s own glide (the reveal hooks below)');
  release(); figureDrawn(); await wait(60);
  assert.equal(lifted, 1, 'never twice');
});

test('a held start that never draws is released by the failsafe path (release), and a page that never held lifts nothing', () => {
  let lifted = 0;
  holdSplash(() => { lifted++; });
  release(); assert.equal(lifted, 1);
  release(); assert.equal(lifted, 1);
});

test('the wiring: the page lifts its cover for the app only on the ready signal, Stage reports each drawn frame, main holds the splash before mounting', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /data-boot'\)==='wait'\)return false/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /if \(cel\.rig\.placed\) figureDrawn\(\);/);
  assert.match(readFileSync('src/main.tsx', 'utf8'), /holdSplash\(\);[\s\S]{0,200}render\(<StrictMode><AppBoundary layer="root"><App \/>/);
});

test('index.html\'s inline boot script is valid JavaScript (a syntax error there takes the whole cover logic with it: the splash then never lifts, not even by its failsafe)', async () => {
  const { Script } = await import('node:vm');
  const html = readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  assert.ok(scripts.length >= 1);
  for (const code of scripts) assert.doesNotThrow(() => new Script(code), 'an inline script must parse');
  assert.match(html, /w\.ppsBootLift=lift/);
});

// ---- splash plan A2 + A6 (22 Nov): the settle is the rig's own glide, so each frame is drawn crisp at full resolution and the labels follow by projection (the CSS scale of the finished canvas resampled both soft) ----
test('the reveal: the closer view is put in under the cover on the first drawn frame, the glide home starts 120 ms after the lift, and a start released without a first frame never plays it', async () => {
  const calls: string[] = [];
  setRevealHooks({ prime: (z) => calls.push(`prime ${z}`), play: (ms) => calls.push(`play ${ms}`) });
  holdSplash(() => calls.push('lift'));
  compileDone(); figureDrawn(); labelsShown();
  for (let i = 0; i < 100 && !calls.includes('lift'); i++) await wait(4);
  assert.equal(calls[0], `prime ${REVEAL_ZOOM}`, 'primed with the first frame, behind the cover');
  assert.ok(calls.includes('lift'));
  assert.equal(calls.filter((c) => c.startsWith('play')).length, 0, 'the glide waits for the cover to begin its fade (A6)');
  await wait(REVEAL_DELAY_MS + 60);
  assert.deepEqual(calls.filter((c) => c.startsWith('play')), [`play ${REVEAL_MS}`], 'played once, 900 ms');
  assert.ok(REVEAL_ZOOM > 1 && REVEAL_ZOOM <= 1.05 && REVEAL_DELAY_MS === 120);
  setRevealHooks(null);
});

test('the zoom is no longer a CSS scale of the canvas; the rig glides it (primed under the cover, settled at the lift); LabelLayer reports full labels', () => {
  const css = readFileSync('src/ui/shell/global.css', 'utf8');
  assert.doesNotMatch(css, /boot-reveal|data-reveal/, 'no keyframes on the figure or its label layer: nothing resamples a finished bitmap');
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /setRevealHooks\(\{ prime: \(zoom\) => cel\.primeReveal\(zoom\), play: \(ms\) => \{ cel\.playReveal\(clock\.now\(\), ms, easeArrive\)/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /className="stage-root"/);
  assert.match(readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), /labelsShown\(\)/);
});

// ---- release review 21 Nov #1: the slow note must never strand a ready app behind the cover ------------------------------------------------------
// Run the shipped inline script against a tiny fake DOM, in both event orders (ready before the slow note, ready after it), and a real failure.
async function runCover(order: 'ready-then-slow' | 'slow-then-ready' | 'keep-waiting-then-ready' | 'renderer-failure') {
  const { Script, createContext } = await import('node:vm');
  const html = readFileSync('index.html', 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((c) => c.includes('ppsBootLift'))!;   // (the cover's script: found by what it defines, not by its place: the look script before it came first from 22 Nov)
  const timers: { at: number; fn: () => void; id: number }[] = []; let now = 0, nid = 0;
  const mkEl = (id: string) => {
    const attrs: Record<string, string> = {};
    const el: any = { id, className: '', innerHTML: '<i>orig</i>', parentNode: { removeChild() { el.removed = true; } }, removed: false, children: {} as Record<string, any>,
      getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; }, removeAttribute: (k: string) => { delete attrs[k]; }, hasAttribute: (k: string) => k in attrs,
      querySelector: (sel: string) => { const m = /\[(data-[a-z]+)\]/.exec(sel)?.[1]; if (!m || !el.innerHTML.includes(m)) return null; return (el.children[m] ??= {}); } };
    return el;
  };
  const boot = mkEl('boot'), root = mkEl('root'); root.firstChild = null;
  const listeners: Record<string, (() => void)[]> = {};
  const ctx: any = { document: { getElementById: (i: string) => (i === 'boot' ? boot : i === 'root' ? root : null), documentElement: { getAttribute: () => 'wait' }, addEventListener: (e: string, f: () => void) => { (listeners[e] ??= []).push(f); } },
    addEventListener() {}, MutationObserver: class { observe() {} disconnect() {} }, navigator: { userAgent: 'test' }, location: { reload() { ctx.reloaded = true; } }, performance: { now: () => now },
    setTimeout: (fn: () => void, ms: number) => { const id = ++nid; timers.push({ at: now + ms, fn, id }); return id; }, clearTimeout: (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); }, console };
  ctx.window = ctx; createContext(ctx); new Script(code).runInContext(ctx);
  listeners.DOMContentLoaded!.forEach((f) => f());
  const advance = (to: number) => { for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > to) break; timers.shift(); now = t.at; t.fn(); } now = to; };
  return { ctx, boot, root, advance, ready: () => ctx.ppsBootLift() };
}

test('inline cover: ready BEFORE the slow note lifts it and takes the covered app out of inert', async () => {
  const c = await runCover('ready-then-slow');
  assert.equal(c.root.hasAttribute('inert'), true, 'the covered app is inert while the cover is up');
  c.advance(5000); c.ready(); c.advance(6000);
  assert.equal(c.boot.className, 'done'); assert.equal(c.root.hasAttribute('inert'), false);
  c.advance(16000); assert.equal(c.boot.className, 'done', 'the slow note never comes after a lift');
});

test('inline cover: ready AFTER the slow note (the stranded case) still lifts it; the note is the recoverable class "slow", not "failed"', async () => {
  const c = await runCover('slow-then-ready');
  c.advance(8500);
  assert.equal(c.boot.className, 'slow'); assert.match(c.boot.innerHTML, /Still loading/);
  c.ready(); c.advance(16200);
  assert.equal(c.boot.className, 'done', 'a ready signal in the slow state reveals the app'); assert.equal(c.root.hasAttribute('inert'), false);
});

test('inline cover: Keep waiting restores the splash and a ready signal after it still lifts; with ready already in, Keep waiting lifts at once', async () => {
  const c = await runCover('keep-waiting-then-ready');
  c.advance(8500); c.boot.children['data-wait'].onclick();
  assert.equal(c.boot.className, '', 'Keep waiting buys a fresh 8 s'); c.advance(12000); assert.equal(c.boot.className, ''); c.ready(); c.advance(13000);
  assert.equal(c.boot.className, 'done');
  // no word of the clock lifts a slow note (independent review F12): it stays, with Reload and Keep waiting, until the app is ready
  const d = await runCover('slow-then-ready'); d.advance(8500); d.advance(21000); assert.equal(d.boot.className, 'slow', 'a held app is not lifted at 20 s');
  d.advance(46000); d.advance(120000);
  assert.equal(d.boot.className, 'slow', 'nor later: the clock never lifts a cover onto a figure that is not drawn');
  d.ready(); d.advance(121000);
  assert.equal(d.boot.className, 'done', 'the app being ready does');
});

test('inline cover: a genuinely failed renderer stays up with Reload and a link to the 2D simulator, and nothing lifts it', async () => {
  const c = await runCover('renderer-failure');
  c.ctx.ppsBootRendererFail('context lost');
  assert.equal(c.boot.className, 'failed'); assert.match(c.boot.innerHTML, /Reload/); assert.match(c.boot.innerHTML, /portal-pressure-simulator\//); assert.match(c.boot.innerHTML, /2D simulator/);
  c.ready(); c.advance(30000);
  assert.equal(c.boot.className, 'failed', 'a terminal failure is not lifted by a late ready or the 20 s timer');
});

test('rendererFailed: before the first picture it calls the page, after a release it does nothing', async () => {
  const { rendererFailed } = await import('../src/boot/ready.ts');
  const calls: string[] = []; (globalThis as any).window = { ppsBootRendererFail: (r: string) => calls.push(r) };
  holdSplash(() => undefined); rendererFailed('lost'); rendererFailed('again');
  assert.deepEqual(calls, ['lost'], 'once');
  holdSplash(() => undefined); release(); rendererFailed('late');
  assert.deepEqual(calls, ['lost'], 'a released start is left alone');
  delete (globalThis as any).window;
});

test('the baked-skin fetch is bounded by progress, and startup spans wrap decode, build, compile and each view\'s first draw; the warm-up and the late build are serialised', () => {
  const baked = readFileSync('src/scene/vessels/skin/baked.ts', 'utf8');
  assert.match(baked, /fetchBin\(/); assert.doesNotMatch(baked, /BAKED_FETCH_MS|BAKED_DECODE_MS/, 'no clock bound on the fetch or the decode'); assert.match(baked, /spanAsync\(`decode:/);
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(stage, /firstDraw\(cel\.view/); assert.match(stage, /spanAsync\('compile:warm'/);
  assert.match(stage, /Promise\.race\(\[all, new Promise[\s\S]{0,320}compileDone\(\)/, 'the warm-up is capped and then reports the compile done: the cover waits for it');
  assert.match(stage, /if \(!compiled\.current\) return;/, 'and the first frame waits for it too');
  assert.match(stage, /clock\.after\(\(\) => cel\.buildMicroIdle\(\), 400\)/, 'the meshes are built after the first picture, once everything is compiled');
  assert.doesNotMatch(stage, /warm\(\); cel\.buildMicroIdle\(\)/);
  assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /span\('build:lobule3d'/);
  assert.match(readFileSync('src/ui/perf/mount.ts', 'utf8'), /spans: spans\(\)/);
});

// The failsafe is about progress, not the clock (22 Nov splash review, item 5): a start that keeps stamping stages keeps the cover; one that stops for the stall time lifts it.
test('watchStall: a new stage stamped restarts the quiet time; no stage for the quiet time stalls; a dead watch is honoured (and there is no total limit: only progress is watched)', async () => {
  resetTimeline();
  assert.ok(BOOT_STALL_MS > 0);
  const t0 = Date.now(); let stalledAt = 0;
  watchStall(() => { stalledAt = Date.now() - t0; }, 1000, () => true);
  await wait(700); stamp('engine'); await wait(700); stamp('scene');   // (progress at 0.7 s and 1.4 s: the quiet time starts again each time)
  await wait(1300);
  assert.ok(stalledAt === 0 || stalledAt > 2300, `stamped stages kept it waiting (${stalledAt})`);
  await wait(1200);
  assert.ok(stalledAt >= 2300 && stalledAt <= 3600, `a second of quiet after the last stage stalls it (${stalledAt})`);
  let dead = 0;
  const off = watchStall(() => { dead++; }, 600, () => true); off(); await wait(900);
  assert.equal(dead, 0, 'a cancelled watch never fires');
  let gone = 0; watchStall(() => { gone++; }, 600, () => false); await wait(900);
  assert.equal(gone, 0, 'a watch whose start has ended never fires');
  resetTimeline();
});

test('the failsafe is the stall watch, not a fixed timer, and the warm-up\'s cap is the same watch', () => {
  const ready = readFileSync('src/boot/ready.ts', 'utf8'), stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(ready, /stallOff = watchStall\(\(\) => \(frames >= 0 \? release\(\) : false\)\)/);
  assert.doesNotMatch(ready, /BOOT_HARD_MS/, 'no total-time limit lifts the cover (independent review F12)');
  assert.doesNotMatch(ready, /BOOT_FAILSAFE_MS/);
  assert.match(stage, /watchStall\(\(\) => r\(\), undefined, \(\) => alive && !compiled\.current\)/);
  assert.doesNotMatch(stage, /WARM_CAP_MS/);
});

// ---- 22 Nov, Mohammad: "even after the loading finishes, black screen for a bit, then the figure pops out without labels, then the labels pop out". Root cause: the cover was lifted by a quiet spell
// (watchStall) BEFORE the figure had drawn: the warm-up's own cap fires on the same spell, so the cover went up as the first frame was about to be drawn, onto the bare ground; then the figure came in, then the labels.
test('a quiet spell before the first frame never lifts the cover (nothing does but the figure being drawn); after the first frame it does; labels still coming in are waited for', async () => {
  resetTimeline();
  let lifted = 0;
  holdSplash(() => { lifted++; });
  const calls: boolean[] = []; const keep = watchStall(() => { calls.push(false); return false; }, 300, () => true);
  await wait(2300); keep();
  assert.ok(calls.length >= 3 && calls.every((h) => h === false), `a handler that says "not yet" is asked again after each new quiet spell (${calls.length})`);
  const src = readFileSync('src/boot/ready.ts', 'utf8');
  assert.match(src, /watchStall\(\(\) => \(frames >= 0 \? release\(\) : false\)\)/, 'the cover\'s own stall watch lifts only a start that has drawn its figure');
  assert.equal(lifted, 0);
  release();
  // labels: progress restarts the grace; the same sum does not
  const lab = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.match(lab, /labelsProgress\(ctl\.out\.reduce/);
  assert.match(src, /Math\.max\(firstAt, labelsAt\) > LABELS_GRACE_MS/);
  assert.match(src, /export function compileDone\(\): void \{\n  compiled = true;\n  reveal\?\.prime\(REVEAL_ZOOM\)/, 'the closer view is in before the first frame: the labels are placed over the view they are lifted over');
});
