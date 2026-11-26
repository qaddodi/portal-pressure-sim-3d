// Integration review I2 (22 Nov): a wait on something the page does not drive (the network, a decode, the fonts, the splash's failsafe, a lazy part's retry) is in REAL time.
// `clock.after` is page time, which the audit's speed mode (?audit&speed=N) runs N times faster, so a bound on outside work would fire N times early.
// (src/engine/pool.ts and boot.ts are the app's own wrappers round the vendored engine: scripts/sync-engine.mjs writes only src/engine/hales/.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SITES: Record<string, RegExp> = {
  'src/engine/pool.ts': /clock\.afterReal\(\(\) => this\.fail\(/,
  'src/engine/boot.ts': /clock\.afterReal\(\(\) => mine\.crash\(/,
  'src/boot/fetch-bin.ts': /timer = clock\.afterReal\(poll, step, 'fetch-quiet'\)/,   // (every data file's quiet watch: the baked skins, welds, organs and the organs' art)
  // (the capture's picture decode: at 20x its 4 s was 0.2 s and the first picture of a run reported icons-r-....png missing, capture 414a0ce2, MASLD 3)
  'src/ui/capture/capture-dom.ts': /clock\.afterReal\(\(\) => no\(false\), waitMs, 'mask-load'\)/,
  'src/ui/shell/talk.ts': /waitReal\(1500\)/,
  'src/ui/histories/open.ts': /clock\.afterReal\(done, DAYS_WAIT_MS/,
  'src/ui/shell/send-feedback.ts': /clock\.afterReal\(\(\) => ok\(null\), FEEDBACK_READ_MS\)/,
  'src/boot/fonts.ts': /clock\.afterReal\(\(\) => res\(false\), timeoutMs\)/,
  'src/boot/ready.ts': /clock\.afterReal\(poll, STALL_POLL_MS\)/,
  'src/boot/lazy-retry.ts': /clock\.afterReal\(r, ms\)/,
  // (the second engine's work out of the slide's numbers: 8 s of page time at the audit's 20x was 0.4 s, and the card came in before them, Ten years 13, capture f23a4c59)
  'src/ui/cards/CardLayer.tsx': /clock\.afterReal\(\(\) => setGaveUp\(numbersKey\), GIVE_UP_MS\)/,
};
test('waits on the network, a decode, the fonts and the failsafe are real time', () => {
  for (const [f, re] of Object.entries(SITES)) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), re, f);
});
