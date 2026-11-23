// The central vein's collagen is ONE analytic band (cv-band.ts), never painted (Mohammad, 23 Nov 2026, the SOS slide on the iPad: two rings, crinkled paper, a jagged lumen). Judged in node, from the twin and the shader's text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3, Vector4 } from 'three';
import { CV_A, CV_FILL, CV_S_MAX, cvAlpha, cvGeom, cvRelief, cvWall, cvEdge } from '../src/scene/lobule/cv-band.ts';
import { LOBULE_PLATE_FS, PLATE_BOX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { collagenInput, paintCollagenWorld } from '../src/scene/lobule/collagen-paint.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { RELIEF_G } from '../src/scene/lobule/relief.ts';

const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const rcv0 = net.rcv0;
const SOS_RW = (DISC_R.cv + 0.05 * 0.73) * (1 - 0.3 * 0.83);   // view.ts cvRadiusNow in SOS (congU 0.73, fibPost 0.83)
const PZ = [0.11, 0.5, 0.82, 1];

test('the SOS numbers: a round lumen of about 0.044 R, the wall about 0.08 R, the collar to about 0.137 R', () => {
  const g = cvGeom(SOS_RW, rcv0, 0.82);
  assert.ok(Math.abs(g.rL - 0.044) < 0.004, `lumen ${g.rL}`);
  assert.ok(Math.abs(g.rw - 0.08) < 0.004, `wall ${g.rw}`);
  assert.ok(Math.abs(g.rC - 0.137) < 0.01, `collar ${g.rC}`);
});

test('cirrhosis: a thin collar (the lumen 0.94 of the wall, the collar 0.013 R past it); healthy: nothing at all', () => {
  const g = cvGeom(0.08, rcv0, 0.11);
  assert.ok(Math.abs(g.rL / g.rw - 0.94) < 0.01 && Math.abs(g.rC - g.rw - 0.013) < 0.002, `${g.rL / g.rw} ${g.rC - g.rw}`);
  const h = cvGeom(0.08, rcv0, 0);
  for (let r = 0; r < 0.3; r += 0.001) assert.equal(cvAlpha(r, h), 0, 'pZ 0: a ≡ 0');
});

test('continuous at the wall: alpha, its slope and the relief agree from both sides within 1e-3 (marks plate outside, scar mesh inside, one function)', () => {
  for (const p of PZ) {
    const g = cvGeom(SOS_RW, rcv0, p), e = 1e-7;
    assert.ok(Math.abs(cvAlpha(g.rw - e, g) - cvAlpha(g.rw + e, g)) < 1e-3, `alpha at pZ ${p}`);
    for (const L of [[1, 0], [0, 1], [-0.6, 0.8]] as const) assert.ok(Math.abs(cvRelief(g.rw - e, g, [1, 0], L) - cvRelief(g.rw + e, g, [1, 0], L)) < 1e-3);
    assert.ok(Math.abs(cvWall(g.rw + 1e-4, g) - 1) < 1e-5, 'the fade leaves the wall flat (C2)');
  }
});

test('nothing in the lumen (one device pixel inside its edge) and nothing past the collar; the core is the septa\'s dense 0.89', () => {
  for (const p of PZ) {
    const g = cvGeom(SOS_RW, rcv0, p), aa = 0.002;
    assert.equal(cvAlpha(g.rL - aa, g, aa), 0, `inside the lumen at pZ ${p}`);
    for (let r = g.rC; r < g.rC + 0.1; r += 0.002) assert.equal(cvAlpha(r, g, aa), 0, 'past the collar');
    assert.ok(Math.abs(cvAlpha((g.rL + g.rw) / 2, g, aa) - CV_A * g.k) < 1e-9, 'the core');
    assert.ok(cvEdge(g.rL, g, aa) > 0.45 && cvEdge(g.rL, g, aa) < 0.55, 'the lumen\'s edge is anti-aliased about its radius');
  }
});

test('the band has no angle in it (a round lumen: no lobes) and its alpha never rises outward of the wall', () => {
  assert.ok(cvAlpha.length <= 3 && cvRelief.length <= 4, 'r only (and the direction for the light)');
  const src = readFileSync(new URL('../src/scene/lobule/cv-band.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /atan|cvRag/, 'no angle, no rag');
  for (const p of PZ) {
    const g = cvGeom(SOS_RW, rcv0, p);
    let prev = cvAlpha(g.rw, g);
    for (let r = g.rw; r < g.rC + 0.05; r += (g.rC - g.rw) / 200 + 1e-6) { const a = cvAlpha(r, g); assert.ok(a <= prev + 1e-12, `pZ ${p} r ${r}`); prev = a; }
  }
});

test('the relief never saturates: |s| <= 0.6 for every growth, every light direction and every radius (one smooth lit crescent, not stripes)', () => {
  let peak = 0;
  for (const p of PZ) {
    const g = cvGeom(SOS_RW, rcv0, p);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, L: [number, number] = [Math.cos(a), Math.sin(a)];
      for (let j = 0; j < 16; j++) {
        const b = (j / 16) * Math.PI * 2, dir: [number, number] = [Math.cos(b), Math.sin(b)];
        for (let r = g.rL - 0.01; r < g.rC + 0.01; r += (g.rC - g.rL) / 400) { const s = Math.abs(cvRelief(r, g, dir, L)); assert.ok(s <= CV_S_MAX + 1e-9, `s ${s}`); peak = Math.max(peak, s); }
      }
    }
  }
  assert.ok(peak > 0.55, `the rope still shows (peak ${peak})`);
  assert.ok(RELIEF_G > 0);
});

test('the relief has one lit and one shade flank across the band (one reversal), flat at the lumen\'s edge and the collar\'s', () => {
  const g = cvGeom(SOS_RW, rcv0, 0.82);
  let rev = 0, last = 0;
  for (let r = g.rL; r <= g.rC; r += (g.rC - g.rL) / 400) { const s = cvRelief(r, g, [1, 0], [-1, 0]); if (Math.abs(s) > 0.05) { if (last && Math.sign(s) !== last) rev++; last = Math.sign(s); } }
  assert.equal(rev, 1);
  assert.ok(Math.abs(cvRelief(g.rL, g, [1, 0], [-1, 0])) < 1e-9 && Math.abs(cvRelief(g.rC, g, [1, 0], [-1, 0])) < 1e-9);
});

test('the vein\'s collagen is bundles painted into the tracts\' plate about its centre (one system with the tracts and the septa): painted inside the collar, nothing between the collar and the tracts', () => {
  const N = 256, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), look = 'light' as never, L = lookColours(look);
  useTokens((n: string, a?: number | string) => L.tk(n, a));
  const r = rasterCtx(N);
  paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, DISC_R.cv, look), 'tracts');
  const ring = (lo: number, hi: number): number => { let sum = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (sc * PLATE_S); if (d >= lo && d < hi) sum += r.alpha[y * N + x]!; } return sum; };
  const g = cvGeom(DISC_R.cv, shape.rcv0 / PLATE_S, 1);
  assert.ok(ring(g.rw * 0.5, g.rC) > 200, 'bundles round the vein');
  assert.equal(ring(g.rC * 1.15, 0.6), 0, 'nothing painted between the collar and the tracts');
});

