// Where a vessel starts inside its organ. The 2D figure starts the splenic vein at the hilum (SPL, the spleen's near edge) and fades it in over two thirds of its length, so it seems to
// begin in the gap beside the spleen. In 3D the vein is drawn in front of the organ and Mohammad asked that it start in the spleen (20 Nov): its course is carried on from the hilum,
// along the way it already leaves it, to a point inside the organ, and it fades in over that carried-on stretch alone (solid at the hilum, where 2D's fade is still faint).
// The 2D app's numbers are untouched: this only adds drawn length at one end. Points are in 2D units (the course's own).
type P2 = readonly [number, number];

/** The extra start of a vessel: the 2D points before its first point, in order (the vein runs from the first of these on). */
const START_IN_ORGAN: Readonly<Record<string, { to: P2; organ: string }>> = {
  V_SPL: { to: [1060, 337], organ: 'spleen' },   // scene (1.20, 0.73): inside the spleen's outline (x 1.05 to 1.35 at that height)
};

const STEP = 3;   // 2D units between added points (the copied courses are sampled about every 1.8)

/** Courses cut short so an artery never crosses a vein (Mohammad, 20 Nov: "artery cannot cross the veins"): the points kept, [first, last). The hepatic artery runs beside the
 *  portal trunk from just past the coronary vein and the caput collateral (which its first stretch crossed) to just short of the cava (its last stretch ran onto it, and its two arterioles crossed
 *  the portal and hepatic veins to the lobes: those are not drawn). */
const TRIM: Readonly<Record<string, readonly [number, number]>> = { A_HEP: [20, 50] };
const trimmed = (id: string, path: readonly P2[]): readonly P2[] => { const t = TRIM[id]; return t && path.length > t[1] ? path.slice(t[0], t[1]) : path; };

/** `path` with its start carried into the organ (or its ends cut), or `path` itself for a vessel that has neither. */
export function withStartInOrgan(id: string, path0: readonly P2[]): readonly P2[] {
  const path = trimmed(id, path0);
  const s = START_IN_ORGAN[id];
  if (!s || path.length < 2) return path;
  const [x0, y0] = path[0]!, [tx, ty] = s.to, d = Math.hypot(tx - x0, ty - y0), n = Math.max(1, Math.round(d / STEP));
  const pre: P2[] = [];
  for (let i = n; i >= 1; i--) pre.push([x0 + ((tx - x0) * i) / n, y0 + ((ty - y0) * i) / n]);
  return [...pre, ...path];
}

/** The share of the vessel's length the carried-on start takes (0 for a vessel without one): its fade-in covers exactly this, so the vein is solid where it leaves the organ. */
export function startInOrganShare(id: string, path: readonly P2[]): number {
  const s = START_IN_ORGAN[id];
  if (!s || path.length < 2) return 0;
  const len = (p: readonly P2[]) => { let t = 0; for (let i = 1; i < p.length; i++) t += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return t; };
  const whole = len(withStartInOrgan(id, path));
  if (!s) return 0;
  return whole > 0 ? 1 - len(path) / whole : 0;
}

/** The organ a vessel starts in, if it does. */
export const startOrgan = (id: string): string | null => START_IN_ORGAN[id]?.organ ?? null;

/** A clean tributary fan for the caudate lobe: its short veins into the cava (the lobe drains straight into the IVC, so it is spared in Budd-Chiari), drawn as a few smooth gently bowed
 *  twigs to one hub, never the 2D figure's tangle of wiggling strands (Mohammad, 20 Nov: "a squiggly worm"). The thick twigs of the 2D fan are kept as their ends, bowed one way
 *  by a quadratic curve; the thin ones, which are the tangle, are dropped. */
export function cleanFeeders<T extends { k: number; fan: boolean; pts: readonly P2[] }>(host: string, list: readonly T[]): readonly T[] {
  if (host !== 'CAUD') return list;
  return list.flatMap((f) => {
    if (!f.fan) return [f];   // (the portal inflows are smooth already)
    if (f.k < 0.9) return [];
    const a = f.pts[0]!, b = f.pts[f.pts.length - 1]!, dx = b[0] - a[0], dy = b[1] - a[1], bow = 0.12;
    const cx = (a[0] + b[0]) / 2 - dy * bow, cy = (a[1] + b[1]) / 2 + dx * bow;
    const pts = f.pts.map((_, i): P2 => { const t = i / (f.pts.length - 1), u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]; });
    return [{ ...f, pts }];
  });
}
