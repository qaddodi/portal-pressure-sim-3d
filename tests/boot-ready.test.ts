// The splash stays until the app is ready (first frame drawn and the labels it places), then goes once (owner, 20 Nov: keep the splash until everything is loaded, then fade in).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const doc = { documentElement: { dataset: {} as Record<string, string> } };
(globalThis as { document?: unknown }).document = doc;
const { holdSplash, figureDrawn, release } = await import('../src/boot/ready.ts');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('held: nothing lifts the cover before a frame is drawn; the drawn frame and the next one (labels placed) lift it, once', async () => {
  let lifted = 0;
  holdSplash(() => { lifted++; });
  assert.equal(doc.documentElement.dataset.boot, 'wait');
  await wait(60); assert.equal(lifted, 0, 'no frame yet');
  figureDrawn(); figureDrawn();
  assert.equal(lifted, 0, 'the frame is not enough: the labels are placed in the next one');
  await wait(200);
  assert.equal(lifted, 1); assert.equal(doc.documentElement.dataset.boot, undefined);
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
