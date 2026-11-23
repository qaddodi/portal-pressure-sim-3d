// Plan 49b (Mohammad, 23 Nov 2026: "the fibrosis should look like ropes, not like a big blob", "this looks 3D", "it has to maintain the cel shadedness", then "it can have fade and blur but no glow"): the septa and the tracts are painted as CORDS
// (collagen-cords.ts), flat fill, ONE flat shade band, a thin deeper edge line, with the cells showing between; the plate shader only grows them. This judges that from the painter's own strokes (a recording context) and the shader's text, never a picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '@shaderfrog/glsl-parser/index.js';
import { LOBULE_PLATE_FS, PLATE_BOX, PLATE_PX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { paintSepta, paintTracts, collagenInput } from '../src/scene/lobule/collagen-paint.ts';
import { cordColours, CORD_BUNDLE, CORD_K, CORD_W_MAX } from '../src/scene/lobule/collagen-cords.ts';
import { EDGE_BOX, EDGE_PLATE_PX, TRACT_RT, TRACT_RT_PX, tractFrontPx } from '../src/scene/lobule/collagen-edge.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { undeclared, badSamplers, usedBeforeDeclared } from './gl-undeclared.ts';
import { shaderText } from './shader-text.ts';

const net = buildLobule(), G = plateShape(net);

/** A recording 2D context: every stroke's colour, width, shadow and points. */
function recorder() {
  const strokes: { style: string; lw: number; pts: [number, number][]; cap: string }[] = [], fills: string[] = [];
  let cur: [number, number][] = [];
  const st = { strokeStyle: '', lineWidth: 1, shadowBlur: 0, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', fillStyle: '' };
  const ctx = new Proxy(st, {
    get(t, k: string) {
      if (k === 'beginPath') return () => { cur = []; };
      if (k === 'moveTo' || k === 'lineTo') return (x: number, y: number) => { cur.push([x, y]); };
      if (k === 'stroke') return () => { strokes.push({ style: st.strokeStyle, lw: st.lineWidth, pts: cur.slice(), cap: st.lineCap }); if (st.shadowBlur > 0) throw new Error('a shadow on a cord is a glow'); };
      if (k === 'fill') return () => { fills.push(st.fillStyle); };
      if (k === 'save' || k === 'restore') return () => {};
      return (t as never)[k];
    },
    set(t, k: string, v: never) { (t as never)[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, fills };
}

test('the plate numbers the shader shares with the arrival times are the plate\'s own', () => {
  assert.equal(EDGE_PLATE_PX, PLATE_PX); assert.equal(EDGE_BOX, PLATE_BOX);
  assert.equal(TRACT_RT, net.rt, 'the tract radius');
  assert.ok(Math.abs(TRACT_RT_PX - net.rt * PLATE_S * (PLATE_PX / (2 * PLATE_BOX * PLATE_S))) < 1e-9);
  assert.equal(net.corners.length, 6);
});

test('the septa are ropes: cords of three flat colours only (fill, one shade band, a deeper edge line), no shadow, no glow, no alpha', () => {
  for (const look of ['light', 'dark'] as const) {
    const L = lookColours(look), col = L.rgb01('--lz-septum'), cc = cordColours(col), r = recorder();
    paintSepta(r.ctx, collagenInput(G, 0, look));
    assert.ok(r.strokes.length > 300, `${look}: a rope is many runs (${r.strokes.length})`);
    for (const s of r.strokes) assert.ok([cc.fill, cc.shade, cc.edge].includes(s.style), `${look}: a stroke of ${s.style} is none of the three flat colours`);
    assert.equal(new Set(r.strokes.map((s) => s.style)).size, 3);
    assert.equal(r.fills.length, 0, 'no filled plate: the band is nothing but its cords');
    const wc = r.strokes.filter((s) => s.style === cc.fill).map((s) => s.lw);
    assert.ok(Math.max(...wc) <= CORD_W_MAX + 1e-9, 'a cord is a thin strand, never a plate');
    // the edge line is darker than the fill (a tone of its own colour, never black ink)
    const lum = (c: string): number => { const m = c.match(/\d+/g)!.map(Number); return 0.299 * m[0]! + 0.587 * m[1]! + 0.114 * m[2]!; };
    assert.ok(lum(cc.edge) < lum(cc.fill) && lum(cc.edge) > 0.45 * lum(cc.fill), `${look}: the edge line is a deeper tone, not black`);
    assert.ok(lum(cc.shade) < lum(cc.fill) && lum(cc.shade) > lum(cc.edge), `${look}: the shade band lies between the fill and the edge`);
  }
});

test('a rope is a tight bundle, never a wide plate: the cords\' strokes stay within a bundle of the band\'s centre line however wide the painter flares the band', () => {
  const r = recorder();
  paintSepta(r.ctx, collagenInput(G, 0, 'dark'));
  const fillW = Math.max(...r.strokes.filter((s) => s.lw <= CORD_W_MAX && s.lw > 3).map((s) => s.lw));
  assert.ok(fillW <= CORD_W_MAX + 1e-9);
  assert.equal(CORD_K, 3);
  // a rope's total width is 2 x CORD_BUNDLE + 1 cord widths at most
  assert.ok((2 * CORD_BUNDLE + 1) * CORD_W_MAX < 0.2 * 400, 'a rope is narrower than the painter\'s hex septum (0.2 R)');
});

test('the tracts are ropes too (the periportal tone), cords of three flat colours', () => {
  for (const look of ['light', 'dark'] as const) {
    const r = recorder();
    paintTracts(r.ctx, collagenInput(G, 0, look));
    assert.ok(r.strokes.length > 200, `${look}: the tracts hold many runs (${r.strokes.length})`);
    assert.equal(new Set(r.strokes.map((s) => s.style)).size, 3);
    assert.equal(r.fills.length, 0);
  }
});

test('every look paints (no look is left on the old plates)', () => {
  for (const look of LOOK_IDS) { const r = recorder(); paintSepta(r.ctx, collagenInput(G, 0, look)); assert.ok(r.strokes.length > 300, look); }
});

test('the arrival times reach every pixel a cord can lie on (the cords sit inside the painter\'s middle pass)', () => {
  const n = 512, box = PLATE_BOX * PLATE_S, tau = collagenTau(G, 0, n, box);
  let reached = 0; for (let i = 0; i < n * n; i++) if (tau[4 * i] !== 255) reached++;
  assert.ok(reached > 2000);
  for (let i = 0; i < n * n; i += 97) assert.equal(tau[4 * i + 3], 255);
});

test('the tracts\' disc grows as it did: nested, the cuff at full growth', () => {
  let last = -1;
  for (let p = 0.1; p <= 1.0001; p += 0.05) { const rf = tractFrontPx(p); assert.ok(rf > last); last = rf; }
  const full = tractFrontPx(1) / TRACT_RT_PX;
  assert.ok(full >= 1.7 && full <= 1.84, `the full disc reaches the cuff's edge, not past it: ${full.toFixed(3)} rt`);
});

test('GLSL: the plate only grows the cords (no edge, fade or relief on the collagen), every name declared, nothing used before it is declared, the collagen read before the discard', () => {
  const t = shaderText(LOBULE_PLATE_FS);
  assert.deepEqual(undeclared(LOBULE_PLATE_FS, ['cameraPosition', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix']), [], 'every name is declared before it is used');
  assert.deepEqual(usedBeforeDeclared(LOBULE_PLATE_FS), [], 'every name is declared BEFORE it is used (the driver reads top to bottom)');
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), [], 'every sampler is declared');
  parser.parse(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''), { quiet: true });
  assert.ok(t.indexOf('collagenAt(vUv)') < t.indexOf('if (fadedOut()) discard;'), 'the collagen\'s derivatives are read before the dissolve\'s discard');
  const body = t.slice(t.indexOf('vec4 collagenAt('), t.indexOf('float plateEdge('));
  for (const bad of ['ropeS', 'ropeColour', 'reliefColour', 'reliefS', 'collCoverage', 'collStria', 'texelFetch', 'smoothstep(-aS', 'uCollS', 'textureLod', 'blur']) assert.ok(!body.includes(bad), `the collagen has no ${bad}`);
  assert.match(body, /return cu \* ft \+ cs \* fs \* \(1\.0 - cu\.a \* ft\)/, 'the cords as painted, the tracts over the septa');
});
