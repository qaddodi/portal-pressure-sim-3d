// Integration review I3 (22 Nov): one run on the figure. A run that a new play() or drive() replaces is STOPPED (its onStop runs once), never dropped: the runners give back the owner claim,
// the marks, the follow and the camera only there, and a replaced IR run left "IR is running" behind for good.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';

test('play or drive over a run stops the old one once; a run that ended is not stopped', () => {
  const p = new CelScene().procs;
  const stops: string[] = [];
  p.play('tips', 0, { onStop: () => stops.push('a') });
  p.play('tips', 0, { onStop: () => stops.push('b') });
  assert.deepEqual(stops, ['a'], 'play over a run stops it');
  p.drive('tips', 0, { onStop: () => stops.push('c') });
  assert.deepEqual(stops, ['a', 'b'], 'drive over a run stops it');
  p.play('tips', 0, {});
  assert.deepEqual(stops, ['a', 'b', 'c'], 'play over a driven run stops it');
  assert.equal(p.driven, null, 'never two runs on the figure');
  p.stop();
  assert.deepEqual(stops, ['a', 'b', 'c'], 'a run without onStop stops quietly');
  p.drive('tips', 0, { onStop: () => stops.push('d') });
  p.stop();
  assert.deepEqual(stops, ['a', 'b', 'c', 'd'], 'stop() stops a driven run too');
});
