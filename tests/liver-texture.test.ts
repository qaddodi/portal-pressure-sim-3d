import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVER_LOOKS, bake, lookBump, surfaceAt, TEX_PH, TEX_PW } from '../src/scene/organs/liver-texture.ts';

test('every liver look is irregular, bounded and has a septum and domes', () => {
  for (const k of LIVER_LOOKS) {
    let sep = 0, n = 0, domeMax = 0;
    for (let y = 200; y < 480; y += 3) for (let x = 330; x < 880; x += 3) {
      const s = surfaceAt(k, x, y);
      for (const v of [s.sep, s.dome, s.tone]) assert.ok(v >= 0 && v <= 1, `${k} ${v}`);
      assert.ok(s.light >= -1 && s.light <= 1);
      sep += s.sep; n++; domeMax = Math.max(domeMax, s.dome);
    }
    const share = sep / n;
    assert.ok(share > 0.03 && share < 0.35, `${k} septum share ${share}`);
    assert.ok(domeMax > 0.95, k);
    assert.ok(lookBump(k, 500, 300) >= 0);
  }
});
test('the look is not a grid: nodule sizes vary and rows do not line up', () => {
  const edge = (k: 'a', y: number) => { const r: number[] = []; for (let x = 330; x < 880; x += 1) r.push(surfaceAt(k, x, y).sep); return r.map((v, i) => (v > 0.5 && (r[i - 1] ?? 0) <= 0.5 ? i : -1)).filter((i) => i >= 0); };
  const a = edge('a', 300), b = edge('a', 323);
  assert.notDeepEqual(a.slice(0, 6).map((v) => v % 21), b.slice(0, 6).map((v) => v % 21));
});
test('bake fills the whole texture', () => {
  const t = bake('c');
  assert.equal(t.length, TEX_PW * TEX_PH * 4);
  assert.ok(t.some((v, i) => i % 4 === 0 && v > 200));
});

import { organColour, LIVER_TOKENS, PLAIN, rgbOf } from '../src/scene/organs/organ-look.ts';
test('a fully congested liver takes the 2D dusk (0.44 of the maroon in Light), never more', () => {
  const base = rgbOf('#B07868'), k = { plate: rgbOf('#F0EBE0'), dark: false, bleed: rgbOf('#8E1A20'), bg: rgbOf('#F0EBE0') };
  const full = organColour(base, { ...PLAIN, congestion: 1.6 }, k), half = organColour(base, { ...PLAIN, congestion: 0.5 }, k);
  const t = LIVER_TOKENS.light, want = base.map((b, i) => b + (t.cong[i]! - b) * t.congA);
  full.forEach((v, i) => assert.ok(Math.abs(v - want[i]!) < 1e-9, `channel ${i}`));
  assert.deepEqual(full, half.map((_, i) => full[i]!));   // past g 0.5 the smoothstep is done: more congestion darkens nothing more
});
