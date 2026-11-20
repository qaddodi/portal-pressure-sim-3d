import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DEPTH_DEFAULTS, DEPTH_KEYS, parseSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

test('the Figure depth switches: on by default, except blood-cell particles (chevrons stay the flow mark)', () => {
  assert.deepEqual([...DEPTH_KEYS], ['smoothJoins', 'organDepth', 'tilt', 'dof', 'particles', 'micro3d']);
  assert.deepEqual(DEPTH_DEFAULTS, { smoothJoins: true, organDepth: true, tilt: true, dof: true, particles: false, micro3d: true });
  for (const k of DEPTH_KEYS) assert.equal(DEFAULTS[k], DEPTH_DEFAULTS[k]);
});

test('a stored value that is not a switch is the default; a stored switch is kept', () => {
  assert.equal(parseSettings('{"tilt":"no"}').tilt, true);
  assert.equal(parseSettings('{"tilt":false}').tilt, false);
  assert.equal(parseSettings('{"particles":true}').particles, true);
});

test('every switch has a row in Settings, in order, with words', () => {
  assert.deepEqual(DEPTH_ROWS.map((r) => r.key), [...DEPTH_KEYS]);
  for (const r of DEPTH_ROWS) assert.ok(r.label.length > 3 && r.hint.length > 10);
});

test('Organ fill: solid cel-shaded by default, see-through is the alternative, anything else is the default', () => {
  assert.equal(DEFAULTS.organFill, 'solid');
  assert.equal(parseSettings('{"organFill":"seethrough"}').organFill, 'seethrough');
  assert.equal(parseSettings('{"organFill":"opaque"}').organFill, 'solid');
});

test('3D lobule and sinusoid: on by default, off is the flat views', () => {
  assert.equal(DEFAULTS.micro3d, true);
  assert.equal(parseSettings('{"micro3d":false}').micro3d, false);
});
