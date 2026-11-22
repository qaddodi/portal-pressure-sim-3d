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
import { rimDistance } from '../src/scene/organs/contour.ts';
import { RIM_KNOTS, RIM_ZONE, fitRimProfile, rimProfileAt, rimShadeNormal } from '../src/scene/organs/rim-profile.ts';
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
