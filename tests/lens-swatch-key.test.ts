// Every lens's menu swatch IS its header key (and so the ramp its vessels are painted from): one source, in every look (Mohammad, 20 Nov: "pressure does not reflect its legend").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { lensSwatch, swatchOfLegend } from '../src/ui/shell/lens-art.ts';
import { samplerFor, rampOf } from '../src/scene/lenses/model.ts';
import { rgb01ToHex } from '../src/scene/lenses/oklab.ts';
import { figureHex } from '../src/scene/vessels/cel-ink.ts';
import { isRawLens } from '../src/scene/lenses/pressure-ramp.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const LENSES: LensId[] = ['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen', 'origin', 'firstpass'];
const LOOKS = ['light', 'soft', 'dark', 'navy', 'black'] as const;

test('the menu swatch of each of the ten lenses is built from its key, in every look', () => {
  for (const look of LOOKS) for (const lens of LENSES) {
    const g = legendFor(lens, look), sw = lensSwatch(lens, look);
    assert.equal(sw, swatchOfLegend(g));
    assert.notEqual(sw, 'none', `${lens} has a swatch`);
    for (const c of [...(g.bar?.stops.map((s) => s[0]) ?? []), ...(g.dots?.map((d) => d.colour).filter(Boolean) ?? [])]) assert.ok(sw.includes(c), `${look} ${lens}: ${c} is in the swatch`);
  }
});

test('the key of a ramp lens runs through the colours the vessels are painted with (the ramp, then the vessel saturation and brightness caps; the pressure and velocity ramps are drawn as authored)', () => {
  for (const look of LOOKS) for (const [lens, name, max] of [['pressure', 'pressure', 30], ['flow', 'flow', 1], ['velocity', 'velocity', 1], ['heat', 'heat', 1], ['drop', 'drop', 1], ['oxygen', 'oxygen', 1]] as const) {
    const g = legendFor(lens, look), s = samplerFor(look, name);
    assert.ok(rampOf(look, name).length > 1);
    const stops = g.bar!.stops;
    for (const [c, p] of [stops[0]!, stops[stops.length - 1]!, stops[Math.floor(stops.length / 2)]!]) assert.equal(c, figureHex(rgb01ToHex(s.at((p / 100) * max, [0, 0, 0])), look, isRawLens(lens)), `${look} ${lens} at ${p}%: the ramp as the vessels wear it (the pressure and velocity ramps are drawn as authored)`);
  }
});
