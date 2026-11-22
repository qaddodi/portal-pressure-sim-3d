// ONE source for the velocity ramp (ramp F, Indigo · Teal · Coral, Mohammad 22 Nov 2026: "Go with F"): lenses/velocity-ramp.ts. Held to numbers per look, as the pressure ramp is (pressure-ramp.test.ts):
// the colours are what the vessels DRAW (authored as drawn, RAW_LENSES), so they are measured as they are. OKLab differences are x100; colour blindness is Machado 2009 at full strength.
//   no sample within 10 of that look's artery red; slow, normal and fast differ by 14 or more for normal, deutan and protan vision (normal against fast under deutan vision is 12.5 or more on the dark looks: their coral is at the sRGB edge); the lit tone is 1.6:1 or more against the page at every position;
//   the legend's stops are the ramp; nothing but the ramp module reads the 2D velocity ramp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VELOCITY_RAMP } from '../src/scene/lenses/velocity-ramp.ts';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { RAW_LENSES } from '../src/scene/lenses/pressure-ramp.ts';
import { legendFor, rampStops } from '../src/scene/lenses/legend.ts';
import { samplerFor } from '../src/scene/lenses/model.ts';
import { type Rgb, hexToRgb01, rgb01ToHex, sampler, toOklab } from '../src/scene/lenses/oklab.ts';
import { celTubeBase, isDarkLook } from '../src/scene/vessels/cel-ink.ts';
import { LOOKS } from '../src/looks/looks.ts';

