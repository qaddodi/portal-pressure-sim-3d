// MURAL CAST (plan 11, Mohammad 22 Nov: "A perfect do it"; mock A): one flat cast grown from a single wall, THREE cel bands lit from the upper left, ink only on its FREE edge, ends fading by gradient (no caps), reaching its wall exactly
// to the lumen's edge (the inner edge of the vein's ink band). Every thrombus key of every preset is walked, not a list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CLOT_END_FADE_DIAMETERS, CLOT_FREE_FULL, CLOT_FREE_NONE, CLOT_INSIDE, CLOT_BANDS_GLSL, ClotObject, clotEndAlpha, clotFreeInk, clotGeometry, clotShapeOf } from '../src/scene/disease/clots.ts';
import { drawnHost, swellsOf } from '../src/scene/disease/host.ts';
import { CLOT_TOKENS, clotTokens, paintClot } from '../src/scene/disease/paint.ts';
import { createShared, rawColor } from '../src/scene/materials/cel.ts';
import { CelScene } from '../src/scene/scene.ts';
import { presetIds, presetState } from './b4-presets.ts';

const ids = await presetIds();

test('every thrombus key of every preset, at occlusion 0.1, 0.5 and 1: the cast lies inside the lumen, reaches its wall (not the 2D 0.9), and never covers the vein\'s ink band', async () => {
  let walked = 0;
  for (const id of ids) {
    const st = await presetState(id);
    for (const vein of Object.keys(st.params.thrombus ?? {})) {
      const h = drawnHost(vein); if (!h) continue;
      for (const v of [0.1, 0.5, 1]) {
        const sw = swellsOf(h, st.frame.D), shape = clotShapeOf(h, sw, v, vein);
        let touches = 0;
        for (let i = 0; i < shape.centres.length; i++) {
          const reach = shape.centres[i]!.distanceTo(shape.axis![i]!) + shape.radii[i]!, lumen = shape.lumen[i]!;
          assert.ok(reach <= lumen + 1e-9, `${id}/${vein} v ${v} ring ${i}: the cast reaches ${reach}, the lumen's edge (the ink band's inner edge) is ${lumen}`);
          assert.ok(reach <= CLOT_INSIDE * lumen + 1e-9);
          if (reach > 0.95 * lumen) touches++;
          // the wall direction is the side it lies on: the centre is offset toward it
          const off = shape.centres[i]!.clone().sub(shape.axis![i]!);
          if (off.length() > 1e-9) assert.ok(off.dot(shape.wall![i]!) > 0, `${vein} ring ${i}: offset toward its wall`);
        }
        assert.ok(touches > 0, `${id}/${vein} v ${v}: the cast lies against its wall somewhere (it is not floating in mid-lumen)`);
      }
      walked++;
    }
  }
  assert.ok(walked >= 5, `walked ${walked} clots`);
});

test('ease-in: a clot at 10% is a thin crescent on its wall, never a lozenge in mid-lumen (its thickest ring is far under the lumen and still touches the wall)', () => {
  for (const id of ['PV_TRUNK', 'RHV_IVC', 'SV_CONF']) {
    const h = drawnHost(id)!, sw = swellsOf(h, null), s = clotShapeOf(h, sw, 0.1, id);
    for (let i = 0; i < s.centres.length; i++) {
      assert.ok(s.radii[i]! < 0.45 * s.lumen[i]!, `${id} ring ${i}: ${s.radii[i]} of ${s.lumen[i]}`);
      assert.ok(Math.abs(s.centres[i]!.distanceTo(s.axis![i]!) + s.radii[i]! - CLOT_INSIDE * s.lumen[i]!) < 1e-9, `${id} ring ${i} rests on the wall`);
    }
  }
});

test('the ink weight is 1 on the face toward the lumen, 0 on the face against the wall, and continuous (smoothstep, never a step) between', () => {
  assert.equal(clotFreeInk(-1), 1); assert.equal(clotFreeInk(CLOT_FREE_FULL), 1);
  assert.equal(clotFreeInk(1), 0); assert.equal(clotFreeInk(CLOT_FREE_NONE), 0);
  let prev = 1;
  for (let nw = -1; nw <= 1; nw += 0.01) { const k = clotFreeInk(nw); assert.ok(k <= prev + 1e-12, 'monotone'); assert.ok(prev - k < 0.06, `no jump at ${nw}`); prev = k; }
  const mid = clotFreeInk((CLOT_FREE_FULL + CLOT_FREE_NONE) / 2); assert.ok(Math.abs(mid - 0.5) < 1e-9);
  // and on a built clot: the vertices facing away from the wall carry 1, those against it 0, all in [0, 1], both present
  const h = drawnHost('PV_TRUNK')!, g = clotGeometry(clotShapeOf(h, swellsOf(h, null), 0.6, 'PV_TRUNK')), f = g.getAttribute('free0').array as Float32Array;
  assert.ok(f.every((x) => x >= 0 && x <= 1)); assert.ok(f.some((x) => x === 1) && f.some((x) => x === 0));
});

