// The organs' shade edge was saw-toothed (Mohammad, 22 Nov, "how is this smoothed?"): the cel shade is cut by the interpolated normal, and across the rim strip (where a pillow stands up vertical and flattens within a
// few units) the triangles' rows are not equally far from the rim, so the crescent's edge followed the triangles. The strip now takes its tilt from the organ's profile at the pixel's interpolated distance to the rim
// (rim-profile.ts; organ-shader.ts rimShadeNormal). Pinned: the distance is exact, the profile is measured and monotone, the baked file carries it, the shader uses it, and on a jittered mesh the crescent's edge is straight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { prepareOrgans } from '../src/scene/organs/prepare.ts';
import { rimDistance, silhouetteRing, weld } from '../src/scene/organs/contour.ts';
import { SMOOTH_SHADE } from '../src/scene/organs/layer.ts';
import { RIM_KNOTS, RIM_SPECK, RIM_ZONE, fitRimProfile, rimProfileAt, rimShadeNormal } from '../src/scene/organs/rim-profile.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { decodeOrgans, encodeOrgans } from '../src/scene/organs/baked.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const made = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });

test('rimDistance is the true distance to the silhouette: on a disc, the radius to the rim', () => {
  const N = 48, pos: number[] = [0, 0, 0.1, 0, 0, -0.1], idx: number[] = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI; pos.push(Math.cos(a), Math.sin(a), 0); }
  for (let r = 1; r <= 3; r++) for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI; pos.push((1 - r * 0.2) * Math.cos(a), (1 - r * 0.2) * Math.sin(a), 0.1 * (1 - (1 - r * 0.2))); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  for (let k = 0; k < N; k++) { const a = 2 + k, b = 2 + ((k + 1) % N); idx.push(0, a, b, 1, b, a); }
  g.setIndex(idx);
  const d = rimDistance(g, 0.5);
  for (let k = 0; k < N; k++) assert.ok(d[2 + k]! < 1e-6, 'a rim vertex is at 0');
  assert.ok(Math.abs(d[0]! - 0.5) < 1e-6, 'far from the rim: the cap');
});

test('the profile: eight knots, monotone, in range; the JS twin of the shader leaves the normal alone with w 0 or past the strip', () => {
  const d = Array.from({ length: 200 }, (_, i) => (i / 200) * RIM_ZONE), nz = d.map((x) => x / (x + 0.01));
  const p = fitRimProfile(d, nz);
  assert.equal(p.length, RIM_KNOTS);
  for (let i = 1; i < p.length; i++) assert.ok(p[i]! >= p[i - 1]! && p[i]! <= 1);
  assert.ok(Math.abs(rimProfileAt(p, 0.5) - 0.015 / 0.025) < 0.08, 'tracks the curve');
  const n: [number, number, number] = [0.6, 0, 0.8];
  assert.deepEqual(rimShadeNormal(n, 0.2, 0, p, 0), n);
  const far = rimShadeNormal(n, 1, 0, p, 1);
  assert.ok(Math.hypot(far[0] - n[0], far[1] - n[1], far[2] - n[2]) < 1e-6, 'beyond the strip the interpolated normal rules');
});

