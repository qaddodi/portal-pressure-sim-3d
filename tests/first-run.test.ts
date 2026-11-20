import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { START_PRESET } from '../src/engine/boot.ts';
import { DEFAULTS } from '../src/state/settings.ts';
import { resolveLook } from '../src/looks/looks.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a first run opens on the 2D app\'s patient: Healthy (2D store.js presetId: \'healthy\')', () => {
  assert.equal(START_PRESET, 'healthy');
  assert.match(read('src/ui/shell/store.ts'), /patientId: 'healthy',/, 'and the top bar names the same patient before the engine answers');
  assert.match(read('src/engine/boot.ts'), /preset = START_PRESET/);
});

test('a first run follows the device\'s light or dark, as 2D does with no saved theme (looks.js: nothing saved is System)', () => {
  assert.equal(DEFAULTS.look, 'system');
  assert.equal(DEFAULTS.lookChosen, false);
  assert.equal(resolveLook(DEFAULTS.look, true), 'dark');
  assert.equal(resolveLook(DEFAULTS.look, false), 'light');
});
