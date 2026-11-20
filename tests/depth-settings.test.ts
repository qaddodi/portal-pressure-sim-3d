import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DEPTH_DEFAULTS, DEPTH_KEYS, FIGURE_SETTINGS_VERSION as V, parseSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

test('the Figure depth switches: on by default, except blood-cell particles (chevrons stay the flow mark)', () => {
  assert.deepEqual([...DEPTH_KEYS], ['smoothJoins', 'organDepth', 'tilt', 'dof', 'particles', 'micro3d']);
  assert.deepEqual(DEPTH_DEFAULTS, { smoothJoins: true, organDepth: true, tilt: true, dof: true, particles: false, micro3d: false });
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

test('Organ fill: solid cel-shaded by default, see-through is the alternative, anything else is the default', () => {
  assert.equal(DEFAULTS.organFill, 'solid');
  assert.equal(parseSettings(`{"figureV":${V},"organFill":"seethrough"}`).organFill, 'seethrough');
  assert.equal(parseSettings(`{"figureV":${V},"organFill":"opaque"}`).organFill, 'solid');
});

test('a phone that saved See-through (the old default) before Cel shaded existed gets the new defaults', () => {
  const stale = '{"look":"dark","lookChosen":true,"organFill":"seethrough","tilt":false,"smoothJoins":false}';   // (no figureV: saved by a build that wrote the default along with a look change)
  const s = parseSettings(stale);
  assert.equal(s.organFill, 'solid'); assert.equal(s.tilt, true); assert.equal(s.smoothJoins, true);
  assert.equal(s.look, 'dark', 'the rest of the saved settings are kept');
  assert.equal(parseSettings(`{"figureV":${V - 1},"organFill":"seethrough"}`).organFill, 'solid', 'an older version too');
});

test('3D lobule and sinusoid: off by default until approved, on is kept', () => {
  assert.equal(DEFAULTS.micro3d, false);
  assert.equal(parseSettings('{"micro3d":true,"figureV":2}').micro3d, true);
});