test('every organ has the strip: rimD and rimC bytes, an eight-point profile, and the baked file holds them exactly', () => {
  for (const [id, g] of made) {
    const rd = g.getAttribute('rimD'), rc = g.getAttribute('rimC'), pr = g.userData.rimProfile as number[];
    assert.ok(rd && rc && rd.count === g.getAttribute('position').count && rc.count === rd.count, `${id}: attributes`);
    assert.equal(pr.length, RIM_KNOTS, `${id}: profile`);
    assert.ok(Math.min(...Array.from(rd.array)) >= 0 && Math.max(...Array.from(rd.array)) <= 1);
  }
  const bytes = encodeOrgans(made, 'x'), back = decodeOrgans(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!;
  for (let k = 0; k < made.length; k++) {
    const a = made[k]![1], b = back.organs[k]![1];
    for (const key of ['rimD', 'rimC']) assert.deepEqual(Array.from(b.getAttribute(key).array), Array.from(a.getAttribute(key).array), `${made[k]![0]} ${key}`);
    assert.deepEqual(b.userData.rimProfile, a.userData.rimProfile);
  }
});

test('the shader takes the shade normal from the strip once, and every shade term reads it (the world normal, never a second one)', () => {
  assert.match(ORGAN_VS, /attribute float rimD;/);
  assert.match(ORGAN_VS, /vRimS = rimD;/);
  assert.match(ORGAN_FS, /vec3 rimShadeNormal\(vec3 n\)/);
  assert.equal((ORGAN_FS.match(/normalize\(vNw\)/g) ?? []).length, 1, 'normalize(vNw) once: the strip reads it');
  assert.match(ORGAN_FS, /float turn = 1\.0 - clamp\(nws\.z, 0\.0, 1\.0\);/);
  assert.match(ORGAN_FS, /vec3 nw = nws;/);
  assert.match(ORGAN_FS, /float lam = dot\(nws, LIGHT\);/);
});

test('on a mesh whose rows are unequally far from the rim, the crescent edge is straight with the strip and saw-toothed without', () => {
  // a disc pillow: a rim ring, then rows at distances 0.03 k plus a jitter per vertex; normals from the true tilt at each vertex's own distance
  const nzAt = (d: number) => d / (d + 0.02), prof = fitRimProfile(Array.from({ length: 400 }, (_, i) => (i / 400) * RIM_ZONE), Array.from({ length: 400 }, (_, i) => nzAt((i / 400) * RIM_ZONE)));
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const A = 60, rows = [0, 0.03, 0.06, 0.09].map((d, r) => Array.from({ length: A }, () => (r === 0 ? 0 : d + (rnd() - 0.5) * 0.02)));
  const vert = (r: number, k: number) => { const a = (k % A) / A * 2 * Math.PI, rad = 1 - rows[r]![k % A]!; return { x: rad * Math.cos(a), y: rad * Math.sin(a), d: rows[r]![k % A]!, a }; };
  const normalOf = (v: { d: number; a: number }): [number, number, number] => { const z = nzAt(v.d), h = Math.sqrt(1 - z * z); return [-h * Math.cos(v.a) * -1, -h * Math.sin(v.a) * -1, z]; };
  const tris: number[][] = [];
  for (let r = 0; r < 3; r++) for (let k = 0; k < A; k++) { const k1 = k + 1; tris.push([r, k, r + 1, k, r, k1], [r, k1, r + 1, k, r + 1, k1]); }   // [r0,k0, r1,k1, r2,k2]
  const field = (px: number, py: number, strip: boolean): number | null => {
    for (const t of tris) {
      const v = [vert(t[0]!, t[1]!), vert(t[2]!, t[3]!), vert(t[4]!, t[5]!)], den = (v[1]!.y - v[2]!.y) * (v[0]!.x - v[2]!.x) + (v[2]!.x - v[1]!.x) * (v[0]!.y - v[2]!.y);
      const l0 = ((v[1]!.y - v[2]!.y) * (px - v[2]!.x) + (v[2]!.x - v[1]!.x) * (py - v[2]!.y)) / den, l1 = ((v[2]!.y - v[0]!.y) * (px - v[2]!.x) + (v[0]!.x - v[2]!.x) * (py - v[2]!.y)) / den, l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const ns = v.map(normalOf), n = [0, 1, 2].map((c) => l0 * ns[0]![c]! + l1 * ns[1]![c]! + l2 * ns[2]![c]!), l = Math.hypot(n[0]!, n[1]!, n[2]!), u: [number, number, number] = [n[0]! / l, n[1]! / l, n[2]! / l];
      const s = (l0 * v[0]!.d + l1 * v[1]!.d + l2 * v[2]!.d) / RIM_ZONE;
      return strip ? rimShadeNormal(u, s, 0, prof, 1)[2] : u[2];
    }
    return null;
  };
  const edge = (strip: boolean): number => {   // the distance from the rim where nz crosses 0.5, round the rim: its spread
    const ds: number[] = [];
    for (let a = 0; a < 360; a += 1.7) {
      const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
      for (let d = 0.004; d < 0.085; d += 0.0004) { const f = field((1 - d) * c, (1 - d) * s, strip); if (f !== null && f > 0.5) { ds.push(d); break; } }
    }
    const m = ds.reduce((x, y) => x + y, 0) / ds.length;
    return Math.sqrt(ds.reduce((x, y) => x + (y - m) ** 2, 0) / ds.length);
  };
  const raw = edge(false), withStrip = edge(true);
  assert.ok(raw > 0.0015, `the interpolated normal's crescent edge wobbles round the rim (${raw.toFixed(4)})`);
  assert.ok(withStrip < raw / 3, `with the strip it is straight (${withStrip.toFixed(4)} against ${raw.toFixed(4)})`);
});

// ---- the speck guard ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The strip takes the direction round the rim from n.xy / |n.xy|. Where the normal nearly faces the eye that direction is noise (it can swing 180 degrees in a pixel), and the strip would paint a speck. The strip's share fades
// in with |n.xy| from RIM_SPECK[0] to RIM_SPECK[1]. Sampled the way the GPU does: every front triangle of the strip, the interpolated shade normal (the smoothed one for the organs that use it, their own otherwise), the interpolated
// distance and offset, taken on a grid one pixel apart (PX scene units: the figure is about 2 units across, so 0.001 is a pixel of a 2000 px figure, finer than any screen the app runs on at its figure size).
const PX = 0.001;
const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** What the twin did before the guard (the strip at full share wherever the zone allows): the control that shows the test bites. */
function unguarded(n: readonly number[], s: number, c: number, prof: readonly number[], w: number): number[] {
  const zone = 1 - smoothstep(0.75, 1, s), hl = Math.hypot(n[0]!, n[1]!), nzP = Math.min(1, Math.max(0, rimProfileAt(prof, s) + c)), k = zone * w, sin = Math.sqrt(Math.max(0, 1 - nzP * nzP));
  const x = n[0]! + ((hl > 1e-4 ? n[0]! / hl : 0) * sin - n[0]!) * k, y = n[1]! + ((hl > 1e-4 ? n[1]! / hl : 0) * sin - n[1]!) * k, z = n[2]! + (nzP - n[2]!) * k, l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
/** The biggest change of the strip's normal between two samples one pixel apart (in x or in y), over the pairs where both samples are inside the speck window (|n.xy| below RIM_SPECK[1]) and the interpolated INPUT normal itself
 *  moves by less than `calm` (so a change in the output is the strip's own doing, not the mesh's). */
function speckJump(g: BufferGeometry, id: string, twin: (n: number[], s: number, c: number, prof: number[], w: number) => readonly number[], calm = 0.03): { worst: number; pairs: number } {
  const pos = g.getAttribute('position'), idx = g.index!.array, N = g.getAttribute(SMOOTH_SHADE.has(id) ? 'shadeN' : 'normal'), rd = g.getAttribute('rimD'), rc = g.getAttribute('rimC'), prof = g.userData.rimProfile as number[];
  let worst = 0, pairs = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const v = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    if (Math.min(rd.getX(v[0]!), rd.getX(v[1]!), rd.getX(v[2]!)) >= 1) continue;
    const P = v.map((i) => [pos.getX(i), pos.getY(i)] as const), den = (P[1]![1] - P[2]![1]) * (P[0]![0] - P[2]![0]) + (P[2]![0] - P[1]![0]) * (P[0]![1] - P[2]![1]);
    if (den <= 0) continue;   // (the back faces are never drawn)
    const at = (x: number, y: number) => {
      const l0 = ((P[1]![1] - P[2]![1]) * (x - P[2]![0]) + (P[2]![0] - P[1]![0]) * (y - P[2]![1])) / den, l1 = ((P[2]![1] - P[0]![1]) * (x - P[2]![0]) + (P[0]![0] - P[2]![0]) * (y - P[2]![1])) / den, L = [l0, l1, 1 - l0 - l1];
      if (L.some((q) => q < 0)) return null;
      const n = [0, 1, 2].map((c) => L[0]! * N.getComponent(v[0]!, c) + L[1]! * N.getComponent(v[1]!, c) + L[2]! * N.getComponent(v[2]!, c)), l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, u = n.map((q) => q / l);
      return { u, s: L[0]! * rd.getX(v[0]!) + L[1]! * rd.getX(v[1]!) + L[2]! * rd.getX(v[2]!), c: L[0]! * rc.getX(v[0]!) + L[1]! * rc.getX(v[1]!) + L[2]! * rc.getX(v[2]!) - 0.5 };
    };
    for (let x = Math.min(P[0]![0], P[1]![0], P[2]![0]); x <= Math.max(P[0]![0], P[1]![0], P[2]![0]); x += PX) for (let y = Math.min(P[0]![1], P[1]![1], P[2]![1]); y <= Math.max(P[0]![1], P[1]![1], P[2]![1]); y += PX) {
      const a = at(x, y); if (!a || Math.hypot(a.u[0]!, a.u[1]!) >= RIM_SPECK[1]) continue;
      for (const [dx, dy] of [[PX, 0], [0, PX]] as const) {
        const b = at(x + dx, y + dy); if (!b || Math.hypot(b.u[0]!, b.u[1]!) >= RIM_SPECK[1]) continue;
        if (Math.hypot(a.u[0]! - b.u[0]!, a.u[1]! - b.u[1]!, a.u[2]! - b.u[2]!) > calm) continue;
        const p = twin(a.u, a.s, a.c, prof, 1), q = twin(b.u, b.s, b.c, prof, 1);
        worst = Math.max(worst, Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!)); pairs++;
      }
    }
  }
  return { worst, pairs };
}

