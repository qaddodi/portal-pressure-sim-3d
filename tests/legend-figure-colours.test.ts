// External review, 20 Nov: "pressure colours get saturation and brightness caps after the legend is built". The vessels never wear the raw lens ramp: the shader makes every lens colour saturated and deep first (cel-glsl.ts celTubeBase;
// the JS twin is cel-ink.ts celTubeBase), so a key built from the raw ramp promised a colour the vessels did not have, and differently on the dark looks (brighter caps). The legend's bar, dots, the lens menu's swatch and the action
// card's strip are ONE source (legend.ts) and all of it goes through figureHex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legendFor, rampStops } from '../src/scene/lenses/legend.ts';
import { figureHex, celTubeBase, isDarkLook } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { LENS_SHARED } from '../src/scene/lenses/tokens.copied.ts';
import { PRESSURE_RAMP } from '../src/scene/lenses/pressure-ramp.ts';
import { hexToRgb01, rgb01ToHex } from '../src/scene/lenses/oklab.ts';
import { lensSwatch } from '../src/ui/shell/lens-art.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const LOOKS = ['light', 'soft', 'dark', 'navy', 'black'] as const;
const LENSES: LensId[] = ['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen', 'origin', 'firstpass', 'system'];
const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
const hex2 = (h: string): [number, number, number] => hexToRgb01(h);

test('figureHex is the vessels\' transform: the same colour celTubeBase gives, per look (the dark looks have the brighter caps)', () => {
  for (const look of LOOKS) for (const h of ['#B8D5ED', '#680C2F', '#D9731F', '#9696A0', '#FFFFFF', '#000000']) {
    assert.equal(figureHex(h, look), rgb01ToHex(celTubeBase(hex2(h), isDarkLook(look))), `${look} ${h}`);
  }
  assert.notEqual(figureHex('#B8D5ED', 'light'), '#B8D5ED', 'the pale end of the pressure ramp is darkened on the figure');
  assert.notEqual(figureHex('#B8D5ED', 'light'), figureHex('#B8D5ED', 'dark'), 'and the dark looks cap it brighter');
});

test('no key colour is lighter or more saturated than a vessel can be: every stop and dot of every lens but the pressure one (authored as drawn, pressure-ramp.ts), in every look, is under the caps', () => {
  const T = CEL_STYLE.TUBE;
  for (const look of LOOKS) {
    const dark = isDarkLook(look), lcap = (dark ? T.LCAP_DARK : T.LCAP) + 0.01, vcap = (dark ? T.VCAP_DARK : T.VCAP) + 0.01;
    for (const lens of LENSES.filter((l) => l !== 'pressure')) {
      const g = legendFor(lens, look);
      const colours = [...(g.bar?.stops.map((s) => s[0]) ?? []), ...((g.dots ?? []).map((d) => d.colour).filter(Boolean))];
      for (const c of colours) { const rgb = hex2(c); assert.ok(lum(rgb) <= lcap && Math.max(...rgb) <= vcap, `${look} ${lens} ${c} is under the vessel caps`); }
    }
  }
});

test('the pressure bar is the pressure ramp as the vessels wear it (authored as drawn: no transform), at every stop, in every look', () => {
  for (const look of LOOKS) {
    const raw = PRESSURE_RAMP[look], stops = legendFor('pressure', look).bar!.stops;
    assert.equal(stops.length, 11);
    // the first and last stops are the ramp's own colours: the vessels wear them as they are
    assert.equal(stops[0]![0], raw[0]![0]);
    assert.equal(stops.at(-1)![0], raw.at(-1)![0]);
    assert.equal(figureHex(raw[0]![0], look, true), raw[0]![0]);
    assert.notEqual(figureHex(raw[0]![0], look), raw[0]![0], 'the transform would still bend it: the raw flag is what keeps the key honest');
    assert.deepEqual(stops, rampStops(look, 'pressure', 30), 'the bar and the action card\'s strip are the same stops');
  }
});

test('the Change bar is read at eleven steps of the figure\'s own scale and capped, the dots are capped, and the lens menu\'s swatch is built from them', () => {
  for (const look of LOOKS) {
    const d = legendFor('delta', look).bar!.stops;
    assert.equal(d.length, 11);
    assert.equal(d[0]![0], figureHex(LENS_SHARED.deltaLow, look)); assert.equal(d[5]![0], figureHex(LENS_SHARED.deltaMid, look)); assert.equal(d[10]![0], figureHex(LENS_SHARED.deltaHigh, look));
    const o = legendFor('origin', look).dots!;
    assert.equal(o[0]!.colour, figureHex(LENS_SHARED.origin[0]!, look));
    for (const lens of LENSES) { const sw = lensSwatch(lens, look); for (const c of legendFor(lens, look).bar?.stops.map((s) => s[0]) ?? []) assert.ok(sw.includes(c), `${look} ${lens}: the swatch has the capped ${c}`); }
  }
});

test('nothing builds a key from a raw ramp any more: legend.ts reads every colour through figureHex', () => {
  const src = readFileSync(new URL('../src/scene/lenses/legend.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ figureHex \} from '\.\.\/vessels\/cel-ink\.ts'/);
  assert.match(src, /figureHex\(rgb01ToHex\(s\.at\(\(i \/ \(n - 1\)\) \* max, \[0, 0, 0\]\)\), look, raw\)/, 'the bar passes the raw flag of its lens');
  assert.doesNotMatch(src, /colour: LENS_SHARED\./, 'a dot is capped');
  assert.doesNotMatch(src, /colour: LENS_TOKENS/, 'a dot is capped');
  assert.doesNotMatch(src, /stops: \[\[LENS_SHARED/, 'the Change bar is capped');
});
