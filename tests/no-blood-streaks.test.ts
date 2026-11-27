import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSettings, DEPTH_KEYS, DEFAULTS, FIGURE_SETTINGS_VERSION } from '../src/state/settings.ts';
import { LITE_KEYS } from '../src/state/lite.ts';
import { PRESET_KEYS } from '../src/state/figure-presets.ts';
import { BLOOD_DEFAULT, BLOOD_MENU } from '../src/scene/blood/options.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { shaderText } from './shader-text.ts';

// Blood streaks (the moving dust of particles in the vessels, the lobule and the sinusoid), their Settings row, their Blood menu row, and the ?dust editor were removed
// (Mohammad, 27 Nov: "no point in having blood streaks"). The chevrons stay. This pins that nothing of it comes back, and that an old save still loads.

const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

test('the streak and dust source files are gone', () => {
  for (const f of [
    'src/scene/blood/dust.ts', 'src/scene/blood/dust-glsl.ts', 'src/scene/blood/dust-spec.ts', 'src/scene/blood/streak-glsl.ts', 'src/scene/blood/routes.ts',
    'src/scene/blood/cells', 'src/scene/micro3d/lobule-routes.ts', 'src/ui/debug/dust-panel.ts', 'src/scene/vessels/skin/dust-wall.ts',
  ]) assert.ok(!existsSync(f), `${f} is back`);
});

test('no source names the removed streak code (a retired setting is named only in the one comment that says an old save may hold it)', () => {
  const names = ['dustTuner', 'DUST_GLSL', 'STREAK_GLSL', 'streakAmt', 'keyStreaks', 'particlesV', 'PARTICLES_VERSION', 'StreaksSwitch', 'dustP', 'dustRoute', 'SKIN_NODUST', 'SKIN_DUSTBLEND', 'BloodCells', 'flowDust', 'flowStreaks', 'setStreaks'];
  const bad: string[] = [];
  for (const f of walk('src')) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8').split('\n');
    text.forEach((line, i) => { if (names.some((n) => line.includes(n))) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});

test('there is no Blood streaks switch anywhere: not in Settings, not in Lite, not in the presets, not in the Blood menu, and no ?dust page', () => {
  assert.ok(!(DEPTH_KEYS as readonly string[]).includes('particles'));
  assert.ok(!(LITE_KEYS as readonly string[]).includes('particles'));
  assert.ok(!(PRESET_KEYS as readonly string[]).includes('particles'));
  assert.ok(!('particles' in DEFAULTS));
  assert.ok(!('keyStreaks' in BLOOD_DEFAULT));
  assert.ok(!BLOOD_MENU.some((m) => m.rows.some((r) => String(r[0]).toLowerCase().includes('streak'))));
  assert.ok(!FLAGS.some((f) => f.id === 'dust' || f.alias === 'dust'));
});

test('the vessel and skin programs hold no dust or streak code (the chevrons are all that flows on a vessel)', () => {
  for (const [name, src] of [['tube vertex', VESSEL_VS], ['tube fragment', VESSEL_FS], ['skin vertex', SKIN_VS], ['skin fragment', SKIN_FS]] as const) {
    assert.doesNotMatch(shaderText(src).replace(/\/\/.*$/gm, ''), /dust|streak|routeTex/i, name);
  }
  assert.match(shaderText(VESSEL_FS), /flowHeads\(/);
});

test('an old save that holds the retired keys still loads: the other switches are kept, the retired ones are not read and the next save leaves them out', async () => {
  const old = parseSettings('{"figureV":' + FIGURE_SETTINGS_VERSION + ',"particles":true,"particlesV":2,"tilt":false}');
  assert.equal(old.tilt, false);
  assert.ok(!('particles' in old) && !('particlesV' in old));
  assert.doesNotThrow(() => parseSettings('{"particles":"yes","particlesV":"x"}'));
  assert.doesNotThrow(() => parseSettings('{"particles":'));
  // the Blood menu's own blob, with the retired key in it: the menu loads, keeps the keys it has and drops the one it no longer has
  const store: Record<string, string> = { 'pps3d.blood': JSON.stringify({ chevrons: false, keyStreaks: true }) };
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } } });
  const fresh = '../src/scene/blood/options.ts?old-save';   // (a query makes node evaluate the module again, so it reads the stub store)
  const { useBlood } = (await import(fresh)) as typeof import('../src/scene/blood/options.ts');
  assert.equal(useBlood.getState().chevrons, false);
  assert.ok(!('keyStreaks' in useBlood.getState()));
  useBlood.getState().set({ chevrons: true });
  assert.ok(!('keyStreaks' in JSON.parse(store['pps3d.blood']!)), 'the next save leaves it out');
});
