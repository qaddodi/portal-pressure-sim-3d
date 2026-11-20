import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DEPTH_DEFAULTS, DEPTH_KEYS, FIGURE_SETTINGS_VERSION as V, parseSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

test('the Figure depth switches: on by default, except blood-cell particles (chevrons stay the flow mark)', () => {
  assert.deepEqual([...DEPTH_KEYS], ['smoothJoins', 'organDepth', 'tilt', 'freeTilt', 'dof', 'particles', 'micro3d']);
  assert.deepEqual(DEPTH_DEFAULTS, { smoothJoins: true, organDepth: true, tilt: true, freeTilt: true, dof: true, particles: false, micro3d: false });
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

test('3D lobule and sinusoid: off by default until approved, on is kept', () => {
  assert.equal(DEFAULTS.micro3d, false);
  assert.equal(parseSettings(`{"micro3d":true,"figureV":${V}}`).micro3d, true);
});
