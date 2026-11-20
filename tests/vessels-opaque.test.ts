// Every blood vessel is OPAQUE at rest, with exactly two flat tones and a bold outline (Mohammad, 20 Nov: "Why is the venacava glassy. 2 shades dude for blood vessels and prominent outlines."):
// no vessel material (body, outline, the cava's copy over the organs and its depth pass, a faded tip, a lens-coloured one) is blended, and no fragment writes an alpha below 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Material, Mesh } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { CASING } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { LOOK_IDS, PALETTES } from '../src/scene/palette.ts';

const mats = (m: Material | Material[]): Material[] => (Array.isArray(m) ? m : [m]);

test('no vessel material is transparent at rest: the body, the outline, the cava\'s copy over the organs and its depth pass, a faded tip, every look', () => {
  const s = new CelScene();
  let n = 0;
  for (const v of NETWORK) {
    const o = s.vesselObject(v.id);
    if (!o) continue;
    for (const id of LOOK_IDS) {
      o.applyPalette(PALETTES[id]);
      const all: Material[] = [...mats(o.toonMesh.material)];
      o.group.traverse((c) => { const m = (c as Mesh).material; if (m && c !== o.toonMesh) all.push(...mats(m)); });
      for (const m of all) { assert.equal(m.transparent, false, `${v.id} (${id}): ${m.type} is blended`); assert.equal(m.opacity, 1, `${v.id}: opacity`); n++; }
    }
  }
  assert.ok(n > 100, `${n} materials checked`);
  s.dispose();
});

test('no vessel fragment writes an alpha: the body is alpha 1, the outline is as opaque as the casing, a fade thins the tube instead', () => {
  assert.doesNotMatch(VESSEL_FS, /vFade|veilA|VEIL_A/, 'no fade or veil alpha in the shader');
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, 1\.0\);/);
  assert.equal(CEL_STYLE.INK_ALPHA_MIN, 1, 'the outline is solid ink');
  for (const id of LOOK_IDS) { assert.equal(CASING[id].a, 1, `${id}: casing`); assert.equal(CASING[id].circ.a, 1, `${id}: circuit casing`); }
  assert.ok(CEL_STYLE.TUBE.FADE_R > 0 && CEL_STYLE.TUBE.FADE_R < 0.5, 'a fade shrinks the radius toward a hairline');
});
