// A tap on an organ or the belly's fluid opens what 2D's does (stage.js pick: vessel, then the vessel near the finger, then the liver (with its lobe), heart or spleen, then the fluid).
// The scene's side (which organ is under a point, and that the gut over the liver is no target) runs here on the real organ meshes; the selection's side (tap-select.ts) on the real store.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { Raycaster, Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { LIVER_SPLIT_X, PICK_OF, lobeAt, organHit } from '../src/scene/organs/pick.ts';
import { x2d, x3, y3 } from '../src/scene/frame2d.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { selectStructure, useSelection, holdScenePicks } from '../src/ui/action/selection.ts';
import { tapSelect } from '../src/ui/action/tap-select.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';

const room = { x: 0, y: 0, w: 900, h: 700 };

async function scene(): Promise<CelScene> {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const s = new CelScene();
  s.resize(900, 700);
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  s.goTo('title', room, 0, 0);
  s.update(0); s.update(1000);
  s.scene.updateMatrixWorld(true);
  return s;
}

test('2D\'s rules: the liver (R left of 640, L right), the heart and its atrium, the spleen; the gut and the kidney take no tap', () => {
  assert.equal(LIVER_SPLIT_X, 640);
  assert.deepEqual(Object.keys(PICK_OF).sort(), ['heart', 'heart-ra', 'liver', 'spleen']);
  assert.equal(PICK_OF['heart-ra'], 'heart');
  for (const id of ['stomach', 'esophagus', 'bowel', 'colon', 'appendix', 'duodenum', 'kidney-l']) assert.equal(PICK_OF[id], undefined, id);
  assert.equal(lobeAt(639), 'R'); assert.equal(lobeAt(640), 'L');
  assert.deepEqual(organHit('liver', 500), { type: 'organ', id: 'liver', lobe: 'R' });
  assert.deepEqual(organHit('liver', 900), { type: 'organ', id: 'liver', lobe: 'L' });
  assert.deepEqual(organHit('spleen', 1050), { type: 'organ', id: 'spleen' });
});

test('across the figure a tap finds the liver on both lobes, the heart and the spleen, and never the stomach, bowel or kidney', async () => {
  const s = await scene(), rc = new Raycaster();
  const seen = new Map<string, number>(), lobes = new Set<string>();
  for (let y = 0; y < 700; y += 6) for (let x = 0; x < 900; x += 6) {
    const h = s.pickTargetAt(x, y, rc);
    if (!h || h.type !== 'organ') continue;
    seen.set(h.id, (seen.get(h.id) ?? 0) + 1);
    if (h.id === 'liver') lobes.add(h.lobe!);
    else assert.equal(h.lobe, undefined, 'only the liver has a lobe');
  }
  for (const id of ['liver', 'heart', 'spleen']) assert.ok((seen.get(id) ?? 0) > 20, `${id} is picked (${seen.get(id)})`);
  assert.deepEqual([...lobes].sort(), ['L', 'R'], 'both lobes of the liver');
  assert.equal(seen.has('abdomen'), false, 'no fluid, no belly target');
  // where an organ is picked, the point is on that organ: the liver's hits lie in its own box
  const lg = s.disease.organs.byId.get('liver')!.toonMesh.geometry; lg.computeBoundingBox();
  const bb = lg.boundingBox!;
  const centre = s.rig.project(new Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, 0));
  let liverAtCentre = false;
  for (let dy = -40; dy <= 40; dy += 8) for (let dx = -40; dx <= 40; dx += 8) { const h = s.pickTargetAt(centre.x + dx, centre.y + dy, rc); if (h?.type === 'organ' && h.id === 'liver') liverAtCentre = true; }
  assert.ok(liverAtCentre, 'the middle of the liver picks the liver');
  assert.equal(s.pickTargetAt(2, 2, rc), null, 'the page picks nothing');
  s.dispose?.();
});

