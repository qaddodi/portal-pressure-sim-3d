// An instrument card's header readings ("16.7" mmHg, "0.0" L) have no dark box behind them (owner, 28 Nov, Fluid balance card, iPhone).
// Root cause: the lifted rule `.pz-hi > b { -webkit-text-stroke: 3px var(--label-halo) }` (dark ink in a dark theme) painted inside a Roll's overflow-hidden box. The reading is on the card's own ground and needs no halo.
// Every header reading (every instrument card, deck and device size) is the one markup TilesHead writes: `.pz-hi > b`, so one rule covers them; this pins the rule and that nothing gives the reading a background or shadow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ui = new URL('../src/ui/', import.meta.url);
const files = ['humanized.css', 'deck-ui.css', 'css3d-over-2d.css', ...readdirSync(new URL('styles/', ui)).filter((f) => f.endsWith('.css')).map((f) => `styles/${f}`)];
const rules = files.flatMap((f) => [...readFileSync(new URL(f, ui), 'utf8').matchAll(/([^{}\n][^{}]*)\{([^{}]*)\}/g)].map((m) => ({ f, sel: m[1]!.trim(), body: m[2]! })));
const onReading = (sel: string) => sel.split(',').some((s) => /\.pz-hi\b(?!\w)[^,]*>\s*b\b/.test(s) && !/\.app\.pz-hi|\.app:not/.test(s.trim().split('>')[0]!) || /\.pz-hr\b.*\b(b|\.dk-roll)\b/.test(s));

test('a header reading is stroked by nothing: the humanized rule clears the outline with !important', () => {
  const r = rules.find((x) => x.f === 'humanized.css' && /\.pz-hi > b,/.test(x.sel));
  assert.ok(r, 'no clearing rule');
  assert.match(r.body, /-webkit-text-stroke:\s*0\s*!important/);
});

test('no rule gives a header reading a background, a box shadow or an outline', () => {
  const bad = rules.filter((r) => onReading(r.sel) && /(^|;|\s)(background(-color)?|box-shadow|outline|text-shadow)\s*:\s*(?!none|transparent|0)/.test(r.body));
  assert.deepEqual(bad.map((r) => `${r.f}: ${r.sel}`), []);
});
