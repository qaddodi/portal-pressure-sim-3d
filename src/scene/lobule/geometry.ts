// The lobule's network, as pure numbers (no three.js, no DOM): a port of the 2D app's `build()` in src/ui/lobule-zoom.js, in lobule radii
// (R = 1, centre at 0,0, the 2D app's y-down plane; the view maps y to up). One representative lobule: a portal triad at each of the six
// corners, inlet venules along the edges, sinusoids in three generations merging toward the central vein, anastomoses, arterioles into the
// first stretch of the sinusoids, and the lymph: the portal tract's lymphatic, the terminal lymphatics along the edges and the space of Disse
// beside each sinusoid. The bile layer is not drawn here (it is not one of B8's rows).
// Same seed (7) and same order of random draws as the 2D build, so the 3D lobule is the same lobule.

export type P2 = [number, number];

/** What a course is. pv/ha/bd/lv/cv are seen end-on in the 2D picture and run along the lobule's axis in 3D. */
export type TubeKind = 'pv' | 'ha' | 'bd' | 'lv' | 'in' | 's0' | 's1' | 's2' | 'an' | 'cv' | 'tw' | 'lt' | 'ly';
export const AXIAL_KINDS: ReadonlySet<TubeKind> = new Set(['pv', 'ha', 'bd', 'lv', 'cv']);
export const BLOOD_SINUS: ReadonlySet<TubeKind> = new Set(['s0', 's1', 's2', 'an']);

export interface Course {
  id: number;
  kind: TubeKind;
  /** Points along the course, N of them, evenly spaced by length. Blood courses run with the blood (portal to central); `lt` runs toward its triad; `ly` runs from the limiting plate inward (the lymph itself runs the other way, out). */
  pts: P2[];
  /** Length in lobule radii. */
  len: number;
  /** Each point's distance from the centre, in lobule radii. */
  rho: number[];
  lvl?: number; tri?: number; edge?: number; sign?: number;
  /** The sinusoid a space-of-Disse course sits beside. */
  sib?: number;
  parent?: number;
}

export interface Triad { i: number; x: number; y: number; a: number; ha: P2; bd: P2; lv: P2; pv: number; haT: number; bdT: number; lvT: number }
export interface Cell { x: number; y: number; a: number; l: number; w: number; tone: number; nu: number; q: number; drop: number; jx: number; jy: number; ja: number }
export interface Stellate { x: number; y: number; a: number; nx: number; ny: number }

export interface LobuleNet {
  R: 1;
  rs0: number; rsN: number; rcv0: number; rt: number;
  courses: Course[];
  triads: Triad[];
  corners: P2[];
  cells: Cell[];
  stellate: Stellate[];
  /** The three portal-to-central septa of advanced cirrhosis. */
  septa: P2[][];
  /** Joins between courses (where they meet), for the view's small spheres. */
  joins: { x: number; y: number; r: number }[];
}

/** Samples a course has (the 2D app's N_SAMPLES). */
export const N = 40;
/** The triad's layout (lobule-tract-labels.js): the small vessels sit TRIAD_D of R out, the arteriole and ductule TRIAD_A radians either side of the outward ray. */
export const TRIAD_D = 0.09, TRIAD_A = 0.98;
/** Sinusoid lumen (healthy) in lobule radii: the 2D app's own, rs0 = clamp(0.0085 R, 1.7, 3) px (lobule-zoom.js), at the 0.0085 an iPad or a Mac shows (a phone's 1.7 px floor is a little more).
 *  It was 0.016 (drawn twice as wide "to read at the fit"), which put the cords of cells 1.9 times too far apart and the tubes 1.5 times too wide (visual review, 19 Nov). */
export const RS0 = 0.0085;
export const SIN_NARROW = 0.75;
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function rng(seed: number): () => number { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }

