// The splash stays until the app is ready (first frame drawn and the labels it places), then goes once (owner, 20 Nov: keep the splash until everything is loaded, then fade in).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = { documentElement: { dataset: {} as Record<string, string> } };
(globalThis as { document?: unknown }).document = doc;
const { holdSplash, figureDrawn, labelsShown, release, REVEAL_MS } = await import('../src/boot/ready.ts');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('held: nothing lifts the cover before a frame is drawn; the drawn frame and the next one (labels placed) lift it, once', async () => {
  let lifted = 0;
  holdSplash(() => { lifted++; });
  assert.equal(doc.documentElement.dataset.boot, 'wait');
  await wait(60); assert.equal(lifted, 0, 'no frame yet');
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
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /figureDrawn\(\);/);
  assert.match(readFileSync('src/main.tsx', 'utf8'), /holdSplash\(\);[\s\S]{0,200}render\(<StrictMode><App \/>/);
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
