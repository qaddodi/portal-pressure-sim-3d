// The audit's low-contrast words on the iPhone (build fd67073f, Soft look): "Splenic vein" 4.03:1 (a linked term inked 80% of its tone, the violet #7D5CDB) and "Sinusoidal" 4.26:1
// (the level kicker, inked as the raw level colour). Both inks are the colour drawn toward the text colour; this pins the share so each reaches 4.5:1 on the page's own background in every look.
import { merged2d } from './merged-2d.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = merged2d('app-04-presenter.css');
const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], p: number) => a.map((v, i) => v * p + b[i]! * (1 - p));
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
/** The share of the colour in the ink of the rule that starts with `head` (the rest of that line holds `color: color-mix(in srgb, <colour> N%, var(--text))`). */
const share = (head: string): number => {
  const line = css.split('\n').find((l) => l.startsWith(head));
  assert.ok(line, head);
  const m = /[^-]color: color-mix\(in srgb, .*? (\d+)%, var\(--text\)\)/.exec(line!);
  assert.ok(m, head);
  return +m![1]! / 100;
};
// each look's page background and text colour (tokens.css), and the portal and systemic colours that look draws the level colours from
const LOOKS = [['light', '#F1EBE0', '#1B1710', '#B8326F', '#3F7FCB'], ['soft', '#DDD0B9', '#1F1A12', '#B8326F', '#3F7FCB'], ['dark', '#1A1917', '#EEEBE5', '#E06AA2', '#79AEEF'], ['navy', '#0E1422', '#E9EDF6', '#E06AA2', '#79AEEF']] as const;

test('a linked term (Splenic vein) reads 4.5:1 on every look', () => {
  const p = share('.pz-term:not(.pz-lens-t) {');
  for (const [name, bg, tx] of LOOKS) assert.ok(ratio(mix(hex('#7D5CDB'), hex(tx), p), hex(bg)) >= 4.5, name);
});

test('the level kicker (Sinusoidal) reads 4.5:1 on every look, every level but the far ends', () => {
  const p = share('.pz-kick {');
  for (const [name, bg, tx, pk, sy] of LOOKS) for (const v of [1, 0.8, 0.6, 0.4]) assert.ok(ratio(mix(mix(hex(pk), hex(sy), v), hex(tx), p), hex(bg)) >= 4.5, `${name} ${v}`);
});