test('no end caps, and the alpha at each free end rises over at least one lumen diameter; the end at the cava has no fade (the cut ends it)', () => {
  for (const id of ['PV_TRUNK', 'SV_CONF', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC']) for (const v of [0.1, 1]) {
    const h = drawnHost(id)!, shape = clotShapeOf(h, swellsOf(h, null), v, id), g = clotGeometry(shape), n = shape.centres.length;
    assert.equal(g.getAttribute('position').count, n * 13, `${id}: only the rings, no cap vertex`);
    const a = clotEndAlpha(shape), D = 2 * Math.max(...shape.lumen) * CLOT_END_FADE_DIAMETERS;
    assert.equal(a[0], 0);
    let acc = 0, reached = 0;
    for (let i = 1; i < n; i++) { acc += shape.centres[i]!.distanceTo(shape.centres[i - 1]!); if (a[i]! < 0.999) reached = acc; }
    if (shape.cavaEnd) { assert.equal(a[n - 1], 1, `${id}: the cava end is not faded`); assert.ok(reached >= 0 && a.every((x) => x >= 0 && x <= 1)); }
    else { assert.equal(a[n - 1], 0); }
    // from the start the alpha is below 1 until the first lumen diameter is past
    let d = 0, firstWhole = n; for (let i = 1; i < n; i++) { d += shape.centres[i]!.distanceTo(shape.centres[i - 1]!); if (a[i]! >= 0.999) { firstWhole = i; break; } }
    if (firstWhole < n) assert.ok(d >= 0.97 * D, `${id} v ${v}: whole after ${d}, a lumen diameter is ${D}`);
    for (let i = 1; i < n; i++) if (!shape.cavaEnd || i < n - 1) assert.ok(Math.abs(a[i]! - a[i - 1]!) < 0.9, `${id}: the ramp is a gradient`);
  }
});

test('the cast is lit in THREE flat cel bands by the one world light, its ink is the figure\'s line on the free edge only, in its vein\'s layer, depth-tested', () => {
  const o = new ClotObject(clotGeometry({ centres: [new Vector3(0, 0, 0), new Vector3(1, 0, 0)], radii: [0.1, 0.1], alpha: [1, 1], lumen: [0.2, 0.2] }), createShared());
  assert.ok(o.toon.fragmentShader.includes(CLOT_BANDS_GLSL), 'three bands, shade / base / lift');
  assert.match(CLOT_BANDS_GLSL, /clotShade[\s\S]*clotBase[\s\S]*clotLift/);
  assert.match(o.toon.fragmentShader, /celLightView\(\)/);
  assert.doesNotMatch(o.toon.fragmentShader, /celTubeTone\(base, sT0/);
  assert.match(o.ink.vertexShader, /nd \* clotInk \* inkRim\(normal\) \* 2\.0 \/ res \* c\.w/);
  assert.match(o.ink.fragmentShader, /vLumA \* cutK \* vFree \* vEnd/);
  assert.match(o.toon.fragmentShader, /vLumA \* cutK \* vEnd/);
  assert.match(o.toon.vertexShader, /min\(clamp\(0\.300 \* rCss, 1\.600, 3\.000\), 0\.5 \* rCss\)/, 'the figure\'s line (LINE_R, LINE_MIN, LINE_MAX), never over half the lumen');
  for (const m of [o.toon, o.ink]) { assert.equal(m.depthTest, true); assert.equal(m.depthWrite, false); }
});

test('paint: the clot tokens are the mock\'s A hexes per look (Soft takes Light\'s; Navy and Black take Dark\'s), and paintClot writes them to the fill program', () => {
  assert.deepEqual(CLOT_TOKENS.light, { shade: '#7c2c2c', base: '#9c4036', lift: '#bf5c4c' });
  assert.deepEqual(CLOT_TOKENS.dark, { shade: '#5b1d1f', base: '#7e2c2b', lift: '#a5413a' });
  assert.deepEqual(CLOT_TOKENS.soft, CLOT_TOKENS.light);
  assert.deepEqual(CLOT_TOKENS.navy, CLOT_TOKENS.dark); assert.deepEqual(CLOT_TOKENS.black, CLOT_TOKENS.dark);
  const o = new ClotObject(clotGeometry({ centres: [new Vector3(0, 0, 0), new Vector3(1, 0, 0)], radii: [0.1, 0.1], alpha: [1, 1], lumen: [0.2, 0.2] }), createShared());
  paintClot(o, clotTokens('dark'));
  for (const [k, hex] of [['clotShade', '#5b1d1f'], ['clotBase', '#7e2c2b'], ['clotLift', '#a5413a']] as const) assert.ok((o.toon.uniforms[k]!.value as { equals(c: unknown): boolean }).equals(rawColor(hex)), k);
});

test('every preset: a built clot carries the ink weight, the end alpha and the lumen on every vertex, in its host\'s layer', async () => {
  for (const id of ids) {
    const st = await presetState(id), th = st.params.thrombus ?? {};
    const s = new CelScene(), c = s.disease.clots;
    c.set(th, 0.016, true, st.frame.D);
    for (const g of c.group.children) for (const m of g.children) {
      const geo = (m as unknown as { geometry: { getAttribute(n: string): { count: number } | undefined } }).geometry;
      for (const a of ['free0', 'endA', 'lumR', 'lumA', 'ringC']) assert.equal(geo.getAttribute(a)?.count, geo.getAttribute('position')!.count, `${id}: ${a}`);
      assert.equal((m as unknown as { material: { depthTest: boolean } }).material.depthTest, true);
    }
    s.dispose?.();
  }
});
