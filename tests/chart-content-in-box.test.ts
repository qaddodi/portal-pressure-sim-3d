// No chart's content is ever outside its box, for every chart, look-independent, at the widths a card gives it on a phone, an iPad and a Mac (Mohammad, 22 Nov: "chart graphs are cut off still"; the audit's
// `chart-clipped` rows). Two roots are pinned here: (1) a chart's picture (shapes and words, as Inter sets them) lies inside the frame it is drawn in, because the painter's box clips what is outside it;
// (2) the box around the picture is the picture's height, never a second height from the 2D stylesheet (the card is sized to the box, so a picture taller than it stood past the card and was cut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { BASELINE_EM } from '../src/ui/charts/text-layer.ts';
import { tessellate, meshBounds } from '../src/ui/charts/geometry.ts';
import type { Frame, Shape, TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf } from './charts-helpers.ts';

/** Shapes that paint something: a rect or circle with no size, or every colour clear, draws nothing (a bar not yet grown, a pill that is not there), wherever it stands. */
const paints = (s: Shape): boolean => {
  switch (s.k) {
    case 'rect': return s.w > 0.01 && s.h > 0.01 && ((s.fill?.[3] ?? 0) > 0 || (s.pen?.color[3] ?? 0) > 0);
    case 'circle': return s.r > 0.01 && ((s.fill?.[3] ?? 0) > 0 || (s.pen?.color[3] ?? 0) > 0);
    case 'text': return s.s !== '' && (s.alpha ?? 1) > 0 && !s.rot;
    default: return true;
  }
};

/** The words' box as the text layer places it (anchor, baseline, Inter's advance widths). */
const wordBox = (t: TextShape) => {
  const w = measure(t.s, t.size, t.weight ?? 500) + (t.ls ? t.ls * t.size * t.s.length : 0);
  const x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x;
  const top = t.y - (t.baseline === 'top' ? 0 : t.baseline === 'middle' ? 0.5 : BASELINE_EM) * t.size;
  return { x0, x1: x0 + w, y0: top, y1: top + t.size };
};

/** What lies outside the box: the words by their measured box, the shapes by their triangles (a pen's half width is the 2 px of slack). */
export function outside(f: Frame): string[] {
  const out: string[] = [], shapes = f.shapes.filter(paints);
  for (const s of shapes) {
    if (s.k !== 'text') continue;
    const b = wordBox(s), over = Math.max(-b.x0, b.x1 - f.w, -b.y0, b.y1 - f.h);
    if (over > 0.5) out.push(`"${s.s}" is ${over.toFixed(1)} px outside the ${f.w} x ${f.h} box`);
  }
  const b = meshBounds(tessellate(shapes));
  if (b && (b.x0 < -2 || b.y0 < -2 || b.x1 > f.w + 2 || b.y1 > f.h + 2)) out.push(`shapes reach ${JSON.stringify(b)} outside the ${f.w} x ${f.h} box`);
  return out;
}

// the box widths a chart gets, by device: a Mac's data card is 300 px at the least (2D `clamp(300px, 29vw, 600px)`); an upright iPad's card is 70% of 768 to 820 px; an upright phone's is the screen
// less 16 and the card's padding; a sideways phone's is 340 at most less its padding (its type is 12 px; a small phone's narrower card, 280, is not covered)
const WIDTHS: Record<string, number[]> = { desktop: [300, 330, 420, 540], 'tablet-portrait': [480, 540], 'phone-portrait': [326, 360], 'phone-landscape': [310, 330] };
const DEVICES = Object.keys(WIDTHS) as (keyof typeof WIDTHS)[];

test('every chart specimen keeps its shapes and words inside its box at every device and width', () => {
  const bad = new Map<string, string>();
  for (const dev of DEVICES) for (const w of WIDTHS[dev]!) for (const k of CHARTS) for (const sp of k.specimens) {
    for (const why of outside(sp.build(ctxOf('light', w, dev as 'desktop')))) { const key = `${k.kind}/${sp.id}: ${why.replace(/[\d.]+ px outside the [\d.]+ x [\d.]+/, 'outside')}`; if (!bad.has(key)) bad.set(key, `${dev} ${w}: ${why}`); }
  }
  assert.deepEqual([...bad.values()], [], 'content outside its chart box');
});

test('the checker sees a word set past the box (it is not a test that passes by looking nowhere)', () => {
  const f: Frame = { w: 100, h: 40, label: '', shapes: [{ k: 'text', x: 60, y: 20, s: 'a long label past the edge', size: 13, color: [0, 0, 0, 1] }, { k: 'rect', x: 0, y: 0, w: 0, h: 90, fill: [0, 0, 0, 1] }] };
  assert.equal(outside(f).length, 1, 'the word is outside; the rect with no width paints nothing');
});

test('a chart wrapper that the 2D sheets give a height is held to its picture (charts.css), so the card is as tall as the chart', () => {
  const dir = new URL('../src/ui/css2d/', import.meta.url);
  const sheets = readdirSync(dir).filter((n) => n.endsWith('.css')).map((n) => readFileSync(new URL(n, dir), 'utf8')).join('\n');
  const held = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  const heldBy = /:is\(([^)]+)\)\s*\{\s*height:\s*auto\s*!important/.exec(held)![1]!;
  // the root `<div className="pz-…">` of every chart card
  const wrappers = new Set<string>();
  const walk = (d: URL) => { for (const e of readdirSync(d, { withFileTypes: true })) { const u = new URL(e.name + (e.isDirectory() ? '/' : ''), d); if (e.isDirectory()) walk(u); else if (e.name.endsWith('Card.tsx')) for (const m of readFileSync(u, 'utf8').matchAll(/<div className="(pz-[a-z]+)[" ]/g)) wrappers.add(m[1]!); } };
  walk(new URL('../src/ui/charts/', import.meta.url));
  assert.ok(wrappers.has('pz-flowtime') && wrappers.has('pz-curve'), 'the wrapper scan finds the chart cards');
  const sized = [...wrappers].filter((c) => new RegExp(`(^|\\n)[^{}]*\\.${c}(?![\\w-])[^{}]*\\{[^}]*(?<![\\w-])height:`).test(sheets));
  const unheld = sized.filter((c) => !heldBy.includes(`.${c}`) && c !== 'pz-prof');
  assert.deepEqual(unheld, [], `2D gives ${unheld.join(', ')} a height of its own and charts.css does not hold it to the picture`);
  assert.match(readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8'), /\.pz-tool > \.pz-prof \{ height: auto;/, 'the profile is held in deck-ui.css');
});
