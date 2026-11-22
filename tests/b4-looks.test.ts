// The disease looks of 19 Nov: the kidney's own colour, the pale septa between the liver's nodules, the embolized spleen's dead part, the stomach's pool of blood, the narrowings and
// their arrowheads, the navel's ring and the flank line, the sinusoids' faint strands and the red wale, and a clot that is never wider than its vein.
// (the septa tests pin the cobbled cel7 surface: the default cirrhotic liver is now cel12, the subtle one, which has no septa: tests/organ-edge-and-cel-soft.test.ts)
(globalThis as { location?: unknown }).location = { search: '?liver=cel7', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, type BufferAttribute, Vector3 } from 'three';
import type { CelShared } from '../src/scene/materials/cel.ts';
import { PALETTES, paletteFor } from '../src/scene/palette.ts';
import { LOOKS, LOOK_IDS } from '../src/looks/looks.ts';
import { ORGAN_STYLE, OrganLayer } from '../src/scene/organs/layer.ts';
import { PLAIN, organColour, rgbOf } from '../src/scene/organs/organ-look.ts';
import { septumAt } from '../src/scene/organs/liver-shape.ts';
import { PAINTED, VertexPaint, infarctAt, infarctEdgeY } from '../src/scene/organs/vertex-paint.ts';
import { CelScene } from '../src/scene/scene.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { waistNarrow, waistSigma, isClampable } from '../src/scene/disease/clamps.ts';
import { Landmarks, flankPoints, ribbon } from '../src/scene/disease/landmarks.ts';
import { bellyZ } from '../src/scene/disease/ascites.ts';
import { RED_WALE, waleEnvelope } from '../src/scene/disease/strands.ts';
import { varixWale } from '../src/scene/disease/copied/varix-bead.js';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { presetState } from './b4-presets.ts';

const shared = (s: CelScene) => (s as unknown as { shared: CelShared }).shared;

test('the kidney has its own plum in every look (2D --organ-kidney), not the spleen\'s', () => {
  assert.equal(ORGAN_STYLE['kidney-l']!.tone, 'kidney');
  assert.equal(LOOKS.light.kidney, '#895F7A'); assert.equal(LOOKS.soft.kidney, '#724963'); assert.equal(LOOKS.dark.kidney, '#A07E8E');
  for (const id of LOOK_IDS) assert.notEqual(PALETTES[id].tones.kidney, PALETTES[id].tones.spleen, id);
});

test('the septa: a faint crevice between nodules (cel7), not a blur over the liver', () => {
  let walls = 0, n = 0;
  for (let x = 300; x < 900; x += 3) for (let y = 150; y < 540; y += 3) { const s = septumAt(x, y); assert.ok(s >= 0 && s <= 1); n++; if (s > 0.05) walls++; }
  assert.ok(walls / n > 0.1 && walls / n < 0.6, `septa cover ${(100 * walls / n).toFixed(1)}% of the liver`);
});

