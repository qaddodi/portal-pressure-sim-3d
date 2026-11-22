// Integration review I6 (22 Nov): the page's pick store (usePick) has one writer, the highlight's onPicked, told on every path that changes the pick: a pick, the lit set clearing it,
// a late tube lighting the wanted id, the picked tube going away. Before, only the reconciler's call wrote it, so a late tube lit a vessel the data card never heard of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Highlight } from '../src/scene/highlight.ts';

const tube = (id: string) => ({ isVessel: true, edge: { id, from: 'a', to: 'b', length: 1 }, ink: { uniforms: { hiAhead: { value: 0 }, hiBehind: { value: 0 }, hiPx: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiEnds: { value: { set() {} } }, hiFade: { value: 1 } } } });

test('every change of the pick is told once', () => {
  const h = new Highlight([tube('pv')] as never);
  const told: (string | null)[] = [];
  h.onPicked = (id) => told.push(id);
  h.set('pv'); h.set('pv');
  assert.deepEqual(told, ['pv'], 'a pick, told once');
  h.setOnly(['pv']);
  assert.deepEqual(told, ['pv', null], 'lighting vessels clears the pick, and says so');
  h.set('shunt');
  assert.deepEqual(told, ['pv', null], 'an id with no tube yet is not picked');
  const t = tube('shunt');
  h.register(t as never);
  assert.deepEqual(told, ['pv', null, 'shunt'], 'its tube arrives: the pick lights and the store hears it');
  h.unregister(t as never);
  assert.deepEqual(told, ['pv', null, 'shunt', null], 'its tube goes: nothing is picked');
});
