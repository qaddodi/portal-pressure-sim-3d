// The stent's waist bracket in the figure (Mohammad, 21 Nov: 2D showed a bracket over the TIPS waist; 3D showed only "6 mm × 0.5 cm"). Pure placing, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { WaistBrackets } from '../src/scene/labels/waist-bracket.ts';
import { geomFix, waistSpan, STENT_KINDS } from '../src/engine/hales/portal/stent-geom.js';
import { CURVE_PTS, GAP, TICK, bracketPath, placeCurve, waistOn } from '../src/scene/labels/waist-place.ts';

test('it eases in with the waist: nothing without one, whole from 3.4 %, never a step', () => {
  assert.equal(waistOn(0), 0);
  assert.equal(waistOn(0.004), 0);
  assert.equal(waistOn(0.034), 1);
  assert.equal(waistOn(0.6), 1);
  let prev = 0;
  for (let r = 0; r <= 0.04; r += 0.002) { const v = waistOn(r); assert.ok(v >= prev && v - prev < 0.1, `smooth at ${r}`); prev = v; }
});
const curveAxis = (k: number, bend: number) => Array.from({ length: k }, (_, i) => { const t = i / (k - 1); return { x: 100 + bend * Math.sin(t * Math.PI), y: 200 + 60 * t }; });
test('it stands one wall plus a gap off the axis, spans the waist, and prefers up and left', () => {
  const p = placeCurve(curveAxis(CURVE_PTS, 0), 6, { x: 1, y: 0 })!;   // a vertical, straight stent, normal along x
  assert.ok(p.line.every((q) => Math.abs(100 - q.x - (6 + GAP)) < 1e-6), 'on the left, wall + gap away, all along');
  assert.ok(Math.abs(p.line[p.line.length - 1]!.y - p.line[0]!.y - 60) < 1e-6, 'as long as the waist');
  assert.ok(Math.abs(p.ta[0].x - p.ta[1].x - TICK) < 1e-6 && Math.abs(p.ta[1].y - p.ta[0].y) < 1e-6, 'its ticks point back at the stent (+x) and are TICK long');
  const h = placeCurve([{ x: 0, y: 100 }, { x: 40, y: 100 }, { x: 80, y: 100 }], 5, { x: 0, y: -1 })!;   // a horizontal stent: above it
  assert.ok(h.line.every((q) => q.y < 100 && Math.abs(100 - q.y - (5 + GAP)) < 1e-6));
  assert.equal(placeCurve([{ x: 5, y: 5 }, { x: 5, y: 5 }], 4, { x: 1, y: 0 }), null, 'no span, no bracket');
});
test('it follows the stent\'s curve: on a bend every point keeps wall + gap off its own axis point, the line bends with the axis, and it never crosses the stent', () => {
  const axis = curveAxis(CURVE_PTS, 25), r = 6, p = placeCurve(axis, r, { x: -1, y: 0 })!;
  // each point of the line is one wall plus a gap from the axis curve (the nearest axis point, to a sample's spacing)
  const fine = Array.from({ length: 400 }, (_, i) => { const t = i / 399; return { x: 100 + 25 * Math.sin(t * Math.PI), y: 200 + 60 * t }; });
  for (const q of p.line) { const near = Math.min(...fine.map((f) => Math.hypot(f.x - q.x, f.y - q.y))); assert.ok(near > r + GAP - 0.6 && near < r + GAP + 0.6, `a point stands ${near.toFixed(2)} from the axis`); }
  // not a chord: the middle point is far from the straight line between the ends (a straight bar would have it at 0)
  const a = p.line[0]!, b = p.line[p.line.length - 1]!, m = p.line[Math.floor(p.line.length / 2)]!;
  const off = Math.abs((b.x - a.x) * (a.y - m.y) - (a.x - m.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(off > 10, `the bracket bows ${off.toFixed(1)} px off its chord`);
  // always the same side of the axis (never crossing it): the signed distance to the axis along the same normal keeps its sign
  const side = p.line.map((q, i) => Math.sign((q.x - axis[i]!.x) * -1));
  assert.ok(side.every((x) => x === side[0]), 'one side all along');
});
test('the bracket path is one path: the line then each end\'s tick, to a tenth of a pixel', () => {
  const d = bracketPath(placeCurve(curveAxis(3, 0), 6, { x: 1, y: 0 })!);
  assert.match(d, /^M[\d. -]+L[\d. -]+(L[\d. -]+)+M[\d. -]+L[\d. -]+$/);
  assert.equal(d.split('M').length - 1, 2, 'the line with its first tick, then the last tick');
});
test('the figure paints it from the stents, and the stent device gives it the waist\'s own span and ramp', () => {
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  const dev = readFileSync(new URL('../src/scene/devices/stent/stent-device.ts', import.meta.url), 'utf8');
  assert.match(layer, /waistBrackets\.paint\(cel\.procs\.stents\)/);
  assert.match(dev, /waistMark\(a: Vector3, b: Vector3\)/);
  assert.match(dev, /waistSpan\(g\)/);
  assert.match(dev, /this\.amount \* Math\.min\(1, Math\.max\(0, \(\(g\.red \|\| 0\) - 0\.004\) \/ 0\.03\)\)/);
});

// A stand-in for the page's DOM, only what the bracket touches: it lets the real WaistBrackets run in node and shows what it would put on the screen.
class El { attrs = new Map<string, string>(); style: Record<string, string> = {}; kids: El[] = []; gone = false;
  setAttribute(k: string, v: string) { this.attrs.set(k, v); } removeAttribute(k: string) { this.attrs.delete(k); } append(...k: El[]) { this.kids.push(...k); } appendChild(k: El) { this.kids.push(k); return k; } remove() { this.gone = true; } }
const withDom = <T>(f: (root: El, all: El[]) => T): T => {
  const all: El[] = [], was = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElementNS: () => { const e = new El(); all.push(e); return e; } };
  try { return f(new El(), all); } finally { (globalThis as { document?: unknown }).document = was; }
};
/** A stent standing on the screen, curving, 8 cm long over 400 px (50 px a cm); its waist from the engine's own span for the geometry `g`. */
type Geo = { len: number; waist: number; trans: number; red: number };
const stentOn = (g: Geo) => {
  const sp = waistSpan(g) as { a1: number; b1: number }, at = (f: number, o: Vector3) => o.set(300 + 30 * Math.sin(f * Math.PI), 100 + 400 * f, 0);
  return { waistMark: (a: Vector3, b: Vector3) => { at(sp.a1, a); at(sp.b1, b); return { r: 20, shown: 1 }; },
    waistAxis: (out: Vector3[]) => { out.forEach((v, i) => at(sp.a1 + (sp.b1 - sp.a1) * (i / (out.length - 1)), v)); return true; } };
};
test('a waist always has its bracket, on screen and visible: every stent kind, both kinds of ends, every waist length and depth', () => {
  for (const kind of STENT_KINDS) for (const ends of ['default', 'abrupt', 'tapered'] as const) for (const red of [0.05, 0.3, 0.8]) for (const waist of [0.5, 1, 1.5, 3, 6]) {
    const g = geomFix({ red, waist, ...(ends === 'abrupt' ? { trans: 0 } : ends === 'tapered' ? { trans: 1 } : {}) }, kind) as Geo;
    const where = `${kind} ${ends} red ${red} waist ${waist} (fitted to ${g.waist} cm, ends ${g.trans})`;
    withDom((root, all) => {
      const wb = new WaistBrackets(root as never, (p, out) => { out.x = p.x; out.y = p.y; return out; });
      assert.ok(g.waist > 0, `${where}: a waist has a floor`);
      assert.equal(wb.paint([['TIPS', stentOn(g) as never]]), true, `${where}: painted`);
      const svg = all[0]!, paths = all.slice(1);
      assert.ok(root.kids.includes(svg), `${where}: in the layer`);
      assert.ok(svg.attrs.has('data-on') && svg.style.opacity === '1', `${where}: visible and opaque`);
      assert.equal(paths.length, 2, `${where}: a halo and a line`);
      for (const q of paths) assert.match(q.attrs.get('d') ?? '', /^M[\d. -]+L[\d. -]+/, `${where}: the line has a path`);
      wb.destroy();
    });
  }
});
test('the bracket is not drawn in a way a browser can lose: no filter or tiny box on the svg, the whole layer\'s size, its halo a stroke', () => {
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  const curve = /\.wb-curve \{[^}]*\}/.exec(css)![0];
  assert.match(curve, /width: 100%; height: 100%/);
  assert.doesNotMatch(curve, /filter|drop-shadow/, 'a drop-shadow on the svg root clipped the line away on Safari (Mohammad, 26 Nov: "no more bracket on the waist?")');
  assert.doesNotMatch(curve, /width: 1px|height: 1px/);
  assert.match(css, /\.wb-halo \{[^}]*stroke: var\(--lb-halo\)/);
});
test('the bracket is one quiet line a little heavier than a hairline: a soft halo, never a hard ring, one weight for the line and its ticks', () => {
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  const path = /^\.wb-path \{[^}]*\}/m.exec(css)![0];
  assert.doesNotMatch(css, /\.wb[-\w]* \{[^}]*box-shadow/);
  assert.match(path, /stroke-width: var\(--wb-w\)/);
  const w = Number(/--wb-w: ([\d.]+)px/.exec(css)![1]);
  assert.ok(w > 1 && w <= 2.5, `slightly thicker than the old 1 px hairline (${w})`);
  assert.doesNotMatch(css, /\.wb-bar|\.wb-tick/, 'no straight bar and tick elements are left');
});
test('the stent device offers the waist\'s axis along its own curve', () => {
  const dev = readFileSync(new URL('../src/scene/devices/stent/stent-device.ts', import.meta.url), 'utf8');
  assert.match(dev, /waistAxis\(out: Vector3\[\]\)/);
  assert.match(dev, /this\.curve\.getPointAt\(Math\.min\(1, Math\.max\(0, \(INSET \+ at \* A\) \/ this\.L\)\), out\[i\]!\)/);
});

import { readdirSync } from 'node:fs';
test('no overlay in the figure wears a hard box-shadow ring as its halo (text and svg marks use the stroke halo, lines the soft drop-shadow)', () => {
  const dirs = ['../src/scene/labels/', '../src/scene/circuit/', '../src/scene/'];
  for (const d of dirs) for (const f of readdirSync(new URL(d, import.meta.url)).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(new URL(d + f, import.meta.url), 'utf8');
    assert.doesNotMatch(css, /box-shadow:\s*0 0 0 [^;]*halo/, `${f}: a hard ring halo`);
  }
});