test('the fluid is the belly\'s target only below its surface and inside the wall, and only once there is a pool', async () => {
  const s = await scene(), rc = new Raycaster();
  const at = (x2: number, y2: number) => { const p = s.rig.project(new Vector3(x3(x2), y3(y2), 0.28)); return s.pickTargetAt(p.x, p.y, rc); };
  assert.equal(s.disease.ascites.holds(712, 900), false, 'no pool yet');
  s.disease.ascites.set(6000);
  const top = s.disease.ascites.surface!;
  assert.ok(top > 400 && top < 1000, `surface ${top}`);
  assert.equal(s.disease.ascites.holds(712, top + 40), true);
  assert.equal(s.disease.ascites.holds(712, top - 40), false, 'above the surface');
  assert.equal(s.disease.ascites.holds(120, top + 40), false, 'outside the wall');
  // find a below-surface point of the belly that no vessel or organ covers: a tap there is the fluid
  let found: unknown = null;
  for (let y = top + 30; y < top + 140 && !found; y += 6) for (let x = 400; x < 1000 && !found; x += 6) { const h = at(x, y); if (h?.type === 'organ' && h.id === 'abdomen') found = h; }
  assert.deepEqual(found, { type: 'organ', id: 'abdomen' });
  s.disease.ascites.set(0);
  assert.equal(s.disease.ascites.holds(712, 950), false, 'the pool is gone');
  s.dispose?.();
});

test('a vessel near the point wins over the organ under it, reaching further for a finger (18 px) than for a mouse (12 px)', async () => {
  const s = await scene(), rc = new Raycaster();
  const p0 = s.rig.project(new Vector3(0, 0, 0)), p1 = s.rig.project(new Vector3(1, 0, 0)), k = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  let checked = 0;
  // every drawn vessel whose neighbours leave room across it (the figure is dense: most places have another vessel within a finger's reach)
  for (const v of NETWORK) {
    if (v.plan?.kind === 'feeder' || v.pts.length < 4) continue;
    const half = v.radius * k, i = Math.floor(v.pts.length / 2);
    const a = s.rig.project(new Vector3(...(v.pts[i] as [number, number, number]))), b = s.rig.project(new Vector3(...(v.pts[i + 1] as [number, number, number])));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const at = (off: number, touch: boolean) => { const h = s.pickTargetAt(a.x + nx * off, a.y + ny * off, rc, touch); return h?.type === 'edge' ? h.id : null; };
    if (at(0, false) !== v.id) continue;
    for (const sgn of [1, -1]) {
      const near = at(sgn * (half + 8), false) === v.id, mouse15 = at(sgn * (half + 15), false) === v.id, touch15 = at(sgn * (half + 15), true) === v.id, touch30 = at(sgn * (half + 30), true) === v.id;
      if (near && !mouse15 && touch15 && !touch30) checked++;
      assert.ok(!(mouse15 && !near), `${v.id}: reach only shrinks outward`);
      assert.ok(!(mouse15 && !touch15), `${v.id}: a finger reaches whatever a mouse does`);
    }
  }
  assert.ok(checked >= 3, `vessels with the 12 px mouse reach and the 18 px finger reach both shown (${checked})`);
  s.dispose?.();
});

// ── the selection ──
const io = (picked: string | null = null, body = true) => { const log: (string | null)[] = []; return { log, io: { picked, pick: (id: string | null) => { log.push(id); }, body } }; };

test('a tap on an organ selects it (the liver with its lobe), a second tap puts it away, a tap on nothing puts it away, a vessel replaces it', () => {
  useSelection.setState({ sel: null });
  const a = io();
  tapSelect({ type: 'organ', id: 'liver', lobe: 'R' }, a.io);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'liver', lobe: 'R' });
  tapSelect({ type: 'organ', id: 'liver', lobe: 'L' }, a.io);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'liver', lobe: 'L' }, 'the other lobe is another pick');
  tapSelect({ type: 'organ', id: 'liver', lobe: 'L' }, a.io);
  assert.equal(useSelection.getState().sel, null, 'the same again puts it away');
  tapSelect({ type: 'organ', id: 'spleen' }, a.io);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'spleen' });
  tapSelect(null, a.io);
  assert.equal(useSelection.getState().sel, null, 'nothing: away');
  tapSelect({ type: 'organ', id: 'heart' }, a.io);
  tapSelect({ type: 'edge', id: 'PV_TRUNK' }, a.io);
  assert.deepEqual(a.log.at(-1), 'PV_TRUNK', 'a vessel goes to the scene\'s pick, which selects it');
  // a view that is not the body does not clear on a miss
  useSelection.setState({ sel: { type: 'organ', id: 'heart' } });
  tapSelect(null, io(null, false).io);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'heart' });
  // the right-click and long press never close it
  tapSelect({ type: 'organ', id: 'heart' }, io().io, false);
  assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'heart' });
  useSelection.setState({ sel: null });
});

