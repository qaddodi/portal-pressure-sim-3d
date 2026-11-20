// Every blood vessel is OPAQUE at rest, with exactly two flat tones and a bold outline (Mohammad, 20 Nov: "Why is the venacava glassy. 2 shades dude for blood vessels and prominent outlines."), EXCEPT through its fade
// zone (a tip into its organ, a bed through the lobe, a vein into the cava): there, and only there, the body AND its outline fade together by opacity (1 to 0 over the zone), at full width (no taper:
// "no fades to end of vessels?" — a thinned tube read as a needle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Material, Mesh } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { CASING } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { LOOK_IDS, PALETTES } from '../src/scene/palette.ts';

const mats = (m: Material | Material[]): Material[] => (Array.isArray(m) ? m : [m]);

test('a vessel material is transparent only through a fade zone: the body, the outline, the cava\'s copy over the organs, every look', () => {
  const s = new CelScene();
  let n = 0, faded = 0;
  for (const v of NETWORK) {
    const o = s.vesselObject(v.id);
    if (!o) continue;
    const inZone = (o.toon.uniforms.fadeMode!.value as number) > 0;
    if (inZone) faded++;
    for (const id of LOOK_IDS) {
      o.applyPalette(PALETTES[id]);
      const all: Material[] = [...mats(o.toonMesh.material)];
      o.group.traverse((c) => { const m = (c as Mesh).material; if (m && c !== o.toonMesh) all.push(...mats(m)); });
      for (const m of all) { assert.equal(m.transparent, inZone, `${v.id} (${id}): ${m.type} ${inZone ? 'must blend in its fade zone' : 'is blended at rest'}`); assert.equal(m.opacity, 1, `${v.id}: opacity`); n++; }
    }
  }
  assert.ok(n > 100 && faded >= 9, `${n} materials checked, ${faded} with a fade zone`);
  s.dispose();
});

test('a fade zone is an opacity ramp 1 to 0 at the end, the outline fading with it, and the tube keeps its full width (no taper)', () => {
  // the ends: the splenic vein into the spleen starts at nothing, a vein out of the plate ends at nothing
  const spl = fadeOf('V_SPL', false)!, out = fadeOf('ILI_IVC', false)!;
  assert.equal(spl.a0, 0); assert.equal(spl.a1, 1); assert.equal(out.a0, 1); assert.equal(out.a1, 0);
  // the shader: the fade factor reaches the body and the outline (vFade), and no radius is scaled by it
  assert.match(VESSEL_VS, /vFade = fa;/);
  assert.doesNotMatch(VESSEL_VS, /swell \*= [^;]*\bfa\b/, 'the tube is not thinned by a fade');
  assert.doesNotMatch(VESSEL_VS, /FADE_R/);
  assert.ok(!('FADE_R' in CEL_STYLE.TUBE));
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, vFade\);/, 'the body');
  assert.match(VESSEL_FS, /clamp\(vHi, 0\.0, 1\.0\)\) \* vFade\);/, 'the outline fades with the body: no ink ring floats at a faded end');
  assert.doesNotMatch(VESSEL_FS, /veilA|VEIL_A/, 'no veil alpha: the cava is whole');
});

test('outside a fade zone the outline is solid ink: the casing alpha is 1 on every look', () => {
  assert.equal(CEL_STYLE.INK_ALPHA_MIN, 1, 'the outline is solid ink');
  for (const id of LOOK_IDS) { assert.equal(CASING[id].a, 1, `${id}: casing`); assert.equal(CASING[id].circ.a, 1, `${id}: circuit casing`); }
});
