// The lobule's vessels are shaded as 2D's Tube shades them (shading.ts): three screen-space tones, no world light or specular, the line by caliber, and the end-on vessels as celDisc (a pale band, the
// wall opened where a vessel joins, an inner line where nothing does). The GLSL is compiled by glsl-compile.test.ts; here the text and the masks are held to 2D's numbers.
import { CEL_TUBE_GLSL } from '../src/scene/cel-glsl.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { LOBULE_INK_FS, LOBULE_INK_VS, LOBULE_TOON_FS, LOBULE_TOON_VS } from '../src/scene/lobule/shading.ts';
import { CEL } from '../src/scene/vessels/cel-ink.ts';
import { DISC_GLSL, DISC_EDGE } from '../src/scene/lobule/from2d/disc-glsl.generated.js';
import { binOpen } from '../src/scene/lobule/from2d/lobule-mouths.generated.js';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Batch } from '../src/scene/lobule/batch.ts';
import { DISC_RADIAL } from '../src/scene/lobule/view.ts';

interface Priv { discInfo: Map<string, { geo: { getAttribute(n: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } | undefined }; discs: { site: { list: { ang: number }[] } | null; start: number; count: number }[] }> }
const open = (g: Priv['discInfo'] extends Map<string, infer I> ? I : never, k: number) => {
  const a = g.geo.getAttribute('mouth')!, w = [a.getX(g.discs[k]!.start), a.getY(g.discs[k]!.start), a.getZ(g.discs[k]!.start)];
  return Array.from({ length: 72 }, (_, b) => binOpen(w, b));
};

