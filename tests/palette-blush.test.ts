// Blush (docs/approved/palette-blush.md): the lighter Light and Soft palette Mohammad picked on 28 Nov 2026 ("L2S2"). Pins the values the mock was built from, that they reach every reader, and that nothing that carries meaning moved.
import test from 'node:test';
import assert from 'node:assert/strict';
const { LOOKS, lookVars } = await import('../src/looks/looks.ts');
const { lookColours, hexOf } = await import('../src/scene/lobule/lz-colours.ts');
const { BLUSH_TOKENS, BLUSH_ORGANS } = await import('../src/looks/looks.ts');
const { PRESSURE_RAMP } = await import('../src/scene/lenses/pressure-ramp.ts');

test('the organs take Blush\'s tones, and the grounds, plate, ink and vessel colours are as before', () => {
  for (const look of ['light', 'soft'] as const) for (const [k, v] of Object.entries(BLUSH_ORGANS[look])) assert.equal((LOOKS[look] as any)[k], v, `${look} ${k}`);
  assert.equal(LOOKS.light.liver, '#AB7A6E'); assert.equal(LOOKS.soft.liver, '#9B6B5F');
  assert.deepEqual([LOOKS.light.bg, LOOKS.light.plate, LOOKS.light.portal, LOOKS.light.systemic], ['#F1EBE0', '#E8DFD0', '#B8326F', '#3F7FCB']);
  assert.deepEqual([LOOKS.soft.bg, LOOKS.soft.plate, LOOKS.soft.portal, LOOKS.soft.systemic], ['#DDD0B9', '#CEC6B7', '#A8306A', '#3A74B8']);
  assert.equal(PRESSURE_RAMP.light[3]![0], '#8852E3'); assert.equal(PRESSURE_RAMP.soft[4]![0], '#850175');
});
test('the lobule and the far lobules read Blush\'s tissue through lookColours, on every look', () => {
  for (const look of ['light', 'soft'] as const) {
    const L = lookColours(look);
    for (const [k, v] of Object.entries(BLUSH_TOKENS[look])) assert.equal(hexOf(L.rgb01('--' + k)), v.toUpperCase(), `${look} --${k}`);
  }
  for (const d of ['dark', 'navy', 'black'] as const) assert.equal(lookColours(d).text('--og-field-1'), lookColours(d).text('--og-liver-1'), d);   // (the dark looks paint the neighbours as before)
  assert.equal(hexOf(lookColours('dark').rgb01('--og-liver-1')), '#885B4C');
});
test('the page carries the same tissue variables for the readers that take them from the document', () => {
  for (const look of ['light', 'soft'] as const) for (const [k, v] of Object.entries(BLUSH_TOKENS[look])) assert.equal(lookVars(look)['--' + k], v);
  assert.equal(lookVars('dark')['--og-liver-1'], undefined);
});
test('the far lobules keep a deeper gap under a lighter cell, so they read under the blur', () => {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };
  for (const look of ['light', 'soft'] as const) { const t = BLUSH_TOKENS[look]; assert.ok(lum(t['og-field-1']!) - lum(t['og-field-2']!) > lum(t['og-liver-1']!) - lum(t['og-liver-2']!), look); }
});
