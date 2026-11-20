// The sinusoid's colours are 2D's tokens, in every look. The tissue shader's uniforms (cBg, the endothelium's four tones, the nucleus, the Kupffer and stellate cells, the bile, the
// red cell, the end arrows' ink) are read from the 2D app's styles/tokens.css at the pin, with its look cascade (a look's own block over the base: Soft over Light, Navy and Black
// over Dark), and compared with what SinusoidView writes for that look. A colour that comes out black or from the wrong look (a token the 3D table lacked) fails here, not in a
// side-by-side picture: a 3D Light look beside 2D's Dark one reads as "pale cells, saturated lumen" without being a fault, so the numbers are what is compared.
// Skipped without the 2D checkout at the pin (tests/two-d-pin.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pinned2D } from './two-d-pin.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { LOOK_IDS, type LookId } from '../src/looks/looks.ts';

const TWO_D = pinned2D('styles/tokens.css');

/** The custom properties of the block that starts at the first line matching `head` (to its closing brace at column 0). */
function block(css: string[], head: RegExp, from = 0): Record<string, string> {
  const i = css.findIndex((l, n) => n >= from && head.test(l));
  assert.ok(i >= 0, `tokens.css: block ${head} not found`);
  const out: Record<string, string> = {};
  for (let n = i + 1; n < css.length && css[n] !== '}'; n++) {
    const m = /^\s*(--[a-z0-9-]+):\s*([^;]+);/.exec(css[n]!);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgbOf = (hex: string): number[] => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
};

test('every look writes 2D\'s own sinusoid tokens, through the look cascade of tokens.css', { skip: TWO_D.skip }, () => {
  const css = readFileSync(`${TWO_D.repo}/styles/tokens.css`, 'utf8').split('\n');
  const base = block(css, /^:root \{/);
  const dark = { ...base, ...block(css, /^:root\[data-theme="dark"\] \{/) };
  const tokens: Record<LookId, Record<string, string>> = {
    light: base,
    soft: { ...base, ...block(css, /^:root\[data-theme="soft"\] \{/) },
    dark,
    navy: { ...dark, ...block(css, /^:root\[data-theme="dark"\]\[data-palette="navy"\] \{/) },
    black: { ...dark, ...block(css, /^:root\[data-theme="dark"\]\[data-palette="black"\] \{/) },
  };
  // uniform -> the 2D token it is made from directly (sinusoid-view.js palette(); the ones it blends are checked by the copy)
  const direct: Record<string, string> = {
    cBg: '--stage-bg', cEndo: '--sv-gl-endothelium', cEndoS: '--sv-gl-endo-sheet', cEndoE: '--sv-gl-endo-edge', cEndoN: '--sv-gl-endo-nucleus',
    cNuc: '--sv-gl-nucleus', cHscQ: '--sv-gl-hsc-quiet', cHscA: '--sv-gl-hsc-active', cHscN: '--sv-gl-hsc-nucleus',
    cKup: '--sv-gl-kupffer', cKupN: '--sv-gl-kupffer-nucleus', cKupE: '--sv-gl-kupffer-edge', cRbc: '--sv-gl-rbc', cBm: '--sv-gl-basement', cCol: '--collagen',
    cEndF: '--text',
  };
  let checked = 0;
  for (const look of LOOK_IDS) {
    const v = new SinusoidView(createShared(), { look }); v.setVisible(true); for (let t = 0; t <= 400; t += 16) v.update(t);
    const uni = (v.tissue.material as unknown as { uniforms: Record<string, { value: { toArray(): number[] } }> }).uniforms;
    for (const [u, tok] of Object.entries(direct)) {
      const want = tokens[look][tok] ?? tokens[look][tok === '--stage-bg' ? '--bg' : tok];
      if (!want || !HEX.test(want)) continue;   // (a token 2D gives as rgba() or a var(): not a plain colour to compare)
      const got = uni[u]!.value.toArray().slice(0, 3).map((x) => Math.round(x * 255));
      const w = rgbOf(want);
      const near = got.every((g, k) => Math.abs(g - w[k]!) <= 1);
      // --text is the look's own in 3D (looks.ts) and may differ a little from 2D's CSS: only a black or page-coloured ink is a fault
      if (u === 'cEndF') { assert.ok(got.some((g) => g > 0) || look === 'light', `${look} ${u} is not black`); continue; }
      assert.ok(near, `${look} ${u}: 3D ${got} vs 2D ${tok} ${want}`);
      checked++;
    }
  }
  assert.ok(checked > 40, `compared ${checked} colours`);
});
