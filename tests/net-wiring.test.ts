// ?geom=net wired into the scene (WP4), node only. Needs the baked network meshes (`node scripts/bake-skins.mjs --net`, about a minute: public/anatomy/net-<n>.bin); without them the tests that need a figure skip and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { loadNetFromDisk } from '../src/scene/vessels/net/load.ts';
import { geomNet } from '../src/scene/vessels/net/flag.ts';
import { NET_FS, NET_GLOBALS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { shaderUniforms } from '../src/scene/vessels/net/uniform-map.ts';
import { EDGE_COLUMNS } from '../src/scene/vessels/net/edge-state.ts';
import { flat } from '../src/scene/vessels/net/rows.ts';

const data = loadNetFromDisk();
const skip = data ? false : 'the baked network meshes are not in public/anatomy (node scripts/bake-skins.mjs --net)';

async function figure() {
  const scene = new CelScene({ joins: 'old' });
  await scene.attachNet(data!, true);
  return { scene, net: scene.netFigure! };
}

test('the flag is off by default and on only for ?geom=net', () => {
  assert.equal(geomNet(''), false); assert.equal(geomNet('?geom=old'), false); assert.equal(geomNet('?joins=old'), false);
  assert.equal(geomNet('?geom=net'), true); assert.equal(geomNet('?geom=netplain'), true);
});

test('no hand-over to the old figure is left: the network program has no handOld and the flag file no oldShare', async () => {
  assert.ok(!NET_FS.includes('handOld'));
  assert.equal('oldShare' in (await import('../src/scene/vessels/net/flag.ts')), false);
});

test('without the flag a scene has no network figure and its old tubes are drawn (the default is untouched)', () => {
  const scene = new CelScene({ joins: 'old' });
  assert.equal(scene.netFigure, null);
  for (const o of scene.vessels) assert.equal((o as unknown as { toon: { visible: boolean } }).toon.visible, true);
});

test('every uniform the network programs declare is supplied by the figure (shared from the old vessels, or its own)', { skip }, async () => {
  const { net } = await figure();
  const own = new Set(Object.keys(net.uniforms).concat(['regionTex', 'capTex', 'capRows', 'keyTex', 'juncGeom', 'juncOn']));
  const declared = new Set([...shaderUniforms(NET_VS), ...shaderUniforms(NET_FS)]);
  const BUILTIN = new Set(['projectionMatrix', 'modelViewMatrix', 'normalMatrix']);
  const dbg = (n: string): boolean => n.startsWith('dbg');   // (the inspector's: present only with ?inspect)
  const missing = [...declared].filter((n) => !own.has(n) && !BUILTIN.has(n) && !dbg(n) && !EDGE_COLUMNS.some((c) => c.name === n));
  assert.deepEqual(missing, [], `declared by the shaders, supplied by nothing: ${missing.join(', ')}`);
  const unnamed = Object.keys(NET_GLOBALS).filter((n) => !own.has(n) && !dbg(n));
  assert.deepEqual(unnamed, [], `NET_GLOBALS the figure does not supply: ${unnamed.join(', ')}`);
});

test('the figure is at most 12 vessel draws and the old tubes are not drawn while it holds the picture', { skip }, async () => {
  const { scene, net } = await figure();
  assert.ok(net.drawCalls <= 12, `${net.drawCalls} draws`);
  scene.update(16);
  const edgeIds = new Set(data!.skel.edges.map((e) => e.id.split('#')[0]!));
  let hidden = 0, kept = 0;
  for (const o of scene.vessels) {
    const id = o.edge?.id ?? '', tube = (o as unknown as { toon: { visible: boolean } }).toon;
    if (edgeIds.has(id)) { assert.equal(tube.visible, false, `${id} is a skeleton edge: the network draws it, its tube is hidden`); hidden++; }
    else { assert.equal(tube.visible, true, `${id} is not in the skeleton (fans, liver branches, caudate veins, the splenic tree): it keeps drawing as today`); kept++; }
  }
  assert.ok(hidden > 50 && kept > 0, `${hidden} hidden, ${kept} kept: both kinds exist`);
});

test('the old fade follows the same rule: 0 for a vessel the network draws, untouched for one it does not', { skip }, async () => {
  const { scene } = await figure();
  const edgeIds = new Set(data!.skel.edges.map((e) => e.id.split('#')[0]!));
  for (const o of scene.vessels) assert.equal(scene.netDraws(o), edgeIds.has(o.edge?.id ?? ''), o.edge?.id ?? '');
});

test('every edge row equals its vessel\'s uniforms, column by column (whole vessels exactly)', { skip }, async () => {
  const { scene, net } = await figure();
  scene.update(16);
  const bad: string[] = [];
  net.skel.edges.forEach((e, row) => {
    const { id, h0, h1 } = net.rows.vessels[row]!;
    if (h0 !== 0 || h1 !== 1) return;
    const u = scene.vesselObject(id)!.toon.uniforms;
    for (const c of EDGE_COLUMNS) {
      if (!c.uniform || !u[c.uniform] || ['fade', 'solidK', 'veilK'].includes(c.name)) continue;
      const f = flat(u[c.uniform]!.value);
      if (!f || f.length !== c.size) continue;
      const got = net.state.get(row, c.name);
      if (got.some((x, i) => Math.abs(x - f[i]!) > 1e-5 * Math.max(1, Math.abs(f[i]!)))) bad.push(`${e.id}.${c.name}: ${got} vs ${f}`);
    }
  });
  assert.deepEqual(bad.slice(0, 5), []);
});

test('junction texel reads per drawn frame, over every copy and the two passes, stay within 1.5 M at every t (the real mesh, bone by bone)', { skip }, async () => {
  const { frameReadsAt, EDGE_ROW_TEXELS } = await import('../src/scene/vessels/net/reads.ts');
  const { net } = await figure();
  const env = { skel: net.skel };
  assert.ok(EDGE_ROW_TEXELS > 0);
  let worst = { total: 0, t: 0, vertices: 0, drawn: 0, passes: 0, byDraw: [] as { name: string; reads: number }[] };
  for (let t = 0; t <= 1.0001; t += 0.05) { const r = frameReadsAt(env, net.draws, t); if (r.total > worst.total) worst = { ...r, t }; }
  console.log(`junction texel reads, worst frame (t ${worst.t.toFixed(2)}): ${worst.total} (${worst.vertices} vertex runs, ${worst.drawn} drawn, passes ${worst.passes}); by draw ${worst.byDraw.map((d) => `${d.name} ${d.reads}`).join(', ')}`);
  assert.ok(worst.total <= 1.5e6, `${worst.total} reads in one drawn frame (bound 1.5 M)`);
});

test('the organs-pass copy holds only the triangles of back vessels, and every vessel is in the vessel-pass copy', { skip }, async () => {
  const { net } = await figure();
  for (const d of net.draws) {
    const full = d.triangles;
    assert.ok(d.organsTriangles <= full);
    assert.ok(d.meshes.some((m) => m.name.endsWith(':vessels')), `${d.name} has a vessel-pass copy`);
  }
  assert.ok(net.draws.some((d) => d.organsTriangles > 0), 'the cava and the other back vessels have an organs-pass copy');
  assert.ok(net.draws.find((d) => d.name === 'loose')!.regions.length === 0);
});

test('the old shaders are untouched: the figure adds no define or uniform to the tubes\' or the skins\' programs', async () => {
  const { VESSEL_FS, VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  assert.ok(!VESSEL_FS.includes('handOld') && !VESSEL_VS.includes('handOld'), 'the network program\'s own uniforms stay out of the old one');
});

test('a split host\'s pieces run on one arc: each piece starts where the one before ends, the chevrons, dust and dashes read that arc, a whole vessel is untouched', { skip }, async () => {
  const { net } = await figure();
  const sk = data!.skel, rows = net.rows, ve = rows.vessels;
  assert.ok(NET_FS.includes('float arcS = vUv.x * len + arcHost.x;') && NET_FS.includes('flowHeads(across, acrossW, arcS * vU, lenH * vU,') && NET_FS.includes('sD = arcS * vU'), 'every phase reads the host arc (the end caps stay piece-local: circCap is remapped per piece)');
  const byId = new Map<string, number[]>();
  sk.edges.forEach((e, row) => { const id = e.id.split('#')[0]!; byId.set(id, [...(byId.get(id) ?? []), row]); });
  let split = 0;
  for (const [id, list] of byId) {
    if (list.length < 2) { assert.deepEqual([...net.state.get(list[0]!, 'arcHost')], [0, 0], `${id}: a whole vessel keeps the default`); continue; }
    split++;
    const host = ve[list[0]!]!, hostLen = net.state.get(list[0]!, 'arcHost')[1]!;
    assert.ok(hostLen > 0, `${id}: the host's length is written`);
    let at = 0;
    list.forEach((row, i) => {
      const a = net.state.get(row, 'arcHost'), len = net.state.get(row, 'len')[0]!;
      assert.ok(Math.abs(a[1]! - hostLen) < 1e-6 * hostLen, `${id}#${i}: one host length`);
      if (i > 0) assert.ok(Math.abs(a[0]! - at) < 1e-5 * hostLen, `${id}#${i}: starts at ${at}, has ${a[0]}`);
      else assert.ok(Math.abs(a[0]!) < 1e-9 || host.h0 === 0, `${id}: the first piece starts the arc`);
      at = a[0]! + len;
    });
    assert.ok(Math.abs(at - hostLen) < 1e-4 * hostLen, `${id}: the pieces end where the host does (${at} vs ${hostLen})`);
  }
  assert.ok(split >= 5, `${split} split hosts`);
});

test('the Circuit at t = 1, default state: every skeleton edge that has a map course is whole in the rows (present, opaque, revealed, a radius), the hepatic-vein lanes among them', { skip }, async () => {
  const { scene, net } = await figure();
  scene.resize(800, 600);
  scene.setCircuitUpright(false, 0);
  scene.setView('circuit', 0);
  scene.goTo('play', { x: 0, y: 40, w: 800, h: 520 }, 0, 0);
  scene.update(0);
  for (let k = 1; k <= 40; k++) { scene.update(k * 80); scene.stepNet(); }   // (the change plays frame by frame, as on a device)
  assert.equal(scene.circuit.t, 1);
  const lanes = ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_R_MHV', 'POST_L_LHV'];
  const bad: string[] = [];
  data!.skel.edges.forEach((e, row) => {
    const get = (n: string): number[] => net.state.get(row, n), id = e.id.split('#')[0]!;
    if (get('noMap')[0] === 1) { assert.ok(!lanes.includes(id), `${id} is a lane: it has a map course`); return; }
    const [first, count] = e.bones, circW = get('circW'), mapBase = get('mapBase')[0]!;
    const wc = Math.max(circW[2]!, circW[0]! >= 0 ? circW[0]! : 6), swell = (0.5 * Math.max(wc, circW[3]!) * 0.0065) / Math.max(mapBase, 1e-6);
    let rmin = Infinity;
    for (let k = 0; k < count; k++) rmin = Math.min(rmin, data!.skel.bones[first + k]!.r[1] * swell * get('liveW')[0]! * get('presence')[0]!);
    const why = [get('presence')[0]! > 0 ? '' : 'presence 0', get('fade')[0]! > 0.004 ? '' : 'fade 0', get('reveal')[0]! > 0 ? '' : 'reveal 0', rmin > 0 ? '' : 'radius 0'].filter(Boolean);
    if (why.length) bad.push(`${e.id}: ${why.join(', ')}`);
  });
  assert.deepEqual(bad, [], 'drawn at the map pose by no column');
  for (const id of lanes) {
    const row = data!.skel.edges.findIndex((x) => x.id === id);
    assert.ok(row >= 0, `${id} is a skeleton edge`);
    assert.equal(net.state.get(row, 'presence')[0], 1, `${id} present`);
  }
});