test('a tube is three tones lit from the top left of the screen, the figure\'s numbers (the one shared tube GLSL), with no specular and no band', () => {
  const t = LOBULE_TOON_FS;
  assert.match(t, /#ifdef TONES3/);
  assert.ok(t.includes(CEL_TUBE_GLSL), 'the same program text as the vessels\'');
  assert.match(t, /celTubeTone\(c, sT, sTw, vRdev\)/);
  assert.ok(CEL_TUBE_GLSL.includes('celTubeHw(rDev)') && /smoothstep\(1\.0, 2\.0, rDev\)/.test(CEL_TUBE_GLSL), 'left out on a hairline');
  assert.match(t, /#ifndef TONES3\s+c \+= rim \* 0\.10 \+ sp \* 0\.32;\s+#endif/, 'no rim light and no specular glint in the tones path');
});

test('the line is the figure\'s: LINE_R of the radius held between LINE_MIN and LINE_MAX device px, by the tube\'s own radius on screen', () => {
  const g = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  assert.ok(LOBULE_INK_VS.includes(`clamp(${g(CEL.LINE_R)} * rDev, ${g(CEL.LINE_MIN)}, ${g(CEL.LINE_MAX)}) / dpr`));
  assert.ok(LOBULE_INK_VS.includes('px > 0.0'), 'a part drawn with no line (the space of Disse\'s band) keeps none');
});

test('a disc is celDisc: the pale band, the wall opened at the mouths (ink pass too), the inner line only where nothing joins', () => {
  assert.ok(LOBULE_TOON_FS.includes(DISC_GLSL) && LOBULE_INK_FS.includes(DISC_GLSL), 'the shader holds 2D\'s own text for celRing, celDisc, discLine and ringOpen');
  assert.match(DISC_GLSL, /0\.144 \* ringBand/);
  assert.match(LOBULE_TOON_FS, /celDisc\(c, discInk, Dd, Rpx, discLine\(discJoin, wl\), 1\.0, open\)/);
  assert.match(LOBULE_INK_FS, /discJoin > 0\.5 && smoothstep\(0\.15, 0\.85, ringOpen\(/);
  assert.match(LOBULE_TOON_VS, /pos0\.xy = dctr \+ \(position\.xy - dctr\) \* discK/);
});

test('the triad\'s outlines are 2D\'s own colours', () => {
  assert.deepEqual(DISC_EDGE, { pv: [0.12, 0.27, 0.58], in: [0.12, 0.27, 0.58], ha: [0.55, 0.1, 0.16], bd: [0.27, 0.29, 0.12] });
});

test('the central vein\'s wall opens where each generation-2 sinusoid arrives, and shuts between', () => {
  const v = new LobuleView(createShared()), info = (v as unknown as Priv).discInfo.get('cv')!;
  const d = info.discs[0]!;
  assert.ok(d.site && d.site.list.length >= 3, 'the sinusoids that end at the vein join it');
  const bins = open(info, 0);
  assert.ok(bins.some((b) => b === 1) && bins.some((b) => b === 0));
  for (const m of d.site!.list) assert.equal(bins[Math.floor(((m.ang / (2 * Math.PI)) + 0.5) * 72) % 72], 1, 'the mouth is open at the vessel\'s own direction');
});

test('the portal venule opens to its inlets; the arteriole to its twig; the ductule has no mouths until the Bile layer joins its canals', () => {
  const v = new LobuleView(createShared()), p = v as unknown as Priv;
  for (const k of ['pv', 'ha'] as const) assert.ok(p.discInfo.get(k)!.discs.every((d) => d.site), `${k}: every disc has a vessel that joins it`);
  assert.equal(p.discInfo.get('pv')!.discs[0]!.site!.list.length, 2, 'two inlets leave each venule');
  const bd = p.discInfo.get('bd')!;
  assert.ok(bd.discs.every((d) => d.site) && bd.discs.length === 6, 'canals of Hering end at each ductule');
  v.setLayers({ bile: false }); v.setVisible(true); v.update(16);
  assert.ok(open(bd, 0).every((b) => b === 0), 'closed with the Bile layer off: 2D\'s mouthsNoBile');
  v.setLayers({ bile: true }); v.update(32);
  assert.ok(open(bd, 0).some((b) => b === 1), 'open where a canal arrives with it on');
});

test('the discs\' radii follow the state as 2D\'s radiusAt does', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true);
  const k = (name: string) => (v.parts as unknown as Record<string, { toon: { uniforms: { discK: { value: number } } } }>)[name]!.toon.uniforms.discK.value;
  v.update(16);
  assert.ok(Math.abs(k('cv') - 1) < 1e-9 && Math.abs(k('pv') - 1) < 1e-9 && Math.abs(k('ha') - 1) < 1e-9, 'healthy: the healthy radii');
  // congestion widens the vein (+0.05 of R at full), pre-sinusoidal fibrosis narrows the venule (1 / (1 + 0.35 fib)), a rise in the arterial inflow widens the arteriole (art ^ 0.3)
  const cur = (v as unknown as { cur: Record<string, number>; goal: Record<string, number> }).cur;
  Object.assign((v as unknown as { goal: Record<string, number> }).goal, { congU: 1, fibPre: 1, fibPost: 0, art: 2 });
  Object.assign(cur, { congU: 1, fibPre: 1, fibPost: 0, art: 2 });
  v.update(32);
  assert.ok(Math.abs(k('cv') - (0.07 + 0.05) / 0.07) < 1e-9);
  assert.ok(Math.abs(k('pv') - 1 / 1.35) < 1e-9);
  assert.ok(Math.abs(k('ha') - 2 ** 0.3) < 1e-9);
  assert.equal(DISC_R.cv, 0.07);
});

test('a disc is a smooth circle: its radius and direction come from the unit-disc position, never from fwidth\'s per-triangle slope', () => {
  for (const f of [LOBULE_TOON_FS, LOBULE_INK_FS]) assert.ok(!/fwidth\s*\(\s*vDisc/.test(f), 'no radius worked out from a derivative of the fan\'s own ramp (|dx|+|dy| is 1 to 1.41 times the slope by direction: a faceted, star-shaped vein)');
  assert.match(LOBULE_TOON_FS, /float Dd = \(length\(vDiscP\) - 1\.0\) \* Rpx;/, 'the distance to the rim is length() of the unit-disc position');
  assert.match(LOBULE_TOON_FS, /float Rpx = vRdev \* discK;/, 'the radius in device pixels is the camera\'s, scaled by how much of its radius the disc has');
  assert.match(LOBULE_TOON_FS, /ringOpen\(vMouth, vDiscP\)/);
  assert.match(LOBULE_INK_FS, /ringOpen\(vMouth, vDiscP\)/);
  for (const v of [LOBULE_TOON_VS, LOBULE_INK_VS]) assert.match(v, /vDiscP = disc\.x >= 0\.0 \? disc\.x \* disc\.yz : disc\.yz;/);
});

test('a disc\'s cap carries the plane position over its radius: 0 at the centre, a unit vector at every rim vertex, so the fan interpolates the true circle', () => {
  assert.ok(DISC_RADIAL >= 96, 'a rim of at least 96 sides');
  const b = new Batch();
  b.tube([[0.3, -0.2, -0.01], [0.3, -0.2, 0.01]], { radius: 0.07, radial: DISC_RADIAL, capped: true, disc: true, uvx: () => 0 });
  const g = b.build(), p = g.getAttribute('position'), d = g.getAttribute('disc');
  let centres = 0, rims = 0;
  for (let i = 0; i < d.count; i++) {
    if (d.getX(i) < 0) continue;   // (the wall: no cap tone)
    const q = d.getX(i) * Math.hypot(d.getY(i), d.getZ(i));
    if (d.getX(i) === 0) { assert.equal(q, 0); centres++; continue; }
    assert.ok(Math.abs(q - 1) < 1e-6, 'a unit vector at the rim'); rims++;
    // and it is the vertex's own direction from the centre, y down
    const dx = (p.getX(i) - 0.3) / 0.07, dy = -(p.getY(i) + 0.2) / 0.07;
    assert.ok(Math.hypot(dx - d.getY(i), dy - d.getZ(i)) < 1e-4, 'its direction from the centre');
  }
  assert.equal(centres, 2); assert.equal(rims, 2 * (DISC_RADIAL + 1));
});
