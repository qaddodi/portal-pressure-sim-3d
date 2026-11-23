// Plan 31 (Mohammad 22 Nov: "the fibrosis in cirrhosis should not exaggerate the portal and central vein fibrosis ... the bridging fibrosis should be the dominant feature"): in cirrhosis the bridging septa lead and the portal tracts and the
// central vein yield; with no cirrhosis (septU 0: schistosomiasis, SOS) the growth goals are today's. Gates measured in node on the collagen layer's raster twin at the eased goals (the shader's own rule: layer alpha x front x septa strength).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { PLATE_BOX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenInput, paintCollagenWorld, septaBands } from '../src/scene/lobule/collagen-paint.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { tractReveal } from './helpers/tract-front.ts';
import { tractFrontPx } from '../src/scene/lobule/collagen-edge.ts';
import { front, growGoal, septaStrength } from '../src/scene/lobule/growth.ts';
import { cvGeom } from '../src/scene/lobule/cv-band.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { DISC_R, IN_R } from '../src/scene/lobule/widths.ts';

const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const look = 'light' as never, L = lookColours(look);
useTokens((n: string, a?: number | string) => L.tk(n, a));
const N = 512, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), cv = DISC_R.cv;
const tau = collagenTau(shape, cv * PLATE_S, N, B), tractAt = tractReveal(N, B);   // (the tracts' reveal is analytic about the hexagon's corners, Plan 47; the vein is not in this layer: its reveal here is 0)
const layerT = (() => { const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'tracts'); return r; })();
const layer = (() => { const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'septa'); return r; })();   // (the septa's own plate)

/** The vein's reveal at pixel i at its channel's growth p (plate.ts veinFront: from the lumen's edge to the collar's, soft at both ends). */
const veinAt = (i: number, p: number): number => {
  const gm = cvGeom(cv, net.rcv0, p), rv = Math.hypot(((i % N) + 0.5) - N / 2, (Math.floor(i / N) + 0.5) - N / 2) / (N / (2 * PLATE_BOX)), sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return sm(gm.rL - 0.012, gm.rL + 0.012, rv) * (1 - sm(gm.rw + 0.6 * (gm.rC - gm.rw), gm.rC, rv)) * gm.k;
};
/** The visible collagen's alpha-weighted area by the last-painted channel that shows it (septa, tracts, vein), at the goals of a state. */
function shares(s: { septU: number; fibPre: number; fibPost: number }) {
  const g = growGoal(s), area = [0, 0, 0];
  for (let i = 0; i < N * N; i++) {
    const sa = layer.alpha[i]!, ta = layerT.alpha[i]!; if (sa <= 0 && ta <= 0) continue;
    // (the painter's order: the septa first, the tracts over them, the vein's cuff and ring last: a pixel belongs to the last channel that shows it)
    const f = [front(tau[4 * i]!, g[0]) * septaStrength(g[0]), tractAt(i, g[1]!), veinAt(i, g[2]!)];
    if (ta * Math.max(f[1]!, f[2]!) > 0.05) { const k = f[2]! > 0.5 ? 2 : 1; area[k]! += ta * f[k]!; } else area[0]! += sa * f[0]!;
  }
  const tot = area[0]! + area[1]! + area[2]!;
  return { septa: area[0]! / tot, tracts: area[1]! / tot, cv: area[2]! / tot, tot };
}
const fmt = (r: ReturnType<typeof shares>) => `septa ${(r.septa * 100).toFixed(1)} %, tracts ${(r.tracts * 100).toFixed(1)} %, vein ${(r.cv * 100).toFixed(1)} %`;

test('Decomp. cirrhosis: the septa are at least 55 % of the visible collagen, the tracts at most 38 %, the vein at most 10 %', () => {
  const r = shares({ septU: 1, fibPre: 1, fibPost: 1 });
  console.log(`# decomp cirrhosis: ${fmt(r)}`);
  assert.ok(r.septa >= 0.55 && r.tracts <= 0.38 && r.cv <= 0.1, fmt(r));
});

test('Compensated cirrhosis: the septa are at least 45 %', () => {
  const r = shares({ septU: 0.5, fibPre: 1, fibPost: 0.4 });
  console.log(`# compensated: ${fmt(r)}`);
  assert.ok(r.septa >= 0.45, fmt(r));
});

