// A slide's data card is let in only once the Tests pane its instrument is has been read in (capture 15c31759: Stiffness 2 and Pregnancy 5 were cut off at the card's foot
// because the card was measured at the pane's placeholder height). Every instrument kind a built-in talk uses maps to a pane or to none, and the card layer asks for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paneOf, paneIn } from '../src/ui/talk/pane-load.ts';
import { INSTRUMENTS } from '../src/ui/talk/instruments.ts';

test('the lazy instrument kinds map to their pane, the others to none', () => {
  assert.equal(paneOf('doppler'), 'doppler');
  assert.equal(paneOf('fibroscan'), 'fibroscan');
  assert.equal(paneOf('scope'), 'endo');
  assert.equal(paneOf('wall'), 'endo');
  for (const k of ['hvpg', 'reading', 'abdomen', 'curve', undefined]) assert.equal(paneOf(k), null, String(k));
  assert.equal(paneIn(null), true);
  assert.equal(paneIn('fibroscan'), false);
});

test('every lazy pane in the tool card comes from pane-load, and the card layer waits on it', () => {
  const body = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  assert.ok(!/lazyRetry\(\(\) => import\(/.test(body), 'ToolCardBody imports a pane on its own, so the card layer cannot wait for it');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /usePaneIn\(paneKind\)/);
  assert.match(layer, /\(panesIn \|\| late === pagesKey\)/);
  const lazyKinds = INSTRUMENTS.map((i) => i.kind).filter((k) => paneOf(k));
  assert.deepEqual(lazyKinds.sort(), ['doppler', 'fibroscan', 'scope', 'wall']);
});