test('the belly opens the Ascites instrument and leaves no card; a held tap (the shunt\'s target) is not an organ\'s', () => {
  useSelection.setState({ sel: null });
  useTests.setState({ open: false });
  tapSelect({ type: 'organ', id: 'abdomen' }, io().io);
  assert.equal(useTests.getState().open, true); assert.equal(useTests.getState().pane, 'abdomen'); assert.equal(useSelection.getState().sel, null);
  useTests.setState({ open: false });
  selectStructure({ type: 'organ', id: 'abdomen' });   // (Treat's paracentesis, the palette: the same door)
  assert.equal(useTests.getState().open, true); assert.equal(useSelection.getState().sel, null);
  const held: (string | null)[] = [];
  const release = holdScenePicks((id) => held.push(id));
  const o = io();
  tapSelect({ type: 'organ', id: 'liver', lobe: 'R' }, o.io);
  assert.equal(useSelection.getState().sel, null, 'no organ is selected while the shunt waits');
  release();
});

test('x2d reaches the 2D x the lobe is judged on', () => { assert.ok(Math.abs(x2d(x3(640)) - 640) < 1e-9); });

// ── the heavy outline of a tapped organ ──
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { OrganPins, PIN_FADE_MS, PIN_PX, SELECT_PX } from '../src/scene/highlight.ts';
import { MESHES_OF } from '../src/scene/organs/pick.ts';
import { ORGAN_GLOW_LAYER } from '../src/scene/glow.ts';

test('the organ outline widens by hiPx with hiOn and takes the highlight colour (it did neither before: the shader ignored both)', () => {
  assert.match(ORGAN_INK_VS, /uniform float hiOn;/);
  assert.match(ORGAN_INK_VS, /uniform float hiPx;/);
  assert.match(ORGAN_INK_VS, /vHi = hiOn;/);
  assert.match(ORGAN_INK_VS, /px \+ hiOn \* hiPx/);
});

test('a tapped organ glows (one mask mesh, eased, on the organ glow layer: the blur makes the fall-off), a slide\'s pin does too, and putting the selection away fades it out; no outline is widened, no hulls', async () => {
  const s = await scene();
  const byId = s.disease.organs.byId, pins = new OrganPins();
  const hi = (id: string) => byId.get(id)!.ink.uniforms.hiOn!.value as number;
  const masks = (id: string) => byId.get(id)!.group.children.filter((c) => c.name === `highlight/glow/${id}`) as unknown as { visible: boolean; layers: { mask: number }; material: { uniforms: Record<string, { value: number }> } }[];
  const lit = (id: string) => masks(id).filter((m) => m.visible).map((m) => m.material.uniforms.amt!.value);
  assert.equal(SELECT_PX, 0); assert.equal(PIN_PX, 0, 'no widened outline: the glow is the highlight');
  assert.equal(pins.glowing, false, 'nothing lit, no glow pass');
  pins.select(MESHES_OF.heart!);
  for (let i = 0; i < 30; i++) pins.step(16, byId);
  assert.equal(hi('heart'), 1); assert.equal(hi('heart-ra'), 1, 'the atrium is part of the heart');
  assert.deepEqual(lit('heart'), [1], 'one mask mesh at full strength');
  assert.deepEqual(lit('heart-ra'), [1], 'and the atrium\'s');
  assert.equal(pins.glowing, true);
  assert.equal(masks('heart')[0]!.layers.mask, 1 << ORGAN_GLOW_LAYER, 'on the organ glow\'s own layer only: the figure\'s passes never draw it');
  assert.equal(lit('liver').length, 0); assert.equal(hi('liver'), 0);
  for (const [id, o] of byId) assert.equal(o.group.children.filter((c) => c.name.startsWith(`highlight/glow/${id}/`)).length, 0, `${id}: no stacked hulls`);
  pins.set(['liver']);
  for (let i = 0; i < 30; i++) pins.step(16, byId);
  assert.equal(hi('liver'), 1); assert.deepEqual(lit('liver'), [1]);
  pins.select([]); pins.set([]);
  for (let i = 0; i < 30; i++) pins.step(16, byId);
  assert.equal(hi('heart'), 0); assert.equal(hi('liver'), 0); assert.equal(lit('heart').length, 0); assert.equal(lit('liver').length, 0);
  assert.equal(pins.glowing, false, 'put away: the glow pass stops');
  // halfway through the fade the glow is part way
  pins.select(MESHES_OF.liver!); pins.step(PIN_FADE_MS / 2, byId);
  const part = lit('liver'); assert.ok(part.length === 1 && part[0]! > 0 && part[0]! < 1, 'eases in');
  assert.deepEqual(MESHES_OF.spleen, ['spleen']); assert.deepEqual(MESHES_OF.liver, ['liver']);
  s.dispose?.();
});