/** A dense curve f(u), u 0..1, resampled to N points evenly spaced along its length. */
export function curve(f: (u: number) => P2, m = 160): { pts: P2[]; len: number } {
  const d: P2[] = [], L = [0];
  for (let i = 0; i <= m; i++) d.push(f(i / m));
  for (let i = 1; i <= m; i++) L.push(L[i - 1]! + Math.hypot(d[i]![0] - d[i - 1]![0], d[i]![1] - d[i - 1]![1]));
  const len = L[m] || 1e-6, pts: P2[] = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const t = (len * k) / (N - 1);
    while (j < m - 1 && L[j + 1]! < t) j++;
    const w = clamp((t - L[j]!) / (L[j + 1]! - L[j]! || 1), 0, 1);
    pts.push([lerp(d[j]![0], d[j + 1]![0], w), lerp(d[j]![1], d[j + 1]![1], w)]);
  }
  return { pts, len };
}

/** The point a fraction u along a polyline. */
export function at(pts: readonly P2[], u: number): P2 {
  const f = clamp(u, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  return [lerp(pts[i]![0], pts[i + 1]![0], t), lerp(pts[i]![1], pts[i + 1]![1], t)];
}

/** A point on an inlet venule (lobule-look.js inletPoint): half-way along the edge, bowed in toward the centre, leaving the triad with the 2D app's slope and arriving flat. */
export const INLET_LEAN = 0.8 * Math.PI, INLET_MID = Math.sin(0.8 * Math.PI);
export function inletBow(u: number): number { const u2 = u * u, u3 = u2 * u; return INLET_LEAN * (u3 - 2 * u2 + u) + INLET_MID * (3 * u2 - 2 * u3); }
export function inletPoint(A: P2, B: P2, n: P2, bow: number, u: number): P2 {
  const g = bow * inletBow(u);
  return [A[0] + (B[0] - A[0]) * 0.5 * u + n[0] * g, A[1] + (B[1] - A[1]) * 0.5 * u + n[1] * g];
}
const rimToward = (c: P2, p: P2, r: number): P2 => { const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1; return [c[0] + (dx / l) * r, c[1] + (dy / l) * r]; };

/** How far out across the hexagon a point is, 0 at the centre, 1 on the edge (lobule-zoom.js hexFrac). */
export function hexFrac(x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; m = Math.max(m, (x * Math.cos(a) + y * Math.sin(a)) / 0.8660254); }
  return m;
}
/** Rappaport zone of a place across the lobule (q 0 at the central vein, 1 at the portal edge): 1 periportal, 2 midzonal, 3 pericentral. */
export const zoneOf = (q: number): 1 | 2 | 3 => (q > 0.66 ? 1 : q > 0.36 ? 2 : 3);

