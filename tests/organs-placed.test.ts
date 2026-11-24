// The approved placement's organs and gut in the app (docs/approved/anatomy-placement.md, frozen round 16; the build-in behind ?anatomy=new). These pin, with the switch on (this file turns it on for its own process): the organs
// are the mock's own re-inflated surfaces (held to the frozen vertices, art/anatomy-placement/organsA.json), at their own depth (nothing moves them again), the 2D art and fields laid through each organ's move; the gut is the mock's
// tubes (the duodenum's funnel from the stomach's cut with no seam, the packed loops, the colon whose rectum end alone fades); the gut draws as one surface (a depth pass, one fill a pixel, the outlines last); the caudate lobe is
// the mock's egg, hidden until a slide or a case calls for it; and the baked file carries all of it.
process.env.PPS_ANATOMY = 'placed';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';

const R = (p: string) => new URL(`../${p}`, import.meta.url);
const { PLACED } = await import('../src/scene/anatomy/source.ts');
const { PLACED_CAUDATE, PLACED_GUT } = await import('../src/scene/anatomy/placement.generated.ts');
const { ORGAN_MESHES, setOrganData, organsReady } = await import('../src/scene/organs/meshes.ts');
const { ORGAN_Z } = await import('../src/scene/organs/z.ts');
const { INFLATED_IDS, planeMap, mapX, mapY } = await import('../src/scene/organs/placed-map.ts');
const { PYL_CUT, HAUSTRA, gutTubes, stomachShare } = await import('../src/scene/organs/gut-tubes.ts');
const { caudateGeometry, CAUDATE_FRONT_Z } = await import('../src/scene/organs/caudate.ts');
const { prepareOrgans } = await import('../src/scene/organs/prepare.ts');
const { encodeOrgans, decodeOrgans, RAW_IDS } = await import('../src/scene/organs/baked.ts');
const L = await import('../src/scene/organs/layer.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');
const { setArtData } = await import('../src/scene/organs/organ-art.ts');

const bin = readFileSync(R('public/anatomy/organs.bin'));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);
await organsReady;
const FROZEN = JSON.parse(readFileSync(R('art/anatomy-placement/organsA.json'), 'utf8')) as Record<string, number[]>;
const arr = (g: BufferGeometry, k: string) => g.getAttribute(k).array as ArrayLike<number>;

test('the switch is on in this file, and every organ mesh carries its own depth (ORGAN_Z moves none again)', () => {
  assert.equal(PLACED, true);
  assert.deepEqual(INFLATED_IDS.slice().sort(), ['heart', 'heart-ra', 'kidney-l', 'liver', 'spleen', 'stomach']);
  for (const [id, z] of Object.entries(ORGAN_Z)) assert.equal(z, 0, id);
});

test('each re-inflated organ is the mock\'s surface: its vertices are the frozen ones (organsA.json, rounded there to 1e-3), in their order', () => {
  for (const id of INFLATED_IDS) {
    const a = FROZEN[id]!, p = arr(ORGAN_MESHES[id]!(), 'position');
    let worst = 0;
    if (id === 'stomach') {
      // (the stomach keeps all but what is never drawn: the antrum's tip inside the funnel and the oesophagus past its fade; the oesophagus's tube is split across before it is inflated. Every kept frozen vertex is matched)
      // (a front and a back vertex share their x and y: each frozen vertex is matched to the kept one at its x and y nearest in depth)
      const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`, at = new Map<string, number[]>();
      for (let i = 0; i < p.length; i += 3) { const k = key(p[i]!, p[i + 1]!); (at.get(k) ?? at.set(k, []).get(k)!).push(p[i + 2]!); }
      let found = 0;
      for (let i = 0; i < a.length; i += 3) { const zs = at.get(key(a[i]!, a[i + 1]!)); if (!zs) continue; found++; worst = Math.max(worst, Math.min(...zs.map((z) => Math.abs(z - a[i + 2]!)))); }
      assert.ok(found > 0.8 * (a.length / 3), `most of the stomach's frozen vertices are kept (${found})`);
    } else {
      assert.equal(p.length, a.length, `${id}: same vertex count`);
      for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(p[i]! - a[i]!));
    }
    assert.ok(worst <= 0.0005 + 1e-6, `${id}: within the frozen file's rounding (${worst})`);
  }
});

