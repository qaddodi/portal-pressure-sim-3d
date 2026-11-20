import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';

test('the lobule is liver-scale small (owner, 20 Nov: ~1/1500 of the scene)', () => { assert.ok(LOBULE_SCALE <= 1 / 1000); });
test('the dive frame is never switched on at setView: only fadeBody shows it, once the body dissolves', () => {
  const s = readFileSync('src/scene/scene.ts', 'utf8');
  assert.ok(!/this\.dive\.visible = true/.test(s));
});
test('in a dive the room moves with the aim (one clock), never on its own', () => {
  const s = readFileSync('src/scene/camera/rig.ts', 'utf8');
  assert.match(s, /lerp\(a\.room\.x, b\.room\.x, q\)/);
});
