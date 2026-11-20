import test from 'node:test';
import assert from 'node:assert/strict';
import { type BufferGeometry, Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { GAP_SLOTS, GAP_X0, REACH, TRAFFIC_REACH, cellOutline } from '../src/scene/micro3d/sinusoid3d.ts';
const GAP_REACH = REACH;
import { UM } from '../src/scene/sinusoid/layout.ts';

function meshes(root: Object3D): Mesh[] { const out: Mesh[] = []; root.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); }); return out; }
const finite = (g: BufferGeometry) => { const a = g.getAttribute('position')?.array ?? []; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false; return true; };

function scene() {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true);
  flat.update(1000); flat.update(1016);
  return { flat, s3 };
}

test('the 3D sinusoid builds every part, finite: it is the only picture of the sinusoid', () => {
  const { flat, s3 } = scene();
  assert.equal(s3.update(true), true);
  assert.equal(s3.group.visible, true);
  assert.ok(!meshes(flat.group).some((m) => !m.name.startsWith('sinusoid3d/')), 'the host draws nothing of its own');
  const ms = meshes(s3.group);
  let verts = 0;
  for (const m of ms) { assert.ok(finite(m.geometry), `${m.name} has no NaN`); verts += m.geometry.getAttribute('position')?.count ?? 0; }
  for (const n of ['sinusoid3d/lumen', 'sinusoid3d/endothelium', 'sinusoid3d/hepatocytes', 'sinusoid3d/nuclei', 'sinusoid3d/kupffer', 'sinusoid3d/stellate', 'sinusoid3d/disse']) {
    const m = ms.find((x) => x.name === n);
    assert.ok(m && (m.geometry.getAttribute('position')?.count ?? 0) > 50, `${n} is built`);
  }
  assert.ok(verts < 320_000, `a phone draws it: ${verts} vertices`);   // (two sinusoids and plates beyond each side now, the outer ones coarser)
});

test('off (tests only): the 3D scene is hidden', () => {
  const { s3 } = scene();
  s3.update(true); s3.update(false);
  assert.equal(s3.group.visible, false);
});

test('a hepatocyte keeps to 2D\'s plate: between the Disse face and 20 µm in, with its cleft taken off', () => {
  const face = () => 9.2;
  const pts = cellOutline(0, 29, 1, face);
  const ys = pts.map((p) => -p[1]);
  assert.ok(Math.min(...ys) > 9.2 && Math.max(...ys) < 9.2 + UM.hep, 'inside the plate');
  assert.ok(Math.min(...ys) < 9.2 + 1 && Math.max(...ys) > 9.2 + UM.hep - 1, 'and fills it');
});

test('on, the traffic is fixed to the tissue (a camera move never slides it); off, the flat view lays its stretch for the screen again', () => {
  const { flat, s3 } = scene();
  const F = flat as unknown as { VW: { vis: [number, number] }; screen: unknown };
  flat.setScreen(8, 390, 390, 12);
  const before = [...F.VW.vis];
  s3.pinTraffic(true);
  assert.deepEqual(F.VW.vis, [-TRAFFIC_REACH, TRAFFIC_REACH]);
  flat.setScreen(8, 390, 390, 30); s3.pinTraffic(true);   // (a pan: the screen's stretch moves, the traffic's does not)
  assert.deepEqual(F.VW.vis, [-TRAFFIC_REACH, TRAFFIC_REACH]);
  s3.pinTraffic(false);
  assert.equal(F.screen, null);
  flat.setScreen(8, 390, 390, 12);
  assert.deepEqual(F.VW.vis, before);
});

test('every streaked stream carries its place across (aux) on every vertex', () => {
  const { s3 } = scene();
  s3.update(true);
  for (const n of ['sinusoid3d/lumen', 'sinusoid3d/lumen-beyond', 'sinusoid3d/disse']) {
    const m = meshes(s3.group).find((x) => x.name === n)!;
    const aux = m.geometry.getAttribute('aux'), pos = m.geometry.getAttribute('position');
    assert.ok(aux && aux.count === pos!.count, `${n}: aux on every vertex`);
  }
});

