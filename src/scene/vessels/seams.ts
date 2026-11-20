// The running stitch round a surgical shunt's sewn end (2D stage-transitions.js anastomoses, suture-marks.js seamTable / seamDashes): a fine thread in dashes round the shunt where it meets the host vein's wall.
// Here the seam is one ring of dashes on the tube at the distance from the shunt's end where its course leaves the host's wall (found on the 2D courses); a shunt whose end lies in no host keeps the old three ticks,
// a ring at 10 units. Pure: figure units from the start and from the end of the vessel.
import { EDGE_PATH_2D } from './paths.copied.ts';
import { NETWORK, NETWORK_BY_ID } from './network.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';

/** The surgical shunts that are sewn (the Warren, the portocaval, the mesocaval and the Meso-Rex). */
export const SEWN_IDS: readonly string[] = ['S_DSR', 'S_PC', 'S_MC', 'REX'];
type Pt = readonly [number, number];
const WALL = 1, STEP = 0.75, TICKS = 10;

const distToLine = (cur: readonly Pt[], x: number, y: number): number => {
  let m = Infinity;
  for (let i = 1; i < cur.length; i++) {
    const [ax, ay] = cur[i - 1]!, [bx, by] = cur[i]!, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return m;
};
/** The point at arc length d from the start of a polyline. */
function pointAt(cur: readonly Pt[], d: number): Pt {
  let s = 0;
  for (let i = 1; i < cur.length; i++) {
    const l = Math.hypot(cur[i]![0] - cur[i - 1]![0], cur[i]![1] - cur[i - 1]![1]);
    if (s + l >= d || i === cur.length - 1) { const t = l > 0 ? Math.min(1, Math.max(0, (d - s) / l)) : 0; return [cur[i - 1]![0] + (cur[i]![0] - cur[i - 1]![0]) * t, cur[i - 1]![1] + (cur[i]![1] - cur[i - 1]![1]) * t]; }
    s += l;
  }
  return cur[cur.length - 1]!;
}
const lengthOf = (c: readonly Pt[]): number => { let s = 0; for (let i = 1; i < c.length; i++) s += Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1]); return s; };

/** The veins a shunt can be sewn into: a vein, a collateral or a liver vessel that is not an artery (2D hostable). */
const hosts = (id: string) => NETWORK.filter((v) => !v.feeder && v.id !== id && v.tone !== 'artery' && (v.kind === 'vein' || v.kind === 'collateral' || v.kind === 'liver') && EDGE_PATH_2D[v.id]);

const memo = new Map<string, readonly [number, number]>();
/** Where the stitch ring lies, in figure units from each end of the shunt: its distance in from the end where the shunt's course leaves the host's wall. */
export function seamsOf(id: string): readonly [number, number] {
  const hit = memo.get(id);
  if (hit) return hit;
  const path = EDGE_PATH_2D[id] as readonly Pt[] | undefined;
  let out: readonly [number, number] = [0, 0];
  if (path && NETWORK_BY_ID.get(id)) {
    const L = lengthOf(path), cand = hosts(id), end = (atEnd: boolean): number => {
      const at = (d: number): Pt => pointAt(path, atEnd ? L - d : d);
      const p0 = at(0);
      let host: { path: readonly Pt[]; r: number } | null = null, bu = 0;
      for (const h of cand) {
        const hp = EDGE_PATH_2D[h.id] as readonly Pt[], hr = h.radius * UNITS_PER_SCENE + WALL, u = hr - distToLine(hp, p0[0], p0[1]);
        if (u > bu) { bu = u; host = { path: hp, r: hr }; }
      }
      if (!host) return Math.min(TICKS, 0.45 * L);   // (in no host: the old three ticks, 10 units in)
      const maxSl = Math.min(60, 0.45 * L);
      for (let sl = 0; sl <= maxSl; sl += STEP) { const q = at(sl); if (host.r - distToLine(host.path, q[0], q[1]) < -0.3) return Math.max(sl, 1.5); }
      return Math.min(TICKS, 0.45 * L);
    };
    out = [end(false), end(true)];
  }
  memo.set(id, out);
  return out;
}
/** What the shader gets: the Warren shunt's start and the end-to-side portocaval shunt's start are the vein itself, so nothing is sewn there (2D sutureRunsOn); a side-to-side portocaval shunt is sewn at both. */
export function seamsFor(id: string, sideToSide: boolean): [number, number] {
  const [a, b] = seamsOf(id);
  const startRunsOn = id === 'S_DSR' || (id === 'S_PC' && !sideToSide);
  return [startRunsOn ? 0 : a, b];
}
