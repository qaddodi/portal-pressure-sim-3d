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
const TRIM: Readonly<Record<string, readonly [number, number]>> = { A_HEP: [20, 64] };
const trimmed = (id: string, path: readonly P2[]): readonly P2[] => { const t = TRIM[id]; return t && path.length >= t[1] ? path.slice(t[0], t[1]) : path; };

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

/** The hepatic artery is one tree (Mohammad, 20 Nov: "hepatic artery is not connected to its branches"): the proper hepatic artery runs beside the portal trunk to the hilum, where it splits at a real junction F
 *  (its own last point, the node the left and right arteries start at) into the left one, which runs on under the left portal vein, and the right one, which passes in front of the portal bifurcation (the artery lies anterior
 *  to the vein; a Y cannot reach both arms of another Y without it) to run on over the right portal vein. Each fades out into the liver alongside its portal branch.
 *
 *  The left and right hepatic arteries run beside their portal branches, a little below them (the portal triad), and cross no vein (Mohammad, 20 Nov: "I want to see the left and right
 *  hepatic artery in anatomy"; "an artery cannot cross the veins"). The left one starts beyond the cava, which the portal vein itself crosses; each fades out with the portal branch. */
const ALONG_VEIN: Readonly<Record<string, { hosts: readonly string[]; minX?: number; maxX?: number; off: number; above?: boolean }>> = {
  A_HR: { hosts: ['PVH_R', 'PVH_R_1', 'PVH_R_2'], off: 8, above: true },
  A_HL: { hosts: ['PVH_L', 'PVH_L_1'], minX: 632, maxX: 668, off: 8 },   // (it ends short of the umbilical vein, which leaves the left portal vein's end below it)
};
export const ALONG_VEIN_IDS: ReadonlySet<string> = new Set(Object.keys(ALONG_VEIN));

export function alongVein(id: string, paths: Readonly<Record<string, readonly P2[]>>): readonly P2[] | null {
  const a = ALONG_VEIN[id];
  if (!a) return null;
  let host: P2[] = [];
  for (const h of a.hosts) host = host.concat(host.length ? paths[h]!.slice(1) : paths[h]!);
  if (a.minX != null) host = host.filter((p) => p[0] >= a.minX!);
  if (a.maxX != null) host = host.filter((p) => p[0] <= a.maxX!);
  const n = host.length, out: P2[] = [];
  const normal = (i: number): P2 => { const p = host[Math.max(0, i - 1)]!, q = host[Math.min(n - 1, i + 1)]!, tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1; return [ty / tl, -tx / tl]; };
  // the side below the vein on the page (2D y grows downward)
  let below = 0; for (let i = 0; i < n; i++) below += normal(i)[1];
  const side = (below >= 0 ? 1 : -1) * (a.above ? -1 : 1);
  for (let i = 0; i < n; i++) { const [nx, ny] = normal(i); out.push([host[i]![0] + side * nx * a.off, host[i]![1] + side * ny * a.off]); }
  // the junction: the artery leaves its parent's end F and eases onto the curve beside its vein (three rounds of corner cutting, the ends held)
  const F = paths[id]![0]!;
  let line: P2[] = [F, ...out];
  for (let r = 0; r < 3; r++) { const nx: P2[] = [line[0]!]; for (let i = 0; i < line.length - 1; i++) { const p = line[i]!, q = line[i + 1]!; nx.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]); } nx.push(line[line.length - 1]!); line = nx; }
  out.length = 0; out.push(...line);
  // (back to the 64 points every course has)
  const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1]! + Math.hypot(out[i]![0] - out[i - 1]![0], out[i]![1] - out[i - 1]![1]));
  const L = cum[cum.length - 1]! || 1, res: P2[] = []; let k = 1;
  for (let i = 0; i < 64; i++) { const d = (L * i) / 63; while (k < out.length - 1 && cum[k]! < d) k++; const u = (d - cum[k - 1]!) / ((cum[k]! - cum[k - 1]!) || 1); res.push([out[k - 1]![0] + (out[k]![0] - out[k - 1]![0]) * u, out[k - 1]![1] + (out[k]![1] - out[k - 1]![1]) * u]); }
  return res;
}
