import {
  BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToneKey } from '../palette.ts';
import { EDGES, JUNCTIONS, JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';

// Placeholder vessels for the HVPG slice. Every drawn vessel is named by its hales-engine topology edge ID, so the engine-to-mesh map is
// the name (slice-plan.md section 3). Centrelines run in the direction of flow (edge `from` to edge `to`), so uv.x on the tube is the
// distance along the blood's way and the flow marks and the "downstream" highlight need no flipping.
// Frontal view: the patient's right is on the viewer's left. Units are scene units (the body plate is about 4.6 wide).

export type Vec3 = [number, number, number];

export interface VesselDef {
  /** hales-engine topology edge ID (a piece's own ID when the engine splits the vein where a shunt or collateral joins it). */
  id: string;
  /** The whole vein this piece belongs to (its own ID when the vein is not split). */
  host: string;
  /** Topology node ids at the two ends (from, to), read from the engine's topology. */
  from: string;
  to: string;
  tone: Extract<ToneKey, 'portal' | 'sys'>;
  radius: number;
  label: string;
  /** Centreline control points in flow order. */
  pts: Vec3[];
}

/** A vein as drawn: its whole course; the engine's pieces of it are cut from it by their share of the length. */
interface HostDef {
  id: string;
  tone: Extract<ToneKey, 'portal' | 'sys'>;
  radius: number;
  pts?: Vec3[];
  chain?: { name: string; t0: number; t1: number };
  /** Ends on the vein where this junction node sits (a vein that joins another part-way along it), not at the host's own end. */
  endsAtJunction?: string;
}

const CONF: Vec3 = [0.15, 0.35, 0.75];
const HILUM: Vec3 = [-0.55, 0.92, 0.42];

/** Shared master paths. Edges that continue one another are slices of one curve, so their tangents match at the joins. */
export const CHAINS: Record<string, Vec3[]> = {
  splenic: [[1.75, 0.82, -0.25], [1.3, 0.55, 0.3], [0.7, 0.42, 0.66], CONF],
  ivc: [[-0.35, -2.6, -0.6], [-0.4, -0.6, -0.6], [-0.48, 1.0, -0.62], [-0.44, 1.66, -0.56], [-0.4, 2.35, -0.5]],
};

export const HOSTS: readonly HostDef[] = [
  { id: 'V_SPL', tone: 'portal', radius: 0.06, chain: { name: 'splenic', t0: 0, t1: 0.34 } },
  { id: 'SV_MID', tone: 'portal', radius: 0.065, chain: { name: 'splenic', t0: 0.34, t1: 0.62 } },
  { id: 'SV_CONF', tone: 'portal', radius: 0.07, chain: { name: 'splenic', t0: 0.62, t1: 1 } },
  { id: 'SMV_CONF', tone: 'portal', radius: 0.08, pts: [[0.15, -1.95, 0.8], [0.28, -1.05, 0.84], [0.22, -0.3, 0.82], CONF] },
  { id: 'LGV_CONF', tone: 'portal', radius: 0.035, pts: [[0.62, 1.62, 0.4], [0.72, 1.0, 0.6], [0.45, 0.5, 0.72]], endsAtJunction: 'PVT_L' },
  { id: 'PV_TRUNK', tone: 'portal', radius: 0.095, pts: [CONF, [-0.15, 0.6, 0.68], HILUM] },
  { id: 'PVH_R', tone: 'portal', radius: 0.06, pts: [HILUM, [-1.0, 1.0, 0.3], [-1.5, 1.05, 0.1]] },
  { id: 'PVH_L', tone: 'portal', radius: 0.055, pts: [HILUM, [-0.15, 1.12, 0.36], [0.55, 1.28, 0.26]] },
  { id: 'RHV_IVC', tone: 'sys', radius: 0.055, pts: [[-1.45, 1.2, -0.3], [-0.95, 1.4, -0.45], [-0.46, 1.64, -0.58]] },
  { id: 'MHV_IVC', tone: 'sys', radius: 0.05, pts: [[-0.3, 0.9, 0.05], [-0.42, 1.3, -0.3], [-0.46, 1.64, -0.58]] },
  { id: 'LHV_IVC', tone: 'sys', radius: 0.05, pts: [[0.5, 1.2, 0.05], [0, 1.5, -0.25], [-0.46, 1.64, -0.58]] },
  { id: 'IVC_IS', tone: 'sys', radius: 0.14, chain: { name: 'ivc', t0: 0, t1: 0.855 } },
  { id: 'IVCS_RA', tone: 'sys', radius: 0.14, chain: { name: 'ivc', t0: 0.855, t1: 1 } },
  { id: 'SVC_RA', tone: 'sys', radius: 0.12, pts: [[-0.42, 3.6, -0.5], [-0.42, 3.0, -0.52], [-0.4, 2.5, -0.5]] },
];

const V = (a: Vec3) => new Vector3(a[0], a[1], a[2]);
const edgeById = new Map((EDGES as { id: string; from: string; to: string; label?: string; share?: number }[]).map((e) => [e.id, e]));

/** A host's whole centreline, slicing its chain by arc length when it has one. */
function hostPath(h: HostDef): Vector3[] {
  if (h.pts) return h.pts.map(V);
  const c = h.chain!;
  const master = new CatmullRomCurve3(CHAINS[c.name]!.map(V));
  const n = Math.max(4, Math.round((c.t1 - c.t0) * 24));
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) out.push(master.getPointAt(c.t0 + ((c.t1 - c.t0) * i) / n));
  return out;
}

