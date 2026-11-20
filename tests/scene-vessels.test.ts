import { BACK_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, JUNCTION_PIECES } from '../src/engine/hales/portal/topology.js';
import { HOSTS, VESSELS, buildVessel, vesselPoints } from '../src/scene/anatomy/vessels.ts';
import { EDGE_IDS, hasVessel, indexOf } from '../src/engine/vessel-data.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/index.ts';
import { CelScene } from '../src/scene/scene.ts';

const edges = EDGES as { id: string; from: string; to: string; d?: number }[];

test('every drawn vessel is named by a topology edge, and its ends are the engine\'s own nodes', () => {
  for (const v of VESSELS) {
    const e = edges.find((x) => x.id === v.id);
    assert.ok(e, `${v.id} is not an engine edge`);
    assert.equal(e.from, v.from, `${v.id} from`);
    assert.equal(e.to, v.to, `${v.id} to`);
    assert.ok(hasVessel(v.id));
  }
});

test('where the engine cuts a vein in pieces (a shunt joins it part-way), every piece is drawn, in order along the one centreline', () => {
  for (const host of HOSTS) {
    const pieces = (JUNCTION_PIECES as Record<string, string[]>)[host.id] ?? [host.id];
    assert.deepEqual(VESSELS.filter((v) => v.host === host.id).map((v) => v.id), pieces, host.id);
  }
  assert.ok(VESSELS.some((v) => v.id === 'PV_TRUNK_1'), 'the portal trunk is two pieces, joined where the coronary vein enters');
  const pts = (id: string) => vesselPoints(VESSELS.find((v) => v.id === id)!);
  const a = pts('PV_TRUNK_1'), b = pts('PV_TRUNK');
  assert.ok(a.at(-1)!.distanceTo(b[0]!) < 1e-6, 'pieces meet exactly');
});

test('vessel names are unique and each has its own data texel', () => {
  const ids = VESSELS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(ids.map(indexOf)).size, ids.length);
  assert.ok(ids.every((id) => EDGE_IDS.includes(id)));
});

test('centrelines run with the flow: each vessel starts where its upstream neighbour ends', () => {
  const byId = new Map(VESSELS.map((v) => [v.id, vesselPoints(v)]));
  let joins = 0;
  for (const v of VESSELS) for (const w of VESSELS) {
    if (v.to !== w.from) continue;
    const gap = byId.get(v.id)!.at(-1)!.distanceTo(byId.get(w.id)![0]!);
    assert.ok(gap < 0.05, `${v.id} end to ${w.id} start: ${gap.toFixed(3)}`);
    joins++;
  }
  assert.ok(joins >= 8, `only ${joins} joins checked`);
  // the confluence: the splenic and mesenteric veins meet the portal trunk's start
  const trunk = byId.get('PV_TRUNK_1')![0]!;
  for (const id of ['SV_CONF', 'SMV_CONF']) assert.ok(byId.get(id)!.at(-1)!.distanceTo(trunk) < 0.05, id);
  // the coronary vein joins the trunk part-way along it, not at its start
  const lgv = byId.get('LGV_CONF')!.at(-1)!;
  assert.ok(lgv.distanceTo(trunk) > 0.2);
  assert.ok(lgv.distanceTo(byId.get('PV_TRUNK')![0]!) < 0.05);
});

test('a vessel is one geometry with uv.x along the flow from 0 to 1 and a tangent per vertex', () => {
  const g = buildVessel(VESSELS[0]!).geometry;
  const uv = g.attributes.uv!;
  let min = 1, max = 0;
  for (let i = 0; i < uv.count; i++) { min = Math.min(min, uv.getX(i)); max = Math.max(max, uv.getX(i)); }
  assert.ok(min <= 0.001 && max >= 0.999);
  assert.equal(g.attributes.tang!.count, g.attributes.position!.count);
});

// 55 vessels at one draw each (the outline is part of the tube: one mesh, one material) plus the organs.
test('the scene stays inside the draw-call budget (spec: under 100)', () => {
  const s = new CelScene();
  let meshes = 0;
  s.scene.traverseVisible((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });   // (the lobule and sinusoid views are hidden until chosen and draw nothing)
  assert.ok(meshes < 100, `${meshes} draw calls`);
  s.setView('lobule'); s.setView('body');
  s.dispose();
});

test('a vessel is one draw: body and ink share one mesh and one material (a vessel behind the organs has its copy over the organs as a second mesh, b3-veil.test.ts)', () => {
  const s = new CelScene();
  for (const o of s.vessels) {
    let n = 0;
    o.group.traverse((c) => { if ((c as { isMesh?: boolean }).isMesh) n++; });
    assert.equal(n, BACK_EDGES.has(o.edge!.id) ? 2 : 1, o.edge!.id);
    assert.equal(o.toonMesh.geometry.getAttribute('hull'), undefined, 'no hull copy');
    assert.ok(!Array.isArray(o.toonMesh.material), 'one material');
    // the highlight's handle on the ink writes the merged material's own uniforms
    assert.equal(o.ink.uniforms.hiOn, o.toon.uniforms.hiOn);
    assert.equal(o.ink.uniforms.inflate, o.toon.uniforms.inflate);
  }
  s.dispose();
});

test('every vessel object knows its edge and its data texel', () => {
  const s = new CelScene();
  for (const o of s.vessels) assert.equal(o.toon.uniforms.vindex.value, indexOf((NETWORK_BY_ID.get(o.edge!.id)?.lensId ?? o.edge!.id)));
  s.dispose();
});

test('the figure\'s views: the new one shows at once, the one left behind is hidden when the camera has landed (nothing pops)', () => {
  const s = new CelScene();
  const room = { x: 0, y: 0, w: 1000, h: 700 };
  s.resize(1000, 700);
  s.goTo('play', room, 0);   // (the first shot with a room puts the camera there at once)
  const drawn = () => { let n = 0; s.scene.traverseVisible((o) => { if ((o as { isMesh?: boolean }).isMesh) n++; }); return n; };
  s.update(10);
  const body = drawn();
  s.setView('lobule');
  assert.ok(s.lobule.isVisible && drawn() > body, 'the lobule is up and the body still drawn while the camera flies');
  s.goTo(lobuleShot('lobule'), room, 100, 0);
  s.update(110);
  assert.ok(s.lobule.isVisible && !s.sinus.isVisible);
  assert.equal(s.bodyShown, 0, 'inside the liver the body has dissolved');
  assert.ok(drawn() < body, 'landed: only the lobule is drawn');
  s.setView('sinusoid'); s.goTo(sinusoidShot(), room, 200, 0); s.update(210);
  assert.ok(s.sinus.isVisible && !s.lobule.isVisible);
  s.setView('body'); assert.ok(drawn() > 0);
  s.goTo('play', room, 300, 0); s.update(310);
  assert.equal(s.bodyShown, 1);
  assert.equal(drawn(), body, 'back on the body, as it was');
  s.dispose();
});
