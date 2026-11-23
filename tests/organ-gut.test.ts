// The gut's art, the organs' surface lines and the esophagus (organ-art.ts): 2D's own data, painted in 2D's classes, the esophagus where 2D draws it and faded as 2D fades it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { BufferGeometry } from 'three';
import { pinned2D } from './two-d-pin.ts';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { ORGAN_VS, ORGAN_FS, ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { type ArtData, esoAttributes, patchedShaders, rectumAttribute, wrapMain } from '../src/scene/organs/organ-art.ts';
import { ART_CLASSES, type Art, type Ctx2D, type Tones, paintArt, styleOf } from '../src/scene/organs/organ-art-paint.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { rgbOf } from '../src/scene/organs/organ-look.ts';
import { x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';

const art = JSON.parse(readFileSync(new URL('../public/anatomy/organ-art.json', import.meta.url), 'utf8')) as ArtData;
const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const twoD = pinned2D('src/ui/organ-art.js');
test('the copied art equals the 2D app\'s at the pin (copy-organ-art --check)', { skip: twoD.skip }, () => {
  execFileSync('node', ['scripts/copy-organ-art.mjs', '--from', twoD.repo, '--check'], { stdio: 'pipe' });
});

const leavesOf = (kids: Art['kids']): { c: string; s: number[][]; w?: number }[] => kids.flatMap((k) => ('kids' in k ? leavesOf(k.kids) : [k]));

test('the art has the small bowel\'s loops, the colon\'s haustra and the organs\' lines, all in classes the painter knows', () => {
  for (const id of ['bowel', 'colon', 'stomach', 'spleen', 'kidney-l', 'heart']) assert.ok(art.arts[id], id);
  const bowel = leavesOf(art.arts.bowel!.kids), colon = leavesOf(art.arts.colon!.kids);
  assert.ok(bowel.filter((l) => l.c === 'ob-wall').length >= 200, 'the 229 loops');
  assert.ok(colon.filter((l) => l.c === 'oc-pouch').length === 3 && colon.some((l) => l.c === 'oc-band') && colon.some((l) => l.c === 'oc-fold'));
  for (const a of Object.values(art.arts)) for (const l of leavesOf(a.kids)) assert.ok(ART_CLASSES.includes(l.c), l.c);
  assert.equal(leavesOf(art.arts.stomach!.kids).filter((l) => l.c === 'od-fold').length, 4, 'the stomach\'s four rugae');
});

const tones = (look: 'light' | 'soft'): Tones => {
  const p = PALETTES[look], og = p.organs.tones.gut, t = art.tokens[look]!;
  return { o1: rgbOf(og[0]), o2: rgbOf(og[1]), o3: rgbOf(og[2]), light: [1, 1, 1, p.organs.light[3]], tok: { ...t, hi: [1, 1, 1], ao: [t.ao[0] / 255, t.ao[1] / 255, t.ao[2] / 255, t.ao[3]] }, soft: look === 'soft' };
};
test('every art paints with 2D\'s widths and opacities, clipped and faded as its groups say', () => {
  const calls: string[] = [];
  const mk = (): Ctx2D => ({
    save() {}, restore() {}, setTransform() {}, translate() {}, clip() { calls.push('clip'); }, fill() { calls.push('fill'); }, stroke() { calls.push(`stroke ${this.lineWidth} ${this.lineCap}`); },
    drawImage() { calls.push('layer'); }, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1,
  });
  const env = { path: () => ({ moveTo() {}, lineTo() {}, closePath() {} }) as unknown as Path2D, surface: () => ({ ctx: mk(), canvas: {} }) };
  for (const look of ['light', 'soft'] as const) for (const a of Object.values(art.arts)) paintArt(env, mk(), a, tones(look), () => {});
  assert.ok(calls.includes('stroke 0.9 butt') && calls.includes('stroke 23.5 butt'), 'the stomach\'s hairline and a loop\'s wall at their 2D widths');
  assert.ok(calls.includes('layer'), 'the colon\'s shade group lays on at its opacity');
  // the loops' own tones (2D app-06-plate.css): rim = o1 64% o3, wall = o1, in Light; Soft leans o1 toward the middle tone
  const t = tones('light'), s = tones('soft');
  assert.deepEqual(styleOf('ob-wall', t, 23.5).stroke!.rgb, t.o1);
  assert.notDeepEqual(styleOf('ob-wall', s, 23.5).stroke!.rgb, s.o1);
  assert.equal(styleOf('oc-pouch', t).fill!.a, 0.42);
  assert.equal(styleOf('od-fold', t, 1.4).stroke!.a, 0.16);
});

const attr = (g: BufferGeometry, n: string) => g.getAttribute(n);
test('the esophagus lies where 2D\'s does: the stomach\'s pillow rises up the 2D outline (x 775 to 799 at the top) and no higher than 2D draws it (y -90)', () => {
  const g = ORGAN_MESHES.stomach!(), pos = g.getAttribute('position');
  const poly = art.eso.poly;
  const px = poly.filter((_, i) => i % 2 === 0), py = poly.filter((_, i) => i % 2 === 1);
  assert.equal(Math.min(...py), -90);
  let top = 1e9; for (let i = 0; i < pos.count; i++) top = Math.min(top, y2d(pos.getY(i)));
  assert.ok(Math.abs(top - -90) < 1, `the pillow's top is at 2D y ${top}`);
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = x2d(pos.getX(i)), y = y2d(pos.getY(i));
    if (y < 0) { n++; assert.ok(x >= 775 - 0.5 && x <= 799 + 0.5, `a vertex of the tube at 2D (${x.toFixed(1)}, ${y.toFixed(1)}) is off 2D's esophagus`); }
  }
  assert.ok(n > 100);
  // its 2D path mapped through the frame agrees with the pillow at the cardia end too
  assert.ok(Math.abs(x3(Math.min(...px)) - x3(775)) < 1e-9 && y3(Math.min(...py)) > 2.1);
});

test('the esophagus fades up as 2D\'s esoFadeG (opaque by y 40, gone by y -40), in its own tone over the cardia (y 226 to 262), and fades its outline too', () => {
  const g = ORGAN_MESHES.stomach!();
  esoAttributes(g, art.eso);
  const pos = g.getAttribute('position'), a = attr(g, 'esoA'), e = attr(g, 'eso');
  let sawTop = false, sawLow = false, sawEso = false, sawStomachTop = false;
  for (let i = 0; i < pos.count; i++) {
    const x = x2d(pos.getX(i)), y = y2d(pos.getY(i));
    if (y <= -40) { assert.equal(a.getX(i), 0); sawTop = true; }
    if (y >= 40) { assert.equal(a.getX(i), 1); sawLow = true; }
    if (y > -40 && y < 40) assert.ok(Math.abs(a.getX(i) - (y + 40) / 80) < 1e-5);
    if (x < 813 && y <= 226) { assert.equal(e.getX(i), 1); sawEso = true; }
    if (y >= 262) assert.equal(e.getX(i), 0);
    if (x > 830 && y < 300) { assert.equal(e.getX(i), 0, 'the stomach beside the cardia keeps its own tone'); sawStomachTop = true; }
  }
  assert.ok(sawTop && sawLow && sawEso && sawStomachTop);
  const p = patchedShaders(ORGAN_VS, ORGAN_FS, ORGAN_INK_VS, INK_FS, { art: true, eso: art.eso });
  assert.match(p.inkVs, /vEsoA = esoA/); assert.match(p.inkFs, /gl_FragColor\.a \*= vEsoA/);
  assert.match(p.fs, /gl_FragColor\.a \*= vEsoA/);
});

test('the colon\'s rectum fades out as 2D\'s rectFadeG (clear above y 902, gone by 1048): fill, art and outline', () => {
  assert.deepEqual(art.rectum, [902, 1048]);
  const g = ORGAN_MESHES.colon!();
  rectumAttribute(g, art.rectum);
  const pos = g.getAttribute('position'), a = attr(g, 'esoA');
  let low = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = y2d(pos.getY(i));
    if (y <= 902) assert.equal(a.getX(i), 1);
    if (y >= 1048) { assert.equal(a.getX(i), 0); low++; }
  }
  // only the rectum tube's last stretch changed: the cecum (x < 700) and everything above y 950 keep the linear fade, and the tube is fully clear by y 1000
  const lin = (y: number) => Math.min(1, Math.max(0, (1048 - y) / 146));
  for (let i = 0; i < pos.count; i++) {
    const y = y2d(pos.getY(i)), x = pos.getX(i) * 300 + 700;
    if (x < 700 || y <= 950) assert.ok(Math.abs(a.getX(i) - lin(y)) < 1e-6, `unchanged at ${x.toFixed(0)},${y.toFixed(0)}`);
    if (x >= 700 && y >= 1000) assert.equal(a.getX(i), 0);
  }
  assert.ok(low > 0, 'the pillow reaches past where 2D has faded it away (the dark bar below the colon)');
  const p = patchedShaders(ORGAN_VS, ORGAN_FS, ORGAN_INK_VS, INK_FS, { art: true, eso: null, fade: true });
  assert.match(p.inkFs, /vEsoA/); assert.doesNotMatch(p.fs, /eso1/);
});

