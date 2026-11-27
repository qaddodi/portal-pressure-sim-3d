// `npm run layout-check` (scripts/layout-check.mjs): the pure parts, and the guards that keep the no-GPU mode from touching a renderer. Node only, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArgs, layoutFindings, addressOf, NOT_LAYOUT } from '../scripts/layout-check.mjs';

test('the command line: default sizes, depth and speed; a bad size is refused', () => {
  const o = parseArgs([]);
  assert.deepEqual(o.sizes, ['iphone', 'ipad', 'mac']);
  assert.equal(o.depth, 'quick'); assert.equal(o.speed, 20);
  assert.deepEqual(parseArgs(['--sizes', 'mac', '--depth', 'full', '--speed', '4']).sizes, ['mac']);
  assert.throws(() => parseArgs(['--sizes', 'tablet']), /unknown size/);
});

test('only layout findings are kept: timing kinds are left out', () => {
  const rows = [{ group: 'Talks', label: 'HVPG 3', flags: [
    { kind: 'clipped', sev: 'fail', what: 'text cut', where: 'card' }, { kind: 'stall', sev: 'fail', what: 'gap', where: '' },
    { kind: 'fade-slow', sev: 'warn', what: 'slow', where: '' }, { kind: 'covered', sev: 'warn', what: 'label under card', where: '' },
  ] }];
  const f = layoutFindings({ rows });
  assert.deepEqual(f.map((x: { kind: string }) => x.kind), ['clipped', 'covered']);
  assert.ok(NOT_LAYOUT.has('stall') && !NOT_LAYOUT.has('spill') && !NOT_LAYOUT.has('card'));
  assert.deepEqual(layoutFindings(undefined), []);
});

test('the address asks for the layout mode and the self-test', () => {
  assert.match(addressOf('http://x', { speed: 20, depth: 'quick' }), /\?layout&audit=here&speed=20&depth=quick$/);
});

test('the layout stage draws nothing: no renderer, canvas or programs in its bridge', () => {
  const src = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  const a = src.indexOf('function LayoutBridge'), b = src.indexOf('function GlStage');
  const body = src.slice(a, b);
  assert.ok(a > 0 && b > a);
  assert.doesNotMatch(body, /useThree|<Canvas|warmPrograms|\.render\(|setRenderer/);
});