test('an organ\'s move in the front view is one map of the plane, so the 2D art and fields laid through it land where they did', () => {
  const man = JSON.parse(readFileSync(R('src/scene/organs/organs-manifest.json'), 'utf8')) as { q: number; organs: Record<string, [number, number, number, number]> };
  for (const id of INFLATED_IDS) {
    const [pb, nv] = man.organs[id]!, q = new Int16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), pb, nv * 3), m = planeMap(id), a = FROZEN[id]!;
    let worst = 0;
    for (let i = 0; i < nv; i++) worst = Math.max(worst, Math.abs(mapX(m, q[i * 3]! / man.q) - a[i * 3]!), Math.abs(mapY(m, q[i * 3 + 1]! / man.q) - a[i * 3 + 1]!));
    assert.ok(worst <= 0.0005 + 1e-6, `${id}: ${worst}`);
  }
  assert.ok(planeMap('liver').sx > planeMap('stomach').sx, 'the liver keeps more of its width than the abdomen (pulled 16% in)');
});

test('the gut is tubes: the duodenum starts open at the stomach\'s cut and hands its last ring to the bowel exactly; the colon\'s rectum end alone fades', () => {
  const t = gutTubes(), d = t.duodenum, b = t.bowel, c = t.colon;
  const dp = arr(d, 'position'), bp = arr(b, 'position'), dn = arr(d, 'normal'), bn = arr(b, 'normal');
  const seg = 25;   // (GUT_SEGMENTS + 1 points a ring)
  const ring0 = Array.from({ length: seg }, (_, j) => dp[j * 3]!);
  assert.ok(Math.abs(ring0.reduce((s, x) => s + x, 0) / seg - PYL_CUT) < 0.015, 'the funnel opens at the cut');
  assert.ok(Math.abs(PLACED_GUT.upper[0]![3] - Math.hypot(dp[1]! - PLACED_GUT.upper[0]![1], dp[2]! - PLACED_GUT.upper[0]![2])) < 0.02, 'with the antrum\'s own width');
  const last = dp.length / 3 - seg;
  for (let j = 0; j < seg; j++) for (let k = 0; k < 3; k++) {
    assert.equal(dp[(last + j) * 3 + k], bp[j * 3 + k], 'the shared ring: same points');
    assert.equal(dn[(last + j) * 3 + k], bn[j * 3 + k], 'and the same normals: no seam');
  }
  const tos = arr(d, 'tos');
  assert.equal(tos[0], 1, 'all of the stomach\'s look at the cut'); assert.equal(tos[tos.length - 1], 0, 'none past the bulb');
  assert.equal(stomachShare(0), 1);
  const ca = arr(c, 'esoA');
  let faded = 0; for (let i = 0; i < ca.length; i++) if (ca[i]! < 1) faded++;
  assert.ok(faded > 0 && faded < 0.15 * ca.length, 'only the colon\'s last stretch fades');
  assert.ok(Math.min(...Array.from(ca)) < 0.01, 'to nothing');
  assert.ok([...Array.from(arr(b, 'esoA')), ...Array.from(arr(d, 'esoA'))].every((v) => v === 1), 'the small bowel fades nowhere');
  assert.ok(HAUSTRA > 0);
});

test('the stomach is cut where the funnel takes over, and the antrum\'s shade turns round the funnel\'s axis there', () => {
  const made = prepareOrgans({ stomach: ORGAN_MESHES.stomach! }), g = made[0]![1], p = arr(g, 'position'), cut = arr(g, 'cutA');
  for (let i = 0; i < cut.length; i++) { const x = p[i * 3]!; if (x < PYL_CUT - 0.016) assert.ok(cut[i]! < 0.5, 'cut away inside the funnel'); if (x > PYL_CUT + 0.016) assert.equal(cut[i], 1); }
  assert.ok(Math.min(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3]!)) > PYL_CUT - 0.06, 'the tip inside the funnel is not kept');
});

test('the caudate lobe is the mock\'s egg: about its centre, its half-axes, fuller toward the papillary end, the IVC side drawn in', () => {
  const g = caudateGeometry(), p = arr(g, 'position'), { c, ax } = PLACED_CAUDATE;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = -Infinity, wTop = 0, wBot = 0;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    if (y > c[1] + 0.5 * ax[1]) wTop = Math.max(wTop, Math.abs(x - c[0])); if (y < c[1] - 0.5 * ax[1]) wBot = Math.max(wBot, Math.abs(x - c[0]));
  }
  assert.ok(Math.abs(y1 - (c[1] + ax[1])) < 1e-3 && Math.abs(y0 - (c[1] - ax[1])) < 1e-3, 'upright, its height the half-axis');
  assert.ok(c[0] - x0 < x1 - c[0], 'the IVC side (the patient\'s right) is drawn in');
  assert.ok(wBot > wTop, 'fuller below');
  assert.ok(Math.abs(z1 - CAUDATE_FRONT_Z) < 2e-3, 'its front is where a mark on it sits');
});

