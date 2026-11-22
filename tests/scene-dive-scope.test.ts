import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A close-up of the body at rest (a deck's zoom on the liver) is not a dive: the fade, the cut window and the field's softness apply only inside one.
const src = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');

test('body fade and cut window are gated to a dive', () => {
  assert.match(src, /this\.inDive\(\) \? bodyFade\(/);
  assert.match(src, /this\.inDive\(\) \? cam\.position\.distanceTo\(this\.livePoint\) : Infinity/);
  // (the dive's fade and cut window never touch depthWrite; the one place scene.ts sets it is the inspector's overlay balls, drawn over everything on purpose)
  const writes = src.split('\n').filter((l) => /depthWrite/.test(l));
  assert.ok(writes.every((l) => /new SphereGeometry\(u\.r/.test(l)), writes.join('\n'));
});
