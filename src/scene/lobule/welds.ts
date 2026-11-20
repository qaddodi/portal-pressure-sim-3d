// Welded junctions for the Lobule (Mohammad, 20 Nov 2026: "how about junctions in the lobule? bile ducts, lymph ducts? all welded?"). The Lobule's vessels were separate tubes that
// overlap where they meet: a round cap lying inside the next tube, a stub where a branch ends against a side, a lump where two tubes of different width run together. This is the Anatomy's
// junction skin (vessels/skin, docs/junction-skin-spec.md) applied to the Lobule's own network, with the same SDF and the same mesh builder, not a second system:
//
//   1. FIND every junction in the network by where the courses touch (no list of ids): two or more course ends at one place (a Y: two sinusoids merging into the next generation, two
//      inlets meeting at the middle of an edge), or one course's end on the side of another (a T: a sinusoid leaving an inlet, an anastomosis or a twig meeting a sinusoid, a bile canal
//      meeting its duct). A T splits the host in two arms there, so every junction is 3 arms (2 for an end-to-end join), at most 4.
//   2. CUT each arm back to a seam ring: one of its own tube rings, the first that stands clear of the other arms' blend (spec rule 4.4) and on the convex hull of all the rings.
//   3. BUILD the skin between the seam rings (vessels/skin/mesh.ts buildSkin): one closed mesh, vertices of the seam rings copied bit for bit, so there is no crack, filled out as the
//      smooth union (smooth-min) of the arms' tapered capsules, the blend 2D draws its forks with.
//
// Pure (numbers in, numbers out): the scene (micro3d/lobule3d.ts) lays the tubes out from the plan and gives the skins to the part that holds their host. A junction that cannot be built (no
// seam clears, the hull misses a ring, two junctions too close on one course) is left as it was: both tubes keep their round ends and overlap, and the planner says so in `skipped`.
import { SkinBuildError, type SkinArm, type SkinCut, type SkinJunction, type SkinMesh } from '../vessels/skin/types.ts';
import { buildSkin, ringHull } from '../vessels/skin/mesh.ts';
import { sdArm, skinKOf, type Capsule } from '../vessels/skin/sdf.ts';
import { tubeFrames } from '../micro3d/cel3d.ts';

export type V3 = [number, number, number];

/** One tube of the network: its path (x, y, z, local units), the radius it has at each sample, and a colour place per sample (what the scene's lens gives it a colour from). */
export interface WeldCourse {
  key: string;
  /** Where the flow marks' phase begins (the scene's per-course offset along the tube). */
  phase: number;
  /** Courses of one family only join each other: the blood vessels, the bile ducts. */
  family: string;
  pts: V3[];
  rad: number[];
  w: number[];
  /** Vertices round each ring. */
  seg: number;
}

/** How near (local units, in the plan) a course's end must lie to another course for the two to be one junction: the sampling's own sag, far below any radius. */
export const TOUCH = 4e-4;
/** A seam is at least this many of its own radii from the junction centre (spec 4.4 rule 2) and clear of the other arms' blend by this many more radii beyond the blend width (rule 1, amended). */
export const SEAM_MIN_R = 1.5, SEAM_CLEAR_R = 0.5;
/** An arm's capsule (what the fillet is shaped by) runs this far from J at most, in its own radii, and a seam may not pass this share of the arm's room. */
export const ARM_REACH_R = 40, SEAM_ROOM = 0.85;
/** The shaping capsule of an arm runs this many of its radii past the seam (so the smooth union is whole where the skin meets the tube). */
export const SKIN_TAIL_R = 2;
/** The most vertices a skin may grow to (a fillet of these thin tubes is a few hundred; more is a remesh running away on a bad shape, and the junction is left as it was). */
export const MAX_SKIN_VERTS = 1400;
/** How many times a build that fails (a fold, too many vertices) is tried again with the seams a ring further out. */
export const BUILD_RETRIES = 4;
/** The most rings a seam is pushed out (spec 4.4: 40 tries). */
export const MAX_PUSH = 40;
/** The fewest tube rings between the seams of two junctions on one course (a seam shared by two skins is two skins that touch: no gap, no crack, nothing between). */
export const MIN_BETWEEN = 0;

