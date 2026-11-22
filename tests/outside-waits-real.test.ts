// Integration review I2 (22 Nov): a wait on something the page does not drive (the network, a decode, the fonts, the splash's failsafe, a lazy part's retry) is in REAL time.
// `clock.after` is page time, which the audit's speed mode (?audit&speed=N) runs N times faster, so a bound on outside work would fire N times early.
// (src/engine/pool.ts and boot.ts are the app's own wrappers round the vendored engine: scripts/sync-engine.mjs writes only src/engine/hales/.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SITES: Record<string, RegExp> = {
  'src/engine/pool.ts': /clock\.afterReal\(\(\) => this\.fail\(/,
  'src/engine/boot.ts': /clock\.afterReal\(\(\) => mine\.crash\(/,
  'src/scene/vessels/skin/baked.ts': /clock\.afterReal\(\(\) => no\(new Error\(`\$\{what\} took over/,
  'src/boot/fonts.ts': /clock\.afterReal\(\(\) => res\(false\), timeoutMs\)/,
  'src/boot/ready.ts': /clock\.afterReal\(poll, STALL_POLL_MS\)/,
  'src/boot/lazy-retry.ts': /clock\.afterReal\(r, ms\)/,
};
test('waits on the network, a decode, the fonts and the failsafe are real time', () => {
  for (const [f, re] of Object.entries(SITES)) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), re, f);
});
