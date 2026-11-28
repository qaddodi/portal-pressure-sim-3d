// Where a vessel starts inside its organ. The 2D figure starts the splenic vein at the hilum (SPL, the spleen's near edge) and fades it in over two thirds of its length, so it seems to
// begin in the gap beside the spleen. In 3D the vein is drawn in front of the organ and Mohammad asked that it start in the spleen (20 Nov): its course is carried on from the hilum,
// along the way it already leaves it, to a point inside the organ, and it fades in over that carried-on stretch alone (solid at the hilum, where 2D's fade is still faint).
// The 2D app's numbers are untouched: this only adds drawn length at one end. Points are in 2D units (the course's own).
import { EDGE_PATH_2D } from '../anatomy/source.ts';
import { piecesOf } from '../anatomy/whole-pieces.ts';
type P2 = readonly [number, number];

/** The extra start of a vessel: the 2D points before its first point, in order (the vein runs from the first of these on). */
const START_IN_ORGAN: Readonly<Record<string, { to: P2; organ: string }>> = {
  V_SPL: { to: [1060, 337], organ: 'spleen' },
  // (the azygos arch: it fades in at its left end, so the esophageal collateral, which meets it at its 2D start, must meet it where it is solid: the arch is carried on 30 units to the left, along the way it leaves the node, and fades in over that stretch alone; Mohammad, 20 Nov: "this collateral should join the azygous vein not where it is fading away")
  AZY_SVC: { to: [547, 43], organ: 'thorax' },   // (the carried-on stretch behind the landing of the collaterals, 30 units: the arch's free left end FADES OUT over it, body and ink on one alpha, full width, no cap and no point (Mohammad, 22 Nov: "the azygos should fade to the left, not end with a knob"); shorter and the arch's depth slope to the cava steepens past vessel-wobble's limit)
};

const STEP = 3;   // 2D units between added points (the copied courses are sampled about every 1.8)

/** Courses cut short so an artery never crosses a vein (Mohammad, 20 Nov: "artery cannot cross the veins"): the points kept, [first, last). The hepatic artery runs beside the
 *  portal trunk from just past the coronary vein and the caput collateral (which its first stretch crossed) to just short of the cava (its last stretch ran onto it, and its two arterioles crossed
 *  the portal and hepatic veins to the lobes: those are not drawn). */
const TRIM: Readonly<Record<string, readonly [number, number]>> = { A_HEP: [20, 64] };
const trimmed = (id: string, path: readonly P2[]): readonly P2[] => { const t = TRIM[id]; return t && path.length >= t[1] ? path.slice(t[0], t[1]) : path; };

/** The extra end of a vessel that runs on further than the 2D figure draws it: the rectal varices run on down the rectum (Mohammad, 20 Nov: "rectal varices should reach more"), the 2D course carried straight on along its last heading to `to`. */
const END_ON: Readonly<Record<string, P2>> = {
  C4: [742, 1010],
};
/** A vessel that RUNS ON INTO another's start (Mohammad, 22 Nov: "the junction itself sucks"; Plan 16D): the ascending lumbar vein is the azygos's origin, end to end (the azygos begins in the abdomen from the right ascending lumbar vein; 2D joins it to a trunk strand at y 108 that 3D does not draw).
 *  Its last `share` of the course (by length) is redrawn as one cubic Hermite curve from where it stood (its own heading there) to the start of `into`'s carried-on stretch (START_IN_ORGAN), arriving along the heading `into` leaves it by, so the two meet tangent-continuous: a smooth curve, never a corner. */