/** A tube's arm at a junction. */
export interface WeldArm {
  key: string;
  /** Index (in the course's planned path) of the sample at J and the step outward (+1 or -1). */
  at: number;
  dir: 1 | -1;
  /** The seam: the ring index that ends the kept tube. */
  seam: number;
  /** The colour place (`w`) at the seam, the radius at the seam, and the path distance from J. */
  wSeam: number;
  rSeam: number;
}

export interface WeldSkin {
  node: string;
  /** The course that carries the skin's colour and marks: the T's host, else the widest arm. */
  host: string;
  /** Whether it is a T (its host runs through, so the host's flow marks carry on across the skin). */
  through: boolean;
  arms: WeldArm[];
  J: V3;
  mesh: SkinMesh;
}

export interface WeldPiece { i0: number; i1: number; capStart: boolean; capEnd: boolean }

export interface WeldCourseOut {
  key: string;
  /** The flow marks' phase along the course (WeldCourse.phase). */
  phase: number;
  /** The path with the junction points of T's inserted. */
  pts: V3[];
  rad: number[];
  w: number[];
  /** Cumulative plan length along the planned path (starts at 0). */
  arc: number[];
  /** The kept stretches of the tube (a through host is cut into several). */
  pieces: WeldPiece[];
  /** Arc ranges (plan length) where no flow mark may be drawn: the junctions this course ends in (a through host is not hushed: its marks run on over the skin). */
  hush: [number, number][];
}

export interface WeldPlan {
  courses: Map<string, WeldCourseOut>;
  skins: WeldSkin[];
  /** Junctions found and not welded, with why (the tubes keep their round ends there). */
  skipped: { node: string; why: string }[];
}

interface Touch { c: number; end: 0 | 1; to: number; seg: number; t: number; x: number; y: number; atEnd: boolean }

const hyp = Math.hypot;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Plan distance from (x, y) to the segment a-b, with the foot's parameter. */
function footOnSegment(x: number, y: number, a: V3, b: V3): { d: number; t: number } {
  const bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by;
  let t = bb > 0 ? ((x - a[0]) * bx + (y - a[1]) * by) / bb : 0;
  t = Math.min(1, Math.max(0, t));
  return { d: hyp(x - a[0] - t * bx, y - a[1] - t * by), t };
}

/** Every place one course's end touches another course of its family. */
function findTouches(cs: readonly WeldCourse[]): Touch[] {
  const out: Touch[] = [];
  cs.forEach((c, i) => {
    for (const end of [0, 1] as const) {
      const P = end === 0 ? c.pts[0]! : c.pts[c.pts.length - 1]!;
      let best: Touch | null = null, bd = TOUCH;
      cs.forEach((o, j) => {
        if (j === i || o.family !== c.family) return;
        for (let s = 0; s < o.pts.length - 1; s++) {
          const f = footOnSegment(P[0], P[1], o.pts[s]!, o.pts[s + 1]!);
          if (f.d < bd) { bd = f.d; best = { c: i, end, to: j, seg: s, t: f.t, x: lerp(o.pts[s]![0], o.pts[s + 1]![0], f.t), y: lerp(o.pts[s]![1], o.pts[s + 1]![1], f.t), atEnd: (s === 0 && f.t < 1e-6) || (s === o.pts.length - 2 && f.t > 1 - 1e-6) }; }
        }
      });
      if (best) out.push(best);
    }
  });
  return out;
}

interface Node { id: string; kind: 'Y' | 'T'; J: V3; ends: { c: number; end: 0 | 1 }[]; host?: { c: number; seg: number; t: number } }