const LOOK_IDS = ['light', 'soft', 'dark', 'navy', 'black'] as const;
type Vision = 'normal' | 'deutan' | 'protan';
const CVD: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const seen = (c: Rgb, v: Vision): Rgb => {
  if (v === 'normal') return c;
  const l = c.map(lin), M = CVD[v];
  return M.map((row) => delin(Math.min(1, Math.max(0, row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)))) as Rgb;
};
const dE = (a: Rgb, b: Rgb, v: Vision) => { const x = toOklab(seen(a, v)), y = toOklab(seen(b, v)); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const Y = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: Rgb, b: Rgb) => { const p = Y(a), q = Y(b); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
const VISIONS: Vision[] = ['normal', 'deutan', 'protan'];
const samples = (look: (typeof LOOK_IDS)[number]): Rgb[] => { const s = sampler(VELOCITY_RAMP[look]); return Array.from({ length: 401 }, (_, i) => s.at(i / 400, [0, 0, 0])); };

test('every look has six stops at 0, .24, .36, .64, .76 and 1 in valid #RRGGBB, one teal across the middle third, and velocity is authored as drawn', () => {
  for (const look of LOOK_IDS) {
    const r = VELOCITY_RAMP[look];
    assert.deepEqual(r.map((s) => s[1]), [0, 0.24, 0.36, 0.64, 0.76, 1], look);
    for (const [c] of r) assert.match(c, /^#[0-9A-F]{6}$/, `${look} ${c}`);
    assert.equal(r[2]![0], r[3]![0], `${look}: normal is one teal`);
  }
  assert.ok(RAW_LENSES.has('velocity'));
});

test('his hues are kept: indigo slow, teal normal, coral fast (OKLCH), on every look', () => {
  for (const look of LOOK_IDS) {
    const hue = (h: string) => { const [, a, b] = toOklab(hexToRgb01(h)); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
    const r = VELOCITY_RAMP[look];
    assert.ok(hue(r[0]![0]) > 260 && hue(r[0]![0]) < 300, `${look}: slow is indigo (${hue(r[0]![0]).toFixed(0)} deg)`);
    assert.ok(hue(r[2]![0]) > 170 && hue(r[2]![0]) < 200, `${look}: normal is teal (${hue(r[2]![0]).toFixed(0)} deg)`);
    assert.ok(hue(r[5]![0]) > 25 && hue(r[5]![0]) < 50, `${look}: fast is coral (${hue(r[5]![0]).toFixed(0)} deg)`);
  }
});

test('no sample is within 10 of that look\'s artery red (the artery keeps its red under every lens)', () => {
  for (const look of LOOK_IDS) {
    const plain = hexToRgb01(LENS_TOKENS[look].artery), drawn = celTubeBase(plain, isDarkLook(look));
    for (const [i, c] of samples(look).entries()) for (const [name, a] of [['token', plain], ['as drawn', drawn]] as const) assert.ok(dE(c, a, 'normal') >= 10, `${look}: ${i / 400} is ${dE(c, a, 'normal').toFixed(1)} from the ${name} artery`);
  }
});

test('slow, normal and fast differ by 14 or more, for normal, deutan and protan vision, every look (12.5 for normal against fast under deutan vision on the dark looks)', () => {
  for (const look of LOOK_IDS) {
    const r = VELOCITY_RAMP[look].map(([h]) => hexToRgb01(h)) as Rgb[], slow = r[0]!, normal = r[2]!, fast = r[5]!;
    for (const v of VISIONS) for (const [n, a, b] of [['slow/normal', slow, normal], ['normal/fast', normal, fast], ['slow/fast', slow, fast]] as const) assert.ok(dE(a, b, v) >= (n === 'normal/fast' && v === 'deutan' && isDarkLook(look) ? 12.5 : 14), `${look} ${v}: ${n} only ${dE(a, b, v).toFixed(1)} apart`);
  }
});

test('the lit tone is 1.6:1 or more against the page at every position, every look (the pale coral on Light is the one to watch)', () => {
  for (const look of LOOK_IDS) {
    const page = hexToRgb01(LOOKS[look].bg);
    for (const [i, c] of samples(look).entries()) assert.ok(contrast(c, page) >= 1.6, `${look}: ${i / 400} is ${contrast(c, page).toFixed(2)}:1 against the page`);
  }
});

test('the legend\'s stops are the ramp as drawn (no transform), the aria names indigo, teal and coral, and the lens key follows', () => {
  for (const look of LOOK_IDS) {
    const s = sampler(VELOCITY_RAMP[look]);
    const g = legendFor('velocity', look);
    g.bar!.stops.forEach(([hex], i) => assert.equal(hex, rgb01ToHex(s.at(i / 10, [0, 0, 0])), `${look} stop ${i}`));
    assert.deepEqual(g.bar!.stops, rampStops(look, 'velocity', 1));
    assert.equal(g.bar!.stops[0]![0], VELOCITY_RAMP[look][0]![0]);
    assert.equal(g.bar!.stops.at(-1)![0], VELOCITY_RAMP[look].at(-1)![0]);
    assert.match(g.aria, /indigo \(slower than normal\) through teal \(normal\) to coral \(faster\)/);
    assert.ok(!/sand|violet/.test(g.aria));
    for (const x of [0, 0.3, 0.5, 0.7, 1]) assert.deepEqual(samplerFor(look, 'velocity').at(x, [0, 0, 0]), s.at(x, [0, 0, 0]));
  }
});

test('nothing but the ramp module (and the copies that hold 2D\'s own) reads the 2D velocity ramp', () => {
  const ALLOWED = new Set(['src/scene/lenses/tokens.copied.ts', 'src/scene/lenses/velocity-ramp.ts', 'src/scene/lenses/model.ts', 'src/scene/labels/names.copied.ts', 'src/parity/b3.ts',
    'src/ui/charts/looks2d/theme-tokens.js', 'src/ui/charts/tokens.generated.ts']);
  const bad: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js)$/.test(f) && !ALLOWED.has(p)) {
    const t = readFileSync(p, 'utf8');
    if (/LENS_TOKENS\s*(\[[^\]]*\]|\.\w+)\s*\.velocity\b|'ramp-velocity'|"ramp-velocity"/.test(t)) bad.push(p);
  } } };
  walk('src');
  assert.deepEqual(bad, [], 'a second reader of the 2D velocity ramp: read samplerFor(look, "velocity") or VELOCITY_RAMP');
  assert.match(readFileSync('src/scene/lenses/model.ts', 'utf8'), /name === 'velocity' \? VELOCITY_RAMP\[look\]/);
});
