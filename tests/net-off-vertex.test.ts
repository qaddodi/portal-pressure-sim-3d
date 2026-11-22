// A triangle with a vertex that is not drawn (a fillet with no share, an extension its fillet hides) is discarded WHOLE. Before, such a vertex had vDraw 0 against its neighbour's 1, and the interpolated value
// (between 0 and 1 across the strip) sent the screen dither over the strip: the speckled checker patches over the IVC at a hepatic confluence on Mohammad's iPhone (22 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NET_FS, NET_VS } from '../src/scene/vessels/net/shaders.ts';

test('no vertex is given vDraw 0: an off vertex sets vOff, which both stages declare', () => {
  assert.doesNotMatch(NET_VS, /vDraw = 0\.0/);
  assert.match(NET_VS, /varying float vOff;/); assert.match(NET_FS, /varying float vOff;/);
  assert.match(NET_VS, /vOff = 1\.0/g);
  assert.ok(NET_FS.includes('if (vOff > 0.001) discard;'), 'any pixel with weight from an off vertex goes');
  assert.ok(NET_FS.indexOf('vOff > 0.001') < NET_FS.indexOf('vec3 n = normalize(vN);'), 'before the shading');
});

test('the three ways a vertex is off all set it: no share, a hidden extension, the shadow program\'s fillets and extensions', () => {
  assert.match(NET_VS, /if \(share <= 0\.0\) vOff = 1\.0;/);
  assert.match(NET_VS, /if \(esh >= 0\.999\) vOff = 1\.0;/);
  assert.match(NET_VS, /#ifdef SHADOW[\s\S]*?if \(region > -0\.5 \|\| region < -1\.5\) vOff = 1\.0;/);
});
