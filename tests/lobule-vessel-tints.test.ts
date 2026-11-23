// The Lobule's vessel tints have ONE writer (applyLook), so a late weld rebuild never whitens the arterioles, bile and lymph (Mohammad, 23 Nov 2026: "Why is bile and lymph colored white and arteriole white").
// Root cause: vesselSteps' coloured() ended every part with setTint([1, 1, 1]); the welded plan lands ~3 s after the first picture and rebuilds the vessels after applyLook ran, which only re-runs on a look change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BufferAttribute, Color } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, LZ, OVER_Z, TUBE_SEG } from '../src/scene/micro3d/lobule3d.ts';
import { bileWeldCourses, bloodWeldCourses } from '../src/scene/lobule/weld-courses.ts';
import { planWelds } from '../src/scene/lobule/welds.ts';
import { LOBULE_PALETTES } from '../src/scene/lobule/tones.ts';
import { hexToRgb01 } from '../src/scene/lenses/oklab.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import type { LookId } from '../src/looks/looks.ts';

const R = 3, HEIGHTS = { R, over: OVER_Z, tube: LZ.tube, bile: LZ.cellTop + 0.001 }, SEGS = { vessel: TUBE_SEG, bile: 6 };
const shared = createShared();
const flat = new LobuleView(shared);
const net = flat.net;
const mouthR: Partial<Record<string, number>> = { pv: DISC_R.pv, ha: DISC_R.ha * 1.7, bd: DISC_R.bd * 1.4, lv: DISC_R.lv, cv: DISC_R.cv };
const avoid = net.courses.filter((c) => mouthR[c.kind] !== undefined).map((c) => { const p = c.pts[Math.floor(c.pts.length / 2)]!; return { x: p[0] * R, y: -p[1] * R, r: mouthR[c.kind]! * R }; });
const plan = planWelds([...bloodWeldCourses(net, HEIGHTS, SEGS), ...bileWeldCourses(net, HEIGHTS, SEGS)], { avoid });

const ONE_TONE: Record<string, string[]> = { artery: ['twigs', 'mouthHa'], bile: ['bile', 'mouthBd'], lymph: ['lt', 'duct', 'mouthLv'] };
const LENS = ['s0', 's1', 's2', 'an', 'inlets', 'mouthPv', 'mouthCv'];
const NAMES = ['ground', 'cells', 'nuclei', 's0', 's1', 's2', 'an', 'inlets', 'twigs', 'lt', 'duct', 'bile', 'mouthPv', 'mouthHa', 'mouthBd', 'mouthLv', 'mouthCv', 'cvScar'];
const LOOKS = (['light', 'dark', 'navy', 'black'] as LookId[]).filter((l) => LOBULE_PALETTES[l]);

const tintOf = (l3: Lobule3D, name: string) => { const p = l3.partsForTest[NAMES.indexOf(name)]!; const c = p.mats.toon.uniforms.tint!.value as Color; return { p, rgb: [c.r, c.g, c.b] }; };
const near = (a: number[], b: number[], tol = 1 / 255) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

function check(l3: Lobule3D, look: LookId, when: string): void {
  const tones = LOBULE_PALETTES[look].tones as Record<string, string>;
  for (const [tone, names] of Object.entries(ONE_TONE)) {
    const want = hexToRgb01(tones[tone]!) as number[];
    for (const n of names) {
      const { p, rgb } = tintOf(l3, n);
      assert.ok(near(rgb, want), `${when} ${look}: ${n} tint ${rgb.map((v) => v.toFixed(3))} should be the ${tone} token ${want.map((v) => v.toFixed(3))}`);
      // the base colour is tint x vertex colour (brightness k only for these parts): it keeps the token's hue, never white x k
      const col = p.geometry.getAttribute('color') as BufferAttribute | undefined;
      if (col) for (let i = 0; i < col.count; i += 17) {
        const k = col.getX(i); assert.ok(k >= 0.8 - 1e-6 && k <= 1 + 1e-6, `${when} ${look}: ${n} brightness ${k}`);
        assert.ok(near([rgb[0]! * k, rgb[1]! * k, rgb[2]! * k], [want[0]! * k, want[1]! * k, want[2]! * k]), `${n} base colour off its token`);
      }
      assert.ok(Math.max(...want.map((v) => 1 - v)) > 0.15 || look === 'light', `${n} token is not distinguishable from white in ${look}`);
      // the outline follows the same tint object (MICRO_INK_FS: vOwnC = tint) at INK_OWN
      assert.equal(p.mats.ink!.uniforms.tint, p.mats.toon.uniforms.tint, `${n} ink tint is the toon's`);
      assert.equal(p.mats.ink!.uniforms.uOwn!.value, CEL_STYLE.TUBE.INK_OWN, `${n} ink own`);
    }
  }
  for (const n of LENS) assert.ok(near(tintOf(l3, n).rgb, [1, 1, 1]), `${when} ${look}: ${n} is lens-coloured by its vertices, tint white`);
}

test('the arterioles, bile and lymph keep their own colour after the welded plan rebuilds the vessels, in every look, through repeated rebuilds and look changes', () => {
  const l3 = new Lobule3D(flat, shared);
  for (const look of LOOKS) {
    l3.buildForTest(look);
    check(l3, look, 'built');
    l3.layWeldsForTest(plan);   // the late-rebuild order
    check(l3, look, 'after the weld rebuild');
    l3.layWeldsForTest(plan);
    check(l3, look, 'after a second rebuild');
  }
  l3.buildForTest('light'); l3.layWeldsForTest(plan); l3.buildForTest('dark'); l3.layWeldsForTest(plan); l3.buildForTest('light');
  check(l3, 'light', 'light -> dark -> light');
  l3.dispose?.();
});

test('the vessel builder never writes a material uniform: vesselSteps holds no setTint, applyLook owns every vessel tint and the builder invalidates the vertex colours itself', () => {
  const src = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('private *vesselSteps()'), src.indexOf('private stepCvScar') > 0 ? src.indexOf('private stepCvScar') : undefined);
  assert.ok(!/setTint\(/.test(body), 'vesselSteps must not call setTint');
  assert.ok(/this\.inkKey = '';\s*\n\s*}\s*$/m.test(body.slice(0, body.indexOf('/** SOS'))), 'vesselSteps ends by invalidating inkKey');
  const apply = src.slice(src.indexOf('private applyLook'), src.indexOf('private stepInk'));
  for (const n of ['s0', 's1', 's2', 'an', 'inlets', 'mouthPv', 'mouthCv']) assert.ok(apply.includes(n), `applyLook sets ${n}`);
});
