// THE HOLES (Mohammad, 22 Nov: "actual holes in the drawing, in the joins, turning around from all directions"): ROOT CAUSE the depth hold-out compared the pixel's depth with the axis' depth at the arm's nearest SCREEN point; an arm along the view is foreshortened to a few px,
// so its own pixels were held out and dropped past the band, and the tube is cut there. It is now the exact 3D distance (skin/shaders.ts skinArmPx); the cases below turn the figure.
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
const HELD_MAX = 0.04;
const DROPPED_MAX = 0.08;   // (a skin whose arms really lie at other depths, a wall skin or the renal vein under the cava, drops the pixels of the arm out of reach by design: 5 % at most at a laptop)

test('the depth hold-out is judged in 3D: the pixel\'s own place in the figure against the arm\'s capsule, not the axis depth at the nearest screen point', () => {
  assert.match(SKIN_FS, /float gap = skinArmSd3\(fragP, arm, 1\.0, g3, r3\) \/ max\(/);
  assert.match(SKIN_FS, /skinArmHeld\(i, 1\.0 \/ gl_FragCoord\.w, vPos, kPx\)/);
  assert.match(SKIN_FS, /float sdPx = skinSdPx\(kPx\);/);
  assert.doesNotMatch(SKIN_FS, /abs\(fragW - wNear\)/);
});

/** The figure turned a quarter and a half turn each way, as a hand turns it (Mohammad, 22 Nov: holes in the junctions "turning around from all directions"). */
const TURNS = [{ yaw: 1.05 }, { yaw: 1.57, pitch: 0.3 }, { yaw: -1.05 }, { yaw: 2.4, pitch: -0.3 }] as const;
/** At most this share of a skin's pixels may be dropped. The hold-out drops none; what is left (measured 1.4 % at most) is a one-pixel sliver of the mesh's OUTER edge where an arm is seen end on and the mesh, stood out by the line, lies a pixel past the outline's band: past the vessel, not in it. Holes were 5 to 50 %. */
const TURNED_DROP_MAX = 0.02;

test('the gate bites: with the hold-out judged at the nearest screen point (until 22 Nov) a turned figure loses a fifth of its junctions\' pixels', () => {
  const g = gateSkins();
  try {
    const stats = rasterSkins(g.scene, g.skins, 1440, 900, 1, { screenDepth: true, view: { yaw: 1.05 } }).filter((k) => k.pixels >= JUDGED_PIXELS);
    const holed = stats.filter((k) => k.dropped / k.pixels > 0.05);
    assert.ok(holed.length >= 6, `${holed.length} of ${stats.length} skins lose over 5 % of their pixels without the fix`);
  } finally { g.done(); }
});

test('no junction skin has a hole at any turn of the figure: the hold-out drops none of a skin\'s pixels (it lay in the tube\'s cut, so a dropped pixel is a hole in the vessel)', () => {
  const g = gateSkins();
  try {
    let judged = 0;
    for (const view of TURNS) {
      for (const k of rasterSkins(g.scene, g.skins, 1440, 900, 1, { view })) {
        if (k.pixels < JUDGED_PIXELS) continue;
        judged++;
        assert.ok(k.dropped / k.pixels <= TURNED_DROP_MAX, `yaw ${view.yaw} ${k.node}: ${(100 * k.dropped / k.pixels).toFixed(1)} % of ${k.pixels} pixels dropped`);
      }
    }
    assert.ok(judged >= 40, `${judged} skin x turn cases judged`);
    // a phone, turned
    for (const k of rasterSkins(g.scene, g.skins, 393, 852, 2, { view: { yaw: 1.2, pitch: 0.3 } })) if (k.pixels >= JUDGED_PIXELS) assert.ok(k.dropped / k.pixels <= TURNED_DROP_MAX, `iPhone turned ${k.node}: ${(100 * k.dropped / k.pixels).toFixed(1)} % dropped`);
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
        // THE AZYGOS WELD (Mohammad, 21 Nov: "Azygos weld into SVC sucks"): the arch dived 45 degrees in depth onto the superior cava, so the depth rule held 9 % of the joint's pixels away from where the shape puts its outline (ragged ink in the lumen). It now comes down on one gentle slope: 1 to 2 %.
        if (k.node === 'SVC_E+SVC') assert.ok(k.held / k.pixels <= HELD_MAX, `${s.name} ${k.node}: the depth rule moves the outline of ${(100 * k.held / k.pixels).toFixed(1)} % of the weld's pixels by more than a pixel`);
      }
    }
    assert.ok(rows.length >= 30, `${rows.length} skin x screen cases judged`);
  } finally { g.done(); }
});