test('the gut draws as one surface: a depth pass of every part, then the fills (tubes first) marking stencil bit 2, then all the outlines; no painted loops or haustra', () => {
  setArtData(JSON.parse(readFileSync(R('public/anatomy/organ-art.json'), 'utf8')));
  const layer = new L.OrganLayer(createShared(), ORGAN_MESHES);
  assert.deepEqual([...L.GUT_GROUP].sort(), ['bowel', 'colon', 'duodenum', 'stomach']);
  const pres: number[] = [], fills: number[] = [], inks: number[] = [];
  for (const id of L.GUT_GROUP) {
    const o = layer.byId.get(id)!, pre = o.group.children.find((k) => k.name === 'gut-depth');
    assert.ok(pre, `${id}: a depth pass`);
    pres.push(pre.renderOrder); fills.push(o.toonMesh.renderOrder); inks.push(o.group.children.find((k) => (k as { material?: unknown }).material === o.ink)!.renderOrder);
    assert.ok(o.toon.stencilWrite && o.toon.stencilRef === 2, `${id}: one fill a pixel`);
    assert.ok(!('art' in o.toon.uniforms) || id === 'stomach', `${id}: no painted art on a tube`);
  }
  assert.ok(Math.max(...pres) < Math.min(...fills) && Math.max(...fills) < Math.min(...inks), 'depth, fills, outlines');
  assert.ok(layer.byId.get('duodenum')!.toonMesh.renderOrder < layer.byId.get('stomach')!.toonMesh.renderOrder, 'the funnel is drawn before the stomach it covers');
  const st = layer.byId.get('stomach')!;
  assert.match(st.toon.fragmentShader, /if \(vCut < 0\.5\) discard;/); assert.match(st.ink.fragmentShader, /if \(vCut < 0\.5\) discard;/);
  assert.match(layer.byId.get('duodenum')!.toon.fragmentShader, /vTos/);
  const cd = layer.byId.get('caudate')!;
  assert.ok(cd.toonMesh.renderOrder < layer.byId.get('liver')!.toonMesh.renderOrder, 'the lobe on the liver\'s back is drawn before the liver, which lies over it');
  assert.notEqual(L.ORGAN_STYLE.caudate!.noRim, true, 'with the rim light');
  layer.dispose();
});

test('the caudate lobe is hidden on a healthy figure and eases in only when called for, and out again', async () => {
  const layer = new L.OrganLayer(createShared(), ORGAN_MESHES);
  const { presetState } = await import('./b4-presets.ts');
  const { bodyTargets } = await import('../src/scene/disease/targets.ts');
  const ps = await presetState('healthy').catch(() => presetState('cirr-decomp'));
  layer.setBody(bodyTargets(ps.frame, ps.params, ps.healthyP), true);
  layer.update(0);
  const lobe = layer.byId.get('caudate')!;
  assert.equal(lobe.group.visible, false, 'hidden by default');
  layer.setCaudate(true, 0);
  layer.update(16); layer.update(100);
  const mid = layer.caudateShown;
  assert.ok(mid > 0 && mid < 1 && lobe.group.visible, `easing in (${mid})`);
  for (let t = 200; t < 4000; t += 100) layer.update(t);
  assert.ok(layer.caudateShown > 0.99);
  layer.setCaudate(false, 0);
  for (let t = 4100; t < 9000; t += 100) layer.update(t);
  assert.equal(lobe.group.visible, false, 'and out again');
  layer.dispose();
});

test('the baked file carries the placed organs whole: the stomach\'s cut, the duodenum\'s share of the stomach\'s look, the tubes\' own normals', () => {
  const live = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });
  const bytes = encodeOrgans(live, 'p-test', RAW_IDS.map((id) => [id, ORGAN_MESHES[id]!()]));
  const back = decodeOrgans(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!;
  const by = new Map(back.organs);
  for (const [id, g] of live) {
    const b = by.get(id)!;
    for (const k of ['cutA', 'tos', 'esoA']) if (g.getAttribute(k)) assert.deepEqual(Array.from(arr(b, k)), Array.from(arr(g, k)), `${id} ${k}`);
    if (g.userData.tube) { const x = arr(g, 'normal'), y = arr(b, 'normal'); let w = 0; for (let i = 0; i < x.length; i++) w = Math.max(w, Math.abs(x[i]! - y[i]!)); assert.ok(w < 1e-3, `${id} normals ${w}`); }
  }
  assert.ok(by.has('caudate') && by.has('bowel'));
});
