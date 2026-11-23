import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mohammad, 23 Nov 2026, step-disc mocks, "go with 4": a step's number is the numeral alone (bold, the names' halo, centred), on the figure and in the words. docs/approved/step-markers.md
const strip = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, sel: string) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, `${sel} is gone`); return css.slice(i, css.indexOf('}', i)); };

test('a figure step is a bold numeral centred in its box with the names\' halo, and has no face', () => {
  const css = strip('src/scene/labels/labels.css');
  assert.match(rule(css, '.cl[data-fig="step"]'), /align-items: center/, 'centred up and down (the base rule\'s baseline alignment put the numeral at the top)');
  assert.match(rule(css, '.cl[data-fig="step"]'), /justify-content: center/);
  const k = rule(css, '.cl[data-fig="step"] .cl-k');
  assert.match(k, /font-weight: 700/);
  assert.match(k, /-webkit-text-stroke: calc\(var\(--lb-halo-w[^;]*var\(--lb-halo/, 'the names\' halo');
  assert.match(k, /paint-order: stroke fill/);
  assert.doesNotMatch(k, /background|box-shadow|border/, 'no face');
  assert.ok(!css.includes('cl-disc'), 'the round face is gone');
  for (const f of ['src/scene/labels/tag-dom.ts', 'src/scene/labels/figure-cards.ts', 'src/ui/glass.css']) assert.ok(!/cl-disc/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), `${f} still builds or lists the disc`);
});

test('a step marker in the words is the numeral alone: no disc, no pill, bold, the text colour', () => {
  const r = rule(strip('src/ui/humanized.css'), 'html:root .pz-step');
  assert.match(r, /background: none/); assert.match(r, /border-radius: 0/); assert.match(r, /font-weight: 700/); assert.match(r, /display: inline/);
  assert.doesNotMatch(r, /box-shadow|outline|border-radius: (?!0)/);
});