/** The junctions of the network: ends that meet at one place (Y), and ends that land on the side of another course (T). */
function findNodes(cs: readonly WeldCourse[]): Node[] {
  const touches = findTouches(cs), nodes: Node[] = [], used = new Set<string>();
  const endKey = (c: number, end: number) => `${c}:${end}`;
  // ends that meet another course's END: cluster the ends that lie at one place
  const endTouch = touches.filter((t) => t.atEnd);
  for (const t of endTouch) {
    if (used.has(endKey(t.c, t.end))) continue;
    const c = cs[t.c]!, P = t.end === 0 ? c.pts[0]! : c.pts[c.pts.length - 1]!;
    const ends: { c: number; end: 0 | 1 }[] = [];
    cs.forEach((o, j) => { for (const e of [0, 1] as const) { const Q = e === 0 ? o.pts[0]! : o.pts[o.pts.length - 1]!; if (hyp(Q[0] - P[0], Q[1] - P[1]) < TOUCH && !used.has(endKey(j, e)) && o.family === c.family) ends.push({ c: j, end: e }); } });
    if (ends.length < 2) continue;
    for (const e of ends) used.add(endKey(e.c, e.end));
    const J: V3 = [0, 0, 0];
    for (const e of ends) { const o = cs[e.c]!, Q = e.end === 0 ? o.pts[0]! : o.pts[o.pts.length - 1]!; for (let d = 0; d < 3; d++) J[d] += Q[d]! / ends.length; }
    nodes.push({ id: `Y(${ends.map((e) => `${cs[e.c]!.key}.${e.end}`).join('+')})`, kind: 'Y', J, ends });
  }
  // ends that land on a side
  for (const t of touches) {
    if (t.atEnd || used.has(endKey(t.c, t.end))) continue;
    used.add(endKey(t.c, t.end));
    const h = cs[t.to]!, z = lerp(h.pts[t.seg]![2], h.pts[t.seg + 1]![2], t.t);
    nodes.push({ id: `T(${cs[t.c]!.key}.${t.end}>${h.key})`, kind: 'T', J: [t.x, t.y, z], ends: [{ c: t.c, end: t.end }], host: { c: t.to, seg: t.seg, t: t.t } });
  }
  return nodes;
}

/** A capsule along `idx` samples of a course outward from J: the sample positions with the radius at each. */
function capsuleOf(path: readonly V3[], rad: readonly number[], J: V3, at: number, dir: 1 | -1, room: number, reach: number): Capsule {
  const pts: number[] = [J[0], J[1], J[2]], r: number[] = [rad[at]!];
  let len = 0, prev: V3 = J;
  for (let i = at + dir; i >= 0 && i < path.length; i += dir) {
    const p = path[i]!;
    len += hyp(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
    pts.push(p[0], p[1], p[2]); r.push(rad[i]!);
    if (len >= Math.min(room, reach)) break;
  }
  return { n: r.length, pts: Float64Array.from(pts), r: Float64Array.from(r) };
}

/** A capsule cut to the first `len` of its length (the point that passes it kept, and the capsule ends there): the skin's own SDF, which only needs the arm out to its seam and a little past. */
function trimmedCapsule(c: Capsule, len: number): Capsule {
  let run = 0, n = c.n;
  for (let i = 1; i < c.n; i++) {
    run += hyp(c.pts[3 * i]! - c.pts[3 * i - 3]!, c.pts[3 * i + 1]! - c.pts[3 * i - 2]!, c.pts[3 * i + 2]! - c.pts[3 * i - 1]!);
    if (run >= len) { n = i + 1; break; }
  }
  return n === c.n ? c : { n, pts: c.pts.slice(0, 3 * n), r: c.r.slice(0, n) };
}

/** The arc length of a path from its start to each sample (plan length). */
const arcsOf = (pts: readonly V3[]): number[] => { const a = [0]; for (let i = 1; i < pts.length; i++) a.push(a[i - 1]! + hyp(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])); return a; };

/** The room an arm has outward from index `at`: the plan length of the path beyond it (the tube is only kept to its far end). */
const roomOf = (arc: readonly number[], at: number, dir: 1 | -1): number => (dir === 1 ? arc[arc.length - 1]! - arc[at]! : arc[at]!);

