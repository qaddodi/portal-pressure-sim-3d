// A menu list that opens on its current row rests on a row's top, so no row is cut at its top edge (Mac Histories promotion picture, 26 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restOnRow } from '../src/ui/menu/open-scroll.ts';

const tops = [0, 30, 75, 120, 165, 210, 255, 300];   // headings and rows, as in the Histories list (rows 45 apart)

test('a list part-way through a row rests on the next row top', () => {
  const r = restOnRow(100, tops, 400);
  assert.equal(r.top, 120); assert.equal(r.room, 0);
});
test('a list already on a row top, or at the top, does not move', () => {
  assert.equal(restOnRow(120, tops, 400).top, 120);
  assert.equal(restOnRow(0, tops, 400).top, 0);
});
test('every scroll position rests on a row top, across the whole list', () => {
  for (let s = 1; s <= 300; s++) { const r = restOnRow(s, tops, 1000); assert.ok(tops.includes(r.top), `at ${s}`); assert.ok(r.top >= s - 0.5); }
});
test('past the end, the list is given the room to rest there (Mac Histories: the current row is the last, the list ends mid-row)', () => {
  const r = restOnRow(290, tops, 292);   // the last row's top (300) is beyond the 292 the list can scroll
  assert.equal(r.top, 300); assert.equal(r.room, 8);
});
