// Owner's ruling L11 (27 Nov 2026, review 3531bdfa D-D5): the six level names under the rail (Sites and causes 2, 27.2) read straight, not tilted. Straight at 12 px they only fit a column when a name breaks
// ("Pre-" over "sinusoidal"), so the longest piece is what a column must hold; a card too narrow for that keeps the tilt (reported to the owner). Node only: the CSS text and the font's own widths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measure } from '../src/ui/charts/measure.ts';
import { RAIL_LEVELS, railName } from '../src/ui/cards/card-fields.ts';
import { widthOf } from '../src/ui/layout/plan.ts';

const css = readFileSync('src/ui/styles/app-04-presenter.css', 'utf8');
const names = RAIL_LEVELS.map(([, n]) => n);
/** The pieces a name can break into: at a hyphen or a soft hyphen. */
const pieces = (n: string): string[] => railName(n).split(/[­-]/).filter(Boolean);
const widest = Math.max(...names.flatMap((n) => pieces(n).map((p) => measure(p, 12, 600))));
/** The rail's side room (.2em each side at the largest caption size) and the five 5 px gaps between its six columns. */
const SIDE = 2 * 0.2 * 21, GAPS = 25;
const FITS_FROM = Math.ceil(6 * widest + GAPS + SIDE);

test('the soft hyphen sits only where a name breaks into its prefix and "sinusoidal"; the others break at their own hyphen', () => {
  assert.equal(railName('Presinusoidal'), 'Pre­sinusoidal');
  assert.equal(railName('Postsinusoidal'), 'Post­sinusoidal');
  assert.equal(railName('Sinusoidal'), 'Sinusoidal');
  assert.equal(railName('Pre-hepatic'), 'Pre-hepatic');
  assert.equal(railName('Cardiac'), 'Cardiac');
  assert.deepEqual(names.map((n) => railName(n).replace(/­/g, '')), names, 'the words are the names, whole');
});

test('every name\'s longest piece fits one column of any card at least 396 px wide, at the 12 px floor', () => {
  assert.ok(widest > 55 && widest < 65, `the longest piece is ${widest.toFixed(1)} px ("sinusoidal")`);
  assert.ok(FITS_FROM <= 396, `a card of ${FITS_FROM} px holds six columns of the longest piece (the CSS says 396)`);
  for (let W = 396; W <= 1200; W += 8) {
    const col = (W - SIDE - GAPS) / 6;
    for (const n of names) for (const p of pieces(n)) assert.ok(measure(p, 12, 600) <= col + 0.01, `${W}px: "${p}" of ${n} fits its column (${col.toFixed(1)} px)`);
  }
});

test('the names are straight and never shrunk under 12 px; only a container under 396 px tilts them', () => {
  const rule = (sel: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?<=^|\})\s*([^{}@]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === sel).map((m) => m[2]!);
  const base = rule('.pz-rail .n').filter((b) => !/rotate/.test(b));
  assert.equal(base.length, 1);
  assert.match(base[0]!, /font-size: max\(12px, /, 'never under 12 px');
  assert.match(base[0]!, /white-space: normal/);
  assert.match(base[0]!, /hyphens: manual/);
  assert.doesNotMatch(base[0]!, /rotate|nowrap|position: absolute/);
  // every rotation of a name is inside the narrow container query or the landscape phone's own sheet (guideline-sides.css, 293 px cards)
  const q = css.indexOf('@container (max-width: 395px)'), end = css.indexOf('\n}\n', q);
  assert.ok(q > 0 && end > q, 'the narrow container query');
  const outside = (css.slice(0, q) + css.slice(end)).replace(/\/\*[\s\S]*?\*\//g, '');
  const tilted = [...outside.matchAll(/([^{}]*)\{([^{}]*rotate: -60deg[^{}]*)\}/g)].map((m) => m[1]!.trim());
  assert.deepEqual(tilted, [], 'no other rule tilts the names');
  assert.doesNotMatch(css, /@container \(max-width: 470px\)/);
  const sides = readFileSync('src/ui/styles/guideline-sides.css', 'utf8');
  assert.match(sides, /@media \(orientation: landscape\) and \(max-height: 500px\)[\s\S]*\.pz \.pz-rail \.n \{[^}]*rotate: -60deg/, 'a phone on its side is the one other place that tilts (its card is 290 to 354 px)');
});

test('the Mac (the capture\'s 27.2) reads straight: its card holds the names even with the widest padding', () => {
  const w = widthOf({ w: 1440, h: 900, safe: { top: 0, left: 0, right: 0, bottom: 0 } } as never);
  assert.ok(w - 2 * 40 >= 396, `a 1440 x 900 card is ${w} px wide, 40 px of padding each side at the most`);
  const small = [[1024, 768], [1280, 720]].map(([a, b]) => widthOf({ w: a, h: b, safe: { top: 0, left: 0, right: 0, bottom: 0 } } as never) - 2 * 18);
  assert.ok(small.every((x) => x < 396 + 60), 'the smaller windows are near the limit and may still tilt (reported)');
});
