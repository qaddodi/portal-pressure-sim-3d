// The right portal and right hepatic veins' draw-only branches (frozen round 17; art/anatomy-placement/RULINGS.md), as the placed network draws them (placed-network.ts: the trunk carried on along its
// through branch, rpvp and rhvb, to the split it draws, and the side branch, rpva and rhva, leaving there) and as the placement holds them:
//   - Mohammad, 24 Nov: "RPV need to be posterior and anterior and from front look less 90 degree and appropriate": the anterior branch runs forward (+z), the posterior one back (-z), and from the front the two
//     leave the split as a Y, not a T;
//   - Mohammad, 24 Nov: "RHV branch shouldn't be going upwards": no point of either right hepatic branch is above its split;
//   - all four end inside the placed liver (organsA.json, the inflated organ's triangles), clear of its front and back surfaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PPS_ANATOMY = 'placed';
const { PLACED_SPLIT, PLACED_EDGE_3D } = await import('../src/scene/anatomy/placed-network.ts');
const { PLACED_COURSES } = await import('../src/scene/anatomy/placement.generated.ts');

type V = readonly number[];
const dist = (a: V, b: V): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const arc = (c: readonly V[]): number[] => { const s = [0]; for (let i = 1; i < c.length; i++) s.push(s[i - 1]! + dist(c[i]!, c[i - 1]!)); return s; };
/** The point `d` along a course from its first point. */
const along = (c: readonly V[], d: number): V => { const s = arc(c), i = s.findIndex((x) => x >= d); return c[i < 0 ? c.length - 1 : i]!; };
const nearestIdx = (c: readonly V[], p: V): number => { let b = 0; for (let i = 1; i < c.length; i++) if (dist(c[i]!, p) < dist(c[b]!, p)) b = i; return b; };
/** The angle between two directions seen from the front (x, y), in degrees. */
const frontAngle = (a: V, b: V): number => { const d = ((Math.atan2(b[1]!, b[0]!) - Math.atan2(a[1]!, a[0]!)) * 180) / Math.PI; return Math.abs(((d + 540) % 360) - 180); };

/** Both branches from the drawn split outward: the through branch (the rest of the host's piece) and the side branch. */
function branches(host: 'PVH_R_2' | 'RHV_IVC_1'): { split: V; through: V[]; side: V[] } {
  const e = PLACED_EDGE_3D[host]! as V[], sp = PLACED_SPLIT[host]!, out = host === 'PVH_R_2';
  const side = (out ? sp.side : sp.side.slice().reverse()) as V[], split = side[0]!, k = nearestIdx(e, split);
  return { split, through: out ? e.slice(k) : e.slice(0, k + 1).reverse(), side };
}

// ---- inside the liver: a point's column of the placed liver's vertices (its front and back surfaces), and the outline round it on all four sides ----
const LIVER = (JSON.parse(readFileSync(new URL('../art/anatomy-placement/organsA.json', import.meta.url), 'utf8')) as Record<string, number[]>).liver!;
const SKIN = 0.015;
function insideLiver(p: V): boolean {
  let lo = Infinity, hi = -Infinity; const side = [false, false, false, false];
  for (let i = 0; i < LIVER.length; i += 3) {
    const dx = LIVER[i]! - p[0]!, dy = LIVER[i + 1]! - p[1]!;
    if (Math.abs(dx) < 0.012 && Math.abs(dy) < 0.012) { lo = Math.min(lo, LIVER[i + 2]!); hi = Math.max(hi, LIVER[i + 2]!); }
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) side[(dx > 0 ? 1 : 0) + (dy > 0 ? 2 : 0)] = true;
  }
  return side.every(Boolean) && p[2]! > lo + SKIN && p[2]! < hi - SKIN;
}

/** The least the anterior tip is in front of the split, and the posterior tip behind it. */
const DEPTH_APART = 0.05;
/** The front-view angle between the two right portal branches over their first stretch: a Y, never a T. */
const Y_MIN = 30, Y_MAX = 75, FIRST = 0.05;
/** The most any point of a right hepatic branch may be above its split. */
const RISE_MAX = 0.01;
/** The least the posterior right portal branch ends below its split (down toward segments 6 and 7). */
const POST_DROP = 0.04;