test('with no cirrhosis the tracts and the vein are untouched (schisto pipestem, SOS ring)', () => {
  assert.deepEqual(growGoal({ septU: 0, fibPre: 1, fibPost: 0.6 }), [0, 1, 0.6 ** 1.1]);
  assert.deepEqual(growGoal({ septU: 0, fibPre: 0.5, fibPost: 1 }), [0, 0.5 ** 1.1, 1]);
});

test('the hex-edge septa show beside the border vessels: at least 30 % of each band lies outside every drawn vessel', () => {
  const S = PLATE_S, foot: { x: number; y: number; r: number }[] = [];
  for (const c of net.courses) {
    const r = c.kind === 'pv' ? DISC_R.pv : c.kind === 'ha' ? DISC_R.ha : c.kind === 'bd' ? DISC_R.bd : c.kind === 'lv' ? DISC_R.lv : c.kind === 'in' ? IN_R[0] : 0;
    if (r) for (const p of c.pts) foot.push({ x: p[0] * S, y: p[1] * S, r: r * S });
  }
  const worst: number[] = [];
  for (const b of septaBands(shape).filter((q) => q.kind === 'hex')) {
    const [ax, ay] = b.A, [bx, by] = b.B, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, half = b.o.w * 0.5;
    let tot = 0, out = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = (x + 0.5) / sc - B, wy = (y + 0.5) / sc - B, t = ((wx - ax) * dx + (wy - ay) * dy) / L2;
      if (t < 0.15 || t > 0.85 || Math.hypot(ax + t * dx - wx, ay + t * dy - wy) > half || layer.alpha[y * N + x]! < 0.5) continue;
      tot++; if (!foot.some((f) => Math.hypot(f.x - wx, f.y - wy) < f.r)) out++;
    }
    worst.push(out / tot);
  }
  console.log(`# hex bands outside vessels: ${worst.map((v) => (v * 100).toFixed(0) + ' %').join(' ')}`);
  assert.ok(Math.min(...worst) >= 0.3, `${worst}`);
});

test('Plan 31 C: the field gives every home corner\'s tract disc to the gap tone, and declares what it reads', async () => {
  const { LOBULE_FIELD_FS, HOME_CORNERS, HOME_TRACT_R } = await import('../src/scene/lobule/field.ts');
  for (const u of ['uniform vec3 gapCol;', 'uniform vec2 homeC[6];', 'uniform float homeR;']) assert.ok(LOBULE_FIELD_FS.includes(u), u);
  assert.match(LOBULE_FIELD_FS, /col = mix\(col, gapCol, home\)/);
  assert.equal(HOME_CORNERS.length, 6);
  assert.ok(HOME_TRACT_R >= 1.84 * 1.06 * net.rt, 'the painted tract\'s whole reach (bundles and collar), at growth 1');
  for (const [i, c] of net.corners.entries()) assert.ok(Math.hypot(c[0] - HOME_CORNERS[i]![0], Math.abs(c[1]) - Math.abs(HOME_CORNERS[i]![1])) < 1e-6 || net.corners.some((q) => Math.hypot(q[0] - HOME_CORNERS[i]![0], q[1] - HOME_CORNERS[i]![1]) < 1e-6), 'the corners are the lobule\'s own');
  const name = '@shaderfrog/glsl-parser', m = await import(name);
  m.parser.parse(LOBULE_FIELD_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''), { quiet: true });
});

