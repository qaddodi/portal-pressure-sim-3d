// A collateral's blend writes only the stretch of each reshape attribute that differs between its two key frames, so it must tell three to upload only that stretch (addUpdateRange), not the whole buffer, 7 buffers per blended vessel per frame.
// The first blend after a new pair uploads whole (the pair's held values were written in full). Run: node --test tests/reshape-upload-range.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/scene/vessels/vessel-object.ts', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('reshapeLerp(a: ReshapeFrame'), src.indexOf('Smooth joins: the lens colour'));

test('reshapeLerp uploads only the blended stretch, and the whole array once per new pair', () => {
  assert.match(body, /if \(!this\.lerpFull\) \(dst as BufferAttribute\)\.addUpdateRange\(sp\.lo, sp\.hi - sp\.lo\);\s*\n\s*dst\.needsUpdate = true;/);
  assert.match(body, /this\.lerpFull = true;/, 'a new pair: its first blend carries the full write');
  assert.match(body, /this\.lerpFull = false;/);
});
