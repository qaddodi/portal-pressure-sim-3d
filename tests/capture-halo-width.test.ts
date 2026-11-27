import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paintItems } from '../src/ui/shell/figure-image-dom.ts';

// The capture drew every outlined word with a halo twice as thick as the live app's (Mohammad, 27 Nov, ascites:4 promotion picture).
// Root: paintItems stroked the halo at `haloW * 2`. A CSS -webkit-text-stroke (or SVG text stroke) of width W is centred on the letter edge and laid under the fill,
// so W/2 shows outside the letters; a canvas stroke is centred the same way, so it must take W as it is.
const ctx = () => {
  const strokes: number[] = [];
  const g = new Proxy({ lineWidth: 1 } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : typeof k === 'string' && k === 'strokeText' ? (() => { strokes.push(t.lineWidth as number); }) : () => undefined),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  return { g: g as unknown as CanvasRenderingContext2D, strokes };
};
const word = (haloW: number) => ({ k: 'text', text: 'Portal venule', x: 10, y: 20, w: 80, font: '600 12px Inter', fill: '#fff', halo: '#000', haloW, spacing: 0, rot: 0, alpha: 1 });

test('every outlined word is stroked at the width its CSS or SVG rule states, label, step, callout, SVG text', () => {
  const halo = Math.max(2, 3 * 1.5);   // the labels' haloPx at LABEL_K 1.5
  for (const [name, w] of [['label', halo], ['step', halo * 1.6], ['callout', halo], ['svg text', 4], ['chart word', 3], ['small label', 2]] as const) {
    const { g, strokes } = ctx();
    paintItems(g, [word(w)] as never);
    assert.deepEqual(strokes, [w], `${name}: stroke width is the CSS width, not double`);
  }
});

test('no code path doubles the halo width', () => {
  for (const f of ['shell/figure-image-dom.ts', 'capture/capture-dom.ts']) assert.doesNotMatch(readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'), /haloW\s*\*\s*2/);
});
