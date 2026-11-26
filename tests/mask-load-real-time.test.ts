// A capture's icons are decoded under a bound, and the bound is on the network and the decoder: REAL time. Root cause of "a picture of the page did not load: .../assets/icons-r-BTePkLq1.png" (capture 414a0ce2,
// MASLD 3, the first picture of the run): the bound was page time, which the audit's 20x runs twenty times faster, so 4 s was 0.2 s and a file still arriving was called missing. The site served it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock } from '../src/clock/frame.ts';
import { loadMasks, MASK_WAIT_MS } from '../src/ui/capture/capture-dom.ts';
import type { ScreenItem } from '../src/ui/capture/capture-model.ts';

type Decode = () => Promise<void>;
function withImage<T>(decode: Decode, run: () => Promise<T>): Promise<T> {
  const g = globalThis as { Image?: unknown }, was = g.Image;
  g.Image = class { src = ''; decode = decode; };
  return run().finally(() => { g.Image = was; });
}
const mask = (url: string) => ({ k: 'mask', url } as ScreenItem);

test('a picture that is slow, not missing, is waited for in real time at any audit speed', async () => {
  clock.setScale(50);
  try {
    const slow: Decode = () => new Promise((ok) => setTimeout(ok, 120));   // (arrives after 120 real ms: 2.4 ms of page time at 50x)
    const got = await withImage(slow, () => loadMasks([mask('assets/icons-r-BTePkLq1.png')], 2000));
    assert.deepEqual(got, [], 'it arrived within its bound, so it is not reported');
  } finally { clock.setScale(1); }
});

test('a picture that never decodes is reported once its real bound has passed, not before', async () => {
  clock.setScale(50);
  try {
    const t0 = Date.now();
    const got = await withImage(() => new Promise<void>(() => undefined), () => loadMasks([mask('assets/never.png')], 150));
    assert.deepEqual(got, ['assets/never.png']);
    assert.ok(Date.now() - t0 >= 140, `waited ${Date.now() - t0} real ms for a 150 ms bound at 50x (page time would have cut it to 16)`);
  } finally { clock.setScale(1); }
});

test('a picture the decoder refuses is reported at once, and the default bound is seconds, not a blink', async () => {
  const got = await withImage(() => Promise.reject(new Error('broken')), () => loadMasks([mask('a.png'), mask('a.png')]));
  assert.deepEqual(got, ['a.png'], 'one report per address');
  assert.ok(MASK_WAIT_MS >= 4000);
});
