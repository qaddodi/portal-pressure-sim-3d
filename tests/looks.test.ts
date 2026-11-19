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

test('settings: the app opens on Light as the 2D page does, a chosen look is kept, and bad storage falls back', () => {
  assert.equal(DEFAULTS.look, 'light');
  assert.deepEqual(parseSettings(null), DEFAULTS);
  assert.deepEqual(parseSettings('{not json'), DEFAULTS);
  assert.equal(parseSettings('{"look":"navy","lookChosen":true}').look, 'navy');
  assert.equal(parseSettings('{"look":"system","lookChosen":true}').look, 'system');
  // a "system" written by the old default (no choice made) is not a choice: the first screen is Light
  assert.equal(parseSettings('{"look":"system"}').look, 'light');
  assert.equal(parseSettings('{"look":"nope","lookChosen":true}').look, 'light');
  assert.ok(!('flowMarks' in parseSettings(null)), 'the Flow marks setting is gone');
});

test('Blur effect is on by default on every device, kept, and off is the solid look (html[data-noglass])', async () => {
  const { applyGlass } = await import('../src/state/settings.ts');
  assert.equal(DEFAULTS.blur, true);
  assert.equal(parseSettings(null).blur, true);
  assert.equal(parseSettings('{"blur":false}').blur, false);
  assert.equal(parseSettings('{"blur":"no"}').blur, true, 'a stored value that is not a switch is the default');
  const attrs = new Set<string>();
  const root = { setAttribute: (n: string) => attrs.add(n), removeAttribute: (n: string) => attrs.delete(n) } as unknown as HTMLElement;
  applyGlass(false, root); assert.ok(attrs.has('data-noglass'));
  applyGlass(true, root); assert.ok(!attrs.has('data-noglass'));
});
