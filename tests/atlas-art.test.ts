// Settings > Figure depth > Atlas art (src/scene/atlas-art/): the external artist's organs and vessel courses behind a Classic / Atlas switch.
// What these hold: Classic is the default and the way back is exact (every vessel's vertices are what they were, bit for bit); the artist's courses fit the app's vessels (same ids, same
// frame, sane radii, the vertex counts the live builders were made with); the organ files read; the specimen follows the patient; the shader is cel stepped, with the figure's own constants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Raycaster, Vector2, Vector3, Vector4 } from 'three';
import { ATLAS_ART_DEFAULT, ATLAS_ARTS, DEFAULTS, parseSettings } from '../src/state/settings.ts';
import { AtlasCourses, KEEP_CLASSIC, SOURCE_ORDER, type CourseFile } from '../src/scene/atlas-art/courses.ts';
import { parseGlb } from '../src/scene/atlas-art/glb.ts';
import { specimenOf } from '../src/scene/atlas-art/specimen.ts';
import { ATLAS_ASCITES_FS, ATLAS_FS, ATLAS_INK_FS, ATLAS_INK_VS, ATLAS_VS } from '../src/scene/atlas-art/shaders.ts';
import { ATLAS_PALETTE } from '../src/scene/atlas-art/palette.ts';
import { AtlasOrgans } from '../src/scene/atlas-art/organs.ts';
import { POOL_WASH } from '../src/scene/atlas-art/pool.ts';
import { calmWash, smoothNormals } from '../src/scene/atlas-art/smooth.ts';
import { LIVER_SHINE } from '../src/scene/atlas-art/organs.ts';
import { STEP, X0, bulgeStep } from '../src/scene/disease/ascites.ts';
import { fluidBase, fluidLevel } from '../src/scene/disease/copied/fluid-step.js';
import { y3 } from '../src/scene/frame2d.ts';
import { AtlasVessels } from '../src/scene/atlas-art/vessels.ts';
import { ATLAS_COURSE, NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { profileAt } from '../src/scene/vessels/tubes.ts';
import { tubularOf } from '../src/scene/vessels/shape.ts';
import { CEL } from '../src/scene/vessels/cel-ink.ts';
import { CelScene } from '../src/scene/scene.ts';
import { atlasPrograms } from '../src/debug/gl-registry.ts';
import type { Specimen } from '../src/scene/atlas-art/types.ts';

const file = JSON.parse(readFileSync('public/atlas/courses.json', 'utf8')) as CourseFile;
const courses = new AtlasCourses(file);
const organFile = (s: Specimen) => { const b = readFileSync(`public/atlas/organs-${s}.glb`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const SPECIMENS: Specimen[] = ['healthy', 'cirr-decomp', 'budd-chiari'];

test('Classic is the default, and the choice is stored and read back', () => {
  assert.equal(ATLAS_ART_DEFAULT, 'classic');
  assert.deepEqual([...ATLAS_ARTS], ['classic', 'atlas']);
  assert.equal(DEFAULTS.atlasArt, 'classic');
  assert.equal(parseSettings(null).atlasArt, 'classic');
  assert.equal(parseSettings('{"atlasArt":"atlas"}').atlasArt, 'atlas');
  assert.equal(parseSettings('{"atlasArt":"fancy"}').atlasArt, 'classic');
  assert.equal(parseSettings('{"organFill":"solid"}').atlasArt, 'classic', 'a store from before the choice existed opens on Classic');
});

test('the specimen follows the patient: the hepatic veins blocked, else cirrhosis from 0.5, else healthy', () => {
  assert.equal(specimenOf(null), 'healthy');
  assert.equal(specimenOf({}), 'healthy');
  assert.equal(specimenOf({ cirrhosis: 0.4 }), 'healthy', 'compensated cirrhosis (the cirr-comp preset) keeps the healthy liver');
  for (const c of [0.6, 0.85, 1]) assert.equal(specimenOf({ cirrhosis: c }), 'cirr-decomp');
  assert.equal(specimenOf({ thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } }), 'budd-chiari');
  assert.equal(specimenOf({ cirrhosis: 0.9, thrombus: { LHV_IVC: 0.8 } }), 'budd-chiari');
  assert.equal(specimenOf({ thrombus: { PV_TRUNK: 1 } }), 'healthy');
});

test('the artist\'s courses: every one is finite, in the app\'s frame, and its radius profile is a sane share of the vessel\'s own', () => {
  const drawn = (id: string) => NETWORK_BY_ID.has(id);
  const missing: string[] = [];
  let used = 0;
  for (const s of SPECIMENS) {
    for (const v of NETWORK) {
      const c = courses.courseOf(v.id, s, v.radius, drawn);
      if (!c) { missing.push(`${s}:${v.id}`); continue; }
      used++;
      assert.ok(c.pts.length >= 2, v.id);
      for (const p of c.pts) { assert.ok(p.every(Number.isFinite), `${v.id} has a point that is not a number`); assert.ok(Math.abs(p[0]) < 2.5 && Math.abs(p[1]) < 2.5 && Math.abs(p[2]) < 1, `${v.id} is outside the frame: ${p}`); }
      assert.equal(c.profile.length, c.pts.length * 2);
      for (let i = 0; i < c.profile.length; i += 2) {
        assert.ok(c.profile[i + 1]! > 0.15 && c.profile[i + 1]! < 8, `${s}:${v.id} radius share ${c.profile[i + 1]!.toFixed(2)} at ${i / 2}`);
        if (i) assert.ok(c.profile[i]! >= c.profile[i - 2]!, `${v.id} arc shares must rise`);
      }
      assert.equal(c.profile[0], 0); assert.ok(Math.abs(c.profile[c.profile.length - 2]! - 1) < 1e-9);
    }
  }
  assert.ok(used > 3 * 55, `the artist drew most of the app's vessels (${used})`);
  // what stays the 2D figure's in the healthy form: the shunts and the stents' ground (they are the procedures'), the optional C8 and the arterial fine twigs the package has no mesh for
  const stay = new Set(missing.filter((m) => m.startsWith('healthy:')).map((m) => m.slice(8)));
  for (const id of KEEP_CLASSIC) assert.ok(stay.has(id), `${id} stays classic`);
  console.log(`atlas courses: ${used} used; healthy form keeps classic: ${[...stay].join(', ')}`);
});

test('a vessel the specimen\'s own file lacks is read from the next file in order (the collaterals from the diseased ones, the caudate vein from Budd–Chiari\'s)', () => {
  const r = (id: string, s: Specimen) => courses.courseOf(id, s, 0.01, (x) => NETWORK_BY_ID.has(x));
  assert.ok(r('C1a', 'healthy'), 'a collateral is drawn in the healthy form too (it opens with pressure)');
  assert.ok(r('CAUD', 'cirr-decomp'));
  assert.deepEqual(SOURCE_ORDER.healthy[0], 'healthy'); assert.deepEqual(SOURCE_ORDER['budd-chiari'][0], 'budd-chiari');
  assert.equal(r('TIPS', 'cirr-decomp'), null);
});

test('shared rings leave the ends that meet end to end without a cap, and only against vessels the app draws', () => {
  const c = courses.courseOf('A_HEP', 'healthy', 0.01, () => true)!;
  assert.deepEqual(c.joined, [false, true], 'A_HEP ends where A_HR starts (the package\'s ring pair)');
  const none = courses.courseOf('A_HEP', 'healthy', 0.01, () => false)!;
  assert.deepEqual(none.joined, [false, false], 'a partner the app does not draw leaves the end capped');
});

test('the radius profile is read by arc share, linearly, held at the ends', () => {
  const p = [0, 2, 0.5, 4, 1, 2];
  assert.equal(profileAt(p, -1), 2); assert.equal(profileAt(p, 0), 2); assert.equal(profileAt(p, 0.25), 3); assert.equal(profileAt(p, 0.5), 4); assert.equal(profileAt(p, 0.75), 3); assert.equal(profileAt(p, 2), 2);
});

test('the organ files read: the healthy file has the ten organs, the diseased files swap the liver, spleen and bowel and add the ascites; indices stay inside the vertices', () => {
  const h = parseGlb(organFile('healthy'));
  assert.deepEqual(h.map((m) => m.name).sort(), ['bowel', 'colon', 'duodenum', 'heart', 'heart-ra', 'kidney-l', 'kidney-r', 'liver', 'spleen', 'stomach']);
  for (const s of ['cirr-decomp', 'budd-chiari'] as const) assert.deepEqual(parseGlb(organFile(s)).map((m) => m.name).sort(), ['ascites', 'bowel', 'liver', 'spleen']);
  for (const s of SPECIMENS) for (const m of parseGlb(organFile(s))) {
    const n = m.position.length / 3;
    assert.ok(m.position.every(Number.isFinite), m.name);
    assert.ok(m.normal && m.normal.length === n * 3, `${m.name} has normals`);
    assert.ok(m.uv && m.uv.length === n * 2, `${m.name} has uvs`);
    if (m.name !== 'ascites') assert.ok(m.color && m.color.length === n * 3 && m.color.every((c) => c >= 0 && c <= 1), `${m.name} has its wash`);
    let max = 0; for (const i of m.index) if (i > max) max = i;
    assert.ok(max < n && m.index.length % 3 === 0, `${m.name}: index ${max} of ${n}`);
  }
});

test('the atlas organs: the healthy form shows, a diseased patient crossfades its liver, spleen and bowel in once that file is loaded, and the ascites follows the volume', () => {
  const cut = { value: new Vector4(0, 0, -1, 1) }, res = { value: new Vector2(800, 600) };
  const o = new AtlasOrgans(cut, res);
  o.add('healthy', parseGlb(organFile('healthy')));
  o.setVisible(true); o.setLook('light', false); o.setBody(0, 1, 0, true); o.setSpecimen('healthy'); o.snap();
  o.update(0);
  const shown = () => o.group.children.filter((g) => g.visible).map((g) => g.name).sort();
  assert.deepEqual(shown(), ['atlas bowel', 'atlas colon', 'atlas duodenum', 'atlas heart', 'atlas heart-ra', 'atlas kidney-l', 'atlas kidney-r', 'atlas liver', 'atlas spleen', 'atlas stomach']);
  // a cirrhotic patient whose file is not in yet: the healthy form stays (nothing pops), and the file is asked for
  o.setSpecimen('cirr-decomp');
  assert.ok(o.needs().includes('cirr-decomp') && !o.has('cirr-decomp'));
  o.update(16); assert.ok(o.group.children.some((g) => g.name === 'atlas liver' && g.visible), 'the healthy liver is still shown');
  o.add('cirr-decomp', parseGlb(organFile('cirr-decomp')));
  o.setBody(3000, 1, 0);
  let t = 16, moving = true;
  for (let i = 0; i < 200 && moving; i++) moving = o.update((t += 16));
  assert.equal(moving, false, 'the crossfade ends');
  const liverMeshes = o.group.children.filter((g) => g.name === 'atlas liver');
  assert.equal(liverMeshes.length, 2, 'both forms of the liver are held');
  assert.equal(liverMeshes.filter((g) => g.visible).length, 1, 'one is shown');
  // the pool is the 2D figure's (columns cut to the cavity, standing to the 2D surface) in the cel look, drawn after every organ, with a waterline; the bowel floats up with the wall
  const pool = o.group.children.find((g) => g.name === 'atlas ascites' && g.visible);
  assert.ok(pool, 'the pool shows at 3 L');
  const poolMesh = pool!.children[0] as unknown as { renderOrder: number; geometry: { getAttribute(n: string): { array: Float32Array } }; material: { fragmentShader: string; depthTest: boolean } };
  assert.ok(o.group.children.filter((g) => g !== pool).every((g) => (g.children[0] as { renderOrder: number }).renderOrder < poolMesh.renderOrder && (g.children[1] as { renderOrder: number }).renderOrder < poolMesh.renderOrder), 'over every organ and its ink');
  assert.match(poolMesh.material.fragmentShader, /dTop \/ max\(fwidth\(dTop\)/, 'a waterline of ink');
  const P = poolMesh.geometry.getAttribute('position').array, mid = Math.round((712 - X0) / STEP);
  assert.ok(Math.abs(P[mid * 6 + 1]! - y3(fluidBase(712, fluidLevel(3000).h))) < 0.01, 'the surface stands at the 2D level for 3 L');
  assert.ok(P[mid * 6 + 1]! > P[mid * 6 + 4]!, 'the surface is above the cavity floor');
  assert.ok(POOL_WASH > 0.4 && POOL_WASH <= 0.6);
  const bowel = o.group.children.find((g) => g.name === 'atlas bowel' && g.visible)!;
  assert.ok(Math.abs(bowel.position.y - (bulgeStep(3000) / 2 / 34 * 26) / 300) < 1e-9 && bowel.position.y > 0, 'the gut floats up with the wall, as Classic\'s does');
  o.setBody(0, 1, 0);
  for (let i = 0; i < 400; i++) o.update((t += 16));
  assert.equal(bowel.position.y, 0, 'and sinks back');
  assert.ok(!o.group.children.some((g) => g.name === 'atlas ascites' && g.visible), 'no pool at 0 mL');
  // the dive's window and the body's fade reach the materials
  o.setBody(0, 1, 0); o.setFade(0.5); o.update((t += 16));
  const m = o.group.children.find((g) => g.name === 'atlas heart')!;
  assert.ok(Math.abs((m.children[0] as unknown as { material: { uniforms: { uAlpha: { value: number }; cut: { value: Vector4 } } } }).material.uniforms.uAlpha.value - 0.5) < 1e-6);
  assert.equal((m.children[0] as unknown as { material: { uniforms: { cut: { value: Vector4 } } } }).material.uniforms.cut.value, cut.value, 'the dive window is the one every organ shares');
  // a tap on the liver's middle, from the front, opens the liver
  o.setFade(1); o.update((t += 16));
  const liver = o.group.children.find((g) => g.name === 'atlas liver' && g.visible)!;
  const box = (liver.children[0] as unknown as { geometry: { boundingBox: { getCenter(v: Vector3): Vector3 } } }).geometry.boundingBox, c = box.getCenter(new Vector3());
  const rc = new Raycaster(new Vector3(c.x, c.y, 5), new Vector3(0, 0, -1));
  o.group.updateWorldMatrix(true, true);
  assert.equal(o.pick(rc)?.id, 'liver');
});

test('Atlas on and off: every vessel is reshaped in place, nothing is NaN, and going back to Classic restores every vertex exactly', () => {
  const scene = new CelScene();
  const geo = (id: string) => scene.vesselObject(id)!.toonMesh.geometry;
  const grab = () => new Map(NETWORK.map((v) => [v.id, ['position', 'rk', 'uv', 'tang', 'cC', 'fr', 'pk'].map((n) => (geo(v.id).getAttribute(n)?.array as Float32Array | undefined)?.slice() ?? null)] as const));
  const before = grab(), pts0 = new Map(NETWORK.map((v) => [v.id, v.pts]));
  assert.equal(ATLAS_COURSE.size, 0);
  const av = new AtlasVessels((id) => scene.vesselObject(id));
  for (const s of SPECIMENS) {
    const changed = av.apply(courses, s);
    assert.ok(changed.length > 50, `${s}: ${changed.length} vessels took the artist's course`);
    assert.equal(av.specimen, s);
    for (const v of NETWORK) {
      const g = geo(v.id), pos = g.getAttribute('position').array as Float32Array, rk = g.getAttribute('rk').array as Float32Array;
      for (const x of pos) if (!Number.isFinite(x)) assert.fail(`${s}: ${v.id} has a vertex that is not a number`);
      for (const x of rk) if (!Number.isFinite(x) || x < 0) assert.fail(`${s}: ${v.id} has a radius share of ${x}`);
      if (ATLAS_COURSE.has(v.id)) assert.strictEqual(v.pts, ATLAS_COURSE.get(v.id)!.pts, 'the vessel\'s own centreline is the artist\'s while Atlas is on');
    }
  }
  const diff = NETWORK.filter((v) => { const a = before.get(v.id)![0]!, b = geo(v.id).getAttribute('position').array as Float32Array; return a.some((x, i) => x !== b[i]); });
  assert.ok(diff.length > 50, 'the shapes changed');
  av.apply(null, 'healthy');
  assert.equal(ATLAS_COURSE.size, 0, 'no atlas course is left behind');
  assert.equal(av.specimen, null);
  const after = grab();
  for (const v of NETWORK) {
    assert.strictEqual(v.pts, pts0.get(v.id), `${v.id}: the 2D centreline is back`);
    const a = before.get(v.id)!, b = after.get(v.id)!;
    a.forEach((arr, i) => { if (arr || b[i]) assert.deepEqual(Array.from(b[i]!), Array.from(arr!), `${v.id}: attribute ${i} is what it was`); });
  }
});

test('the atlas shader is cel stepped with the figure\'s own constants, has the dive window, and the ink hull is a screen-space outline', () => {
  assert.match(ATLAS_FS, new RegExp(`#define CEL_SHADE ${CEL.SHADE}\\b`));
  assert.match(ATLAS_FS, new RegExp(`#define CEL_LIT ${CEL.LIT}\\b`));
  assert.match(ATLAS_FS, /smoothstep\(cut\.z, cut\.z \+ 0\.3/);
  assert.doesNotMatch(ATLAS_FS, /uVessel|uDevice|uFlow|pow\(max\(0\.0, nl\), 6/, 'the package\'s smooth satin and vessel branches are gone: stepped tones only');
  assert.match(ATLAS_FS, /stepAt\(nl,/);
  assert.match(ATLAS_VS, /normalMatrix \* normal/);
  assert.match(ATLAS_INK_VS, /res\.y \* projectionMatrix\[1\]\[1\]/);
  assert.match(ATLAS_INK_FS, /inkA \* uAlpha \* win/);
  for (const [name, p] of atlasPrograms().map((p) => [p.name, p] as const)) {
    assert.match(p.vertexGlsl, /^#version 300 es\n/, name); assert.match(p.fragmentGlsl, /^#version 300 es\n/, name);
    assert.equal((p.vertexGlsl.match(/#version/g) ?? []).length, 1, `${name}: one version line`);
  }
  assert.deepEqual(atlasPrograms().map((p) => p.name), ['atlas organ', 'atlas organ ink', 'atlas ascites']);
});

test('both palettes name every organ the files carry, and each is a hex colour', () => {
  for (const pal of [ATLAS_PALETTE.light, ATLAS_PALETTE.dark]) {
    for (const id of ['heart', 'heart-ra', 'kidney-l', 'kidney-r', 'duodenum', 'stomach', 'colon', 'liver', 'liver.cirr', 'liver.budd', 'spleen', 'bowel', 'ascites']) assert.match((pal as Record<string, string>)[id] ?? '', /^#[0-9a-f]{6}$/, id);
  }
});

test('Classic is untouched: nothing of the atlas is in the boot chunk\'s path and no file is fetched until it is chosen', () => {
  const scene = readFileSync('src/scene/scene.ts', 'utf8'), idx = readFileSync('src/scene/atlas-art/index.ts', 'utf8'), loader = readFileSync('src/scene/atlas-art/loader.ts', 'utf8');
  assert.doesNotMatch(scene, /atlas-art\/loader/, 'the scene does not import the loader');
  assert.match(idx, /if \(!this\.active\) return false;/, 'update is a no-op in Classic');
  assert.match(idx, /if \(!this\.active\) return;/, 'feed stores and returns in Classic');
  assert.doesNotMatch(loader, /^\s*(void\s+)?(fetch|get)\(/m, 'nothing is fetched when the module loads');
  assert.equal(ATLAS_COURSE.size, 0);
});

test('the tube segment counts are the 2D courses\' whatever atlas course is set (so a smooth-joins toggle or the atlas swap reshapes in place)', () => {
  const classic = new Map(NETWORK.map((v) => [v.id, tubularOf(v, 0)]));
  try {
    for (const v of NETWORK) { const c = courses.courseOf(v.id, 'cirr-decomp', v.radius, (id) => NETWORK_BY_ID.has(id)); if (c) ATLAS_COURSE.set(v.id, c); }
    assert.ok(ATLAS_COURSE.size > 50);
    for (const v of NETWORK) assert.deepEqual(tubularOf(v, 0), classic.get(v.id), v.id);
  } finally { ATLAS_COURSE.clear(); }
});

test('the cirrhotic liver is calm for the cel look: its normals are smoothed, its wash keeps less mottle, the nodules are one flat low-contrast band and the liver keeps little of the shine', () => {
  const liver = parseGlb(organFile('cirr-decomp')).find((m) => m.name === 'liver')!;
  const rough = (nrm: ArrayLike<number>) => {   // the mean cosine between a normal and its neighbours' sum
    const n = nrm.length / 3, acc = new Float32Array(n * 3);
    for (let t = 0; t < liver.index.length; t += 3) for (const [p, q] of [[0, 1], [1, 0], [1, 2], [2, 1], [2, 0], [0, 2]] as const) { const a = liver.index[t + p]!, b = liver.index[t + q]!; for (let k = 0; k < 3; k++) acc[a * 3 + k]! += nrm[b * 3 + k]!; }
    let d = 0;
    for (let i = 0; i < n; i++) d += (acc[i * 3]! * nrm[i * 3]! + acc[i * 3 + 1]! * nrm[i * 3 + 1]! + acc[i * 3 + 2]! * nrm[i * 3 + 2]!) / (Math.hypot(acc[i * 3]!, acc[i * 3 + 1]!, acc[i * 3 + 2]!) || 1);
    return d / n;
  };
  const heavy = smoothNormals(liver.normal!, liver.index, 24);
  assert.ok(rough(liver.normal!) < 0.97 && rough(heavy) > 0.995, 'the artist\'s nodules are small; the heavy pass takes them out');
  for (let i = 0; i < heavy.length; i++) assert.ok(Number.isFinite(heavy[i]));
  for (let i = 0; i < heavy.length; i += 3) assert.ok(Math.abs(Math.hypot(heavy[i]!, heavy[i + 1]!, heavy[i + 2]!) - 1) < 1e-4, 'unit normals');
  const sd = (a: ArrayLike<number>) => { let s1 = 0, s2 = 0; for (let i = 0; i < a.length; i++) { s1 += a[i]!; s2 += a[i]! * a[i]!; } return Math.sqrt(s2 / a.length - (s1 / a.length) ** 2); };
  assert.ok(sd(calmWash(liver.color!, liver.index, 6, 0.3, 0.55)) < 0.6 * sd(liver.color!), 'the wash has well under its mottle');
  assert.match(ATLAS_VS, /in vec3 detail;/); assert.match(ATLAS_FS, /uNod \* CEL_SHADE \* nod/); assert.match(ATLAS_FS, /CEL_LIT \* lit \* uShine/);
  assert.ok(LIVER_SHINE <= 0.3);
  const o = new AtlasOrgans({ value: new Vector4(0, 0, -1, 1) }, { value: new Vector2(800, 600) });
  o.add('cirr-decomp', parseGlb(organFile('cirr-decomp')));
  const mat = (o.group.children.find((g) => g.name === 'atlas liver')!.children[0] as unknown as { material: { uniforms: Record<string, { value: number }> } }).material;
  assert.equal(mat.uniforms.uShine!.value, LIVER_SHINE); assert.ok(mat.uniforms.uNod!.value > 0);
});