test('every triangle of every part faces the way its normals do (one wound against them is a hole of ink: the dark red cells and the X across each hepatocyte, 20 Nov)', () => {
  const { s3 } = scene();
  s3.update(true);
  const seen = new Set<BufferGeometry>();
  for (const m of meshes(s3.group)) {
    const g = m.geometry;
    if (seen.has(g)) continue; seen.add(g);
    const p = g.getAttribute('position')?.array, n = g.getAttribute('normal')?.array, ix = g.getIndex()?.array;
    if (!p || !n || !ix) continue;
    let bad = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
      const e1 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!], e2 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
      const f = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      if (f[0]! * (n[a]! + n[b]! + n[c]!) + f[1]! * (n[a + 1]! + n[b + 1]! + n[c + 1]!) + f[2]! * (n[a + 2]! + n[b + 2]! + n[c + 2]!) < 0) bad++;
    }
    assert.equal(bad, 0, `${m.name}: ${bad} triangles wound against their normals`);
  }
});

test('the next sinusoids are hazed (from past this one\'s plates outward) and the traffic runs a little faster while on, 2D\'s pace again off', () => {
  const { flat, s3 } = scene();
  s3.update(true);
  const m = meshes(s3.group).find((x) => x.name === 'sinusoid3d/lumen-beyond')!;
  const h = ((m.material as unknown as { uniforms: Record<string, { value: { x: number; y: number; z: number } }> }).uniforms.uHaze!.value);
  assert.ok(h.x > UM.lum + UM.endo + UM.disse + UM.hep * 0.5 && h.y > h.x && h.z > 0.3, `haze ${h.x}..${h.y} x${h.z}`);
  const F = flat as unknown as { trafficSpeed: number };
  assert.ok(F.trafficSpeed > 1);
  s3.update(false);
  assert.equal(F.trafficSpeed, 1);
});

test('paused, the blood stands still: the traffic stops, and the view asks for no frames for it', () => {
  const { flat, s3 } = scene();
  s3.update(true, 0);   // (the eased rate, settled at rest)
  const F = flat as unknown as { trafficSpeed: number; traffic: { flowX: number } };
  assert.equal(F.trafficSpeed, 0);
  const x0 = F.traffic.flowX;
  flat.update(2000); flat.update(2100);
  assert.equal(F.traffic.flowX, x0);
});

test('the sinusoid has streaks only, never chevrons (Mohammad 20 Nov: "sinusoids view ONLY STREAKS")', () => {
  const { s3 } = scene();
  s3.update(true);
  for (const m of meshes(s3.group)) { const u = (m.material as { uniforms?: Record<string, { value: unknown }> }).uniforms; if (u?.uProfile) assert.ok((u.uProfile.value as number) >= 0, `${m.name}: no chevrons`); }
});

test('the neighbours carry the disease more lightly: collagen in their Disse and a stellate cell each', () => {
  const { flat, s3 } = scene();
  (flat as unknown as { cur: { col: number; act: number } }).cur.col = 1; (flat as unknown as { cur: { col: number; act: number } }).cur.act = 1;
  s3.update(true);
  const fib = meshes(s3.group).find((m) => m.name === 'sinusoid3d/collagen')! as unknown as { count: number; getMatrixAt(i: number, m: Matrix4): void };
  let far = 0; const m4 = new Matrix4(); const g = (flat as unknown as { g: { hepIn(x: number): number } }).g;
  for (let i = 0; i < fib.count; i++) { fib.getMatrixAt(i, m4); const x = m4.elements[12]!, y = Math.abs(m4.elements[13]!); if (y > g.hepIn(x) + UM.hep - 1) far++; }
  assert.ok(far > 5 && far < fib.count / 2, `fewer fibres in the neighbours' Disse: ${far} of ${fib.count}`);
});

test('the focus band: nothing when the scene is off, its blur starting past this sinusoid\'s plates', () => {
  const { s3, flat } = scene();
  const a = new Vector3(), b = new Vector3(), e0 = new Vector3(), e1 = new Vector3();
  assert.equal(s3.focusBand(a, b, e0, e1), 0, 'off: no band');
  s3.update(true);
  assert.ok(s3.focusBand(a, b, e0, e1) > 0);
  const toLocal = (v: Vector3) => s3.group.worldToLocal(v.clone());
  assert.ok(Math.abs(toLocal(e0).y) > (flat as unknown as { g: { hepIn(x: number): number } }).g.hepIn(0) && Math.abs(toLocal(e1).y) > Math.abs(toLocal(e0).y));
});

