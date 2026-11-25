// Settings › Diagnostics › Preview pill: the orange build tab is shown by default, the choice is kept on the device, and the build stays readable in Settings with the pill hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSettings, DEFAULTS, useSettings } from '../src/state/settings.ts';
import { buildNote } from '../src/ui/shell/build-pill.ts';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the pill shows by default, with no saved choice, a damaged one, or a save from before the setting existed', () => {
  assert.equal(DEFAULTS.showBuildPill, true);
  assert.equal(parseSettings(null).showBuildPill, true);
  assert.equal(parseSettings('{not json').showBuildPill, true);
  assert.equal(parseSettings(JSON.stringify({ look: 'dark', lookChosen: true })).showBuildPill, true);
  assert.equal(parseSettings(JSON.stringify({ showBuildPill: 'no' })).showBuildPill, true, 'only a real boolean counts');
});

test('hiding it is saved and read back on reload; showing it again is saved too', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  useSettings.getState().set('showBuildPill', false);
  assert.equal(parseSettings(store.get('pps3d.settings.v1') ?? null).showBuildPill, false);
  useSettings.getState().set('showBuildPill', true);
  assert.equal(parseSettings(store.get('pps3d.settings.v1') ?? null).showBuildPill, true);
  useSettings.getState().set('showBuildPill', false);
  useSettings.getState().reset();
  assert.equal(useSettings.getState().showBuildPill, true, 'Reset everything brings the pill back');
});

test('the build note names the commit and the checks, and a newer build when one is out', () => {
  assert.equal(buildNote('56cb768a', 'tests: 2 failing', null), 'Build 56cb768a · tests: 2 failing');
  assert.equal(buildNote('56cb768a', '', null), 'Build 56cb768a');
  assert.equal(buildNote('', '', null), 'Build local');
  assert.equal(buildNote('56cb768a', '', 'abc12345'), 'Build 56cb768a · a newer build is out');
  assert.equal(buildNote('56cb768a', '', ''), 'Build 56cb768a · a newer build is out', 'the worker said so without a commit');
});

test('the pill draws nothing while hidden, and Settings offers the switch on a preview build only', () => {
  const pill = src('../src/ui/shell/BuildPill.tsx');
  assert.match(pill, /useSettings\(\(s\) => s\.showBuildPill\)/);
  assert.match(pill, /if \(!shown\) return null;/);
  const sheet = src('../src/ui/settings/SettingsSheet.tsx');
  assert.match(sheet, /sec\.title === 'Diagnostics' && import\.meta\.env\.VITE_CHANNEL === 'preview' \? <BuildPillRow \/>/);
});

test('the pill and Settings reload through the one path (boot/reload.ts loadNewestBuild): drop this copy, then reload onto what is on the screen', () => {
  const reload = src('../src/boot/reload.ts');
  assert.match(reload, /export function loadNewestBuild/);
  assert.match(reload, /dropThisCopy\(\)[\s\S]*reloadKeepingState\(\)/);
  const pill = src('../src/ui/shell/BuildPill.tsx'), sheet = src('../src/ui/settings/SettingsSheet.tsx');
  assert.match(pill, /loadNewestBuild\(\)/); assert.match(sheet, /loadNewestBuild\(\)/);
  for (const [name, text] of [['pill', pill], ['settings', sheet]]) {
    assert.ok(!/serviceWorker|caches\.|location\.replace/.test(text), `${name} holds no reload code of its own`);
  }
});

test('Settings › Diagnostics has the reload row beside the pill switch, on preview builds only, whether or not the pill is shown', () => {
  const sheet = src('../src/ui/settings/SettingsSheet.tsx');
  const row = sheet.slice(sheet.indexOf('function BuildPillRow'), sheet.indexOf('function useFullscreen'));
  assert.match(row, /<MenuItem icon="reset"[^>]*onClick=\{reload\}/);
  assert.ok(!/if \(!on\)|on \?/.test(row), 'the row does not depend on the pill switch');
});
