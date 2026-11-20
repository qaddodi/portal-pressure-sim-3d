import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DEPTH_DEFAULTS, DEPTH_KEYS, FIGURE_SETTINGS_VERSION as V, parseSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

test('the Figure depth switches: on by default, except Free tilt (the blood streaks are on: a play-test with the switch off saw none)', () => {
  assert.deepEqual([...DEPTH_KEYS], ['smoothJoins', 'organDepth', 'tilt', 'dof', 'particles', 'hideBehind']);
  assert.deepEqual(DEPTH_DEFAULTS, { smoothJoins: true, organDepth: true, tilt: true, dof: true, particles: true, hideBehind: false });
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
  assert.equal(s.tilt, true); assert.equal(s.smoothJoins, true); assert.equal(s.look, 'dark', 'the rest of the saved settings are kept');
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