test('the speck guard: both twins share its constants, the shader reads them, and the GLSL multiplies the strip by it', () => {
  assert.ok(RIM_SPECK[0] > 0 && RIM_SPECK[0] < RIM_SPECK[1] && RIM_SPECK[1] <= 0.3);
  const n: [number, number, number] = [0.05, 0, Math.sqrt(1 - 0.0025)], prof = new Array(RIM_KNOTS).fill(0.2);
  assert.deepEqual(rimShadeNormal(n, 0.2, 0, prof, 1).map((v) => +v.toFixed(6)), n.map((v) => +v.toFixed(6)), 'below the window the interpolated normal rules, whatever the strip says');
  assert.match(ORGAN_FS, new RegExp(`\\* rimW \\* smoothstep\\(${RIM_SPECK[0]}, ${RIM_SPECK[1]}, hl\\);`));
  assert.ok(ORGAN_FS.indexOf('float hl = length(n.xy);') < ORGAN_FS.indexOf('* rimW * smoothstep('), 'hl is read before the strip uses it');
});

test('every baked organ: where the shade normal nearly faces the eye, the strip moves its normal by less than 0.15 between samples one pixel apart (and without the guard it does not)', () => {
  let unguardedWorst = 0;
  for (const [id, g] of made) {
    const guarded = speckJump(g, id, (n, s, c, p, w) => rimShadeNormal(n as [number, number, number], s, c, p, w)), bare = speckJump(g, id, unguarded);
    assert.ok(guarded.worst < 0.15, `${id}: the strip's normal moves ${guarded.worst.toFixed(3)} in a pixel over ${guarded.pairs} samples`);
    unguardedWorst = Math.max(unguardedWorst, bare.worst);
  }
  assert.ok(unguardedWorst > 0.5, `the unguarded strip does swing (${unguardedWorst.toFixed(3)}), so this test has teeth`);
});