test('the sinusoid never visibly ends: the scene runs well past the traffic, and the blur along it melts both ends', () => {
  assert.ok(REACH >= TRAFFIC_REACH + 40);
  const { s3 } = scene(); s3.update(true);
  const a = new Vector3(), b = new Vector3(), e0 = new Vector3(), e1 = new Vector3(), ends = { mid: new Vector3(), f0: new Vector3(), f1: new Vector3() };
  s3.focusBand(a, b, e0, e1, ends);
  const x = (v: Vector3) => Math.abs(s3.group.worldToLocal(v.clone()).x);
  assert.ok(x(ends.f0) < x(ends.f1) && x(ends.f1) < REACH - 30, 'whole before the end');
});

test('the ends\' arrows are never 3D objects in the scene: they are part of the names (SinusoidCaptions endArrow)', async () => {
  const { s3 } = scene(); s3.update(true);
  const arrows = meshes(s3.group).find((m) => m.name === 'sinusoid3d/ends')!;
  let shown = true; for (let o: Object3D | null = arrows; o; o = o.parent) if (!o.visible) { shown = false; break; }
  assert.equal(shown, false);
  const src = (await import('node:fs')).readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8');
  assert.match(src, /endArrow\(key\)/);
  // 2D's own arrow (a shaft and a head, never a text glyph), outside the name: left of the portal venule and right of the central vein on a wide screen, above and below on a tall one
  assert.doesNotMatch(src, /\\u2190|\\u2192/);
  const css = (await import('node:fs')).readFileSync('src/scene/sinusoid/names.css', 'utf8');
  for (const d of ['l', 'r', 'u', 'd']) assert.match(css, new RegExp(`\\.sv-end-arrow-${d} \\{`));
  assert.match(css, /\.sv-end-arrow-l \{ right: calc\(100% \+ 12px\)/);
  assert.match(css, /\.sv-end-arrow-d \{ top: calc\(100% \+ 13px\)/);
});

test('Pause eases the 3D sinusoid traffic to a stop and Play back up: traffic speed follows the scene\'s one eased rate, never a jump from full to 0', () => {
  const { flat, s3 } = scene();
  s3.update(true, 1); const full = flat.trafficSpeed;
  assert.ok(full > 0);
  s3.update(true, 0.5); assert.ok(Math.abs(flat.trafficSpeed - full * 0.5) < 1e-9, 'half the rate, half the pace');
  s3.update(true, 0); assert.equal(flat.trafficSpeed, 0, 'stood at rest');
  s3.update(false, 0.25); assert.ok(Math.abs(flat.trafficSpeed - 0.25) < 1e-9, 'the flat view eases too');
});

test('the fenestrae are real gaps through the lining (bead and edges cut through to Disse), not dark dots; they close as the lining capillarizes', () => {
  const { flat, s3 } = scene();
  const S = s3 as unknown as { bead: { mats: { toon: { defines: Record<string, string>; uniforms: Record<string, { value: unknown }> } } }; beadLine: { mats: { toon: { defines: Record<string, string> } } }; gapData: Uint8Array; gapKey: number; stepPores(p: number): void };
  assert.ok('GAPS' in S.bead.mats.toon.defines && 'GAPS' in S.beadLine.mats.toon.defines, 'the bead and its edge lines are cut');
  assert.ok(!meshes(s3.group).some((m) => m.name.startsWith('sinusoid3d/fenestrae')), 'no pore dots drawn over the lining');
  s3.update(true, 1);
  S.gapKey = -1; S.stepPores(1);
  const open = (d: Uint8Array) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i]! > 0) n++; return n; };
  const n1 = open(S.gapData);
  // ±200 µm of lining both sides, sieve plates of five in most stretches of ten (minus the nuclei's swells)
  assert.ok(n1 > 2 * 2 * GAP_REACH * 0.25, `healthy: many gaps (${n1})`);
  let far = 0; for (let side = 0; side < 2; side++) for (let j = 0; j < GAP_SLOTS; j++) if (Math.abs(GAP_X0 + j) > 140 && Math.abs(GAP_X0 + j) < REACH && S.gapData[(side * GAP_SLOTS + j) * 4]! > 0) far++;
  assert.ok(far > 20, `gaps run on past the flat view's 130 µm, out to the blurred ends (${far})`);
  S.stepPores(0.05);
  assert.ok(open(S.gapData) < n1 * 0.2, 'capillarized: nearly all closed');
  void flat;
});

