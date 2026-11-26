// The figure key (the chip on the figure: "Pressure drop Low → High") wears the colours the vessels are painted with: the lens colour key's own (legend.ts), in every look and for every lens
// that has a key. It once kept the 2D table and drew green for Pressure drop while the vessels were purple (Mohammad, 22 Nov 2026). Root cause: a second copy of the colours; this fails on any divergence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyModel, KEY_LENSES } from '../src/scene/labels/key.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const hexes = (css: string) => [...css.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]!.toUpperCase());

test('every key with a colour scale draws the legend bar\'s colours, in every look', () => {
  for (const look of LOOK_IDS) for (const lens of KEY_LENSES) {
    const k = keyModel(lens, look)!;
    if (!k.scale) continue;
    const bar = legendFor(lens as LensId, look).bar;
    assert.ok(bar, `${lens}: the legend has a bar`);
    assert.deepEqual(hexes(k.scale.gradient), bar!.stops.map(([c]) => c.toUpperCase()), `${lens} ${look}`);
  }
});

test('Pressure drop is not green: its key and the vessels read the same (purple) ramp', () => {
  for (const look of LOOK_IDS) {
    const stops = hexes(keyModel('drop', look)!.scale!.gradient);
    for (const hex of stops) {
      const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      assert.ok(!(g > r && g > b), `${look} ${hex} is green`);
    }
  }
});

test('every key with swatches takes the legend\'s colours: velocity\'s ends are its bar\'s ends; the others are the legend\'s dots', () => {
  for (const look of LOOK_IDS) {
    const vel = legendFor('velocity', look).bar!.stops, sw = keyModel('velocity', look)!.swatches!;
    assert.equal(sw[0]!.colour.toUpperCase(), vel[0]![0].toUpperCase());
    assert.equal(sw[1]!.colour.toUpperCase(), vel[vel.length - 1]![0].toUpperCase());
    const dir = legendFor('direction', look).dots!, ds = keyModel('direction', look)!.swatches!;
    ds.forEach((s, i) => assert.equal(s.colour.toUpperCase(), dir[i]!.colour.toUpperCase(), `direction ${look} ${i}`));
    const sysDots = legendFor('system', look).dots!, ss = keyModel('system', look)!.swatches!;
    ss.forEach((x, i) => { assert.equal(x.colour.toUpperCase(), sysDots[i]!.colour.toUpperCase(), `system ${look} ${i}`); assert.equal(x.label, sysDots[i]!.name); });
    assert.deepEqual(hexes(keyModel('since', look)!.scale!.gradient), hexes(keyModel('delta', look)!.scale!.gradient), `since wears Change's colours (${look})`);
    const org = legendFor('origin', look).dots!, os = keyModel('origin', look)!.swatches!;
    // the key lists SMV, IMV, Spleen, Artery, Systemic; the legend lists SMV, IMV, SV, Sys, HA
    const byName = (n: string) => org.find((d) => d.name === n)!.colour.toUpperCase();
    ['SMV', 'IMV', 'SV', 'HA', 'Sys'].forEach((n, i) => assert.equal(os[i]!.colour.toUpperCase(), byName(n), `origin ${look} ${n}`));
  }
});

test('the key reads no 2D colour table of its own for ramps', () => {
  const src = readFileSync('src/scene/labels/key.ts', 'utf8');
  assert.ok(!/ramp-\$\{|`ramp-/.test(src), 'key.ts must not read the KEY_COLOURS ramp tokens');
});