/** Where on its host vein a junction node sits (fraction of the course), from the engine's own table. */
function junctionAt(node: string): { host: string; at: number } | null {
  const j = (JUNCTIONS as unknown as [string, string, number][]).find((row) => row[0] === node);
  return j ? { host: j[1], at: j[2] } : null;
}

const hostPaths = new Map<string, CatmullRomCurve3>();
const pathOf = (id: string): CatmullRomCurve3 => {
  let c = hostPaths.get(id);
  if (!c) { c = new CatmullRomCurve3(hostPath(HOSTS.find((h) => h.id === id)!)); hostPaths.set(id, c); }
  return c;
};

/** The vessels to draw: every piece the engine cuts each host into (one when the vein is whole), each named by its own edge ID. */
export const VESSELS: readonly VesselDef[] = HOSTS.flatMap((h): VesselDef[] => {
  const ids = (JUNCTION_PIECES as Record<string, string[]>)[h.id] ?? [h.id];
  const host = pathOf(h.id);
  let points = hostPath(h);
  if (h.endsAtJunction) {
    const j = junctionAt(h.endsAtJunction);
    if (j) points = [...points, pathOf(j.host).getPointAt(j.at)];
  }
  let cum = 0;
  return ids.map((id): VesselDef => {
    const e = edgeById.get(id);
    if (!e) throw new Error(`no engine edge ${id}`);
    const share = ids.length === 1 ? 1 : (e.share ?? 1 / ids.length);
    const c0 = cum, c1 = cum + share;
    cum = c1;
    let pts: Vec3[];
    if (ids.length === 1) pts = points.map((p) => [p.x, p.y, p.z] as Vec3);
    else {
      const n = Math.max(3, Math.round(share * 18));
      pts = Array.from({ length: n + 1 }, (_, i) => { const p = host.getPointAt(Math.min(1, c0 + ((c1 - c0) * i) / n)); return [p.x, p.y, p.z] as Vec3; });
    }
    return { id, host: h.id, from: e.from, to: e.to, tone: h.tone, radius: h.radius, label: e.label ?? id, pts };
  });
});

export const vesselPoints = (def: VesselDef): Vector3[] => def.pts.map(V);

export interface VesselGeometry {
  geometry: BufferGeometry;
  curve: CatmullRomCurve3;
  /** Arc length of the centreline in scene units. */
  length: number;
  /** Slices along the tube and sides round it: vertex (i, j) of the tube is i * (radial + 1) + j; the two end caps follow (the Circuit's morph reads this layout). */
  tubular: number;
  radial: number;
}

/** A tube along the centreline with round caps merged in, so a vessel is one geometry and two draw calls (toon and ink). uv.x = distance along
 *  the flow (0 to 1), uv.y = angle round; `tang` is the unit tangent for the flow chevrons. */
export function buildTube(points: Vector3[], radius: number, caps = true, minSlices = 0): VesselGeometry {
  const curve = new CatmullRomCurve3(points);
  const tubular = Math.max(16, Math.round(curve.getLength() * 30), minSlices);
  const radial = 14;
  const tube = new TubeGeometry(curve, tubular, radius, radial, false);
  const tang: number[] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = curve.getTangentAt(i / tubular);
    for (let j = 0; j <= radial; j++) tang.push(t.x, t.y, t.z);
  }
  tube.setAttribute('tang', new Float32BufferAttribute(tang, 3));
  const parts: BufferGeometry[] = [tube];
  if (caps) {
    for (const end of [0, 1]) {
      const s = new SphereGeometry(radius, 14, 10);
      const pos = curve.getPointAt(end);
      s.translate(pos.x, pos.y, pos.z);
      const t = curve.getTangentAt(end);
      const n = s.attributes.position.count;
      const uv: number[] = [];
      const tg: number[] = [];
      for (let i = 0; i < n; i++) { uv.push(end, 0.5); tg.push(t.x, t.y, t.z); }
      s.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      s.setAttribute('tang', new Float32BufferAttribute(tg, 3));
      parts.push(s);
    }
  }
  const geometry = parts.length > 1 ? mergeGeometries(parts, false)! : tube;
  return { geometry, curve, length: curve.getLength(), tubular, radial };
}

export function buildVessel(def: VesselDef, minSlices = 0): VesselGeometry {
  return buildTube(vesselPoints(def), def.radius, true, minSlices);
}

export const VESSEL_IDS: readonly string[] = VESSELS.map((v) => v.id);
