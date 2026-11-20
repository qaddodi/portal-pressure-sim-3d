// The vessels' ink reads as an edge on EVERY look (Mohammad, 20 Nov play-test: "in Dark the vessels show no visible ink edge; Light has a dark continuous outline"). The ink is the look's casing taken most of the way
// to a deep tone of the vessel's own colour; on the dark looks the vessel's base is far brighter (LCAP_DARK), so the same share left the ink at the ground's own lightness (1.13:1 on Dark) and the line vanished.
// The ink now stands a clear step off the vessel body, the ground and the organ behind it, by luminance contrast (WCAG), in all five looks, for the portal (pink) and the systemic (blue) vessels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { PALETTES, contrast, hexToRgb255 } from '../src/scene/palette.ts';
import { CASING, celTubeBase, tubeInk } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const DARK = new Set(['dark', 'navy', 'black']);

test('the ink is 1.6:1 or more against the vessel\'s lit body and 1.5:1 or more against its shade, the ground and the organ behind it, on every look', () => {
  for (const id of LOOK_IDS) {
    const p = PALETTES[id], dark = DARK.has(id);
    const g = hexToRgb255(p.bg);
    for (const k of ['liver', 'spleen', 'kidney', 'gut', 'stomach', 'heart'] as const) {
      const t = hexToRgb255(p.tones[k]);
      const organ = hex(t.map((v, i) => p.organLayer * v + (1 - p.organLayer) * g[i]!));
      for (const v of ['portal', 'sys'] as const) {
        const base = hexToRgb255(p.tones[v]).map((x) => x / 255) as [number, number, number];
        const lit = celTubeBase(base, dark), shade = lit.map((x) => x * (1 - CEL_STYLE.SHADE));
        const ink = hex(tubeInk(id, base).map((x) => x * 255));
        const at = `${id} ${v} / ${k}`;
        const cLit = contrast(ink, hex(lit.map((x) => x * 255))), cSh = contrast(ink, hex(shade.map((x) => x * 255)));
        assert.ok(cLit >= 1.6, `${at}: ink vs the lit body ${cLit.toFixed(2)}`);
        assert.ok(cSh >= 1.5, `${at}: ink vs the shade ${cSh.toFixed(2)}`);
        assert.ok(contrast(ink, p.bg) >= 1.5, `${at}: ink vs the ground ${contrast(ink, p.bg).toFixed(2)}`);
        assert.ok(contrast(ink, organ) >= 1.5, `${at}: ink vs the organ ${contrast(ink, organ).toFixed(2)}`);
      }
    }
  }
});

test('the ink stays a deep tone of the vessel, never black or white, and the shader takes the dark looks\' tone by the one tubeDark flag', () => {
  const T = CEL_STYLE.TUBE;
  assert.ok(T.INK_TONE_DARK > T.INK_TONE && T.INK_TONE_DARK < 0.7);
  assert.match(VESSEL_FS, /mix\(0\.32, 0\.55, tubeDark\)/);
  for (const id of LOOK_IDS) {
    const ink = tubeInk(id, hexToRgb255(PALETTES[id].tones.portal).map((x) => x / 255) as [number, number, number]);
    assert.ok(Math.max(...ink) < 0.6 && Math.max(...ink) > 0.05, id);
    assert.equal(CASING[id].a, 1, 'whole alpha: an ink, not a tint');
  }
});