// ---- false rims -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// silhouetteRing marks every place the mesh turns from facing the eye to facing away. In a folded organ that would include folds INSIDE the outline, where more surface lies beyond, and a strip grown from one would paint a false crescent
// inside the organ. A ring segment is OUTER when the plane just past it holds no triangle on at least one side; an inner fold has surface on both.
function ringReport(g: BufferGeometry): { pieces: { n: number; closed: boolean }[]; inner: number } {
  const w = weld(g), ring = silhouetteRing(g, w), pos = g.getAttribute('position'), at = (v: number): [number, number] => { const i = w.verts[v]![0]!; return [pos.getX(i), pos.getY(i)]; };
  const segs: [number, number][] = [];
  for (const [u, [a, b]] of ring) for (const v of [a, b]) if (u < v || !ring.get(v)?.includes(u)) segs.push([u, v]);
  const adj = new Map<number, number[]>(), seen = new Set<number>(), pieces: { n: number; closed: boolean }[] = [];
  for (const [u, v] of segs) { (adj.get(u) ?? adj.set(u, []).get(u)!).push(v); (adj.get(v) ?? adj.set(v, []).get(v)!).push(u); }
  for (const v0 of adj.keys()) {
    if (seen.has(v0)) continue;
    const st = [v0]; seen.add(v0); let n = 0, closed = true;
    while (st.length) { const u = st.pop()!; n++; const l = adj.get(u)!; if (l.length !== 2) closed = false; for (const x of l) if (!seen.has(x)) { seen.add(x); st.push(x); } }
    pieces.push({ n, closed });
  }
  const CELL = 0.02, cells = new Map<string, number[]>(), cell = (x: number) => Math.floor(x / CELL), tri: number[][] = [];
  for (let t = 0; t < w.tris.length; t += 3) {
    const a = at(w.tris[t]!), b = at(w.tris[t + 1]!), c = at(w.tris[t + 2]!), k = tri.length;
    tri.push([...a, ...b, ...c]);
    for (let cx = cell(Math.min(a[0], b[0], c[0])); cx <= cell(Math.max(a[0], b[0], c[0])); cx++) for (let cy = cell(Math.min(a[1], b[1], c[1])); cy <= cell(Math.max(a[1], b[1], c[1])); cy++) (cells.get(`${cx},${cy}`) ?? cells.set(`${cx},${cy}`, []).get(`${cx},${cy}`)!).push(k);
  }
  const covered = (x: number, y: number): boolean => (cells.get(`${cell(x)},${cell(y)}`) ?? []).some((k) => {
    const [ax, ay, bx, by, cx, cy] = tri[k]!, d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) return false;
    const l0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    return l0 >= 0 && l1 >= 0 && l0 + l1 <= 1;
  });
  let inner = 0;
  for (const [u, v] of segs) {
    const p = at(u), q = at(v), l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l < 1e-9) continue;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, nx = (-(q[1] - p[1]) / l) * 0.0015, ny = ((q[0] - p[0]) / l) * 0.0015;
    if (covered(mx + nx, my + ny) && covered(mx - nx, my - ny)) inner++;
  }
  return { pieces: pieces.sort((a, b) => b.n - a.n), inner };
}