test('Disse lies under the whole lining, so a gap shows the space of Disse, never the ground', () => {
  const { s3 } = scene();
  s3.update(true);
  const d = meshes(s3.group).find((m) => m.name === 'sinusoid3d/disse')!;
  const pos = d.geometry.getAttribute('position')!, aux = d.geometry.getAttribute('aux')!;
  assert.equal(aux.count, pos.count, 'one aux per vertex');
  let inner = Infinity; for (let i = 0; i < pos.count; i++) inner = Math.min(inner, Math.abs(pos.getY(i)));
  assert.ok(inner < UM.lum + 0.1, `Disse reaches in under the bead (${inner.toFixed(2)} µm from the axis)`);
});

test('the Kupffer cell sits on bare lining, never on top of an endothelial cell, on a wide and a tall screen (and no endothelial cells overlap each other)', async () => {
  const { xkFor } = await import('../src/scene/sinusoid/portrait.ts');
  const { KUP_CLEAR, SEED, nucAt } = await import('../src/scene/sinusoid/layout.ts');
  for (const p of [false, true]) {
    const xk = xkFor(p);
    for (let n = -6; n <= 6; n++) assert.ok(Math.abs(xk - nucAt(n, SEED.nucDn)) >= KUP_CLEAR - 1e-9, `portrait ${p}: clear of the nucleus at ${nucAt(n, SEED.nucDn).toFixed(1)} (xk ${xk.toFixed(1)})`);
  }
  for (const sd of [SEED.nucUp, SEED.nucDn]) for (let n = -8; n <= 8; n++) assert.ok(nucAt(n + 1, sd) - nucAt(n, sd) > 2 * 4.6, 'neighbouring endothelial cells never overlap');
});

test('two more sinusoids and plates lie beyond the main plates each way, and the blur starts at the middle of the first hepatocyte row and is whole by the next sinusoid', async () => {
  const { BEYOND, PERIOD, ACROSS } = await import('../src/scene/micro3d/sinusoid3d.ts');
  assert.equal(BEYOND, 2);
  assert.ok(ACROSS >= UM.lum + UM.endo + UM.disse + UM.hep + 2 * PERIOD, 'the ground reaches past the last plate');
  const { flat, s3 } = scene();
  const G = (flat as unknown as { g: { hepIn(x: number): number } }).g;
  s3.update(true);
  const far = meshes(s3.group).find((m) => m.name === 'sinusoid3d/lumen-beyond')!;
  const pos = far.geometry.getAttribute('position')!;
  let ymax = 0; for (let i = 0; i < pos.count; i++) ymax = Math.max(ymax, Math.abs(pos.getY(i)));
  assert.ok(ymax > G.hepIn(0) + UM.hep + PERIOD + UM.disse, `a second lumen beyond each side (${ymax.toFixed(1)} µm)`);
  const a = new Vector3(), b = new Vector3(), e0 = new Vector3(), e1 = new Vector3();
  s3.focusBand(a, b, e0, e1);
  const inv = new Matrix4().copy(s3.group.matrixWorld).invert();
  const y0 = Math.abs(e0.clone().applyMatrix4(inv).y), y1 = Math.abs(e1.clone().applyMatrix4(inv).y);
  assert.ok(Math.abs(y0 - (G.hepIn(0) + UM.hep * 0.5)) < 1e-6, 'sharp to the middle of the first hepatocyte row, then it begins');
  assert.ok(Math.abs(y1 - y0 - (UM.hep * 0.5 + UM.disse + UM.endo + UM.lum * 0.5)) < 1e-6, `whole by the middle of the next sinusoid (${(y1 - y0).toFixed(1)} µm)`);
});

