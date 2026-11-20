import test from 'node:test';
import assert from 'node:assert/strict';
import { bake, surfaceAt, noduleBumpAt, domeAt, TEX_PH, TEX_PW } from '../src/scene/organs/liver-texture.ts';
import { organColour, LIVER_TOKENS, PLAIN, rgbOf } from '../src/scene/organs/organ-look.ts';

test('the cirrhotic surface is bounded, has walls and round domes', () => {
  let sep = 0, n = 0, domeMax = 0;
  for (let y = 200; y < 480; y += 3) for (let x = 330; x < 880; x += 3) {
    const s = surfaceAt(x, y);
    for (const v of [s.sep, s.dome, s.tone]) assert.ok(v >= 0 && v <= 1, `${v}`);
    assert.ok(s.light >= -1 && s.light <= 1);
    sep += s.sep; n++; domeMax = Math.max(domeMax, s.dome);
  }
  assert.ok(sep / n > 0.01 && sep / n < 0.3, `septum share ${sep / n}`);
  assert.ok(domeMax > 0.95);
  assert.ok(noduleBumpAt(500, 300) >= 0 && domeAt(500, 300) >= 0);
});
test('it is not a grid: the walls of two rows do not line up', () => {
  const walls = (y: number) => { const r: number[] = []; for (let x = 330; x < 880; x++) r.push(surfaceAt(x, y).sep); return r.map((v, i) => (v > 0.2 && (r[i - 1] ?? 0) <= 0.2 ? i : -1)).filter((i) => i >= 0); };
  assert.notDeepEqual(walls(300).slice(0, 6).map((v) => v % 13), walls(323).slice(0, 6).map((v) => v % 13));
});
test('bake fills the whole texture', () => {
  const t = bake();
  assert.equal(t.length, TEX_PW * TEX_PH * 4);
  assert.ok(t.some((v, i) => i % 4 === 0 && v > 100));
});
test('a fully congested liver takes the 2D dusk (0.44 of the maroon in Light), never more', () => {
  const base = rgbOf('#B07868'), k = { plate: rgbOf('#F0EBE0'), dark: false, bleed: rgbOf('#8E1A20'), bg: rgbOf('#F0EBE0') };
  const full = organColour(base, { ...PLAIN, congestion: 1.6 }, k), half = organColour(base, { ...PLAIN, congestion: 0.5 }, k);
  const t = LIVER_TOKENS.light, want = base.map((b, i) => b + (t.cong[i]! - b) * t.congA);
  full.forEach((v, i) => assert.ok(Math.abs(v - want[i]!) < 1e-9, `channel ${i}`));
  assert.deepEqual(full, half.map((_, i) => full[i]!));
});
