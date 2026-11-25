// Figure presets (review R6, owner-approved 25 Nov 2026): Cool, Balanced and Rich set the ten figure switches in one save; the preset is read back from the switches, and a mix is Custom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, DEPTH_KEYS, FIGURE_DETAIL, FIGURE_SETTINGS_VERSION as V, parseSettings, useSettings } from '../src/state/settings.ts';
import { PRESET_IDS, PRESET_KEYS, presetOf, presetValues } from '../src/state/figure-presets.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';
import { MORE_NOW, PRESET_LABEL, PRESET_LINE } from '../src/ui/settings/preset-rows.ts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('three presets, in the order the sheet shows them, each setting all ten switches', () => {
  assert.deepEqual([...PRESET_IDS], ['cool', 'balanced', 'rich']);
  assert.equal(PRESET_KEYS.length, 10);
  assert.deepEqual([...PRESET_KEYS].sort(), ['autoDetail', 'blur', 'figureDetail', 'sharpMoving', ...DEPTH_KEYS].sort());
  for (const phone of [false, true]) for (const id of PRESET_IDS) assert.deepEqual(Object.keys(presetValues(id, phone)).sort(), [...PRESET_KEYS].sort(), id);
});

test('Balanced is what the app starts with, on a Mac and on a phone (the streaks start off there)', () => {
  for (const phone of [false, true]) {
    const d = parseSettings(null, phone);
    assert.equal(presetOf(d, phone), 'balanced');
    for (const k of PRESET_KEYS) assert.equal(presetValues('balanced', phone)[k], d[k], k);
  }
  assert.equal(presetOf(DEFAULTS, false), 'balanced');
});

test('Cool is the low-cost end: soft 1x that stays 1x in a gesture, no glass, and every depth effect off; Auto detail stays on', () => {
  const c = presetValues('cool');
  assert.equal(FIGURE_DETAIL[c.figureDetail].dpr, 1);
  assert.equal(c.blur, false); assert.equal(c.sharpMoving, false); assert.equal(c.autoDetail, true);
  for (const k of DEPTH_KEYS) assert.equal(c[k], false, k);
  assert.equal(presetValues('cool', true).particles, false);
});

test('Rich is every effect on at the sharpest detail, held (Auto detail off), on a phone too', () => {
  for (const phone of [false, true]) {
    const r = presetValues('rich', phone);
    assert.equal(FIGURE_DETAIL[r.figureDetail].dpr, 2);
    assert.equal(r.blur, true); assert.equal(r.autoDetail, false);
    for (const k of DEPTH_KEYS) assert.equal(r[k], true, k);
  }
});

test('no two presets are the same, and each reads back as itself', () => {
  for (const phone of [false, true]) {
    const seen = new Set<string>();
    for (const id of PRESET_IDS) {
      const v = presetValues(id, phone);
      seen.add(JSON.stringify(v));
      assert.equal(presetOf({ ...DEFAULTS, ...v }, phone), id, `${id} (phone ${phone})`);
    }
    assert.equal(seen.size, 3);
  }
});

test('one switch off its preset is Custom (null); the look, shortcuts and diagnostics are not the presets\'', () => {
  for (const id of PRESET_IDS) for (const k of PRESET_KEYS) {
    const v = presetValues(id, false), s = { ...DEFAULTS, ...v };
    const flipped = typeof s[k] === 'boolean' ? !s[k] : (s[k] as number) === 0 ? 1 : 0;
    assert.equal(presetOf({ ...s, [k]: flipped }, false), null, `${id} with ${k} changed`);
  }
  const rich = { ...DEFAULTS, ...presetValues('rich', false) };
  const other = { ...rich, look: 'dark' as const, keys: false, showFps: true };
  assert.equal(presetOf(other, false), 'rich');
});

test('choosing a preset writes the ten switches in one save and leaves the rest of the settings alone', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  const st = useSettings.getState();
  st.setLook('dark'); st.set('keys', false);
  const writes = () => store.get('pps3d.settings.v1');
  st.setMany(presetValues('cool', false));
  const o = JSON.parse(writes()!);
  for (const k of PRESET_KEYS) assert.equal(o[k], presetValues('cool', false)[k], k);
  assert.equal(o.look, 'dark'); assert.equal(o.keys, false); assert.equal(o.figureV, V);
  assert.equal(presetOf(useSettings.getState(), false), 'cool');
  useSettings.getState().set('tilt', true);
  assert.equal(presetOf(useSettings.getState(), false), null, 'a switch changed under More is Custom');
  useSettings.getState().reset();
  assert.equal(presetOf(useSettings.getState(), false), 'balanced', 'Reset everything is back to Balanced');
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('the words: a label and a line for each preset and for Custom, plain, and the More page names where it stands', () => {
  for (const id of PRESET_IDS) { assert.ok(PRESET_LABEL[id].length > 3); assert.ok(PRESET_LINE[id].length > 10); }
  assert.ok(PRESET_LINE.custom.includes('More'));
  assert.match(MORE_NOW('rich'), /Rich/); assert.match(MORE_NOW(null), /Custom/);
  for (const w of Object.values(PRESET_LINE)) assert.doesNotMatch(w, /—|–|→/, 'no dashes or arrows in the words');
});

test('Settings shows the presets with a More page that keeps every individual switch (Blur, Figure detail, Auto detail, Sharp while moving, the six depth switches)', () => {
  const sheet = src('../src/ui/settings/SettingsSheet.tsx');
  assert.match(sheet, /<FigurePresets /);
  assert.match(sheet, /function FigureMore\(\)/);
  const more = sheet.slice(sheet.indexOf('function FigureMore()'), sheet.indexOf('export function SettingsSheet'));
  for (const piece of ['Blur effect', '<FigureDetail />', '<AutoDetail />', 'Sharp while moving', '<DepthGroup />']) assert.ok(more.includes(piece), piece);
  assert.equal(DEPTH_ROWS.length, 6);
  assert.doesNotMatch(sheet, /<DepthGroup \/> : null\}\n\s*<\/Fragment>/, 'the depth switches are no longer on the main page');
});
