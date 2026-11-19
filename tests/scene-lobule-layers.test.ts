// The Layers menu starts as 2D's does (store.js: lobuleLayers { zones: false, lymph: true, bile: true }): the 3D build had Bile off, so the ductule, the canaliculi and the canals of Hering were missing until the owner found the switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pinned2D } from './two-d-pin.ts';
import { FIGURE_DEFAULTS } from '../src/ui/shell/store.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { createShared } from '../src/scene/materials/cel.ts';

test('the three layers start as 2D\'s: zones off, lymph on, bile on', () => {
  assert.deepEqual({ zones: FIGURE_DEFAULTS.zones, lymph: FIGURE_DEFAULTS.lymph, bile: FIGURE_DEFAULTS.bile }, { zones: false, lymph: true, bile: true });
  assert.deepEqual({ ...new LobuleView(createShared()).currentLayers }, { zones: false, lymph: true, bile: true });
});

test('and that is what the pinned 2D store says', (t) => {
  const two = pinned2D('src/ui/store.js');
  if (two.skip) return t.skip(String(two.skip));
  assert.match(readFileSync(`${two.repo}/src/ui/store.js`, 'utf8'), /lobuleLayers: \{ zones: false, lymph: true, bile: true \}/);
});