test('the right portal vein splits into an anterior branch (forward) and a posterior one (back), with real depth between them', () => {
  const { split, through, side } = branches('PVH_R_2');
  const a = side[side.length - 1]!, p = through[through.length - 1]!;
  assert.ok(a[2]! - split[2]! >= DEPTH_APART, `rpva's tip is ${(a[2]! - split[2]!).toFixed(3)} in front of the split (at least ${DEPTH_APART})`);
  assert.ok(split[2]! - p[2]! >= DEPTH_APART, `rpvp's tip is ${(split[2]! - p[2]!).toFixed(3)} behind the split (at least ${DEPTH_APART})`);
  // (and as placed: the anterior course forward of its first point, the posterior one behind it)
  const A = PLACED_COURSES.rpva!, P = PLACED_COURSES.rpvp!;
  assert.ok(A[A.length - 1]![2] - A[0]![2] >= DEPTH_APART && P[0]![2] - P[P.length - 1]![2] >= DEPTH_APART, 'placed rpva runs forward and rpvp back');
});

test(`from the front the right portal vein's branches leave as a Y (${Y_MIN} to ${Y_MAX} degrees over their first ${FIRST}), not a T`, () => {
  const { split, through, side } = branches('PVH_R_2');
  const t = along(through, FIRST), s = along(side, FIRST);
  const deg = frontAngle([t[0]! - split[0]!, t[1]! - split[1]!], [s[0]! - split[0]!, s[1]! - split[1]!]);
  assert.ok(deg >= Y_MIN && deg <= Y_MAX, `the branches leave ${deg.toFixed(1)} degrees apart from the front`);
  // (the anterior one above the posterior one: up-lateral toward segments 5 and 8, the posterior one down-lateral toward 6 and 7)
  assert.ok(s[1]! > split[1]! && t[1]! < split[1]!, 'rpva leaves upward and rpvp downward');
  // (round 16's T: the posterior branch ran on level with the trunk, its tip 0.002 above the split, while the anterior one curved straight up)
  const drop = split[1]! - through[through.length - 1]![1]!;
  assert.ok(drop >= POST_DROP, `rpvp's tip is ${drop.toFixed(3)} below the split (at least ${POST_DROP})`);
});

test('no right hepatic vein branch runs upward from its split (drawn and placed)', () => {
  const { split, through, side } = branches('RHV_IVC_1');
  for (const [n, c] of [['rhvb', through], ['rhva', side]] as const) {
    const top = Math.max(...c.map((q) => q[1]!));
    assert.ok(top - split[1]! <= RISE_MAX, `${n} rises ${(top - split[1]!).toFixed(3)} above the split`);
  }
  for (const n of ['rhva', 'rhvb'] as const) {
    const c = PLACED_COURSES[n]!, top = Math.max(...c.map((q) => q[1]));
    assert.ok(top - c[0]![1] <= RISE_MAX, `placed ${n} rises ${(top - c[0]![1]).toFixed(3)} above its first point`);
  }
  // (two distinct branches: the anterior one in front of the posterior one at their tips)
  assert.ok(side[side.length - 1]![2]! - through[through.length - 1]![2]! >= DEPTH_APART, 'rhva ends in front of rhvb');
});

test('all four branches end inside the placed liver, clear of its surfaces', () => {
  const bad: string[] = [];
  for (const host of ['PVH_R_2', 'RHV_IVC_1'] as const) {
    const { through, side } = branches(host);
    for (const [n, c] of [[`${host} through`, through], [`${host} side`, side]] as const) {
      const tip = c[c.length - 1]!;
      if (!insideLiver(tip)) bad.push(`${n} tip ${tip.map((x) => x.toFixed(3)).join(', ')}`);
    }
  }
  for (const n of ['rpva', 'rpvp', 'rhva', 'rhvb'] as const) { const c = PLACED_COURSES[n]!; if (!insideLiver(c[c.length - 1]!)) bad.push(`placed ${n}`); }
  assert.deepEqual(bad, []);
});