/** Plans every junction of `courses`. */
export function planWelds(courses: readonly WeldCourse[], opts: { avoid?: readonly { x: number; y: number; r: number }[] } = {}): WeldPlan {
  const skipped: WeldPlan['skipped'] = [];
  // (a meeting inside a vessel's mouth is not a junction: the tubes run into the pool and are lost in it, whatever they do there)
  const nodes = findNodes(courses).filter((n) => !(opts.avoid ?? []).some((d) => hyp(n.J[0] - d.x, n.J[1] - d.y) < d.r));
  // the planned paths: a copy of each course with every T's junction point inserted into its host
  const P = courses.map((c) => ({ pts: c.pts.map((p) => [...p] as V3), rad: [...c.rad], w: [...c.w], mark: new Array<string | null>(c.pts.length).fill(null) }));
  const hostSpots = new Map<number, { node: Node; pos: number }[]>();
  for (const n of nodes) if (n.host) { const l = hostSpots.get(n.host.c) ?? []; l.push({ node: n, pos: n.host.seg + n.host.t }); hostSpots.set(n.host.c, l); }
  for (const [ci, spots] of hostSpots) {
    spots.sort((a, b) => b.pos - a.pos);   // (from the far end, so an insertion never moves a spot still to come)
    const p = P[ci]!;
    for (const { node } of spots) {
      const { seg, t } = node.host!;
      p.pts.splice(seg + 1, 0, [...node.J] as V3);
      p.rad.splice(seg + 1, 0, lerp(p.rad[seg]!, p.rad[seg + 1]!, t));
      p.w.splice(seg + 1, 0, lerp(p.w[seg]!, p.w[seg + 1]!, t));
      p.mark.splice(seg + 1, 0, node.id);
    }
  }
  const arcs = P.map((p) => arcsOf(p.pts));
  const accepted: WeldSkin[] = [];
  const hush = new Map<number, [number, number][]>();
  const cutsOf = new Map<number, { from: number; to: number }[]>();   // the sample ranges (inclusive of the seams) a skin has taken out of a course

  const sorted = [...nodes].sort((a, b) => a.id < b.id ? -1 : 1);
  for (const n of sorted) {
    try {
      // the arms
      type A = { c: number; at: number; dir: 1 | -1 };
      const arms: A[] = [];
      for (const e of n.ends) {
        const last = P[e.c]!.pts.length - 1;
        arms.push({ c: e.c, at: e.end === 0 ? 0 : last, dir: e.end === 0 ? 1 : -1 });
      }
      if (n.host) {
        const ci = n.host.c, at = P[ci]!.mark.indexOf(n.id);
        if (at < 1 || at > P[ci]!.pts.length - 2) throw new SkinBuildError(n.id, 'the host has no room either side of the junction');
        arms.push({ c: ci, at, dir: -1 }, { c: ci, at, dir: 1 });
      }
      if (arms.length < 2 || arms.length > 4) throw new SkinBuildError(n.id, `${arms.length} arms`);
      // widest arm first (the spec's order: the skin's k comes from the narrowest)
      arms.sort((a, b) => P[b.c]!.rad[b.at]! - P[a.c]!.rad[a.at]!);
      const J = n.J;
      const caps = arms.map((a) => capsuleOf(P[a.c]!.pts, P[a.c]!.rad, J, a.at, a.dir, roomOf(arcs[a.c]!, a.at, a.dir) * SEAM_ROOM * 1.3, ARM_REACH_R * P[a.c]!.rad[a.at]!));
      const skArms: SkinArm[] = arms.map((a) => ({ vesselId: courses[a.c]!.key, end: a.dir === 1 ? 0 : 1, courseIndex: 0, dataIndex: -1, lensIndex: -1, baseD: 0, widthKind: 0, restR: P[a.c]!.rad[a.at]! }));
      const k = skinKOf(skArms);
      // the seams: the first ring of each arm that stands clear (rule 1, 2), then pushed out together until the hull covers every ring
      const seam = arms.map((a) => a.at + a.dir);
      const frames = arms.map((a) => tubeFrames(P[a.c]!.pts));
      const ringOf = (ai: number, idx: number): { pos: Float32Array; nor: Float32Array } => {
        const a = arms[ai]!, p = P[a.c]!, fr = frames[ai]!, seg = courses[a.c]!.seg, r = p.rad[idx]!, c = p.pts[idx]!, nn = fr.N[idx]!, bn = fr.Bn[idx]!;
        const pos = new Float32Array(3 * seg), nor = new Float32Array(3 * seg);
        for (let q = 0; q < seg; q++) {
          const ang = (q / seg) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
          const dx = nn[0] * ca + bn[0] * sa, dy = nn[1] * ca + bn[1] * sa, dz = nn[2] * ca + bn[2] * sa;
          pos[3 * q] = c[0] + dx * r; pos[3 * q + 1] = c[1] + dy * r; pos[3 * q + 2] = c[2] + dz * r;
          nor[3 * q] = dx; nor[3 * q + 1] = dy; nor[3 * q + 2] = dz;
        }
        return { pos, nor };
      };
      const clear = (ai: number, idx: number): boolean => {
        const a = arms[ai]!, p = P[a.c]!, c = p.pts[idx]!;
        if (hyp(c[0] - J[0], c[1] - J[1], c[2] - J[2]) < SEAM_MIN_R * p.rad[idx]!) return false;
        const ring = ringOf(ai, idx).pos, need = k + SEAM_CLEAR_R * p.rad[idx]!;
        for (let o = 0; o < arms.length; o++) {
          if (o === ai) continue;
          for (let q = 0; q < ring.length / 3; q++) if (sdArm(caps[o]!, ring[3 * q]!, ring[3 * q + 1]!, ring[3 * q + 2]!) < need) return false;
        }
        return true;
      };
      let rings: { pos: Float32Array; nor: Float32Array }[] = [];
      let ok = false;
      for (let tries = 0; tries < MAX_PUSH && !ok; tries++) {
        for (let ai = 0; ai < arms.length; ai++) {
          const a = arms[ai]!, last = P[a.c]!.pts.length - 1;
          while (!clear(ai, seam[ai]!)) {
            seam[ai] = seam[ai]! + a.dir;
            if (seam[ai]! < 0 || seam[ai]! > last || Math.abs(seam[ai]! - a.at) > (SEAM_ROOM * Math.abs((a.dir === 1 ? last : 0) - a.at)) + 0.5) throw new SkinBuildError(n.id, `no seam on ${courses[a.c]!.key} stands clear within its room`);
          }
        }
        rings = arms.map((_, ai) => ringOf(ai, seam[ai]!));
        if (ringHull(rings.map((r) => r.pos)).ok) ok = true;
        else for (let ai = 0; ai < arms.length; ai++) { const a = arms[ai]!, nx = seam[ai]! + a.dir; if (nx < 0 || nx > P[a.c]!.pts.length - 1) throw new SkinBuildError(n.id, 'the hull misses a ring and the arm is out of room'); seam[ai] = nx; }
      }
      if (!ok) throw new SkinBuildError(n.id, 'the hull never covered the seam rings');
      // the junction must not overlap one already accepted on a course: the seams and what lies between them
      const takenNow = () => arms.map((a, ai) => ({ c: a.c, from: Math.min(a.at, seam[ai]!), to: Math.max(a.at, seam[ai]!) }));
      const meets = () => { for (const t of takenNow()) for (const o of cutsOf.get(t.c) ?? []) if (!(t.to < o.from - MIN_BETWEEN || t.from > o.to + MIN_BETWEEN)) throw new SkinBuildError(n.id, `its seams on ${courses[t.c]!.key} meet another junction's`); };
      meets();
      const cuts: SkinCut[] = arms.map((a, ai) => ({ vesselId: courses[a.c]!.key, end: a.dir === 1 ? 0 : 1, ring: seam[ai]!, u: seam[ai]! / Math.max(1, P[a.c]!.pts.length - 1) }));
      // (the fillet is shaped by each arm out to a little past its seam: a longer capsule only slows the build, closestOnArm being what it spends its time in)
      const shaped: Capsule[] = caps.map((c, ai) => { const sc = P[arms[ai]!.c]!.pts[seam[ai]!]!; return trimmedCapsule(c, hyp(sc[0] - J[0], sc[1] - J[1], sc[2] - J[2]) + SKIN_TAIL_R * P[arms[ai]!.c]!.rad[seam[ai]!]!); });
      let mesh: SkinMesh | null = null;
      for (let again = 0; !mesh; again++) {
        try { mesh = buildSkin({ node: n.id, J, arms: skArms } as SkinJunction, cuts, rings.map((r) => r.pos), rings.map((r) => r.nor), shaped, MAX_SKIN_VERTS); }
        catch (e) {
          // a remesh that folds or outgrows its limit on this seam is tried again a ring further out on every arm (the fillet is then a gentler shape), a few times
          if (!(e instanceof SkinBuildError) || again >= BUILD_RETRIES) throw e;
          for (let ai = 0; ai < arms.length; ai++) {
            const a = arms[ai]!, nx = seam[ai]! + a.dir;
            if (nx < 0 || nx > P[a.c]!.pts.length - 1) throw e;
            seam[ai] = nx; rings[ai] = ringOf(ai, nx); cuts[ai] = { ...cuts[ai]!, ring: nx };
            const sc = P[a.c]!.pts[nx]!;
            shaped[ai] = trimmedCapsule(caps[ai]!, hyp(sc[0] - J[0], sc[1] - J[1], sc[2] - J[2]) + SKIN_TAIL_R * P[a.c]!.rad[nx]!);
          }
          if (!ringHull(rings.map((r) => r.pos)).ok) throw e;
        }
      }
      meets();
      for (const t of takenNow()) { const l = cutsOf.get(t.c) ?? []; l.push({ from: t.from, to: t.to }); cutsOf.set(t.c, l); }
      const wArms: WeldArm[] = arms.map((a, ai) => ({ key: courses[a.c]!.key, at: a.at, dir: a.dir, seam: seam[ai]!, wSeam: P[a.c]!.w[seam[ai]!]!, rSeam: P[a.c]!.rad[seam[ai]!]! }));
      // flow marks: a course that ENDS in this junction is hushed over its last stretch; a host runs through (its marks carry across the skin)
      arms.forEach((a, ai) => {
        const isHost = n.host && a.c === n.host.c;
        if (isHost) return;
        const arc = arcs[a.c]!, s = arc[seam[ai]!]!, J0 = arc[a.at]!;
        const l = hush.get(a.c) ?? []; l.push([Math.min(s, J0), Math.max(s, J0)]); hush.set(a.c, l);
      });
      const hostKey = n.host ? courses[n.host.c]!.key : courses[arms[0]!.c]!.key;
      accepted.push({ node: n.id, host: hostKey, through: !!n.host, arms: wArms, J, mesh });
    } catch (e) {
      if (!(e instanceof SkinBuildError)) throw e;
      skipped.push({ node: n.id, why: e.message });
    }
  }
  // the tubes: what is kept of each course. Each arm takes out of its course the samples between J and its seam (the seam ring itself stays, the tube ends on it); a through host's two arms
  // together take out the stretch round J. What is left is whole runs of samples: each run is a tube, with a round cap only at an end of the course no skin took.
  const out = new Map<string, WeldCourseOut>();
  courses.forEach((c, ci) => {
    const p = P[ci]!, n = p.pts.length, gone = new Uint8Array(n);
    for (const s of accepted) for (const a of s.arms) if (a.key === c.key) {
      if (a.dir === 1) { for (let i = a.at; i < a.seam; i++) gone[i] = 1; } else { for (let i = a.seam + 1; i <= a.at; i++) gone[i] = 1; }
    }
    const pieces: WeldPiece[] = [];
    for (let i = 0; i < n;) {
      if (gone[i]) { i++; continue; }
      let j = i;
      while (j + 1 < n && !gone[j + 1]) j++;
      if (j > i) pieces.push({ i0: i, i1: j, capStart: i === 0, capEnd: j === n - 1 });
      i = j + 1;
    }
    out.set(c.key, { key: c.key, phase: c.phase, pts: p.pts, rad: p.rad, w: p.w, arc: arcs[ci]!, pieces, hush: hush.get(ci) ?? [] });
  });
  return { courses: out, skins: accepted, skipped };
}