test('an organ\'s highlight colour is its own colour lifted, never white, in every look; the vessel\'s white is not used', async () => {
  const { organHighlight } = await import('../src/scene/organs/layer.ts');
  const { PALETTES } = await import('../src/scene/palette.ts');
  const { rgbOf } = await import('../src/scene/organs/organ-look.ts');
  const s = await scene();
  for (const [look, p] of Object.entries(PALETTES)) {
    const dark = p.highlight === 'white';
    for (const og of ['heart', 'liver', 'spleen', 'stomach'] as const) {
      const c = rgbOf(p.organs.tones[og][1]), h = organHighlight(c, dark);
      for (let i = 0; i < 3; i++) assert.ok(h[i]! >= c[i]! - 1e-9 && h[i]! < 0.96, `${look} ${og} channel ${i} is brighter than the organ and not white`);
      assert.ok(h[0] + h[1] + h[2] > c[0] + c[1] + c[2], `${look} ${og} is brighter`);
    }
  }
  // the selection's line, in every look: not white, and on a light look darker than the organ's fill (a lifted tone was invisible on the page)
  const { organSelectLine } = await import('../src/scene/organs/layer.ts');
  for (const [look, p] of Object.entries(PALETTES)) {
    const dark = p.highlight === 'white';
    for (const og of ['heart', 'liver', 'spleen', 'stomach'] as const) {
      const c = rgbOf(p.organs.tones[og][1]), ink = rgbOf(p.organs.tones[og][2]), h = organSelectLine(c, ink, dark);
      assert.ok(!(h[0] > 0.96 && h[1] > 0.96 && h[2] > 0.96), `${look} ${og} is not white`);
      if (!dark) assert.ok(h[0] + h[1] + h[2] < c[0] + c[1] + c[2], `${look} ${og}: darker than its fill, so it shows`);
    }
  }
  // what the layer writes into the ink after a paint, in every look: not the white of highlightColour
  for (const [look, p] of Object.entries(PALETTES)) {
    s.disease.organs.applyLook(p); s.disease.organs.update(2000 + Object.keys(PALETTES).indexOf(look));
    for (const id of ['liver', 'heart', 'spleen']) { const c = byId(s, id).ink.uniforms.hiColor!.value as { r: number; g: number; b: number }; assert.ok(!(c.r > 0.97 && c.g > 0.97 && c.b > 0.97), `${look} ${id} is not white`); }
  }
  s.dispose?.();
});
const byId = (s: CelScene, id: string) => s.disease.organs.byId.get(id)!;

test('selecting any one organ lights that organ only: no other organ and no vessel carries a highlight (iPhone, 20 Nov: "when i select spleen; i see every organ highlighted")', async () => {
  const s = await scene();
  const byId = s.disease.organs.byId, pins = new OrganPins();
  for (const pick of ['spleen', 'liver', 'heart']) {
    pins.select(MESHES_OF[pick]!);
    for (let i = 0; i < 40; i++) pins.step(16, byId);
    for (const [id, o] of byId) assert.equal(o.ink.uniforms.hiOn!.value, MESHES_OF[pick]!.includes(id) ? 1 : 0, `${pick} selected: ${id}`);
    for (const o of s.vessels) assert.equal(o.ink.uniforms.hiOn!.value, 0, `${pick} selected: vessel ${o.edge?.id} is not lit`);
    for (const [id, o] of byId) assert.equal(o.group.children.filter((c) => c.name.startsWith('highlight/glow/') && c.visible).length, MESHES_OF[pick]!.includes(id) ? 1 : 0, `${pick} selected: ${id}'s glow`);
    // the organs' lines are not shared uniform objects: one organ's cannot write another's
    const seen = new Set<object>();
    for (const o of byId.values()) { for (const k of ['hiOn', 'hiPx', 'hiColor']) { const u = o.ink.uniforms[k]!; assert.ok(!seen.has(u), `${k} is its own`); seen.add(u); } }
    seen.clear();
  }
  pins.select([]);
  for (let i = 0; i < 40; i++) pins.step(16, byId);
  for (const o of byId.values()) assert.equal(o.ink.uniforms.hiOn!.value, 0);
  
  s.dispose?.();
});
