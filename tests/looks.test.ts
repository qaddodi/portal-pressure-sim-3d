import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, LOOK_IDS, lookVars, resolveLook, hexToRgb } from '../src/looks/looks.ts';
import { parseSettings, DEFAULTS } from '../src/state/settings.ts';

const HEX = /^#[0-9A-F]{6}$/i;

test('five looks, every colour a six-digit hex', () => {
  assert.deepEqual([...LOOK_IDS], ['light', 'soft', 'dark', 'navy', 'black']);
  for (const id of LOOK_IDS) for (const [k, v] of Object.entries(LOOKS[id])) if (typeof v === 'string' && !['scheme', 'shadowRgb', 'glass', 'accentSoft', 'edge'].includes(k)) assert.match(v, HEX, `${id}.${k}`);
});

test('Soft carries the two deeper vessel tones the owner accepted', () => {
  assert.equal(LOOKS.soft.portal, '#A8306A');
  assert.equal(LOOKS.soft.systemic, '#3A74B8');
});

test('pressure signals are the spec table (HVPG colours come from the engine\'s cuts, never here)', () => {
  assert.deepEqual([LOOKS.light.ok, LOOKS.light.caution, LOOKS.light.danger], ['#157A58', '#B07A0A', '#C23F2A']);
  assert.deepEqual([LOOKS.dark.ok, LOOKS.dark.caution, LOOKS.dark.danger], ['#34C38F', '#F0B43C', '#F2634D']);
});

test('ink and ground: the ink is darker than the plate in every look, black ink on Black', () => {
  const lum = (h: string) => { const [r, g, b] = hexToRgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const id of LOOK_IDS) assert.ok(lum(LOOKS[id].ink) <= lum(LOOKS[id].plate), id);
  assert.equal(LOOKS.black.ink, '#000000');
});

test('System follows the device; the others do not', () => {
  assert.equal(resolveLook('system', true), 'dark');
  assert.equal(resolveLook('system', false), 'light');
  assert.equal(resolveLook('navy', false), 'navy');
});

test('CSS variables exist for every look and agree with the table', () => {
  for (const id of LOOK_IDS) { const v = lookVars(id); assert.equal(v['--bg'], LOOKS[id].bg); assert.equal(v['--vein-portal'], LOOKS[id].portal); }
});

test('settings: the flow-mark style defaults to A and survives bad storage', () => {
  assert.equal(DEFAULTS.flowMarks, 'A');
  assert.deepEqual(parseSettings(null), DEFAULTS);
  assert.deepEqual(parseSettings('{not json'), DEFAULTS);
  assert.equal(parseSettings('{"look":"navy","flowMarks":"C"}').flowMarks, 'C');
  assert.equal(parseSettings('{"look":"nope","flowMarks":"Z"}').look, 'system');
});