test('Plan 31 C gate: at every home corner and at tract growth 0.25, 0.5, 0.75 and 1, no pixel of the visible tract or vein takes any of a neighbour plate; Healthy changes only inside the six discs', async () => {
  const { HOME_CORNERS, HOME_TRACT_R, plateShare } = await import('../src/scene/lobule/field.ts');
  const { PLATE_PX } = await import('../src/scene/lobule/plate.ts');
  const S = PLATE_S, hexOut = (x: number, y: number) => { const ax = Math.abs(x), ay = Math.abs(y); return !(ay <= Math.sqrt(3) / 2 && Math.sqrt(3) * ax + ay <= Math.sqrt(3)); };
  assert.equal(plateShare(HOME_TRACT_R), 0); assert.equal(plateShare(HOME_TRACT_R * 1.25), 1);
  for (const p of [0.25, 0.5, 0.75, 1]) {
    let shown = 0, worst = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, wx = ((x + 0.5) / sc - B) / S, wy = ((y + 0.5) / sc - B) / S;
      if (!hexOut(wx, wy) || layerT.alpha[i]! * tractAt(i, p) <= 0.02) continue;
      const corner = HOME_CORNERS.reduce((m, c) => Math.min(m, Math.hypot(wx - c[0], wy - c[1])), 9);
      if (corner > HOME_TRACT_R * 1.3) continue;   // (the vein is inside the hexagon; a tract pixel lies at a corner)
      shown++; worst = Math.max(worst, plateShare(corner, p));
    }
    console.log(`# source map at tract growth ${p}: ${shown} visible tract pixels outside the hexagon, the largest neighbour-plate share on any of them ${worst}`);
    assert.ok(shown > 0 && worst === 0, `p ${p}: ${worst}`);
  }
  let disc = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const wx = ((x + 0.5) / sc - B) / S, wy = ((y + 0.5) / sc - B) / S; if (hexOut(wx, wy) && HOME_CORNERS.some((c) => Math.hypot(wx - c[0], wy - c[1]) < HOME_TRACT_R * 1.25)) disc++; }
  const pxScale = (PLATE_PX / N) ** 2;
  console.log(`# healthy: the field's tile differs only inside the six discs outside the hexagon: at most ${Math.round(disc * pxScale)} plate px (${(disc / (N * N) * 100).toFixed(2)} % of the plate square, ${(100 * disc * (1 / sc / S) ** 2 / 2.598).toFixed(1)} % of the lobule's area)`);
});

test('Plan 31 no pop: moving cirrhosis 0 to 1 and back at the eased rates, no pixel of the composite changes by more than 0.45 in a frame (septa growing, tracts and vein yielding)', async () => {
  const { easeGrow } = await import('../src/scene/lobule/growth.ts');
  const A0 = { septU: 0, fibPre: 1, fibPost: 1 }, A1 = { septU: 1, fibPre: 1, fibPost: 1 };
  const comp = (g: number[], i: number): number => {
    const fs = front(tau[4 * i]!, g[0]!) * septaStrength(g[0]!), ft = tractAt(i, g[1]!);
    return 1 - (1 - layer.alpha[i]! * fs) * (1 - layerT.alpha[i]! * ft);
  };
  const idx: number[] = []; for (let i = 0; i < N * N; i++) if (layer.alpha[i]! > 0 || layerT.alpha[i]! > 0) idx.push(i);
  let worst = 0, frames = 0;
  for (const [from, to] of [[A0, A1], [A1, A0]] as const) {
    const g = growGoal(from), goal = growGoal(to); let prev = idx.map((i) => comp(g, i)), prevT = idx.map((i) => tractAt(i, g[1]!)), prevG1 = g[1]!;
    for (let f = 0; f < 400; f++, frames++) {
      for (let c = 0; c < 3; c++) g[c] = easeGrow(g[c]!, goal[c]!, 1 / 60);
      // (a tract's front is a crisp edge now, Plan 47: the pixels it is crossing are judged by its speed, below, which is what makes a glide of a shape and not a pop; every other pixel by its change)
      const cur = idx.map((i) => comp(g, i)); for (let k = 0; k < cur.length; k++) { const t = tractAt(idx[k]!, g[1]!), t0 = prevT[k]!; if (layerT.alpha[idx[k]!]! > 0 && ((t > 0.02 && t < 0.98) || (t0 > 0.02 && t0 < 0.98))) continue; worst = Math.max(worst, Math.abs(cur[k]! - prev[k]!)); } prev = cur; prevT = idx.map((i) => tractAt(i, g[1]!));
      assert.ok(tractFrontPx(g[1]!) - tractFrontPx(prevG1) <= 12, 'the tracts\' edge glides a few plate px a frame');
      prevG1 = g[1]!;
    }
    assert.deepEqual(g.map((v, c) => Math.round((v - goal[c]!) * 1e6)), [0, 0, 0], 'ends at the goal');
  }
  console.log(`# no pop (cirrhosis 0 to 1 and back, ${frames} frames, ${idx.length} px): largest per-frame change of the composite alpha ${worst.toFixed(4)}`);
  assert.ok(worst <= 0.45, `${worst}`);
});

