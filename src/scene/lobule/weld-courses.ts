// The Lobule's tubes as the weld planner sees them (welds.ts): each course's path in the scene's local units, its radius at every sample and its colour place, exactly the numbers the scene's
// own tube builder uses (micro3d/lobule3d.ts buildVessels), so a welded tube's rings are the rings the unwelded tube would have had. Pure.
import type { Course, LobuleNet } from './geometry.ts';
import { buildBile } from './bile.ts';
import { DISC_R, RS_N, inletRadius, sinRadius, twigR } from './widths.ts';
import { sinW } from './ink.ts';
import type { WeldCourse } from './welds.ts';

/** The heights the scene lays its tubes at, and the radius scale (the lobule's radius in local units). */
export interface WeldHeights { R: number; over: number; tube: number; bile: number }

/** Segments round a tube, per family: the blood and the lymph vessels, the bile's hairlines. */
export interface WeldSegs { vessel: number; bile: number }

/** A course without its samples closer to the centre than `r` (lobule radii): a sinusoid stops at the central vein's lip. */
export function trimmedInside(c: Course, r: number): Course {
  let n = c.pts.length;
  while (n > 2 && Math.hypot(c.pts[n - 1]![0], c.pts[n - 1]![1]) < r) n--;
  return n === c.pts.length ? c : { ...c, pts: c.pts.slice(0, n), rho: c.rho.slice(0, n) };
}

const at3 = (p: readonly [number, number], z: number, R: number): [number, number, number] => [p[0] * R, -p[1] * R, z];

/** The blood vessels that weld to each other: the inlets, the three generations of sinusoids and their links, and the arteriole's twigs. */
export function bloodWeldCourses(net: LobuleNet, h: WeldHeights, segs: WeldSegs): WeldCourse[] {
  const out: WeldCourse[] = [];
  const add = (c: Course, z: number, rad: (i: number) => number, w: (i: number) => number) => {
    out.push({ key: `${c.kind}${c.id}`, phase: c.id * 0.137, family: 'blood', pts: c.pts.map((p) => at3(p, z, h.R)), rad: c.pts.map((_, i) => Math.max(1e-4, rad(i) * h.R)), w: c.pts.map((_, i) => w(i)), seg: segs.vessel });
  };
  for (const c of net.courses) {
    if (c.kind === 'in') {
      add(c, h.tube, (i) => inletRadius(i, c.pts.length, Math.hypot(c.pts[i]![0] - c.pts[0]![0], c.pts[i]![1] - c.pts[0]![1])), (i) => i / (c.pts.length - 1));
    } else if (c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an') {
      const t = trimmedInside(c, DISC_R.cv * 0.78);
      out.push({ key: `${c.kind}${c.id}`, phase: c.id * 0.137, family: 'blood', pts: t.pts.map((p) => at3(p, h.over, h.R)), rad: t.pts.map((_, i) => Math.max(1e-4, sinRadius(c.kind as 's0' | 's1' | 's2' | 'an', t.rho[i]!) * h.R)), w: t.pts.map((_, i) => sinW(t.rho[i]!)), seg: segs.vessel });
    }
    else if (c.kind === 'tw') {
      // the arteriole's twig: it opens into its sinusoid, so it welds to it; its skin eases from the arteriole's colour to the sinusoid's (ink.ts 'art')
      add(c, h.over, (i) => twigR(i / (c.pts.length - 1), RS_N), () => 0);
    }
  }
  return out;
}

/** The bile: each channel with its canal of Hering and the ducts they meet. */
export function bileWeldCourses(net: LobuleNet, h: WeldHeights, segs: WeldSegs): WeldCourse[] {
  return buildBile(net).map((c, n) => ({ key: `bile${n}`, phase: n * 0.29, family: 'bile', pts: c.pts.map((p) => at3(p, h.bile, h.R)), rad: c.radius.map((r) => Math.max(2e-4, r * h.R)), w: c.pts.map(() => 0), seg: segs.bile }));
}
