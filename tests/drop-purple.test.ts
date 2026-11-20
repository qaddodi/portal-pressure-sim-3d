import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LENS_TOKENS } from '../src/scene/lenses/tokens.copied.ts';
import { legendFor } from '../src/scene/lenses/legend.ts';

// The Pressure drop lens is purple: its menu swatch was, and its figure and its legend were 2D's green (owner, 20 Nov 2026).
const hue = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };

test('every look\'s drop ramp runs pale to purple (hue 250 to 290), not 2D\'s green', () => {
  for (const [look, t] of Object.entries(LENS_TOKENS)) {
    const ramp = t.drop, first = ramp[0]![0], last = ramp[ramp.length - 1]![0];
    assert.ok(ramp.length >= 4, look);
    for (const [c] of ramp.slice(1)) { const h = hue(c); assert.ok(h >= 250 && h <= 290, `${look} ${c} hue ${h.toFixed(0)}`); }
    assert.ok(first > '#D', `${look} starts pale`);
    assert.notEqual(last, '#456F4A'); assert.notEqual(last, '#1D4724');
  }
});

test('the legend bar and its words say purple, and the menu swatch is the same family', async () => {
  const lg = legendFor('drop', 'light') as { bar: { stops: [string, number][] }; aria: string };
  assert.match(lg.aria, /pale to deep purple/);
  for (const [c] of lg.bar.stops.slice(3)) { const h = hue(c.length === 7 ? c : '#7A4FB5'); if (c.length === 7) assert.ok(h >= 240 && h <= 295, c); }
  const { lensSwatch } = await import('../src/ui/shell/lens-art.ts');
  assert.equal(lensSwatch('drop', 'light'), `linear-gradient(90deg, ${lg.bar.stops.map(([c, p]) => `${c} ${p}%`).join(', ')})`, 'the menu swatch is the key');
});

test('the generator carries the departure, so a re-copy from 2D keeps it', () => {
  const g = readFileSync(new URL('../scripts/copy-b3-data.mjs', import.meta.url), 'utf8');
  assert.match(g, /DROP_PURPLE/);
  assert.match(g, /drop: DROP_PURPLE\[/);
});
