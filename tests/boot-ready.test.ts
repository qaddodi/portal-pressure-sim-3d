// The splash stays until the app is ready (first frame drawn and the labels it places), then goes once (owner, 20 Nov: keep the splash until everything is loaded, then fade in).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = { documentElement: { dataset: {} as Record<string, string> } };
(globalThis as { document?: unknown }).document = doc;
const { holdSplash, figureDrawn, labelsShown, release, compileDone, programsCompiled, REVEAL_MS } = await import('../src/boot/ready.ts');
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
  assert.equal(doc.documentElement.dataset.reveal, '1', 'the figure settles in from a mild zoom as the cover goes');
  await wait(REVEAL_MS + 80); assert.equal(doc.documentElement.dataset.reveal, undefined, 'and the zoom flag is taken off again');
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

test('the zoom is on the figure and its label layer together (the same centre), one scale each, and off for Reduce Motion; LabelLayer reports full labels', () => {
  const css = readFileSync('src/ui/shell/global.css', 'utf8');
  assert.match(css, /html\[data-reveal\] :is\(\.stage-root, \.lb-layer\)[^}]*animation: boot-reveal/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ html\[data-reveal\] :is\(\.stage-root, \.lb-layer\) \{ animation: none/);
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /className="stage-root"/);
  assert.match(readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), /labelsShown\(\)/);
});

// ---- release review 21 Nov #1: the slow note must never strand a ready app behind the cover ------------------------------------------------------
// Run the shipped inline script against a tiny fake DOM, in both event orders (ready before the slow note, ready after it), and a real failure.
async function runCover(order: 'ready-then-slow' | 'slow-then-ready' | 'keep-waiting-then-ready' | 'renderer-failure') {
  const { Script, createContext } = await import('node:vm');
  const html = readFileSync('index.html', 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((c) => c.includes('ppsBootLift'))!;   // (the page's first inline script is the saved look's ground, boot-look.test.ts)
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
  // the unguarded 20 s timer also lifts a slow note whatever happened (the 2D page's last word)
  const d = await runCover('slow-then-ready'); d.advance(8500); d.advance(21000);
  assert.equal(d.boot.className, 'done', 'the 20 s timer lifts a slow (not failed) cover');
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

test('the baked-skin fetch and decode are bounded, and startup spans wrap decode, build, compile and each view\'s first draw; the warm-up and the late build are serialised', () => {
  const baked = readFileSync('src/scene/vessels/skin/baked.ts', 'utf8');
  assert.match(baked, /BAKED_FETCH_MS/); assert.match(baked, /BAKED_DECODE_MS/); assert.match(baked, /spanAsync\(`decode:/);
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(stage, /firstDraw\(cel\.view/); assert.match(stage, /spanAsync\('compile:warm'/);
  assert.match(stage, /Promise\.race\(\[all, new Promise[\s\S]{0,160}compileDone\(\)/, 'the warm-up is capped and then reports the compile done: the cover waits for it');
  assert.match(stage, /if \(!compiled\.current\) return;/, 'and the first frame waits for it too');
  assert.match(stage, /clock\.after\(\(\) => cel\.buildMicroIdle\(\), 400\)/, 'the meshes are built after the first picture, once everything is compiled');
  assert.doesNotMatch(stage, /warm\(\); cel\.buildMicroIdle\(\)/);
  assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /span\('build:lobule3d'/);
  assert.match(readFileSync('src/ui/perf/mount.ts', 'utf8'), /spans: spans\(\)/);
});
