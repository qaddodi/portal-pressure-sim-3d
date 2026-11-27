// Where the sinusoid view stands in the lobule, found by RULE on the lobule's own sinusoids and never by a hand-picked number (owner, 27 Nov: "zoom from anatomy to
//  lobule to sinusoid ... every zoom out should feel
// like one continuous zoom"). The 3D lobule grows the sinusoid view's own layout round this place (micro3d/lobule-fine.ts), so the station is where the lobule's
//  neighbouring sinusoids lie most like the view's rows: in
// zone 2 (the middle of the lobule's radius, the sinusoid's own place in the teaching), on a sinusoid that runs along the view's x axis, with a neighbour on each
//  side nearly parallel to it and the two the same distance
// away, at two row spacings (the view draws one row between the sinusoid and each neighbour). It is a pure function of the net; frames.ts holds its answer as
//  constants (the search costs a third of a second, too much for a
// phone's boot) and tests/dive-scales-agree.test.ts holds the constants against this function on buildLobule(7).
import type { LobuleNet } from './geometry.ts';
import { hexFrac, zoneOf } from './geometry.ts';
import { PERIOD } from '../sinusoid/layout.ts';
import { LOBULE_R } from './sizes.ts';
import { SIN_REL } from './frames.ts';
import { U } from '../sinusoid/view.ts';

/** Micrometres in one lobule local unit: the view's µm are U plane units and a plane unit is SIN_REL local units (frames.ts), so this is the one scale every part reads
 *  (about 235: the lobule is 1.4 mm across). */
export const UM_PER_LOCAL = 1 / (U * SIN_REL);
/** How parallel the neighbouring sinusoids must run (degrees), and how far off the view's x axis the station's own sinusoid may run (degrees, either way along it).
 *  6.5 where the lead asked for about 5: the best place on this lobule has its two neighbours at 1.3 and 6.0 degrees. */
export const PARALLEL_DEG = 6.5, AXIS_DEG = 8;
/** How near a neighbour may be (µm): a sinusoid closer than this is the station's own branch, not a neighbour. And how far along (as a share of the way across) a
 *  neighbour's nearest point may lie: a cone about the normal. */
export const NEIGHBOUR_MIN_UM = 26, NEIGHBOUR_CONE = 0.5;

export interface Station {
  /** The lobule local units (x right, y up: the lobule's own frame, lobule/shots.ts lobuleToScene) of the point. */
  x: number; y: number;
  /** The way the blood runs there, radians in the lobule's local frame (portal to central), in (-pi, pi]. */
  angle: number;
  course: number; sample: number;
  /** The distances (µm) to the nearest sinusoid on the left and right of the flow, and each one's angle to it (degrees). */
  gapLeft: number; gapRight: number; turnLeft: number; turnRight: number;
  score: number;
}

interface Pt { id: number; i: number; x: number; y: number; a: number; q: number }
const wrapPi = (a: number): number => { const t = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return t - Math.PI; };
/** Degrees between two undirected lines. */
const lineTurn = (a: number, b: number): number => { const d = Math.abs(wrapPi(a - b)); return (Math.min(d, Math.PI - d) * 180) / Math.PI; };

/** Every interior sample of the net's blood sinusoids (s0, s1, s2) in lobule local units, with its flow angle and its place across the lobule (hexFrac, 0 at the vein, 1 at the edge). */
export function sinusoidSamples(net: LobuleNet): Pt[] {
  const out: Pt[] = [];
  for (const c of net.courses) {
    if (c.kind !== 's0' && c.kind !== 's1' && c.kind !== 's2') continue;
    c.pts.forEach((p, i) => {
      if (i === 0 || i === c.pts.length - 1) return;
      // (the direction is the chord over three samples each side, about 0.2 of a lobule radius: one sample's own turn is noise on a bent course)
      const a = c.pts[Math.max(0, i - 3)]!, b = c.pts[Math.min(c.pts.length - 1, i + 3)]!;
      out.push({ id: c.id, i, x: p[0] * LOBULE_R, y: -p[1] * LOBULE_R, a: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), q: hexFrac(p[0], p[1]) });
    });
  }
  return out;
}

/** The place: of the zone 2 samples running along x, the one whose nearest sinusoids either side are parallel to it (within PARALLEL_DEG), the same distance away
 *  and nearest `2 * PERIOD` µm: the view's row spacing
 *  twice, one row between. The cost is the two gaps' difference and their distance from that spacing (as shares of it) and the two turns (as shares of PARALLEL_DEG). */
export function placedSinusoidStation(net: LobuleNet, period = PERIOD, parallel = PARALLEL_DEG, cone = NEIGHBOUR_CONE): Station | null {
  const all = sinusoidSamples(net), want = 2 * period, minD = NEIGHBOUR_MIN_UM / UM_PER_LOCAL;
  let best: Station | null = null;
  for (const s of all) {
    if (zoneOf(s.q) !== 2) continue;
    const toX = Math.min(lineTurn(s.a, 0), lineTurn(s.a, Math.PI));
    if (toX > AXIS_DEG) continue;
    const dx = Math.cos(s.a), dy = Math.sin(s.a), nx = -dy, ny = dx;
    const side = [{ d: Infinity, h: Infinity, t: 0 }, { d: Infinity, h: Infinity, t: 0 }];
    for (const t of all) {
      if (t.id === s.id) continue;
      const ex = t.x - s.x, ey = t.y - s.y, across = ex * nx + ey * ny, along = ex * dx + ey * dy, k = across > 0 ? 0 : 1, d = Math.abs(across), h = Math.hypot(ex, ey);
      if (d < minD || Math.abs(along) > cone * d) continue;
      // (the nearest neighbour is the nearest by straight distance, its gap is its distance across)
      if (h < side[k]!.h) side[k] = { d, h, t: lineTurn(t.a, s.a) };
    }
    const l = side[0]!, r = side[1]!;
    if (!(l.d < Infinity) || !(r.d < Infinity) || l.t > parallel || r.t > parallel) continue;
    const gl = l.d * UM_PER_LOCAL, gr = r.d * UM_PER_LOCAL;
    const score = Math.abs(gl - gr) / want + (Math.abs(gl - want) + Math.abs(gr - want)) / want + (l.t + r.t) / parallel / 4 + toX / AXIS_DEG / 8;
    if (!best || score < best.score) best = { x: s.x, y: s.y, angle: wrapPi(s.a), course: s.id, sample: s.i, gapLeft: gl, gapRight: gr, turnLeft: l.t, turnRight: r.t, score };
  }
  return best;
}