test('the bile canaliculus is a small round lumen between each pair of hepatocytes, not a long channel down the border (Mohammad 20 Nov: "like a circle in between each hepatocyte")', () => {
  const { s3 } = scene(); s3.update(true);
  const m = meshes(s3.group).find((o) => o.name === 'sinusoid3d/canaliculi')!;
  const a = m.geometry.getAttribute('position').array;
  // group the vertices into blobs (they lie a cell apart along the plate), then each blob is as tall as it is wide
  const pts: [number, number][] = []; for (let i = 0; i < a.length; i += 3) pts.push([a[i]!, a[i + 1]!]);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const blobs: [number, number][][] = [];
  for (const p of pts) {
    const b = blobs.find((k) => Math.hypot(k[0]![0] - p[0], k[0]![1] - p[1]) < 4);
    if (b) b.push(p); else blobs.push([p]);
  }
  assert.ok(blobs.length >= 8, `a canaliculus at each border on both plates (${blobs.length})`);
  for (const b of blobs) {
    const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    assert.ok(Math.abs(w / h - 1) < 0.1, `round, not a sliver: ${w.toFixed(3)} x ${h.toFixed(3)}`);
  }
});

test('the microvilli are the hepatocyte\'s own colour with its near-black line round each one (Mohammad 20 Nov: "outline the villi")', () => {
  const { s3 } = scene(); s3.update(true);
  const ms = meshes(s3.group);
  const toon = ms.find((o) => o.name === 'sinusoid3d/microvilli')!, ink = ms.find((o) => o.name === 'sinusoid3d/microvilli/ink');
  const cells = ms.find((o) => o.name === 'sinusoid3d/hepatocytes')!, cellInk = ms.find((o) => o.name === 'sinusoid3d/hepatocytes/ink')!;
  assert.ok(ink, 'each villus is outlined');
  const u = (m: Mesh, k: string) => ((m.material as unknown as { uniforms: Record<string, { value: { toArray(): number[] } }> }).uniforms[k]!.value.toArray());
  assert.deepEqual(u(toon, 'tint'), u(cells, 'tint'), 'the hepatocyte\'s fill');
  assert.deepEqual(u(ink!, 'color'), u(cellInk, 'color'), 'the hepatocyte\'s line');
  assert.ok(Math.max(...u(cellInk, 'color')) < 0.2, 'near black');
});

test('the blur starts at the middle of the first hepatocyte row and is whole by the middle of the next sinusoid, rising fast (Mohammad 20 Nov: "start earlier and be more intense quickly")', async () => {
  const { BLUR_RUN } = await import('../src/scene/micro3d/sinusoid3d.ts');
  const { DOF_BAND_FRAC } = await import('../src/scene/post-dof.ts');
  assert.ok(Math.abs(BLUR_RUN - (UM.hep * 0.5 + UM.disse + UM.endo + UM.lum * 0.5)) < 1e-9);
  assert.ok(DOF_BAND_FRAC >= 0.02);
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/post-dof.ts', import.meta.url), 'utf8');
  assert.match(src, /k = t \* \(2\.0 - t\)/, 'eases out: most of the blur in the first half of the run');
});

test('each microvillus roots inside its cell, just under the cell\'s top face, so cell and villi read as one outlined shape (no line across a villus\'s root)', async () => {
  const { VILLUS_R, VILLUS_ROOT, Z } = await import('../src/scene/micro3d/sinusoid3d.ts');
  assert.ok(VILLUS_ROOT >= 0.4 && VILLUS_R >= 0.2);
  const { s3 } = scene(); s3.update(true);
  const v = meshes(s3.group).find((o) => o.name === 'sinusoid3d/microvilli') as unknown as { count: number; getMatrixAt(i: number, m: Matrix4): void };
  assert.ok(v.count > 50);
  const m = new Matrix4(), p = new Vector3();
  v.getMatrixAt(0, m); p.setFromMatrixPosition(m);
  assert.ok(p.z + VILLUS_R <= Z.cell && p.z + VILLUS_R > Z.cell - 0.2, `its top just under the cell's face (${(p.z + VILLUS_R).toFixed(2)})`);
});