export function buildLobule(seed = 7): LobuleNet {
  const r = rng(seed);
  const R = 1, cx = 0, cy = 0;
  const rs0 = RS0, rsN = rs0 * SIN_NARROW, rcv0 = 0.07, rt = 0.1;
  const C: P2[] = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as P2);
  const courses: Course[] = [];
  const joins: LobuleNet['joins'] = [];
  const add = (kind: TubeKind, c: { pts: P2[]; len: number }, o: Partial<Course> = {}): Course => {
    const t: Course = { id: courses.length, kind, pts: c.pts, len: c.len, rho: c.pts.map(([x, y]) => Math.hypot(x - cx, y - cy)), ...o };
    courses.push(t);
    return t;
  };
  const join = (x: number, y: number, rSmall: number) => { joins.push({ x, y, r: clamp(rSmall * 1.2, 0.006, 0.03) }); };
  const polar = (x: number, y: number): [number, number] => [Math.hypot(x - cx, y - cy), Math.atan2(y - cy, x - cx)];
  const unwrap = (a: number, ref: number) => a + Math.round((ref - a) / TAU) * TAU;
  const dot = (x: number, y: number) => curve((u) => [x + (u - 0.5) * 0.06, y], 4);
  const radial = (p0: P2, p1: P2, amp: number) => {
    const [r0, a0] = polar(...p0); let [r1, a1] = polar(...p1); a1 = unwrap(a1, a0);
    const ph = r() * TAU, fq = 1.2 + r() * 1.2;
    return curve((u) => {
      const e = u * u * (3 - 2 * u), rr = lerp(r0, r1, u);
      const a = lerp(a0, a1, e) + (amp * Math.sin(Math.PI * u) * Math.sin(fq * TAU * u + ph)) / Math.max(rr, 0.01);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
  };

  // Portal triads at the six corners (venule, arteriole, ductule; the lymphatic is added with the lymph below)
  const triads: Triad[] = C.map(([x, y], i) => {
    const a = Math.atan2(y - cy, x - cx), d = TRIAD_D;
    const ha: P2 = [x + Math.cos(a + TRIAD_A) * d, y + Math.sin(a + TRIAD_A) * d];
    const bd: P2 = [x + Math.cos(a - TRIAD_A) * d, y + Math.sin(a - TRIAD_A) * d];
    const lv: P2 = [x + Math.cos(a) * d, y + Math.sin(a) * d];
    return { i, x, y, a, ha, bd, lv, pv: add('pv', dot(x, y), { tri: i }).id, haT: add('ha', dot(...ha), { tri: i }).id, bdT: add('bd', dot(...bd), { tri: i }).id, lvT: -1 };
  });

  // Inlet venules from each triad along both of its edges, a little inside the lobule
  const inletF = (i: number, dir: number) => {
    const A = C[i]!, B = C[(i + dir + 6) % 6]!, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
    const n: P2 = [(cx - mx) / nl, (cy - my) / nl], bow = 0.03;
    return (u: number) => inletPoint(A, B, n, bow, u);
  };
  const inlets: Course[] = [];
  const inletFs: ((u: number) => P2)[] = [];
  for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {
    const f = inletF(i, dir), t = add('in', curve(f), { tri: i });
    inlets[i * 2 + (dir > 0 ? 0 : 1)] = t; inletFs[t.id] = f;
  }
  for (const tr of triads) join(tr.x, tr.y, 0.011);
  for (let e = 0; e < 6; e++) { const a = inlets[e * 2]!, q = a.pts[N - 1]!; join(q[0], q[1], 0.009); }

  // Sinusoids, three generations merging pairwise toward the central vein
  const N0 = 8;
  const s0: { p: P2; inl: Course; e: number; k: number }[] = [];
  for (let e = 0; e < 6; e++) for (let k = 0; k < N0; k++) {
    const tt = (k + 0.5) / N0 + (r() - 0.5) * (0.3 / N0);
    const inl = tt < 0.5 ? inlets[e * 2]! : inlets[((e + 1) % 6) * 2 + 1]!;
    const u = clamp(tt < 0.5 ? tt / 0.5 : (1 - tt) / 0.5, 0.08, 0.95);
    s0.push({ p: inletFs[inl.id]!(u), inl, e, k });
  }
  const rho1 = 0.6, rho2 = 0.34, rIn = rcv0 * 0.55;
  const node = (pa: P2, pb: P2, rho: number): P2 => { const [, a] = polar(...pa); let [, b] = polar(...pb); b = unwrap(b, a); const m = (a + b) / 2 + (r() - 0.5) * 0.04; const rr = rho * (1 + (r() - 0.5) * 0.08); return [cx + Math.cos(m) * rr, cy + Math.sin(m) * rr]; };
  const n1: P2[] = [], L0: Course[] = [], L1: Course[] = [], L2: Course[] = [];
  for (let m = 0; m < s0.length / 2; m++) n1.push(node(s0[2 * m]!.p, s0[2 * m + 1]!.p, rho1));
  const n2: P2[] = [];
  for (let m = 0; m < Math.floor(n1.length / 2); m++) n2.push(node(n1[2 * m]!, n1[2 * m + 1]!, rho2));
  const amp = 0.012;
  s0.forEach((st, j) => {
    const t = add('s0', radial(st.p, n1[j >> 1]!, amp), { lvl: 0, edge: st.e, tri: st.k < N0 / 2 ? st.e : (st.e + 1) % 6 });
    L0.push(t); join(st.p[0], st.p[1], rsN);
  });
  n1.forEach((p, m) => { const t = add('s1', radial(p, n2[Math.min(n2.length - 1, m >> 1)]!, amp), { lvl: 1 }); L1.push(t); join(p[0], p[1], rsN); L0[2 * m]!.parent = L0[2 * m + 1]!.parent = t.id; });
  n2.forEach((p, m) => {
    const [, a] = polar(...p);
    const t = add('s2', radial(p, [cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn], amp * 0.6), { lvl: 2 });
    L2.push(t); join(p[0], p[1], rsN);
    for (const k of L1.filter((_, j) => Math.min(n2.length - 1, j >> 1) === m)) k.parent = t.id;
  });
  // Anastomoses between neighbouring sinusoids that do not merge
  const link = (a: Course, b: Course, ua: number, ub: number, lvl: number) => {
    const pa = at(a.pts, ua), pb = at(b.pts, ub);
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 0.24) return;
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, k = (r() - 0.5) * 0.25;
    add('an', curve((u) => [lerp(pa[0], pb[0], u) + (pb[1] - pa[1]) * k * Math.sin(Math.PI * u), lerp(pa[1], pb[1], u) - (pb[0] - pa[0]) * k * Math.sin(Math.PI * u)]), { lvl, sign: r() < 0.5 ? -1 : 1 });
    void mx; void my;
  };
  for (let m = 0; m < L0.length / 2; m++) link(L0[2 * m + 1]!, L0[(2 * m + 2) % L0.length]!, 0.35 + r() * 0.25, 0.35 + r() * 0.25, 0);
  for (let m = 0; m < L1.length; m += 2) if (L1[m + 1] && L1[m + 2]) link(L1[m + 1]!, L1[(m + 2) % L1.length]!, 0.4 + r() * 0.2, 0.4 + r() * 0.2, 1);
  // Central vein, end-on
  add('cv', dot(cx, cy));
  // Arterioles: from each triad's arteriole into the first stretch of a sinusoid (zone 1)
  for (const tr of triads) {
    const target = L0.find((t) => t.edge === tr.i && t.tri === tr.i) || L0[tr.i * N0]!;
    const q = at(target.pts, 0.2), A = rimToward(tr.ha, q, 0.0115);
    add('tw', curve((u) => [lerp(A[0], q[0], u) + 0.012 * Math.sin(Math.PI * u), lerp(A[1], q[1], u)]), { tri: tr.i });
    join(A[0], A[1], 0.012);
  }
  // Portal-central septa (advanced cirrhosis): from three triads into the central vein's cuff
  const septa = [0, 2, 4].map((i) => {
    const [x, y] = C[i]!, ph = r() * TAU, nx = -(cy - y), ny = cx - x;
    return curve((u) => { const e = 0.05 * Math.sin(Math.PI * u) * Math.sin(1.5 * TAU * u + ph); return [lerp(x, cx, u * 0.94) + nx * e, lerp(y, cy, u * 0.94) + ny * e]; }).pts;
  });

  // Hepatocytes: plates one cell thick between the sinusoids, ring by ring; and the cells stack outward like beads on a cord
  const cells: Cell[] = [];
  const sinP = [...L0, ...L1, ...L2].map((t) => ({ rs: rsN * (t.kind === 's0' ? 1 : t.kind === 's1' ? 1.15 : 1.3), P: t.pts.map(([x, y]) => polar(x, y)) }));
  const crossAt = (rr: number) => {
    const out: { a: number; rs: number }[] = [];
    for (const { rs, P } of sinP) for (let i = 0; i < P.length - 1; i++) {
      const [r1, a1] = P[i]!, [r2, b2] = P[i + 1]!;
      if ((r1 - rr) * (r2 - rr) > 0 || r1 === r2) continue;
      const a2 = unwrap(b2, a1), a = a1 + (a2 - a1) * ((rr - r1) / (r2 - r1));
      out.push({ a: Math.atan2(Math.sin(a), Math.cos(a)), rs }); break;
    }
    return out.sort((p, q) => p.a - q.a);
  };
  const cl = 0.052, dg = rs0 * 1.7, wT = 0.08;
  for (let rr = rcv0 * 1.55; rr < 1.02; rr += cl) {
    const X = crossAt(rr);
    if (X.length < 2) continue;
    for (let j = 0; j < X.length; j++) {
      const A = X[j]!, B = X[(j + 1) % X.length]!, gA = (j + 1 === X.length ? B.a + TAU : B.a) - A.a;
      const use = rr * gA - A.rs - B.rs - 2 * dg;
      if (use < 0.02) continue;
      const n = Math.max(1, Math.round(use / wT)), w = use / n;
      for (let c = 0; c < n; c++) {
        const a = A.a + (A.rs + dg + (c + 0.5) * w) / rr, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        const q = hexFrac(x, y);
        if (q > 0.975) continue;
        const l = cl * (0.84 + r() * 0.08), wd = w * (n > 1 ? 0.86 : 0.94), tone = r(), nu = (r() - 0.5) * 0.3, drop = r();
        const jx = r() - 0.5, jy = r() - 0.5, ja = r() - 0.5;   // (the 2D app's jitter: how far a cell strays in cirrhosis, when the plates lose their order)
        cells.push({ x, y, a, l, w: wd, tone, nu, q, drop, jx, jy, ja });
      }
    }
  }
  // Stellate cells in the space of Disse, beside sinusoids
  const stellate: Stellate[] = [];
  for (let i = 0; i < 22; i++) {
    const t = [...L0, ...L1][Math.floor(r() * (L0.length + L1.length))]!, u = 0.15 + r() * 0.7, [x, y] = at(t.pts, u), [x2, y2] = at(t.pts, u + 0.02);
    const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, sd = r() < 0.5 ? -1 : 1;
    r();
    stellate.push({ x: x - (dy / l) * sd * (rsN + rs0 * 0.9), y: y + (dx / l) * sd * (rsN + rs0 * 0.9), a: Math.atan2(dy, dx), nx: (-dy / l) * sd, ny: (dx / l) * sd });
  }

  // Lymph: the tract's own lymphatic, the terminal lymphatics along the edges, the space of Disse beside each sinusoid
  for (const tr of triads) tr.lvT = add('lv', dot(tr.lv[0], tr.lv[1]), { tri: tr.i }).id;
  const lt: Course[] = [];
  for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {
    const A = C[i]!, B = C[(i + dir + 6) % 6]!, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
    const nx = (mx - cx) / nl, ny = (my - cy) / nl, k = i * 2 + (dir > 0 ? 0 : 1), f = inletFs[inlets[k]!.id]!;
    const lv = rimToward(triads[i]!.lv, [f(0.22)[0] + nx * 0.037, f(0.22)[1] + ny * 0.037], 0.016);
    const t = add('lt', curve((u) => {
      const q = f(1 - u), o = lerp(0.04, 0.025, 1 - u), e = smooth(0.78, 1, u), px = q[0] + nx * o, py = q[1] + ny * o;
      return [lerp(px, lv[0], e), lerp(py, lv[1], e)];
    }), { tri: i });
    lt[k] = t;
  }
  for (const tr of triads) join(tr.lv[0], tr.lv[1], 0.008);
  for (const t of L0) {
    const P = t.pts, side = t.tri === t.edge ? lt[t.edge! * 2]! : lt[((t.edge! + 1) % 6) * 2 + 1]!;
    let E = side.pts[0]!, bd = Infinity;
    for (const q of side.pts) { const d = Math.hypot(q[0] - P[0]![0], q[1] - P[0]![1]); if (d < bd) { bd = d; E = q; } }
    const poly: P2[] = [E, ...P];
    add('ly', curve((u) => at(poly, u)), { lvl: 0, sib: t.id });
  }
  for (const t of L1) add('ly', curve((u) => at(t.pts, u)), { lvl: 1, sib: t.id });
  for (const t of L2) add('ly', curve((u) => at(t.pts, u)), { lvl: 2, sib: t.id });

  return { R: 1, rs0, rsN, rcv0, rt, courses, triads, corners: C, cells, stellate, septa, joins };
}

/** Courses of one or more kinds. */
export const ofKind = (net: LobuleNet, ...kinds: TubeKind[]): Course[] => net.courses.filter((c) => kinds.includes(c.kind));
