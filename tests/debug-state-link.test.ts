// The state link restores the camera and the sliders (batch B14): captured from the app's snapshot, written into an address, read back, and cleaned of anything hostile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureState, stateLink, readStateLink, cleanExtras, cleanParams, diffParams, changedFrom, baseOf } from '../src/ui/debug/packet/state.ts';
import { app } from './debug-helpers.ts';

const BASE = 'https://qaddodi.github.io/portal-pressure-sim-3d/preview/';
const free = (over = {}) => app({ mode: 'free' as const, deck: null, ...over });

test('the camera the hand left (turn, zoom, pan) and the picked vessel ride in the link and come back whole', () => {
  const a = free({ camera: { moving: false, placed: true, orbitDeg: -12.5, zoom: 2.25, pan: [-140, 60], stage: { w: 390, h: 844 } }, picked: 'PV' });
  const back = readStateLink(stateLink(captureState(a as never), BASE));
  assert.deepEqual(back.x.cam, { orbit: -12.5, k: 2.25, x: -140, y: 60 });
  assert.equal(back.x.sel, 'PV');
  assert.equal(back.preset, 'csph');
});

test('a camera at its own framing leaves nothing in the link (a slide or a shot frames itself)', () => {
  const s = captureState(free() as never);
  assert.equal(s.x.cam, undefined); assert.equal(s.x.sel, undefined);
});

test('the sliders are the difference from the patient\'s own settings, not the whole tree', () => {
  const base = { portal: { resistance: 1, stenosis: [0, 0] }, drugs: { carvedilol: false }, same: { a: 1 } };
  const now = { portal: { resistance: 2.4, stenosis: [0, 0] }, drugs: { carvedilol: true }, same: { a: 1 } };
  const delta = diffParams(base, now);
  assert.deepEqual(delta, { portal: { resistance: 2.4 }, drugs: { carvedilol: true } });
  assert.equal(diffParams(base, base), null);
  assert.deepEqual(changedFrom(base, now), { 'portal.resistance': [1, 2.4], 'drugs.carvedilol': [false, true] });
  const back = readStateLink(stateLink(captureState(free() as never, { params: delta }), BASE));
  assert.deepEqual(back.x.params, delta);
});

test('in a talk the slide sets the settings, so the sliders are not part of the link', () => {
  const s = captureState(app() as never, { params: { a: { b: 1 } } });
  assert.equal(s.x.params, undefined);
  assert.equal(s.script, 'hvpg');
});

test('a link anyone can edit is cleaned: out-of-range cameras, prototype keys, deep or huge parameter trees, odd vessel ids', () => {
  assert.equal(cleanExtras({ cam: { orbit: 90, k: 2, x: 0, y: 0 } }).cam, undefined);
  assert.equal(cleanExtras({ cam: { orbit: 0, k: 0, x: 0, y: 0 } }).cam, undefined);
  assert.equal(cleanExtras({ cam: { orbit: 0, k: 1, x: NaN, y: 0 } }).cam, undefined);
  assert.equal(cleanExtras({ sel: 'a b<script>' }).sel, undefined);
  const hostile = JSON.parse('{"__proto__":{"x":1},"portal":{"constructor":{"y":1},"resistance":3,"name":"' + 'z'.repeat(200) + '","bad key!":1,"ok":[1,2,{"a":1}],"list":[1,2,3]}}');
  const c = cleanParams(hostile)!;
  assert.deepEqual(c, { portal: { resistance: 3, list: [1, 2, 3] } });
  assert.equal(({} as Record<string, unknown>).x, undefined, 'Object.prototype was not touched');
  let deep: Record<string, unknown> = { v: 1 };
  for (let i = 0; i < 20; i++) deep = { n: deep };
  assert.equal(cleanParams(deep), null, 'deeper than 8 levels is dropped');
  const wide = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`k${i}`, i]));
  assert.ok(Object.keys(cleanParams(wide)!).length <= 400);
  assert.equal(cleanParams('x'), null); assert.equal(cleanParams([1]), null);
});

test('a link without the new parts still reads (older links keep opening)', () => {
  const old = stateLink(captureState(free() as never), BASE);
  assert.ok(!old.includes('cam')); // (it is base64, so look at the decoded part)
  const back = readStateLink(`${BASE}?preset=csph#x=${Buffer.from(JSON.stringify({ look: 'dark' })).toString('base64url')}`);
  assert.deepEqual(back.x, { look: 'dark' });
  assert.equal(baseOf({ origin: 'https://a.b', pathname: '/p/' }), 'https://a.b/p/');
});
