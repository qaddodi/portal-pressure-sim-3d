import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DEPTH_DEFAULTS, DEPTH_KEYS, FIGURE_SETTINGS_VERSION as V, parseSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

test('the Figure depth switches: on by default, except Free tilt (the blood streaks are on: a play-test with the switch off saw none)', () => {
  assert.deepEqual([...DEPTH_KEYS], ['organDepth', 'tilt', 'dof', 'particles', 'fluidSurface', 'deviceShadow']);
  assert.deepEqual(DEPTH_DEFAULTS, { organDepth: true, tilt: true, dof: true, particles: true, fluidSurface: true, deviceShadow: true });
  for (const k of DEPTH_KEYS) assert.equal(DEFAULTS[k], DEPTH_DEFAULTS[k]);
});

test('a stored value that is not a switch is the default; a stored switch is kept', () => {
  assert.equal(parseSettings(`{"figureV":${V},"tilt":"no"}`).tilt, true);
  assert.equal(parseSettings(`{"figureV":${V},"tilt":false}`).tilt, false);
  assert.equal(parseSettings(`{"figureV":${V},"particles":true}`).particles, true);
});

test('every switch has a row in Settings, in order, with words', () => {
  assert.deepEqual(DEPTH_ROWS.map((r) => r.key), [...DEPTH_KEYS]);
  for (const r of DEPTH_ROWS) assert.ok(r.label.length > 3 && r.hint.length > 10);
});

test('the organs are always the see-through wash: there is no Organ fill setting, and a saved one is dropped (figure settings version 3)', () => {
  assert.ok(!('organFill' in DEFAULTS));
  assert.ok(V >= 3, 'the figure settings version moved on, so an older save (with organFill) reads as the defaults');
  const s = parseSettings(`{"look":"dark","lookChosen":true,"organFill":"solid","tilt":false,"smoothJoins":false,"figureV":2}`);
  assert.ok(!('organFill' in s));
  assert.equal(s.tilt, true); assert.equal(s.look, 'dark', 'the rest of the saved settings are kept');
});

test('the lobule and the sinusoid are always 3D: no switch, no row, and a saved one is dropped (Mohammad, 20 Nov 2026: "remove the toggle for 3D or not 3D; everything 3D")', async () => {
  assert.ok(!('micro3d' in DEFAULTS));
  assert.ok(!DEPTH_ROWS.some((r) => (r.key as string) === 'micro3d'));
  assert.ok(!('micro3d' in parseSettings(`{"micro3d":false,"figureV":${V}}`)));
  const { readFileSync } = await import('node:fs');
  const scene = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /private readonly micro3d = true;/);
  assert.doesNotMatch(scene, /useSettings\.getState\(\)\.micro3d/);
});

test('smooth vessel joins are always on: no switch, no row, a saved "off" is dropped, and the scene no longer reads a setting for it (Mohammad, 21 Nov 2026: "turning it off things look like shit")', async () => {
  assert.ok(!('smoothJoins' in DEFAULTS));
  assert.ok(!DEPTH_ROWS.some((r) => (r.key as string) === 'smoothJoins'));
  const kept = parseSettings(`{"figureV":${V},"smoothJoins":false,"tilt":false}`);
  assert.ok(!('smoothJoins' in kept), 'a saved "off" is not read back');
  assert.equal(kept.tilt, false, 'the other switches are kept');
  const { readFileSync } = await import('node:fs');
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  for (const p of ['../src/scene/scene.ts', '../src/scene/micro3d/lobule3d.ts']) assert.doesNotMatch(src(p), /\.smoothJoins\b/, p);
  assert.match(src('../src/scene/scene.ts'), /setSmoothJoins\(true\);/);
  const { useSettings } = await import('../src/state/settings.ts');
  assert.ok(!('smoothJoins' in useSettings.getState()));
  assert.ok(!(await import('node:fs')).readFileSync(new URL('../src/state/settings.ts', import.meta.url), 'utf8').includes('smoothJoins: s.smoothJoins'), 'and it is not written back on the next save');
});

test('Blood streaks start off on a phone and on elsewhere (Mohammad, 24 Nov: too heavy on the iPhone); a phone that chose keeps its choice; a phone\'s older save takes the new default once; Mac and iPad keep what they saved', async () => {
  const { PARTICLES_VERSION: PV } = await import('../src/state/settings.ts');
  assert.equal(parseSettings(null, true).particles, false, 'a new phone: off');
  assert.equal(parseSettings(null, false).particles, true, 'a new Mac or iPad: on');
  assert.equal(parseSettings(`{"figureV":${V},"particles":true}`, true).particles, false, 'a phone save from before: the new default, once');
  assert.equal(parseSettings(`{"figureV":${V},"particlesV":${PV},"particles":true}`, true).particles, true, 'a phone that turned them back on keeps them on');
  assert.equal(parseSettings(`{"figureV":${V},"particlesV":${PV},"particles":false}`, true).particles, false);
  assert.equal(parseSettings(`{"figureV":${V},"particles":true}`, false).particles, true, 'Mac and iPad keep their save');
  assert.equal(parseSettings(`{"figureV":${V},"particles":false}`, false).particles, false);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../src/state/settings.ts', import.meta.url), 'utf8'), /particlesV: PARTICLES_VERSION/, 'every save carries the version');
});
