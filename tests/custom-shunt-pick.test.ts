// A custom shunt a learner makes is a vessel like any other: a tap picks it, the highlight (glow, in its own colour) lights it, its card and menu open, and Take down shunt eases it out.
// Root cause (21 Nov): the highlight and the pick lists were built once from the figure's vessels, and a custom shunt's tube is made later (circuit/tubes.ts routeOpen), so it was in neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CelScene } from '../src/scene/scene.ts';
import { CUSTOM_EDGES } from '../src/scene/circuit/data.copied.ts';
import { GLOW_LAYER } from '../src/scene/glow.ts';
import { VESSEL_LAYER } from '../src/scene/layers.ts';
import { sceneSource } from './helpers/scene-source.ts';

const [ID] = CUSTOM_EDGES[0]!, [ID2] = CUSTOM_EDGES[5]!;
const ctx = (open: Record<string, number>) => ({ ramp: 0, t: 0, body: 1, drawn: () => true, caudPin: false, open });
const settle = (s: CelScene, open: Record<string, number>, n = 30) => { for (let i = 0; i < n; i++) { s.tubes.update(50, ctx(open)); s.highlight.step(50); } };

test('a custom shunt\'s tube is registered with the highlight and is pickable once it stands, and let go when it has eased out', () => {
  const s = new CelScene();
  assert.equal(s.highlight.picked, null);
  assert.deepEqual(s.tubes.pickable(), []);
  const open = { [ID]: 8 };
  s.tubes.routeOpen(open);
  assert.equal(s.tubes.pickable().length, 0, 'not yet in: it takes no tap while it has only begun to ease in');
  settle(s, open);
  const [o] = s.tubes.pickable();
  assert.equal(o!.edge!.id, ID);
  s.pick(ID);
  assert.equal(s.highlight.picked, ID, 'a pick names it');
  settle(s, open, 6);
  assert.equal(o!.ink.uniforms.hiOn.value, 1, 'lit, as any picked vessel');
  assert.equal(o!.glowMesh!.visible, true, 'with the glow');
  assert.equal(s.highlight.glowing, true);
  // closed: it eases out (never a pop), is let go, and takes the highlight's track with it
  s.pick(null);
  s.tubes.routeOpen({});
  s.tubes.update(50, ctx({}));
  assert.equal(s.tubes.pickable().length, 0, 'a shunt on its way out takes no tap');
  assert.ok(o!.fade > 0 && o!.fade < 1, 'it is easing, not gone');
  settle(s, {});
  assert.equal(s.tubes.ids.some((e) => e.kind === 'custom'), false);
  s.pick(ID);
  assert.equal(s.highlight.picked, ID, 'a closed shunt may still be named (its tube is not here; it lights when it opens)');
  s.dispose();
});

test('a shunt picked the moment it is made (before its tube is routed) lights when the tube arrives', () => {
  const s = new CelScene();
  s.pick(ID);   // (Add shunt: the change is made, then the new vessel is selected; the tube is routed on the next engine frame)
  assert.equal(s.highlight.picked, ID);
  const open = { [ID]: 10 };
  s.tubes.routeOpen(open);
  settle(s, open);
  const [o] = s.tubes.pickable();
  settle(s, open, 6);
  assert.equal(o!.ink.uniforms.hiOn.value, 1);
  assert.equal(o!.glowMesh!.visible, true);
  s.dispose();
});

test('a shunt closed and opened again: the old tube eases out, the new one is the one picked and lit', () => {
  const s = new CelScene();
  const open = { [ID]: 8 };
  s.tubes.routeOpen(open); settle(s, open);
  s.pick(ID);
  s.tubes.routeOpen({}); s.tubes.routeOpen(open);
  settle(s, open);
  const now = s.tubes.pickable();
  assert.equal(now.length, 1);
  settle(s, open, 6);
  assert.equal(now[0]!.ink.uniforms.hiOn.value, 1);
  s.dispose();
});

test('picking one custom shunt lights only it; the glow mesh is on the glow\'s own layer, not the figure\'s', () => {
  const s = new CelScene();
  const open = { [ID]: 8, [ID2]: 6 };
  s.tubes.routeOpen(open); settle(s, open);
  const [a, b] = ['' + ID, '' + ID2].map((id) => s.tubes.pickable().find((o) => o.edge!.id === id)!);
  s.pick(ID2);
  settle(s, open, 6);
  assert.equal(b!.ink.uniforms.hiOn.value, 1);
  assert.equal(a!.ink.uniforms.hiOn.value, 0);
  assert.equal(a!.glowMesh!.layers.mask, 1 << GLOW_LAYER);
  assert.notEqual(a!.glowMesh!.layers.mask, 1 << VESSEL_LAYER);
  s.dispose();
});

test('the finger\'s reach covers the custom shunts, on the body and on the map', () => {
  const s = new CelScene();
  const open = { [ID]: 8 };
  s.tubes.routeOpen(open); settle(s, open);
  const [c] = s.tubes.pickCourses();
  assert.equal(c!.id, ID);
  assert.ok(c!.map && c!.map.length > 4, 'its routed course on the map');
  assert.ok(c!.body && c!.body.pts.length > 4 && c!.body.radius > 0, 'its own course on the body (when the plate draws one)');
  const scene = sceneSource();
  assert.match(scene, /\[\.\.\.this\.vessels, \.\.\.this\.tubes\.pickable\(\)\]/, 'the ray looks at the custom tubes too');
  assert.match(scene, /for \(const c of this\.tubes\.pickCourses\(\)\) if \(c\.map\) along/, 'and so does the map\'s pick');
  s.dispose();
});

test('the shunt\'s card has its menu: Edit stent and Take down shunt (2D actions.js), and a tap on the shunt selects it as it does any vessel', () => {
  const cards = readFileSync(new URL('../src/ui/action/cards.ts', import.meta.url), 'utf8');
  assert.match(cards, /e\.shunt === 'custom'[\s\S]{0,200}stent: id/);
  assert.match(cards, /label: 'Take down shunt'[\s\S]{0,300}delete c\[id\]/);
});