const RUNS_INTO: Readonly<Record<string, { into: string; share: number }>> = { C9: { into: 'AZY_SVC', share: 0.25 } };
/** The vessel `id` runs on into the start of (its end is that vessel's start, drawn as one vein), or null. */
export const runsInto = (id: string): string | null => RUNS_INTO[id]?.into ?? null;
/** The vessels that run on into `id`'s start (its origin): while one is drawn, the start is solid and carries on from it. */
export const originsOf = (id: string): readonly string[] => Object.entries(RUNS_INTO).filter(([, r]) => r.into === id).map(([k]) => k);
/** The point and heading (unit, the way the vessel runs) of the start of `into`'s course as drawn, where a vessel that runs on into it arrives. */
export function startOfRunOn(into: string): { at: P2; dir: P2 } | null {
  const s = START_IN_ORGAN[into], raw = EDGE_PATH_2D[into];
  if (!s || !raw) return null;
  const [ax, ay] = raw[0]!, d = Math.hypot(ax - s.to[0], ay - s.to[1]) || 1;
  return { at: s.to, dir: [(ax - s.to[0]) / d, (ay - s.to[1]) / d] };
}
const arcLen = (p: readonly P2[], from = 0, to = p.length - 1): number => { let t = 0; for (let i = from + 1; i <= to; i++) t += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return t; };
function runOnInto(path: readonly P2[], r: { into: string; share: number }): readonly P2[] {
  const t = startOfRunOn(r.into);
  if (!t || path.length < 8) return path;
  const total = arcLen(path);
  let i = path.length - 2;
  while (i > 2 && arcLen(path, i) < r.share * total) i--;
  const p0 = path[i]!, a = path[i - 1]!, b = path[i + 1]!, dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t0: P2 = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
  const L = Math.hypot(t.at[0] - p0[0], t.at[1] - p0[1]), n = Math.max(2, Math.ceil((L * 1.15) / HERMITE_STEP));
  const post: P2[] = [];
  for (let k = 1; k <= n; k++) {
    const u = k / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    post.push([h00 * p0[0] + h10 * HERMITE_K * L * t0[0] + h01 * t.at[0] + h11 * HERMITE_K * L * t.dir[0], h00 * p0[1] + h10 * HERMITE_K * L * t0[1] + h01 * t.at[1] + h11 * HERMITE_K * L * t.dir[1]]);
  }
  return [...path.slice(0, i + 1), ...post];
}
/** The tangents' length, as a share of the chord: shorter turns tighter (a bend of 62 degrees over the last quarter, 0.8: the tightest bend 6 of the vein's radii, 6 units' drift off its line), longer drifts wider. */
const HERMITE_K = 0.8;
const HERMITE_STEP = 1.5;   // 2D units between the points of the redrawn stretch: fine, so the last segment lies along the heading it arrives by
export const endOn = (id: string): P2 | null => END_ON[id] ?? null;

