// Rule (owner, 26 Nov: "in sinusoid view the legend that says Protein doesn't show a yellow circle resembling protein"): EVERY entry of EVERY key has a swatch painted from the same colour source as the
// scene element it names, in every look and at every screen size. A word with no swatch (the sinusoid's Protein, whose dot had been stripped with the pill; the Anatomy key's two vein dots, whose colour was
// an empty string) fails here, as does a swatch painted from a token the scene does not use. Source-reading and pure data, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ALBUMIN_TOKENS, SINUSOID_KEY } from '../src/scene/sinusoid/legend.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { LENS_IDS } from '../src/scene/lenses/model.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { figureHex } from '../src/scene/vessels/cel-ink.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { LOOKS, type LookId } from '../src/looks/looks.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const looks = Object.keys(LOOKS) as LookId[];
const HEX = /^#[0-9a-f]{6}$/i;
const hue = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; const x = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return x * 60; };
const rgbHex = (c: readonly number[] /* 0 to 1 */) => '#' + [c[0], c[1], c[2]].map((v) => Math.round(v! * 255).toString(16).padStart(2, '0')).join('');

test('the sinusoid key: every entry has a word and a round swatch, and ProteinLegend draws every entry of the list (none is written by hand)', () => {
  assert.ok(SINUSOID_KEY.length >= 1);
  for (const k of SINUSOID_KEY) { assert.ok(k.word.trim()); assert.equal(k.shape, 'circle'); assert.match(k.fill, /^--[\w-]+$/); assert.match(k.edge, /^--[\w-]+$/); }
  const comp = read('src/scene/sinusoid/ProteinLegend.tsx');
  assert.match(comp, /SINUSOID_KEY\.map\(/);
  assert.match(comp, /className="alb"/);
  assert.match(comp, /'--key-fill': `var\(\$\{k\.fill\}\)`, '--key-edge': `var\(\$\{k\.edge\}\)`/, 'the swatch is painted from the tokens of the list');
  assert.doesNotMatch(comp, /<\/i>Protein|\/>Protein</, 'the word is not typed beside a swatch of its own');
});

test('the Protein swatch and the scene\'s protein particles are painted from the same two tokens', () => {
  const view = read('src/scene/sinusoid/view.ts');
  assert.match(view, /'--sv-gl-albumin': ALBUMIN_TOKENS\.fill/, 'view.ts resolves the particles\' fill to the legend\'s fill token');
  const pal = read('src/scene/sinusoid/palette.copied.js');
  assert.match(pal, /U\.cAlb = rgb\(cssv\('--sv-gl-albumin'\)\)/, 'the particles\' fill is --sv-gl-albumin');
  assert.ok(pal.includes(`U.cAlbE = rgb(cssv('${ALBUMIN_TOKENS.edge}'))`), 'the particles\' rim is the legend\'s edge token');
});

test('in every look both swatch tokens exist, the fill is a yellow-amber, and the rim is told from it', () => {
  for (const look of looks) {
    const p = paletteOf(look);
    for (const k of SINUSOID_KEY) {
      assert.ok(p.has(k.fill.slice(2)), `${look}: ${k.fill}`); assert.ok(p.has(k.edge.slice(2)), `${look}: ${k.edge}`);
      const fill = rgbHex(p.tok(k.fill.slice(2))), edge = rgbHex(p.tok(k.edge.slice(2)));
      assert.match(fill, HEX); assert.notEqual(fill, edge, `${look}: the rim is not the fill`);
      const h = hue(fill); assert.ok(h >= 28 && h <= 52, `${look}: ${fill} reads yellow-amber (hue ${Math.round(h)})`);
    }
  }
});

test('no stylesheet hides or collapses the swatch, and the circle is drawn from the key\'s own tokens at every screen size', () => {
  const dir = new URL('../src/', import.meta.url);
  const walk = (u: URL): URL[] => readdirSync(u, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === 'engine' ? [] : walk(new URL(d.name + '/', u))) : d.name.endsWith('.css') ? [new URL(d.name, u)] : []);
  const rules: [string, string, string][] = [];
  for (const f of walk(dir)) for (const m of strip(readFileSync(f, 'utf8')).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) rules.push([m[1]!.trim(), m[2]!, f.pathname]);
  const alb = rules.filter(([s]) => /\.sv-legend[^,{]*\bi(\.alb)?\b|\bi\.alb\b/.test(s));
  assert.ok(alb.length >= 2);
  for (const [s, b] of alb) {
    assert.doesNotMatch(b, /display:\s*none/, `${s} hides the swatch`);
    assert.doesNotMatch(b, /(^|[;\s])(width|height):\s*0(px)?\s*(;|$)/, `${s} collapses the swatch`);
    assert.doesNotMatch(b, /visibility:\s*hidden|opacity:\s*0\b/, `${s} hides the swatch`);
  }
  const mine = rules.find(([s, , f]) => /^html:root \.sv-legend i\.alb$/.test(s) && f.endsWith('humanized.css'));
  assert.ok(mine, 'humanized.css draws the swatch');
  const b = mine![1];
  assert.match(b, /display:\s*inline-block/); assert.match(b, /border-radius:\s*50%/);
  const w = /(?:^|[;\s])width:\s*([\d.]+)px/.exec(b)?.[1], h = /(?:^|[;\s])height:\s*([\d.]+)px/.exec(b)?.[1];
  assert.ok(w && w === h && +w >= 8, 'a circle, at least 8 px');
  assert.match(b, /background:\s*var\(--key-fill/); assert.match(b, /box-shadow:\s*inset 0 0 0 1px var\(--key-edge/);
  // no media rule on the legend's own sheet takes the swatch away on a phone or a tablet
  assert.doesNotMatch(strip(read('src/scene/sinusoid/legend.css')), /\bi\b[^{]*\{[^}]*display:\s*none/);
});

test('every lens key: every dot has a name and a real colour, every bar has stops, in every look', () => {
  const lenses = [...LENS_IDS, 'neutral'] as LensId[];
  let dots = 0;
  for (const look of looks) for (const lens of lenses) {
    const g = legendFor(lens, look);
    for (const d of g.dots ?? []) { dots++; assert.ok(d.name.trim(), `${look} ${lens}`); assert.match(d.colour, HEX, `${look} ${lens} "${d.name}" has no swatch colour (an empty colour paints nothing beside the word)`); }
    if (g.bar) assert.ok(g.bar.stops.length >= 2 && g.bar.stops.every(([c]) => HEX.test(c)), `${look} ${lens}`);
    assert.ok(g.bar || (g.dots && g.dots.length), `${look} ${lens} draws neither a bar nor a dot`);
  }
  assert.ok(dots > 50);
});

test('the Anatomy key\'s vein dots are the colours the vessels wear: the look\'s portal and systemic tones through the vessels\' own transform', () => {
  for (const look of looks) {
    const d = legendFor('neutral', look).dots!;
    assert.deepEqual(d.map((x) => x.name), ['Portal veins', 'Systemic veins']);
    assert.equal(d[0]!.colour.toLowerCase(), figureHex(PALETTES[look].tones.portal, look).toLowerCase(), look);
    assert.equal(d[1]!.colour.toLowerCase(), figureHex(PALETTES[look].tones.sys, look).toLowerCase(), look);
    assert.notEqual(d[0]!.colour, d[1]!.colour, `${look}: told apart`);
  }
});

test('the lens key paints every dot from its colour (Legend.tsx has no dot without a background)', () => {
  assert.match(read('src/scene/lenses/Legend.tsx'), /<i style=\{\{ background: d\.colour \}\} \/>\{d\.name\}/);
});
