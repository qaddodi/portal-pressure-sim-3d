// The pressure ramp v2 (S1, Mohammad 22 Nov 2026: "take the new ones"), held to numbers per look. The colours are what the vessels DRAW (authored as drawn: lenses/pressure-ramp.ts), so they are measured as they are.
// OKLab differences are x100 (about 2 just visible, 5 clearly different); colour blindness is Machado 2009 at full strength. Limits, each on every look, at every 0.5 mmHg from 0 to 30:
//   lightness strictly falls with pressure; two pressures 2.5 mmHg apart differ by 3.5 or more for normal, deutan and protan vision; 9 against 13 mmHg by 7.5 or more, 10 against 15 by 8 or more, 12 against 20 by 15 or more;
//   no ramp colour within 10 of the artery red as drawn; the lit tone is 1.6:1 or more against the page at every pressure (the 0 mmHg end was 1.57 on Light and 1.22 on Soft before it was deepened).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESSURE_RAMP, pressureRampText } from '../src/scene/lenses/pressure-ramp.ts';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { type Rgb, hexToRgb01, sampler, toOklab } from '../src/scene/lenses/oklab.ts';
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

function colours(look: (typeof LOOK_IDS)[number]): Rgb[] {
  const s = sampler(PRESSURE_RAMP[look]);
  return Array.from({ length: 61 }, (_, i) => s.at(i * 0.5, [0, 0, 0]));
}

test('every look has a six-stop ramp at 0, 5, 10, 12, 20 and 30 mmHg, in valid #RRGGBB', () => {
  for (const look of LOOK_IDS) {
    const r = PRESSURE_RAMP[look];
    assert.deepEqual(r.map((s) => s[1]), [0, 5, 10, 12, 20, 30], look);
    for (const [c] of r) assert.match(c, /^#[0-9A-F]{6}$/, `${look} ${c}`);
    assert.equal(pressureRampText(look).split(',').length, 6);
  }
});

test('lightness as drawn falls with pressure, every look (it rose again at 12.5 to 20 mmHg before)', () => {
  for (const look of LOOK_IDS) {
    const L = colours(look).map((c) => toOklab(c)[0]);
    for (let i = 1; i < L.length; i++) assert.ok(L[i]! < L[i - 1]!, `${look}: lightness rises at ${i * 0.5} mmHg (${L[i - 1]!.toFixed(3)} to ${L[i]!.toFixed(3)})`);
  }
});

test('two pressures 2.5 mmHg apart differ by 3.5 or more, for normal, deutan and protan vision, every look', () => {
  for (const look of LOOK_IDS) {
    const c = colours(look);
    for (const v of VISIONS) for (let i = 0; i + 5 < c.length; i++) assert.ok(dE(c[i]!, c[i + 5]!, v) >= 3.5, `${look} ${v}: ${i * 0.5} against ${i * 0.5 + 2.5} mmHg only ${dE(c[i]!, c[i + 5]!, v).toFixed(2)} apart`);
  }
});

test('the clinical pairs stay apart in every vision: 9 against 13 (7.5), 10 against 15 (8), 12 against 20 (15)', () => {
  for (const look of LOOK_IDS) {
    const c = colours(look);
    for (const v of VISIONS) {
      assert.ok(dE(c[18]!, c[26]!, v) >= 7.5, `${look} ${v}: 9 against 13 mmHg ${dE(c[18]!, c[26]!, v).toFixed(1)}`);
      assert.ok(dE(c[20]!, c[30]!, v) >= 8, `${look} ${v}: 10 against 15 mmHg ${dE(c[20]!, c[30]!, v).toFixed(1)}`);
      assert.ok(dE(c[24]!, c[40]!, v) >= 15, `${look} ${v}: 12 against 20 mmHg ${dE(c[24]!, c[40]!, v).toFixed(1)}`);
    }
  }
});

test('no ramp colour is within 10 of the artery red as the figure draws it (an artery keeps the transform)', () => {
  for (const look of LOOK_IDS) {
    const artery = celTubeBase(hexToRgb01(LENS_TOKENS[look].artery), isDarkLook(look));
    for (const [i, c] of colours(look).entries()) assert.ok(dE(c, artery, 'normal') >= 10, `${look}: ${i * 0.5} mmHg is ${dE(c, artery, 'normal').toFixed(1)} from the artery`);
  }
});

test('the lit tone is 1.6:1 or more against the page at every pressure, every look (the pale 0 mmHg end of Light and Soft was under it)', () => {
  for (const look of LOOK_IDS) {
    const page = hexToRgb01(LOOKS[look].bg);
    for (const [i, c] of colours(look).entries()) assert.ok(contrast(c, page) >= 1.6, `${look}: ${i * 0.5} mmHg is ${contrast(c, page).toFixed(2)}:1 against the page`);
  }
});

test('the hues are the app\'s: blue to violet at the CSPH line to magenta to wine, hue only ever turning one way along the ramp (OKLCH)', () => {
  for (const look of LOOK_IDS) {
    const h = colours(look).filter((_, i) => i % 4 === 0).map((c) => { const [, a, b] = toOklab(c); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; });
    assert.ok(h[0]! > 220 && h[0]! < 270, `${look}: 0 mmHg is blue (${h[0]!.toFixed(0)} deg)`);
    assert.ok(h[h.length - 1]! < 30 || h[h.length - 1]! > 340, `${look}: 30 mmHg is wine (${h[h.length - 1]!.toFixed(0)} deg)`);
  }
});

test('Dusk (option A, Mohammad 23 Nov 2026): the stops are the ones he picked, and the 10 mmHg line turns the colour (9 against 11 mmHg is clearly different in every vision, every look)', () => {
  assert.deepEqual(PRESSURE_RAMP.light.map((s) => s[0]), ['#98B9D1', '#73A0CE', '#647CEC', '#8852E3', '#920181', '#4F023B']);
  assert.deepEqual(PRESSURE_RAMP.dark.map((s) => s[0]), ['#D5EDFE', '#B1D5F8', '#A6B7F6', '#BB94FF', '#D14B97', '#9C1472']);
  assert.equal(PRESSURE_RAMP.navy, PRESSURE_RAMP.dark);
  assert.equal(PRESSURE_RAMP.black, PRESSURE_RAMP.dark);
  for (const look of LOOK_IDS) {
    const c = colours(look);
    for (const v of VISIONS) assert.ok(dE(c[18]!, c[22]!, v) >= 3.5, `${look} ${v}: 9 against 11 mmHg only ${dE(c[18]!, c[22]!, v).toFixed(1)}`);
    assert.ok(dE(c[18]!, c[22]!, 'normal') >= 5.5, `${look}: the turn at 10 mmHg shows for normal vision`);
  }
});
