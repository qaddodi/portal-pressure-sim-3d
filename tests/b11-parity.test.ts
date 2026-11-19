import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILT_PANES, PANES, TABS, tabOf, PANE_ORDER, shortName, tinyName } from '../src/ui/tests/panes.ts';
import { claims } from '../src/parity/b11.ts';
import { testsPlace, sideWidth, roomWith } from '../src/ui/tests/place.ts';
import { freeRoom } from '../src/ui/shell/room.ts';
import { deviceClass } from '../src/ui/layout/device.ts';

const layer = readFileSync(new URL('../src/ui/tests/TestsLayer.tsx', import.meta.url), 'utf8');
const panesDir = readFileSync(new URL('../src/ui/tests/panes.ts', import.meta.url), 'utf8');

test('the tabs are the 2D dock\'s: nine instruments, Over time under Pressure, the 2D short names', () => {
  assert.deepEqual(PANE_ORDER, ['profile', 'scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts', 'trials']);
  assert.deepEqual(TABS, PANE_ORDER.filter((id) => id !== 'scope'));
  assert.equal(tabOf('scope'), 'profile');
  assert.equal(PANES.scope.name, 'Pressure over time');
  assert.equal(PANES.hvpg.name, 'IR (HVPG)');
  assert.equal(shortName('hvpg'), 'IR');
  assert.equal(tinyName('endoscopy'), 'Scope');
  assert.equal(tinyName('fibroscan'), 'Fibro');
});

test('every instrument claimed as wired is one TestsLayer renders; the claims name only inventory rows (parity-score checks that)', () => {
  for (const id of BUILT_PANES) assert.ok(new RegExp(`\\b${id}:\\s*\\(`).test(layer) || layer.includes(`registerPane('${id}'`), `TestsLayer renders no pane for ${id}`);
  assert.ok(panesDir.includes('BUILT_PANES'));
  const wired = new Set(claims.filter((c) => c.wired).map((c) => c.id));
  for (const id of BUILT_PANES) assert.ok(wired.has(`tests:${id}`), `tests:${id} is built but not claimed wired`);
  assert.equal(claims.filter((c) => c.id.startsWith('tests:')).length, PANE_ORDER.length);
});

test('placement: a wide screen docks the card on the right at the 2D width; a phone takes a sheet over the foot; the figure keeps the rest', () => {
  assert.equal(sideWidth(1000), 500); assert.equal(sideWidth(1440), 500); assert.equal(sideWidth(2400), 600);
  const safe = { top: 0, right: 0, bottom: 0, left: 0 };
  const mac = { w: 1440, h: 900, safe }, d = deviceClass(mac.w, mac.h);
  const p = testsPlace(mac, d);
  assert.equal(p.kind, 'side');
  assert.equal(p.rect.x + p.rect.w + 12, mac.w);
  const room = freeRoom(mac, d), left = roomWith(room, p);
  assert.ok(left.w > 0 && left.x + left.w <= p.rect.x, 'the figure\'s room ends before the card');
  const phone = { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, dp = deviceClass(phone.w, phone.h);
  const s = testsPlace(phone, dp);
  assert.equal(s.kind, 'sheet');
  assert.ok(s.rect.y + s.rect.h <= phone.h && s.rect.x >= 0 && s.rect.x + s.rect.w <= phone.w);
  const rest = roomWith(freeRoom(phone, dp), s);
  assert.ok(rest.h > 150 && rest.y + rest.h <= s.rect.y, 'the figure keeps a room above the sheet');
});
