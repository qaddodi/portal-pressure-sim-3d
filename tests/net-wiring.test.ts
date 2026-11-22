// ?geom=net wired into the scene (WP4), node only. Needs the baked network meshes (`node scripts/bake-skins.mjs --net`, about a minute: public/anatomy/net-<n>.bin); without them the tests that need a figure skip and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { loadNetFromDisk } from '../src/scene/vessels/net/load.ts';
import { geomNet, oldShare, NET_HANDOVER_T } from '../src/scene/vessels/net/flag.ts';
import { NET_FS, NET_GLOBALS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { shaderUniforms } from '../src/scene/vessels/net/uniform-map.ts';
import { EDGE_COLUMNS } from '../src/scene/vessels/net/edge-state.ts';
import { flat } from '../src/scene/vessels/net/rows.ts';

const data = loadNetFromDisk();
const skip = data ? false : 'the baked network meshes are not in public/anatomy (node scripts/bake-skins.mjs --net)';

async function figure() {
  const scene = new CelScene({ joins: 'old' });
  await scene.attachNet(data!);
  return { scene, net: scene.netFigure! };
}

test('the flag is off by default and on only for ?geom=net', () => {
  assert.equal(geomNet(''), false); assert.equal(geomNet('?geom=old'), false); assert.equal(geomNet('?joins=old'), false);
  assert.equal(geomNet('?geom=net'), true);
});

test('the hand-over is temporary, eased, and exactly 0 at rest and 1 after the first tenth', () => {
  assert.equal(oldShare(0), 0); assert.equal(oldShare(NET_HANDOVER_T), 1); assert.equal(oldShare(0.5), 1); assert.equal(oldShare(-1), 0);
  let prev = 0; for (let t = 0; t <= NET_HANDOVER_T; t += 0.001) { const s = oldShare(t); assert.ok(s >= prev - 1e-12 && s <= 1); prev = s; }
  assert.ok(oldShare(NET_HANDOVER_T / 2) > 0.4 && oldShare(NET_HANDOVER_T / 2) < 0.6, 'a smoothstep: half-way at half');
  assert.match(NET_FS, /if \(handOld > 0\.0 && fract\(52\.9829189 \* fract\(dot\(gl_FragCoord\.xy, vec2\(0\.06711056, 0\.00583715\)\)\)\) < handOld\) discard;/, 'the complement of the old program\'s fadedOut (dither >= fade)');
  assert.ok(NET_FS.indexOf('handOld > 0.0') < NET_FS.indexOf('vec3 n = normalize(vN);'), 'before any derivative');
});

test('without the flag a scene has no network figure and its old tubes are drawn (the default is untouched)', () => {
  const scene = new CelScene({ joins: 'old' });
  assert.equal(scene.netFigure, null);
  for (const o of scene.vessels) assert.equal((o as unknown as { toon: { visible: boolean } }).toon.visible, true);
});

test('every uniform the network programs declare is supplied by the figure (shared from the old vessels, or its own)', { skip }, async () => {
  const { net } = await figure();
  const own = new Set(Object.keys(net.uniforms).concat(['regionTex', 'capTex', 'capRows']));
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
  for (const o of scene.vessels) assert.equal((o as unknown as { toon: { visible: boolean } }).toon.visible, false, 'the tubes are hidden at the body pose');
  assert.equal(net.uniforms.handOld!.value, 0);
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
  assert.ok(!VESSEL_FS.includes('handOld') && !VESSEL_VS.includes('handOld'), 'the hand-over is in the network program only; the old one holds back by its own fade');
});