test('the helper finds an inner fold: a pillow lying over a larger one has its own outline inside the first', () => {
  const disc = (cx: number, r: number, z: number): [number[], number[]] => {
    const N = 24, pos: number[] = [cx, 0, z + 0.1, cx, 0, z - 0.1], idx: number[] = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI; pos.push(cx + r * Math.cos(a), r * Math.sin(a), z); }
    for (let k = 0; k < N; k++) { const a = 2 + k, b = 2 + ((k + 1) % N); idx.push(0, a, b, 1, b, a); }
    return [pos, idx];
  };
  const [pa, ia] = disc(0, 1, 0), [pb, ib] = disc(0.1, 0.3, 0.05), g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...pa, ...pb], 3)); g.setIndex([...ia, ...ib.map((v) => v + pa.length / 3)]);
  const r = ringReport(g);
  assert.equal(r.pieces.length, 2, 'two rings');
  assert.equal(r.inner, r.pieces[1]!.n, 'the small one lies inside the large one: all its segments are inner folds');
});

test('every baked organ has one silhouette ring and no inner fold in it (a fold would grow a false rim crescent)', () => {
  // the ring is one closed loop for these; the small bowel, the duodenum and the caudate lobe are pinched (a silhouette vertex where the ring branches), so their one piece is not closed: pinned, not a loop of its own
  const PINCHED = new Set(['bowel', 'duodenum', 'caudate']);
  for (const [id, g] of made) {
    const r = ringReport(g);
    assert.equal(r.pieces.length, 1, `${id}: ${r.pieces.length} separate rings (${r.pieces.slice(0, 5).map((p) => p.n).join(', ')}): restrict the strip's ring (contour.ts rimDistance) to the outer one`);
    assert.equal(r.pieces[0]!.closed, !PINCHED.has(id), `${id}: ring ${r.pieces[0]!.closed ? 'is' : 'is not'} one closed loop`);
    assert.equal(r.inner, 0, `${id}: ${r.inner} ring segments are folds inside the outline (surface beyond them on both sides)`);
  }
});