test('cirrhosis: a septum is paler than a nodule, which is tawny on pale; no cirrhosis, no difference', () => {
  const k = { plate: rgbOf('#E8DFD0'), dark: false, bleed: rgbOf('#8E1A20'), bg: rgbOf('#F1EBE0') }, base = rgbOf('#905B49');
  const lum = (c: readonly number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
  const nod = organColour(base, { ...PLAIN, cirrhosisNod: 1 }, k), sep = organColour(base, { ...PLAIN, cirrhosisNod: 1, septum: 1 }, k), plain = organColour(base, PLAIN, k);
  assert.ok(lum(sep) > lum(nod) && lum(sep) > lum(plain), 'the septum is the palest');
  assert.deepEqual(organColour(base, { ...PLAIN, septum: 1 }, k), plain, 'a healthy liver has no septa');
});

test('the infarct lies below its edge line and nowhere else; a partial embolization paints the spleen\'s lower part toward the stage', async () => {
  const y = infarctEdgeY(1050)!;
  assert.ok(y > 330 && y < 360);
  assert.equal(infarctAt(1050, y - 20).dead, 0); assert.equal(infarctAt(1050, y + 20).dead, 1);
  assert.ok(infarctAt(1050, y).line > 0.9 && infarctAt(1050, y + 30).line === 0);
  assert.deepEqual(infarctAt(900, y + 20), { dead: 0, line: 0 }, 'outside the stroke\'s span nothing is dead');
  const s = new CelScene(); const palette = paletteFor('light');
  const mk = () => new BoxGeometry(0.4, 1.4, 0.1, 3, 24, 1).translate(x3(1050), y3(420), 0);
  const o = new OrganLayer(shared(s), { spleen: mk });
  o.applyLook(palette);
  const t = bodyTargets((await presetState('cirr-decomp')).frame, { splenicRx: 1 }, null);
  o.setBody(t, true); for (let i = 0; i < 90; i++) o.update(1000 + i * 33);
  const sp = o.byId.get('spleen')!;
  assert.equal((sp.toon.uniforms.inkAmount!.value as number), 1, 'the vertices carry the colour');
  const ink = sp.toonMesh.geometry.getAttribute('ink') as BufferAttribute, pos = sp.toonMesh.geometry.getAttribute('position');
  let top = -1, bot = -1;
  for (let i = 0; i < ink.count; i++) { const yy = pos.getY(i); if (top < 0 && yy > y3(300)) top = i; if (bot < 0 && yy < y3(470)) bot = i; }
  assert.notDeepEqual([ink.getX(top), ink.getY(top), ink.getZ(top)], [ink.getX(bot), ink.getY(bot), ink.getZ(bot)], 'the dead part is another colour');
  o.setBody({ ...t, splenicRx: 0 }, false); for (let i = 0; i < 120; i++) o.update(5000 + i * 33);
  assert.equal((sp.toon.uniforms.inkAmount!.value as number), 0, 'a whole spleen is one colour again');
  o.dispose(); s.dispose?.();
});

test('the bleed\'s pool is a level the stomach\'s shader draws per pixel, not vertex colour', async () => {
  const s = new CelScene(); const palette = paletteFor('light');
  const mk = () => new BoxGeometry(0.5, 1.2, 0.1, 3, 30, 1).translate(x3(850), y3(400), 0);
  const o = new OrganLayer(shared(s), { stomach: mk });
  o.applyLook(palette);
  const t = bodyTargets((await presetState('cirr-decomp')).frame, {}, null);
  const st = o.byId.get('stomach')!, u = st.toon.uniforms;
  assert.equal(st.toonMesh.geometry.getAttribute('ink'), undefined, 'the stomach has no vertex paint: the pool is per pixel');
  assert.equal((u.poolA!.value as { z: number }).z, 0, 'no bleed, no pool');
  o.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total: 900 } }, true); for (let i = 0; i < 120; i++) o.update(1000 + i * 33);
  const a = u.poolA!.value as { x: number; y: number; z: number }, d = u.poolDelta!.value as { x: number; y: number; z: number };
  assert.ok(a.z > 0.9, 'the blood is in');
  const box = u.box!.value as { y: number; w: number };
  const surfY = box.y - a.x * box.w;   // the level, back in scene y
  assert.ok(surfY < y3(280) && surfY > y3(600), 'the surface is across the stomach');
  assert.ok(d.x - d.z > 0.05, 'the pool is redder than the wash');
  const rp = u.poolLand!.value as { z: number; w: number };
  assert.ok(rp.z > 0.9, 'the ripples stand while it bleeds');
  const w0 = rp.w; o.update(1000 + 120 * 33 + 200);
  assert.notEqual(rp.w, w0, 'and run on the clock');
  const before = a.x;
  o.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total: 1400 } }, false); o.update(9000);
  assert.ok(a.x < before + 1e-9 && a.x > 0, 'the level eases (a fuller pool is higher up the box, never a jump)');
  o.setBody({ ...t, bleed: { active: false, site: 'VAR', rate: 0, total: 1400 } }, false);
  let frames = 0; while (o.update(20000 + frames * 33) && frames < 400) frames++;
  assert.ok(frames > 5 && frames < 400, 'the ripples ease out when the bleed stops (and ask for no more frames after)');
  assert.equal(rp.z, 0, 'and are off');
  o.dispose(); s.dispose?.();
});

