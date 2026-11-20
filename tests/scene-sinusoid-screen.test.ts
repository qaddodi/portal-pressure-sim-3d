// The sinusoid's end arrows, protein dots and legend follow what the camera really shows (2D keeps its own scale and centre, VW.k and VW.C; 3D measures them on the screen): a model of the framing
// drifted from the picture, which put the arrows at (or off) the screen's edge and the traffic over a stretch that was not the one on screen (about a third of 2D's dots).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { endsFor, measureScreen } from '../src/scene/sinusoid/portrait.ts';
import { FACE_UM, LEGEND_INSET, legendBox, legendOn } from '../src/scene/sinusoid/legend.ts';

const run = (v: SinusoidView, ms: number) => { for (let t = 0; t <= ms; t += 16) v.update(t); };

test('measureScreen: pixels per µm and where the room\'s middle is along the flow, whichever way the flow runs on the screen', () => {
  // wide: 10 µm along is 86 px to the right; the room's middle is 40 px right of the sinusoid's
  let m = measureScreen({ x: 400, y: 300 }, { x: 486, y: 300 }, { x: 440, y: 310 });
  assert.ok(Math.abs(m.k - 8.6) < 1e-9 && Math.abs(m.centreUm - 40 / 8.6) < 1e-9);
  // tall: the flow runs down the screen
  m = measureScreen({ x: 200, y: 300 }, { x: 200, y: 386 }, { x: 205, y: 250 });
  assert.ok(Math.abs(m.k - 8.6) < 1e-9 && Math.abs(m.centreUm + 50 / 8.6) < 1e-9);
  // flow to the left (a turned frame): the middle on the other side is positive µm
  m = measureScreen({ x: 400, y: 300 }, { x: 314, y: 300 }, { x: 360, y: 300 });
  assert.ok(m.centreUm > 0);
  assert.deepEqual(measureScreen({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 9, y: 9 }), { k: 0, centreUm: 0 });
});

test('the arrows stand 32 px inside the room\'s ends about the room\'s middle, not the sinusoid\'s: a hand pan or a card that moves the picture moves them with it', () => {
  const k = 8.6, [a, b] = endsFor(k, 800, false, 5, 0), [a2, b2] = endsFor(k, 800, false, 5, 40 / k);
  assert.ok(Math.abs(a - -(400 - 32) / k) < 1e-9 && Math.abs(b - (400 - 32) / k) < 1e-9);
  assert.ok(Math.abs(a2 - (a + 40 / k)) < 1e-9 && Math.abs(b2 - (b + 40 / k)) < 1e-9);
  const v = new SinusoidView(createShared()); v.setVisible(true);
  v.setScreen(k, 800, 800, 40 / k); run(v, 64);
  const e = v.ends;
  assert.ok(Math.abs(e[0] - a2) < 1e-6 && Math.abs(e[1] - b2) < 1e-6, `ends ${e[0]}, ${e[1]}`);
});

test('the traffic runs over the stretch really on screen: centred where the screen is, a little past each end, so the same dots show as 2D\'s', () => {
  const dots = (k: number, centre: number) => {
    const v = new SinusoidView(createShared()); v.setVisible(true); v.setScreen(k, 800, 800, centre); run(v, 600);
    return v.spriteCount;
  };
  const near = dots(14, 0), real = dots(8.6, 0);
  assert.ok(real > near * 1.3, `more dots when more of the stretch is on screen (${real} against ${near})`);
  // the same count whichever way the picture is panned (the stretch is the same width)
  assert.ok(Math.abs(dots(8.6, 20) - real) <= 4);
  // the stretch is the screen's: ends within the reach
  const v = new SinusoidView(createShared()); v.setVisible(true); v.setScreen(8.6, 800, 800, 20);
  const vis = (v as unknown as { VW: { vis: [number, number] } }).VW.vis;
  assert.ok(Math.abs(vis[0] - (20 - (400 / 8.6 + 8))) < 1e-9 && Math.abs(vis[1] - (20 + 400 / 8.6 + 8)) < 1e-9);
});

test('the scene measures the camera\'s own picture for the view (not the rest-scale model) while the sinusoid is up', () => {
  const src = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(src, /measureScreen\(o, a, this\.rig\.roomCentre\(\)\)/);
  assert.match(src, /if \(!this\.sinus\.isVisible\) return;/);
});

test('the Protein legend: 2D\'s own look, only while the sinusoid is the view, at the free room\'s top left under the top bar, its room to 8 px short of a tall sinusoid\'s plate', () => {
  assert.equal(legendOn('sinusoid', true), true);
  for (const [v, d] of [['sinusoid', false], ['lobule', true], ['body', true]] as const) assert.equal(legendOn(v, d), false);
  const b = legendBox({ l: 12, t: 8, r: 788, b: 500 }, 0, 56, 788);
  assert.equal(b.x, 12 + LEGEND_INSET.x);
  assert.equal(b.y, 56 - LEGEND_INSET.bar + LEGEND_INSET.y);
  assert.equal(b.maxW, 788 - b.x);
  assert.equal(legendBox({ l: 12, t: 8, r: 388, b: 700 }, 0, 56, 100).maxW, 90, 'never narrower than 90');
  assert.ok(Math.abs(FACE_UM - 9.2) < 1e-9);
  const css = readFileSync(new URL('../src/ui/css2d/app-03-layouts.css', import.meta.url), 'utf8');
  assert.match(css, /\.sv-legend i\.alb \{ width: 8px; height: 8px; background: var\(--albumin\)/);
  const comp = readFileSync(new URL('../src/scene/sinusoid/ProteinLegend.tsx', import.meta.url), 'utf8');
  assert.match(comp, /className="alb"/); assert.match(comp, /Protein/);
  assert.match(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), /<ProteinLegend \/>/);
});
