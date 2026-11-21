// THE SKIN GATE (Mohammad, 21 Nov: "zoomed out the vessels look fucked": at a phone's scale every junction skin was line from edge to edge, with the tubes' blue only between them). A skin change ships only with a case here that fails without it.
// The real junction skins are drawn in node (tests/skin-gate-lib.ts: the fragment stage's own outline rule on the camera the app has at a screen's size) at an iPhone and a laptop, and one number per skin says whether it is a vessel: the share of
// its pixels that are lumen. ROOT CAUSE of the day's break: the outline's DEPTH rule (skin/shaders.ts skinArmPx) held an arm out when the pixel's surface lay more than the arm's radius from the arm's depth, but the mesh is built INK wider than the lumen,
// so its surface is a radius PLUS THE LINE away. The line is a fixed 1.6 to 3 CSS px, a growing share of a small vessel: at a phone's scale (a lumen 2.5 CSS px across) the gap was always more than the blend width, every arm was held out, and the whole joint
// came out as line. At a laptop only the thin vessels broke, which is why it went unseen. The rule must hold at every scale, so the gate judges both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { gateSkins, rasterSkins } from './skin-gate-lib.ts';

const SCREENS = [{ name: 'iPhone', w: 393, h: 852, dpr: 2 }, { name: 'laptop', w: 1440, h: 900, dpr: 2 }] as const;
/** The least share of a skin's pixels that must be lumen (the line is a band round it: a vessel a few px wide is about half line, a broken joint is all of it), for a skin big enough on the screen to judge. */
const LUMEN_MIN = 0.3, JUDGED_PIXELS = 100;
/** The share of a skin's pixels the shader may drop for lying past the line's band. */
const DROPPED_MAX = 0.08;   // (a skin whose arms really lie at other depths, a wall skin or the renal vein under the cava, drops the pixels of the arm out of reach by design: 5 % at most at a laptop)

test('the depth rule counts the line: an arm is held out only by a depth beyond its radius plus the ink the mesh stands out by', () => {
  assert.match(SKIN_FS, /float gap = abs\(fragW - wNear\)[^;]*- rNear - inkPx;/);
  assert.match(SKIN_FS, /float sdPx = skinSdPx\(kPx, inkDev\);/);
});

test('the gate bites: with the depth rule as it was (the radius alone) the iPhone\'s skins are line from edge to edge', () => {
  const g = gateSkins();
  try {
    const stats = rasterSkins(g.scene, g.skins, 393, 852, 2, false, false).filter((k) => k.pixels >= JUDGED_PIXELS);
    const broken = stats.filter((k) => k.lumen / (k.lumen + k.line) < LUMEN_MIN || k.dropped / k.pixels > DROPPED_MAX);
    assert.ok(broken.length >= 10, `${broken.length} of ${stats.length} skins fail without the fix`);
  } finally { g.done(); }
});

test('every junction skin is a vessel at every screen: its lumen is there (no skin is line from edge to edge) and the depth rule drops none of it', () => {
  const g = gateSkins();
  try {
    const rows: string[] = [];
    for (const s of SCREENS) {
      const stats = rasterSkins(g.scene, g.skins, s.w, s.h, s.dpr);
      assert.ok(stats.length >= 20, `${stats.length} skins`);
      for (const k of stats) {
        if (k.pixels < JUDGED_PIXELS) continue;
        const lumen = k.lumen / (k.lumen + k.line), dropped = k.dropped / k.pixels;
        rows.push(`${s.name} ${k.node}: lumen ${(100 * lumen).toFixed(0)} %, dropped ${(100 * dropped).toFixed(0)} % of ${k.pixels}`);
        assert.ok(lumen >= LUMEN_MIN, `${s.name} ${k.node}: only ${(100 * lumen).toFixed(0)} % of its pixels are lumen (the joint is drawn as line)`);
        assert.ok(dropped <= DROPPED_MAX, `${s.name} ${k.node}: ${(100 * dropped).toFixed(0)} % of its pixels dropped past the line's band`);
      }
    }
    assert.ok(rows.length >= 30, `${rows.length} skin x screen cases judged`);
  } finally { g.done(); }
});