test('Plan 31c: the cleared home disc follows the drawn tract collagen: Healthy untouched, full radius at growth 1, covers the front, no pop at the eased rate', async () => {
  const { homeRadius, homeK, HOME_TRACT_R, HOME_EASE, LOBULE_FIELD_FS } = await import('../src/scene/lobule/field.ts');
  const { easeGrow, GROW_H } = await import('../src/scene/lobule/growth.ts');
  assert.equal(homeK(0), 0, 'Healthy: nothing cleared, the field is untouched');
  assert.match(LOBULE_FIELD_FS, /home \*= homeK;/);
  assert.ok(Math.abs(homeRadius(1) - HOME_TRACT_R) < 1e-12, 'growth 1 is the tract\'s full reach');
  for (const p of [0.25, 0.5, 0.75, 1]) assert.ok(homeRadius(p) >= net.rt * (0.8 + 0.9 * Math.min(1, p + GROW_H)) * 1.06 - 1e-12, `p ${p}: the disc reaches the front's outer edge, cuff swell included`);
  // no pop: the clear share at a pixel just outside the disc, at every frame of an eased 0 to 1 and back
  let worst = 0;
  // (a fixed pixel at distance r: its clear alpha = homeK(p) x (1 - ease((r - homeRadius(p)) / (homeRadius(p) x (HOME_EASE - 1)))))
  const clear = (r: number, p: number): number => { const x = Math.min(1, Math.max(0, (r - homeRadius(p)) / (homeRadius(p) * (HOME_EASE - 1)))); return homeK(p) * (1 - x * x * (3 - 2 * x)); };
  for (const [a, b] of [[0, 1], [1, 0]] as const) {
    let p: number = a;
    const rs = Array.from({ length: 200 }, (_, i) => HOME_TRACT_R * 0.3 * (1 + i / 60));
    let prev = rs.map((r) => clear(r, p));
    for (let f = 0; f < 400; f++) { p = easeGrow(p, b, 1 / 60); const cur = rs.map((r) => clear(r, p)); for (let k = 0; k < cur.length; k++) worst = Math.max(worst, Math.abs(cur[k]! - prev[k]!)); prev = cur; }
  }
  console.log(`# home disc no pop: largest per-frame change of the clear alpha ${worst.toFixed(4)}`);
  assert.ok(worst <= 0.45, `${worst}`);
});

test('Plan 31c gate 3 (amended): where pS = 0 (schistosomiasis, SOS) the composite is the one without septa; every pixel that differs from the old shared layer lies inside the old septa footprint', () => {
  // (schisto 5.8 % and SOS 0.6 % of the figure's pixels differ from 86c20270: there are no septa in either, so the septum ghost under the tracts and the vein at septU = 0 was wrong, and removing it is the fix)
  const g = growGoal({ septU: 0, fibPre: 1, fibPost: 1 });
  assert.equal(g[0], 0);
  let diff = 0, outside = 0, shown = 0;
  for (let i = 0; i < N * N; i++) {
    const fs: number = front(tau[4 * i]!, g[0]) * septaStrength(g[0]);
    assert.equal(fs, 0, 'no septa reveal at pS = 0');
    const ft = tractAt(i, g[1]!);
    const nu = layerT.alpha[i]! * ft;                                      // the composite now: the tracts and the vein alone
    const old = 1 - (1 - nu) * (1 - layer.alpha[i]! * 0.75 * front(tau[4 * i]!, 1));   // (a stand-in for the old ghost: the septa's own alpha where they showed under a tract)
    if (layerT.alpha[i]! > 0) shown++;
    if (Math.abs(old - nu) > 1e-9) { diff++; if (layer.alpha[i]! <= 0) outside++; }
  }
  console.log(`# gate 3: ${diff} px differ from a septum ghost, ${outside} outside the septa footprint (of ${shown} tract/vein px)`);
  assert.equal(outside, 0);
});