test('the patch wraps the organ painter\'s main and never edits it (a shader without its one anchor is refused)', () => {
  const p = patchedShaders(ORGAN_VS, ORGAN_FS, ORGAN_INK_VS, INK_FS, { art: true, eso: art.eso });
  assert.ok(p.fs.startsWith(ORGAN_FS.replace('void main() {', 'void main_organ() {')));
  assert.match(p.fs, /void main\(\) \{\n  main_organ\(\);/);
  assert.match(p.fs, /texture2D\(art, vArt\)/);
  assert.throws(() => wrapMain('void main() {} void main() {}', '', ''));
  assert.throws(() => wrapMain('nothing', '', ''));
});

test('the organ layer wears the art: the stomach\'s materials are patched, the colon fades, the heart has its line, the liver stays the painter\'s own', async () => {
  const { setArtData } = await import('../src/scene/organs/organ-art.ts');
  const { OrganLayer } = await import('../src/scene/organs/layer.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  setArtData(art);
  const layer = new OrganLayer(createShared(), ORGAN_MESHES);
  layer.applyLook(PALETTES.light);
  const st = layer.byId.get('stomach')!, co = layer.byId.get('colon')!, du = layer.byId.get('duodenum')!;
  assert.match(st.toon.fragmentShader, /main_organ/); assert.match(st.ink.fragmentShader, /vEsoA/);
  assert.match(co.ink.fragmentShader, /vEsoA/); assert.doesNotMatch(co.toon.fragmentShader, /eso1/);
  assert.doesNotMatch(du.toon.fragmentShader, /vArt/, 'the duodenum has no art: the painter\'s own tube, patched only for its tail\'s fade');
  assert.match(du.toon.fragmentShader, /gl_FragColor\.a \*= vEsoA/, 'the duodenum\'s free end fades out');
  const box = st.toon.uniforms.box!.value as { z: number; w: number };
  assert.ok(Math.abs(box.w - 319 / 300) < 1e-6, 'the stomach\'s gradient runs over its own outline, not the esophagus\'s length too');
  layer.setBody({ spleenScale: 1, splenicRx: 0, bleed: { active: false, total: 0 }, cirrhosis: 0, congestion: 0, tint: 0 } as never, true);
  layer.update(0);
  const e1 = st.toon.uniforms.eso1!.value as { x: number };
  assert.ok(e1.x > 0.5 && e1.x < 1, 'the esophagus\'s own tone is set');
});
