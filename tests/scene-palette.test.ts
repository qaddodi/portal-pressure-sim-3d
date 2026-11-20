import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_IDS, PALETTES, contrast, flowMarkColours, hexToRgb255, highlightColour, organTone } from '../src/scene/palette.ts';
import { LOOKS } from '../src/looks/looks.ts';

test('every look has a scene palette built from the one looks table', () => {
  for (const id of LOOK_IDS) {
    const p = PALETTES[id], l = LOOKS[id];
    assert.equal(p.bg, l.bg); assert.equal(p.body, l.plate); assert.equal(p.ink, l.ink); assert.equal(p.shade, l.shadeK);
    assert.equal(p.tones.portal, l.portal); assert.equal(p.tones.sys, l.systemic); assert.equal(p.tones.liver, organTone(l.liver, l.ink));
  }
});

test('shadow factors: 0.62 on Light and Soft, 0.50 on Dark and Navy (spec section 2)', () => {
  assert.equal(PALETTES.light.shade, 0.62);
  assert.equal(PALETTES.soft.shade, 0.62);
  assert.equal(PALETTES.dark.shade, 0.5);
  assert.equal(PALETTES.navy.shade, 0.5);
});

test('Soft carries the deeper vessel tones the owner accepted', () => {
  assert.equal(PALETTES.soft.tones.portal, '#A8306A');
  assert.equal(PALETTES.soft.tones.sys, '#3A74B8');
});

test('highlight is the vessel tone lifted toward white (never pure white) on the dark looks and half the vessel tone on the light ones', () => {
  for (const id of ['dark', 'navy', 'black'] as const) for (const tone of ['portal', 'sys'] as const) {
    const h = highlightColour(PALETTES[id], tone), t = PALETTES[id].tones[tone];
    assert.notEqual(h.toUpperCase(), '#FFFFFF', `${id} ${tone}`);
    const hv = hexToRgb255(h), tv = hexToRgb255(t);
    for (let i = 0; i < 3; i++) assert.ok(hv[i]! >= tv[i]!, `${id} ${tone} channel ${i} is lifted`);
  }
  assert.equal(highlightColour(PALETTES.light, 'portal'), '#5c1938');
});

test('the balloon is the look\'s caution colour', () => {
  for (const id of LOOK_IDS) assert.equal(PALETTES[id].tones.balloon, LOOKS[id].caution);
});

test('flow marks stand off every vessel tone in every look by at least 3:1 (dark or cream, chosen per vessel)', () => {
  for (const id of LOOK_IDS) for (const tone of ['portal', 'sys'] as const) {
    const m = flowMarkColours(PALETTES[id], tone);
    const c = contrast(m.forward, PALETTES[id].tones[tone]);
    assert.ok(c >= 3, `${id} ${tone}: marks ${m.forward} on ${PALETTES[id].tones[tone]} is ${c.toFixed(2)}:1`);
  }
});

test('reversed flow marks stand off the vessel by at least 3:1 and differ from the forward ones', () => {
  for (const id of LOOK_IDS) for (const tone of ['portal', 'sys'] as const) {
    const m = flowMarkColours(PALETTES[id], tone);
    const c = contrast(m.reversed, PALETTES[id].tones[tone]);
    assert.ok(c >= 3, `${id} ${tone}: reversed ${m.reversed} on ${PALETTES[id].tones[tone]} is ${c.toFixed(2)}:1`);
    assert.notEqual(m.reversed, m.forward);
  }
});

// Spec section 10: ink at least 3:1 against the organs it outlines. The looks table's Light and Soft organs were too dark for that (1.9 to 2.5:1;
// even pure black ink reaches only 2.8:1 on Soft's liver), so the scene lightens those organ tones by the least that reaches it.
for (const id of LOOK_IDS) {
  test(`ink stands off every organ by 3:1 in ${id}`, () => {
    for (const k of ['liver', 'spleen', 'heart', 'gut', 'stomach'] as const) assert.ok(contrast(PALETTES[id].ink, PALETTES[id].tones[k]) >= 3, `${id} ink on ${k}`);
  });
}

test('organ tones only move when they must: dark looks keep the token, light ones are lightened toward white and keep their hue', () => {
  for (const id of ['dark', 'navy', 'black'] as const) {
    for (const k of ['liver', 'spleen', 'heart', 'gut', 'stomach'] as const) assert.equal(PALETTES[id].tones[k], LOOKS[id][k]);
  }
  for (const id of ['light', 'soft'] as const) {
    for (const k of ['liver', 'spleen', 'heart', 'gut', 'stomach'] as const) {
      const was = hexToRgb255(LOOKS[id][k]), now = hexToRgb255(PALETTES[id].tones[k]);
      for (let c = 0; c < 3; c++) assert.ok(now[c]! >= was[c]!, `${id} ${k} channel ${c} only goes up`);
      // never a big jump: at most 70 per channel (Soft's liver, the darkest, moves the most)
      for (let c = 0; c < 3; c++) assert.ok(now[c]! - was[c]! <= 70, `${id} ${k} moved ${now[c]! - was[c]!}`);
    }
  }
  assert.equal(organTone('#FFFFFF', '#000000'), '#FFFFFF');
  assert.equal(organTone('#905B49', '#000000'), '#905B49', 'a tone the ink already stands off is left alone');
});
