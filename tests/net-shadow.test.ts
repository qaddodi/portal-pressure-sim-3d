// S3, the crossing shadow, in the network shader (WP3, 22 Nov; review doc "Note for WP3 (the net shader): the crossing shadow"): the SHADOW program is the same vertex and fragment source with SHADOW defined, by the same rule as the old tubes' (tests/crossing-shadow.test.ts holds the
// look table: ONE table, cel-ink.ts SHADOW, written to the shadowCol/shadowA uniforms once per look). What it pins: the hull, its depth, the Circuit's over and under, no shadow from a fillet or an extension, the join fade and the tone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GL_PROGRAMS, NET_FS, NET_GLOBALS, NET_VS, NET_VS_COLUMNS, NET_FS_COLUMNS } from '../src/scene/vessels/net/shaders.ts';
import { EDGE_LAYOUT } from '../src/scene/vessels/net/edge-state.ts';
import { SHADOW_FEATHER } from '../src/scene/vessels/cel-ink.ts';
import { TUBE_DEPTH_SHARE } from '../src/scene/vessels/shaders.ts';

test('a SHADOW program exists (the figure draws the network once more through it), one program per network and no new source', () => {
  const p = GL_PROGRAMS.find((g) => g.name === 'net vessel SHADOW');
  assert.ok(p && p.vs === NET_VS && p.fs === NET_FS && p.defines.SHADOW === 1, 'the same sources with SHADOW defined');
});

test('the hull is the tube and its line made shadowPx wider, laid behind its own depth; on the Circuit the line has no bulge in depth and stands its own mapDepth', () => {
  assert.match(NET_VS, /shW = shadowPx \* wpcV \/ vU;/);
  assert.match(NET_VS, /o\.pad = inkW \+ shW \+ \(lumenW \+ inkW \+ shW\) \* ringSag \+ inflate;/, 'the hull is the line\'s hull plus the band, ring polygon included');
  assert.ok(NET_VS.includes(`TUBE_DEPTH_SHARE`) || NET_VS.includes(`${TUBE_DEPTH_SHARE.toFixed(2)} * (1.0 - circT)`));
  assert.match(NET_VS, /\(1\.0 - circT\)\) \* c\.w;/, 'a flat line on the Circuit has no bulge in depth');
  assert.match(NET_VS, /c\.z -= mapDepthAcc \* circT \* \(-projectionMatrix\[3\]\[2\]\) \/ c\.w;/);
  assert.match(NET_VS, /c\.z \+= mix\(shadowDepth, shadowDepthC, circT\) \* \(-projectionMatrix\[3\]\[2\]\) \/ c\.w;/);
  for (const c of ['mapDepth']) { assert.ok(NET_VS_COLUMNS.includes(c) && EDGE_LAYOUT.has(c), c); }
});

test('a fillet and the arms\' extensions cast no shadow, a joined end fades its band out, and the band is the old program\'s: feathered past the line, in the look\'s tone', () => {
  assert.match(NET_VS, /if \(region > -0\.5 \|\| region < -1\.5\) vOff = 1\.0;/);
  assert.ok(NET_FS_COLUMNS.includes('shadowEnd') && EDGE_LAYOUT.has('shadowEnd'));
  assert.match(NET_FS, /float endS = \(shadowEnd\.x > 0\.0 \? smoothstep\(0\.5 \* shadowEnd\.x \* rS, shadowEnd\.x \* rS, d0S\) : 1\.0\)/);
  assert.ok(NET_FS.includes(`smoothstep(${SHADOW_FEATHER} * shadowPx, shadowPx, sS)`));
  assert.match(NET_FS, /float aS = shadowA \* bandS \* endS \* fadeHere;/);
  assert.match(NET_FS, /gl_FragColor = vec4\(shadowCol, aS\);/);
  assert.match(NET_FS, /fadeHere \*= max\(solidK, veilK\);/, 'the band follows whichever copy of the vessel is showing');
  // the band follows the line of an artery as the lumen's line does (S8): the same art share
  assert.match(NET_FS, /float lineS = [^;]*, '1\.0 - lensUse'|float lineS = .*1\.0 - lensUse/);
  for (const g of ['shadowPx', 'shadowDepth', 'shadowDepthC', 'shadowA', 'shadowCol']) assert.ok(g in NET_GLOBALS, `${g} is a global (the look's table, once per look)`);
});
