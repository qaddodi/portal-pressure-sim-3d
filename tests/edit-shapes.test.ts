// Edit shapes (src/scene/edit/): the pure maths (handles, moving one, the copied JSON) and that the mode is off by default and never saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyEdits, exportEdits, handleIndices, moveHandle, parseEdits, type P2 } from '../src/scene/edit/model.ts';
import { DEFAULTS, parseSettings } from '../src/state/settings.ts';
import { dzOf, editDz } from '../src/scene/edit/dz.ts';

const line: P2[] = Array.from({ length: 64 }, (_, i): P2 => [i * 10, 0]);

test('handles: both ends, ascending, at most nine', () => {
  const idx = handleIndices(line);
  assert.equal(idx[0], 0); assert.equal(idx.at(-1), 63); assert.ok(idx.length >= 2 && idx.length <= 9);
  assert.deepEqual([...idx].sort((a, b) => a - b), idx);
  assert.deepEqual(handleIndices([[0, 0], [1, 1]]), [0, 1]);
});

test('moving a handle moves its sample fully, the span to its neighbours by a share, and nothing else', () => {
  const idx = handleIndices(line), h = 3, at = idx[h]!;
  const out = moveHandle(line, idx, h, line[at]![0] + 5, 40);
  assert.deepEqual(out[at], [line[at]![0] + 5, 40]);
  assert.deepEqual(out[idx[h - 1]!], line[idx[h - 1]!]);
  assert.deepEqual(out[idx[h + 1]!], line[idx[h + 1]!]);
  const mid = Math.round((idx[h - 1]! + at) / 2); assert.ok(out[mid]![1] > 0 && out[mid]![1] < 40);
  assert.deepEqual(out[0], line[0]); assert.equal(out.length, line.length);
  assert.deepEqual(line[at], [at * 10, 0], 'the source is not touched');
});

test('an end handle moves the end, the rest follow toward the next handle', () => {
  const idx = handleIndices(line), out = moveHandle(line, idx, 0, -20, 10);
  assert.deepEqual(out[0], [-20, 10]); assert.deepEqual(out[idx[1]!], line[idx[1]!]);
});

test('Copy output reads back; malformed input is dropped', () => {
  const e = emptyEdits(); e.vessels.PV_TRUNK = { pts: [[1.234, 2.345], [3, 4]], dz: 0.0123 }; e.organs.liver = { dx: 0.1, dy: -0.2, dz: 0.05 };
  const back = parseEdits(exportEdits(e));
  assert.deepEqual(back.vessels.PV_TRUNK, { pts: [[1.2, 2.3], [3, 4]], dz: 0.012 });
  assert.deepEqual(back.organs.liver, { dx: 0.1, dy: -0.2, dz: 0.05 });
  assert.deepEqual(parseEdits('nope'), emptyEdits());
  assert.deepEqual(parseEdits('{"vessels":{"X":{"pts":[["a",1]]}}}'), emptyEdits());
});

test('off by default, never saved, and no depth is added while off', () => {
  assert.equal(DEFAULTS.editShapes, false);
  assert.equal(parseSettings('{"editShapes":true}').editShapes, false);
  assert.equal(editDz.size, 0); assert.equal(dzOf('PV_TRUNK'), 0);
});