/** `path` with its start carried into the organ (or its ends cut), or `path` itself for a vessel that has neither. */
export function withStartInOrgan(id: string, path0: readonly P2[]): readonly P2[] {
  const into = RUNS_INTO[id], path = into ? runOnInto(trimmed(id, path0), into) : trimmed(id, path0);
  const e = END_ON[id];
  if (e && path.length >= 2) {
    const [x1, y1] = path[path.length - 1]!, [ax, ay] = path[path.length - 4]!, d = Math.hypot(x1 - ax, y1 - ay) || 1, L = Math.hypot(e[0] - x1, e[1] - y1), n = Math.max(1, Math.round(L / STEP));
    // (a gentle bend from the last heading onto the target, so the extension is a continuation and not a corner)
    const post: P2[] = [];
    for (let i = 1; i <= n; i++) { const t = i / n, hx = x1 + ((x1 - ax) / d) * L * 0.5 * t * (1 - t) * 2; post.push([hx + (e[0] - x1) * t, y1 + ((y1 - ay) / d) * L * 0.5 * t * (1 - t) * 2 + (e[1] - y1) * t]); }
    return withStartInOrgan0(id, [...path, ...post]);
  }
  return withStartInOrgan0(id, path);
}
function withStartInOrgan0(id: string, path: readonly P2[]): readonly P2[] {
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


/** The hepatic artery is one tree (Mohammad, 20 Nov: "hepatic artery is not connected to its branches"): the proper hepatic artery runs beside the portal trunk to the hilum, where it splits at a real junction F
 *  (its own last point, the node the left and right arteries start at) into the left one, which runs on under the left portal vein, and the right one, which passes behind the portal bifurcation (a Y cannot reach both arms of another Y without it) to run on over the right portal vein. Each fades out into the liver alongside its portal branch.
 *
 *  The left and right hepatic arteries run beside their portal branches, a little below them (the portal triad), and cross no vein (Mohammad, 20 Nov: "I want to see the left and right
 *  hepatic artery in anatomy"; "an artery cannot cross the veins"). The left one starts beyond the cava, which the portal vein itself crosses; each fades out with the portal branch. */
const ALONG_VEIN: Readonly<Record<string, { hosts: readonly string[]; minX?: number; maxX?: number; off: number; above?: boolean; fork?: number }>> = {
  A_HR: { hosts: piecesOf('PVH_R'), off: 8, above: true },
  A_HL: { hosts: piecesOf('PVH_L'), minX: 632, maxX: 676, off: 8, above: true, fork: 40 },   // (it ends short of the umbilical vein, which leaves the left portal vein's wall just beyond it, below)
};
export const ALONG_VEIN_IDS: ReadonlySet<string> = new Set(Object.keys(ALONG_VEIN));
/** The vein an artery runs beside to its end (the last of its hosts: the one that branches into the liver), whose fade the artery's out-fade is tied to (fades.ts companionEnd). */
export const alongVeinCompanion = (id: string): string | null => { const h = ALONG_VEIN[id]?.hosts; return h ? h[h.length - 1]! : null; };

function alongVeinBase(id: string, paths: Readonly<Record<string, readonly P2[]>>): P2[] | null {
  const a = ALONG_VEIN[id];
  if (!a) return null;
  let host: P2[] = [];
  // (the paths asked for are the 2D figure's own, cut where it cut its veins: the pieces the engine table has added since have none,
  //  and the ones it has run end to end as the whole vein)
  for (const h of a.hosts) if (paths[h]) host = host.concat(host.length ? paths[h]!.slice(1) : paths[h]!);
  // (an artery that lands on no path at all would be drawn as nothing, in silence: name it)
  if (!host.length) throw new Error(`along-vein ${id}: none of its hosts (${a.hosts.join(', ')}) has a 2D path to run beside`);
  if (a.minX != null) host = host.filter((p) => p[0] >= a.minX!);
  if (a.maxX != null) host = host.filter((p) => p[0] <= a.maxX!);
  const n = host.length, out: P2[] = [];
  const normal = (i: number): P2 => { const p = host[Math.max(0, i - 1)]!, q = host[Math.min(n - 1, i + 1)]!, tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1; return [ty / tl, -tx / tl]; };
  // the side below the vein on the page (2D y grows downward)
  let below = 0; for (let i = 0; i < n; i++) below += normal(i)[1];
  const side = (below >= 0 ? 1 : -1) * (a.above ? -1 : 1);
  for (let i = 0; i < n; i++) { const [nx, ny] = normal(i); out.push([host[i]![0] + side * nx * a.off, host[i]![1] + side * ny * a.off]); }
  // the junction: both branches leave the parent's end F along the parent's own heading and bend away from one another over the first stretch (a cubic from F onto the curve beside the vein),
  // so the fork is a smooth Y with a rounded crotch, not two lines meeting at an angle (Mohammad, 20 Nov: "a crude Y")
  const F = paths[id]![0]!, par = paths.A_HEP!, pa = par[Math.max(0, par.length - 9)]!, pl = Math.hypot(F[0] - pa[0], F[1] - pa[1]) || 1, d: P2 = [(F[0] - pa[0]) / pl, (F[1] - pa[1]) / pl];
  let j0 = 0; while (j0 < out.length - 2 && Math.hypot(out[j0]![0] - F[0], out[j0]![1] - F[1]) < (a.fork ?? 26)) j0++;
  const O = out[j0]!, T0 = out[Math.max(0, j0 - 1)]!, T1 = out[Math.min(out.length - 1, j0 + 1)]!, tl = Math.hypot(T1[0] - T0[0], T1[1] - T0[1]) || 1, tO: P2 = [(T1[0] - T0[0]) / tl, (T1[1] - T0[1]) / tl];
  const FL = Math.hypot(O[0] - F[0], O[1] - F[1]), c1: P2 = [F[0] + d[0] * 0.25 * FL, F[1] + d[1] * 0.25 * FL], c2: P2 = [O[0] - tO[0] * 0.3 * FL, O[1] - tO[1] * 0.3 * FL];
  const bez: P2[] = [];
  for (let k = 0; k < 16; k++) { const t = k / 16, u = 1 - t; bez.push([u * u * u * F[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * O[0], u * u * u * F[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * O[1]]); }
  const rest = out.slice(j0);
  out.length = 0; out.push(...bez, ...rest);
  // (back to the 64 points every course has)
  const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1]! + Math.hypot(out[i]![0] - out[i - 1]![0], out[i]![1] - out[i - 1]![1]));
  const L = cum[cum.length - 1]! || 1, res: P2[] = []; let k = 1;
  for (let i = 0; i < 64; i++) { const d = (L * i) / 63; while (k < out.length - 1 && cum[k]! < d) k++; const u = (d - cum[k - 1]!) / ((cum[k]! - cum[k - 1]!) || 1); res.push([out[k - 1]![0] + (out[k]![0] - out[k - 1]![0]) * u, out[k - 1]![1] + (out[k]![1] - out[k - 1]![1]) * u]); }
  return res;
}

/** The bed each hepatic artery runs on to (Mohammad, 20 Nov: "extend the arteriole"): the lobar artery used to end beside the start of the portal venule it follows, 20 radii of that venule from the sinusoid bed's node, so it could not be welded to it.
 *  It now carries on to the bed's node and ends there, as the arteriole that opens into the sinusoids does: one curve from where it ended to the node, arriving from its own side of the venule at BED_ANGLE degrees off the venule's heading. */
const BED_OF: Readonly<Record<string, string>> = { A_HR: 'PRE_R', A_HL: 'PRE_L' };
export const BED_ANGLE = 55;
const bedCache = new Map<string, { path: P2[]; stretch: number }>();
function reachBed(id: string, base: P2[], bed: readonly P2[]): { path: P2[]; stretch: number } {
  const n = bed.length, E = base[base.length - 1]!, tb = base[Math.max(0, base.length - 4)]!;
  const J: P2 = bed[n - 1]!, B = bed[Math.max(0, n - 4)]!;
  const unit = (x: number, y: number): P2 => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const H = unit(J[0] - B[0], J[1] - B[1]), T0 = unit(E[0] - tb[0], E[1] - tb[1]);
  // the side of the venule's line the artery is on, and the heading it arrives with: the venule's, turned toward the venule by BED_ANGLE
  const nrm: P2 = [H[1], -H[0]], side = Math.sign((E[0] - J[0]) * nrm[0] + (E[1] - J[1]) * nrm[1]) || 1, a = (BED_ANGLE * Math.PI) / 180;
  const T1 = unit(H[0] * Math.cos(a) - side * nrm[0] * Math.sin(a), H[1] * Math.cos(a) - side * nrm[1] * Math.sin(a));
  const L = Math.hypot(J[0] - E[0], J[1] - E[1]), c1: P2 = [E[0] + T0[0] * 0.4 * L, E[1] + T0[1] * 0.4 * L], c2: P2 = [J[0] - T1[0] * 0.4 * L, J[1] - T1[1] * 0.4 * L];
  const out: P2[] = [...base];
  const m = 24;
  for (let k = 1; k <= m; k++) { const t = k / m, u = 1 - t; out.push([u * u * u * E[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * J[0], u * u * u * E[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * J[1]]); }
  const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1]! + Math.hypot(out[i]![0] - out[i - 1]![0], out[i]![1] - out[i - 1]![1]));
  const Lt = cum[cum.length - 1]! || 1, res: P2[] = []; let k = 1;
  for (let i = 0; i < 64; i++) { const d = (Lt * i) / 63; while (k < out.length - 1 && cum[k]! < d) k++; const u = (d - cum[k - 1]!) / ((cum[k]! - cum[k - 1]!) || 1); res.push([out[k - 1]![0] + (out[k]![0] - out[k - 1]![0]) * u, out[k - 1]![1] + (out[k]![1] - out[k - 1]![1]) * u]); }
  return { path: res, stretch: lenOf(base) / lenOf(res) };
}
function alongVeinFull(id: string, paths: Readonly<Record<string, readonly P2[]>>, drawn?: (id: string) => readonly P2[]): { path: P2[]; stretch: number } | null {
  let c = bedCache.get(id);
  if (!c) {
    const base = alongVeinBase(id, paths);
    if (!base) return null;
    c = BED_OF[id] ? reachBed(id, base, drawn?.(BED_OF[id]!) ?? paths[BED_OF[id]!]!) : { path: base, stretch: 1 };
    if (drawn || !BED_OF[id]) bedCache.set(id, c);   // (only the drawn course is kept: a caller without it gets the 2D one, for the stretch of a fade, and leaves the cache to the network's)
  }
  return c;
}
/** `drawn`: the course a vessel is drawn on (the bed's node is where its venule's DRAWN course ends, smoothed through the run-on, not where its 2D course does). */
export function alongVein(id: string, paths: Readonly<Record<string, readonly P2[]>>, drawn?: (id: string) => readonly P2[]): readonly P2[] | null { return alongVeinFull(id, paths, drawn)?.path ?? null; }
/** How much of the drawn course the part beside the portal branch is (1 for a course that does not run on to a bed): a fade that was laid over the last share of the old course starts at the same place on the longer one. */
export const alongVeinStretch = (id: string, paths: Readonly<Record<string, readonly P2[]>>): number => alongVeinFull(id, paths)?.stretch ?? 1;

/** A branch that leaves its parent's wall, not the parent's end (Mohammad, 20 Nov: "umbilical vein into the left portal vein still sucks"): the umbilical vein started at the end node of the left portal vein, where that vein has already
 *  narrowed to a fraction of its width and splits into its fading tips, so a wider, separate tube hung off a thin tip. It now leaves the left portal vein `back` figure units before that end, where the vein is still wide:
 *  one swept curve that starts on the vein's own axis, sets off along the vein's heading and bends over onto its own course by `reach` units along it, with matching tangents at both ends (no corner, no notch). */
const LEAVE_VEIN: Readonly<Record<string, { hosts: readonly string[]; back: number; reach: number; lean: number }>> = {
  C3: { hosts: piecesOf('PVH_L'), back: 30, reach: 48, lean: 0.6 },   // (lean: how far the branch's first heading is turned off the vein's, toward where it is going: a branch leaves a wall at an angle, it does not double back on the vein)
};
export const LEAVE_VEIN_IDS: ReadonlySet<string> = new Set(Object.keys(LEAVE_VEIN));
const lenOf = (p: readonly P2[]): number => { let t = 0; for (let i = 1; i < p.length; i++) t += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return t; };
/** The point at arc length `d` along `p`, and the heading there. */
function at(p: readonly P2[], d: number): { pt: P2; dir: P2; i: number } {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= d || i === p.length - 1) { const t = l > 0 ? Math.min(1, Math.max(0, (d - acc) / l)) : 0; return { pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: l > 0 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [0, 1], i }; }
    acc += l;
  }
  return { pt: p[p.length - 1]!, dir: [0, 1], i: p.length - 1 };
}
/** `paths[id]` with its start moved onto the host vein's axis (see LEAVE_VEIN), or null for a vessel that does not leave a wall. `hostPath` is the drawn course of a host. */
export function leaveVein(id: string, paths: Readonly<Record<string, readonly P2[]>>, hostPath: (host: string) => readonly P2[]): readonly P2[] | null {
  const a = LEAVE_VEIN[id];
  if (!a) return null;
  let host: P2[] = [];
  for (const h of a.hosts) { const hp = hostPath(h); host = host.concat(host.length ? hp.slice(1) : hp); }
  const own = paths[id]!, Lh = lenOf(host);
  const F = at(host, Math.max(0, Lh - a.back)), O = at(own, a.reach);
  const FL = Math.hypot(O.pt[0] - F.pt[0], O.pt[1] - F.pt[1]) || 1;
  const cd: P2 = [(O.pt[0] - F.pt[0]) / FL, (O.pt[1] - F.pt[1]) / FL], sd: P2 = [F.dir[0] * (1 - a.lean) + cd[0] * a.lean, F.dir[1] * (1 - a.lean) + cd[1] * a.lean], sl = Math.hypot(sd[0], sd[1]) || 1
  const c1: P2 = [F.pt[0] + (sd[0] / sl) * 0.5 * FL, F.pt[1] + (sd[1] / sl) * 0.5 * FL], c2: P2 = [O.pt[0] - O.dir[0] * 0.5 * FL, O.pt[1] - O.dir[1] * 0.5 * FL];
  const out: P2[] = [];
  const n = 24;
  for (let k = 0; k < n; k++) { const t = k / n, u = 1 - t; out.push([u * u * u * F.pt[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * O.pt[0], u * u * u * F.pt[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * O.pt[1]]); }
  out.push(O.pt);
  for (let i = O.i; i < own.length; i++) out.push(own[i]!);
  return out;
}
