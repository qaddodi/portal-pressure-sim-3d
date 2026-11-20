// Smooth calibres (Mohammad, 20 Nov: "seamless and smooth calibres across the entirety of the app"; "the hepatic veins don't connect to the IVC"). Pinned: (1) every piece of a vein the engine cuts in pieces is drawn at one
// calibre, whatever the exceptions (the superior cava's upper piece was 1.39 times its lower: 2D keys the 0.72 by the piece id); (2) no vessel's radius changes faster along its length than SLOPE_MAX (a step softened into a bulge is still a step);
// (3) a vein that opens into the cava runs whole to its wall, takes the cava's colour AND opacity there, and is cut along the wall: it no longer dissolves to nothing before it, which left an oblique vein ending in a pale wedge short of the cava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUNCTION_PIECES } from '../src/engine/hales/portal/topology.js';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { radiusAtU } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { CAVA_RECEDE, cavaEndSpan, fadeOf, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { cavaMateOf } from '../src/scene/vessels/neighbour.ts';
import { CelScene } from '../src/scene/scene.ts';

/** The steepest a drawn vessel's radius may change along its own length (radius per unit run): about 14 degrees. 2D's SVC step made 0.40. */
const SLOPE_MAX = 0.25;

test('the pieces of a split vein share one calibre', () => {
  for (const [host, pieces] of Object.entries(JUNCTION_PIECES as Record<string, string[]>)) {
    const rs = pieces.filter((p) => NETWORK_BY_ID.has(p)).map((p) => NETWORK_BY_ID.get(p)!.radius);
    if (rs.length < 2) continue;
    for (const r of rs) assert.ok(Math.abs(r - rs[0]!) < 1e-9, `${host}: pieces drawn at ${rs.map((x) => x.toFixed(4)).join(', ')}`);
  }
});

test('no vessel changes calibre faster than SLOPE_MAX along its length, as drawn', () => {
  const bad: string[] = [];
  for (const v of NETWORK) {
    if (!v.plan) continue;
    const c = coursesOf(v, REST)[0]!;
    if (!(c.radius > 0)) continue;
    let len = 0;
    for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1], c.pts[i]![2] - c.pts[i - 1]![2]);
    const N = 200;
    let prev = radiusAtU(c, 0, len);
    for (let i = 1; i <= N; i++) { const r = radiusAtU(c, i / N, len), s = Math.abs(r - prev) / (len / N); if (s > SLOPE_MAX) { bad.push(`${v.id} u ${(i / N).toFixed(2)}: ${s.toFixed(3)}`); break; } prev = r; }
  }
  assert.deepEqual(bad, []);
});

test('a vein into the cava takes the cava\'s opacity at its wall and is cut along it; every hepatic and renal vein is wired the same way', () => {
  assert.match(VESSEL_FS, /fadeHere = mix\(vFade, cavaA, wA\);/);
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, fadeHere \* cavA\);/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(-0\.8 \* vNbr\.y, 0\.0, cd\)/, 'no dissolve before the wall');
  const s = new CelScene();
  try {
    let n = 0;
    for (const v of NETWORK) {
      if (!opensIntoCava(v.id)) continue;
      n++;
      const u = s.vesselObject(v.id)!.toon.uniforms as unknown as { cavaCut: { value: number }; cavaA: { value: number } };
      assert.equal(u.cavaCut.value, 1, `${v.id} opens into the cava`);
      assert.equal(u.cavaA.value, fadeOf(cavaMateOf(v.id)!, false)!.a1, `${v.id} comes to the cava's opacity at its wall`);
    }
    assert.ok(n >= 3, `${n} veins open into the cava`);
    assert.equal(cavaEndSpan('RHV_IVC'), 0, 'no end ramp');
  } finally { s.dispose(); }
});

test('the run-on overlap of two joined tubes (a hair, so no light line shows) is drawn only where the tube is opaque: a faint tube (the cava) drawn twice over it is a dashed darker band across it', async () => {
  const { VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  assert.match(VESSEL_VS, /float runOn = RUN_ON_PX \* smoothstep\(0\.97, 1\.0, fa\);/);
  assert.match(VESSEL_VS, /p -= aTan \* \(runOn \* wpcV \/ vU\);/);
  assert.match(VESSEL_VS, /p \+= aTan \* \(runOn \* wpcV \/ vU\);/);
  assert.doesNotMatch(VESSEL_VS, /aTan \* \(RUN_ON_PX/, 'no overlap that ignores the tube\'s opacity');
  assert.ok(VESSEL_VS.indexOf('float fa = 1.0;') < VESSEL_VS.indexOf('float runOn'), 'the opacity is known before the overlap is placed');
});