test('the pool level: a fuller pool stands higher, the jet lands inside the box, and the shader runs it per pixel with a meniscus', async () => {
  const { poolUniforms } = await import('../src/scene/organs/pool-level.ts');
  const { ORGAN_FS } = await import('../src/scene/organs/organ-shader.ts');
  const box = [x3(700), y3(250), 0.6, 0.9] as const;
  const bleed = { site: 'VAR' as const, rate: 90 };
  const lo = poolUniforms(box, 0.12, { ...bleed, total: 20 }), hi = poolUniforms(box, 1, { ...bleed, total: 1500 });
  assert.ok(hi.level < lo.level, 'a fuller pool has its surface nearer the top of the box');
  assert.ok(lo.landX > 0 && lo.landX < 1, 'the jet lands inside the stomach\'s box');
  assert.ok(lo.unitsPerBox === 0.9 * 300);
  for (const bit of ['poolA', 'fwidth(vBox.y)', 'smoothstep(-aa, aa, dU)', 'wet', 'poolDelta']) assert.ok(ORGAN_FS.includes(bit), bit);
  // the pool's own arithmetic (poolShade mirrors the GLSL): the waterline is a smooth blend, blood is nearly opaque, deeper is darker, and nothing above the surface is dyed
  const { poolShade } = await import('../src/scene/organs/pool-level.ts');
  const wash = [0.9, 0.75, 0.68], delta = [-0.2, -0.5, -0.45], light = [1, 0.95, 0.9];
  const at = (dU: number) => poolShade(wash, 0.72, { dU, lobe: 0, amount: 1, flow: 0.8, delta, light });
  assert.deepEqual(at(-30).fill.map((v) => +v.toFixed(3)), wash, 'dry wall above the surface is the wash');
  assert.ok(Math.abs(at(-30).layer - 0.72) < 1e-9, 'and keeps the wash\'s opacity');
  assert.ok(at(30).layer > 0.89, 'blood lies on the page nearly opaque');
  assert.ok(at(80).fill[1]! < at(8).fill[1]!, 'deeper blood is darker');
  let prev = at(-8).fill[1]!, worst = 0;
  for (let d = -8; d <= 8; d += 0.25) { const g = at(d).fill[1]!; worst = Math.max(worst, Math.abs(g - prev)); prev = g; }
  assert.ok(worst < 0.06, `the waterline blends over several units, never a step (largest step ${worst.toFixed(3)} per quarter unit)`);
  const land = poolShade(wash, 0.72, { dU: 2, lobe: 1, amount: 1, flow: 1, delta, light }).fill, none = poolShade(wash, 0.72, { dU: 2, lobe: 0, amount: 1, flow: 1, delta, light }).fill;
  assert.ok(land[1]! > none[1]!, 'the surface is lighter where the jet lands');
  const ripple = (dxU: number, phase: number, r = 1) => poolShade(wash, 0.72, { dU: 1, dxU, ripple: r, phase, lobe: 0, amount: 1, flow: 0.8, delta, light, dark: [0, 0, 0] }).fill[1]!;
  assert.equal(ripple(20, 1, 0), ripple(20, 3, 0), 'no ripple height, no wave: the phase changes nothing');
  assert.ok(Math.abs(ripple(20, 0) - ripple(20, 1.5)) > 1e-3, 'a ripple moves the surface as the phase runs');
  assert.ok(Math.abs(ripple(300, 0) - ripple(300, 1.5)) < Math.abs(ripple(20, 0) - ripple(20, 1.5)), 'the ripples die away with distance from the landing');
  assert.ok(ORGAN_FS.indexOf('fwidth(vBox.y)') < ORGAN_FS.indexOf('discard;'), 'the pool\'s derivative is taken before the window\'s discard');
});

test('the painted organs are the two that vary over their vertices (the stomach pool is per pixel)', () => { assert.deepEqual([...PAINTED].sort(), ['liver', 'spleen']); assert.equal(typeof VertexPaint, 'function'); });

test('a stenosis pinches the vessel at its middle in the 2D waist, and a vessel with none is untouched', () => {
  const sig = waistSigma(8, 200);
  assert.equal(waistNarrow(0.6, 0.5, sig), 0.6);
  assert.ok(waistNarrow(0.6, 0.5 + 3 * sig, sig) < 0.001, 'smooth back to the full lumen');
  assert.ok(waistNarrow(0.6, 0.5 + sig, sig) > 0.2 && waistNarrow(0.6, 0.5 + sig, sig) < 0.3);
  assert.ok(isClampable('IVCS_RA') && !isClampable('TIPS') && !isClampable('NOT_A_VESSEL'));
  const s = new CelScene(); const c = s.disease.clamps;
  assert.equal(c.set({ IVCS_RA: 0.6 }, () => 1, 0.016, true), false);
  assert.equal(c.shown().IVCS_RA, 0.6);
  const v = s.vesselObject('IVCS_RA')!, nar = v.toonMesh.geometry.getAttribute('narrow') as BufferAttribute, uv = v.toonMesh.geometry.getAttribute('uv') as BufferAttribute;
  let mid = 0, end = 1;
  for (let i = 0; i < nar.count; i++) { if (Math.abs(uv.getX(i) - 0.5) < 0.1) mid = Math.max(mid, nar.getX(i)); if (uv.getX(i) < 0.02) end = Math.min(end, nar.getX(i)); }
  assert.ok(mid > 0.5 && mid > end, `narrow ${mid.toFixed(2)} at the middle, ${end.toFixed(2)} at the end`);
  assert.equal(c.marks().length, 1, 'the arrowheads (drawn flat by the label layer)');
  c.set({ IVCS_RA: 0.6 }, () => 0, 0.016, true); assert.deepEqual(c.shown(), {}, 'a vessel that is not drawn has no clamp'); assert.equal(c.marks().length, 0);
  c.set({}, () => 1, 0.016, true);
  for (let i = 0; i < nar.count; i++) assert.equal(nar.getX(i), 0);
  s.dispose?.();
});