test('the scar mesh is told the vein\'s scale, and both pieces share the band numbers', async () => {
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { LobuleView } = await import('../src/scene/lobule/view.ts');
  const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts');
  const sh = createShared(), host = new LobuleView(sh), m3 = new Lobule3D(host, sh);
  const p = m3 as unknown as { grow: number[]; stepCvScar(k: number): void; marksMat: { uniforms: Record<string, { value: unknown }> }; cvScar: { mats: { toon: { uniforms: Record<string, { value: unknown }> } } } };
  p.grow[2] = 0.82; p.stepCvScar(1.14);
  assert.equal(p.cvScar.mats.toon.uniforms.uScarK!.value, 1.14, 'uScarK = kcv');
  assert.equal(p.marksMat.uniforms.uScarK!.value, 1, 'the marks plate is unscaled');
  assert.equal(p.cvScar.mats.toon.uniforms.uCv, p.marksMat.uniforms.uCv, 'one set of band numbers');
  const v = p.marksMat.uniforms.uCv!.value as Vector4, g = cvGeom(host.cvRadiusNow, net.rcv0, 0.82);
  assert.ok(Math.abs(v.x - g.rL) < 1e-6 && Math.abs(v.y - g.rw) < 1e-6 && Math.abs(v.z - g.rC) < 1e-6 && Math.abs(v.w - g.k) < 1e-6);
  assert.ok((p.marksMat.uniforms.uCvCol!.value as Vector3).length() > 0, 'the septa\'s colour');
  assert.equal(CV_FILL, 0.55);
});

test('shader text: the vein\'s growth is the one front over its painted bundles, read in the one collagen function, and the shader parses', async () => {
  const fs = LOBULE_PLATE_FS;
  assert.match(fs, /float veinFront\(float rv\)/);
  assert.match(fs, /vec2 veinUv\(vec2 uv\)/);
  assert.match(fs, /veinFront\(length\(uv - 0\.5\) \* CV_SPAN\)/);
  assert.doesNotMatch(fs, /float cvA = CV_A/, 'no analytic flat band any more: the vein is bundles');
  assert.doesNotMatch(fs, /front\(t\.b/, 'channel B is not read');
  const name = '@shaderfrog/glsl-parser'; let parse: ((s: string) => unknown) | null = null;
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  if (parse) parse(fs.replace(/^\n/, '').replace(/^#include.*$/gm, ''));
});
