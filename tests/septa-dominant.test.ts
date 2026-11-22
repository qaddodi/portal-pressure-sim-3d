// Plan 31 (Mohammad 22 Nov: "the fibrosis in cirrhosis should not exaggerate the portal and central vein fibrosis ... the bridging fibrosis should be the dominant feature"): in cirrhosis the bridging septa lead and the portal tracts and the
// central vein yield; with no cirrhosis (septU 0: schistosomiasis, SOS) the growth goals are today's. Gates measured in node on the collagen layer's raster twin at the eased goals (the shader's own rule: layer alpha x front x septa strength).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { PLATE_BOX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenInput, paintCollagenWorld, septaBands } from '../src/scene/lobule/collagen-paint.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { front, growGoal, septaStrength } from '../src/scene/lobule/growth.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { DISC_R, IN_R } from '../src/scene/lobule/widths.ts';

const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const look = 'light' as never, L = lookColours(look);
useTokens((n: string, a?: number | string) => L.tk(n, a));
const N = 512, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), cv = DISC_R.cv;
const tau = collagenTau(shape, cv * PLATE_S, N, B);
const layer = (() => { const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, look)); return r; })();

/** The visible collagen's alpha-weighted area by the last-painted channel that shows it (septa, tracts, vein), at the goals of a state. */
function shares(s: { septU: number; fibPre: number; fibPost: number }) {
  const g = growGoal(s), area = [0, 0, 0];
  for (let i = 0; i < N * N; i++) {
    const a = layer.alpha[i]!; if (a <= 0) continue;
    // (the painter's order: the septa first, the tracts over them, the vein's cuff and ring last: a pixel belongs to the last channel that shows it)
    const f = [front(tau[4 * i]!, g[0]) * septaStrength(g[0]), front(tau[4 * i + 1]!, g[1]), front(tau[4 * i + 2]!, g[2])];
    const k = f[2]! > 0.5 ? 2 : f[1]! > 0.5 ? 1 : 0; area[k]! += a * f[k]!;
  }
  const tot = area[0]! + area[1]! + area[2]!;
  return { septa: area[0]! / tot, tracts: area[1]! / tot, cv: area[2]! / tot, tot };
}
const fmt = (r: ReturnType<typeof shares>) => `septa ${(r.septa * 100).toFixed(1)} %, tracts ${(r.tracts * 100).toFixed(1)} %, vein ${(r.cv * 100).toFixed(1)} %`;

test('Decomp. cirrhosis: the septa are at least 55 % of the visible collagen, the tracts at most 25 %, the vein at most 10 %', () => {
  const r = shares({ septU: 1, fibPre: 1, fibPost: 1 });
  console.log(`# decomp cirrhosis: ${fmt(r)}`);
  assert.ok(r.septa >= 0.55 && r.tracts <= 0.25 && r.cv <= 0.1, fmt(r));
});

test('Compensated cirrhosis: the septa are at least 50 %', () => {
  const r = shares({ septU: 0.5, fibPre: 1, fibPost: 0.4 });
  console.log(`# compensated: ${fmt(r)}`);
  assert.ok(r.septa >= 0.5, fmt(r));
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
  assert.ok(Math.abs(HOME_TRACT_R - 1.84 * net.rt) < 1e-12, 'the cuff\'s outer edge at growth 1');
  for (const [i, c] of net.corners.entries()) assert.ok(Math.hypot(c[0] - HOME_CORNERS[i]![0], Math.abs(c[1]) - Math.abs(HOME_CORNERS[i]![1])) < 1e-6 || net.corners.some((q) => Math.hypot(q[0] - HOME_CORNERS[i]![0], q[1] - HOME_CORNERS[i]![1]) < 1e-6), 'the corners are the lobule\'s own');
  const name = '@shaderfrog/glsl-parser', m = await import(name);
  m.parser.parse(LOBULE_FIELD_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''), { quiet: true });
});