test('the navel\'s ring comes with the paraumbilical vein, in steps, and the flank line only with ascites', () => {
  const l = new Landmarks();
  l.setAscites(0); l.setCaput(0, 0.016, true); assert.deepEqual(l.state(), { flank: false, step: -1, navel: 0 });
  l.setCaput(0.6, 0.016, true); assert.equal(l.state().navel, 1);
  l.setCaput(0.3, 0.016, true); assert.ok(l.state().navel > 0 && l.state().navel < 1, 'a quarter step');
  l.setAscites(2000); const st = l.state(); assert.equal(st.flank, true); assert.ok(st.step > 0);
  l.setFade(0); assert.equal(l.state().flank, false, 'it goes with the body');
  const pts = flankPoints(0); assert.deepEqual(pts[0], [336, 470]); assert.deepEqual(pts[pts.length - 1], [1088, 470]);
  const g = ribbon(pts, 0.7, bellyZ()); assert.equal(g.getAttribute('position').count, pts.length * 2);
  const b = flankPoints(68); assert.ok(b[Math.floor(b.length / 4)]![0] < pts[Math.floor(pts.length / 4)]![0], 'the wall bulges outward');
  l.dispose();
});

test('the wale lies over the middle of a strand only (the strand layer draws none of the vessels\' plexuses: tests/b3-no-mesh.test.ts)', async () => {
  const s = new CelScene(); const d = s.disease;
  const f = (await presetState('cirr-decomp')).frame;
  d.feed(f as never, {}, null, { instant: true, presence: () => 1, recruit: () => 1 }, true);
  d.update(1000);
  assert.ok(waleEnvelope(0.5) === 1 && waleEnvelope(0.05) === 0 && waleEnvelope(0.95) === 0);
  assert.equal(varixWale(false, 1, 1), 0); assert.ok(varixWale(true, 1, 1) > 0);
  assert.ok(RED_WALE[0] > 0.8);
  s.dispose?.();
});

test('a cirrhotic liver is painted with its septa; a healthy one is one colour', async () => {
  const s = new CelScene(); const palette = paletteFor('light');
  const mk = () => new BoxGeometry(1.0, 0.8, 0.1, 40, 32, 1).translate(x3(560), y3(350), 0);
  const o = new OrganLayer(shared(s), { liver: mk });
  o.applyLook(palette);
  const set = async (id: string) => { const p = await presetState(id); o.setBody(bodyTargets(p.frame, p.params, p.healthyP), true); for (let i = 0; i < 60; i++) o.update(1000 + i * 33); };
  await set('healthy');
  assert.equal(o.byId.get('liver')!.toon.uniforms.inkAmount!.value, 0);
  await set('cirr-decomp');
  const liver = o.byId.get('liver')!, ink = liver.toonMesh.geometry.getAttribute('ink') as BufferAttribute;
  assert.equal(liver.toon.uniforms.inkAmount!.value, 1);
  // the vertices carry one colour; the septum and the dome's light are per pixel (the baked texture and sepDelta, liver-texture.ts)
  let lo = 9, hi = 0; for (let i = 0; i < ink.count; i++) { lo = Math.min(lo, ink.getX(i)); hi = Math.max(hi, ink.getX(i)); }
  assert.ok(hi - lo < 1e-6, 'one colour on the vertices');
  const u = liver.toon.uniforms, sd = u.sepDelta!.value as { x: number; y: number; z: number };
  assert.ok(u.nodAmt!.value as number > 0.5, 'the dome light is on');
  assert.ok(Math.abs(sd.x) + Math.abs(sd.y) + Math.abs(sd.z) > 0.001, 'the crevice differs from the nodule');
  assert.ok((u.nodTex!.value as { image: { width: number } }).image.width > 100, 'the texture is baked once the liver is scarred');
  o.dispose(); s.dispose?.();
});
