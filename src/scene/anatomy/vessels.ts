import {
  BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ToneKey } from '../palette.ts';

// Placeholder vessels for the HVPG slice. Every drawn vessel is named by its hales-engine topology edge ID, so the engine-to-mesh map is
// the name (slice-plan.md section 3). Centrelines run in the direction of flow (edge `from` to edge `to`), so uv.x on the tube is the
// distance along the blood's way and the flow marks and the "downstream" highlight need no flipping.
// Frontal view: the patient's right is on the viewer's left. Units are scene units (the body plate is about 4.6 wide).

export type Vec3 = [number, number, number];

export interface VesselDef {
  /** hales-engine topology edge ID. */
  id: string;
  /** Topology node ids at the two ends (from, to). */
  from: string;
  to: string;
  tone: Extract<ToneKey, 'portal' | 'sys'>;
  radius: number;
  /** Centreline control points in flow order, or a slice of a shared chain. */
  pts?: Vec3[];
  chain?: { name: string; t0: number; t1: number };
  label: string;
}

const CONF: Vec3 = [0.15, 0.35, 0.75];
const HILUM: Vec3 = [-0.55, 0.92, 0.42];

/** Shared master paths. Edges that continue one another are slices of one curve, so their tangents match at the joins. */
export const CHAINS: Record<string, Vec3[]> = {
  splenic: [[1.75, 0.82, -0.25], [1.3, 0.55, 0.3], [0.7, 0.42, 0.66], CONF],
  ivc: [[-0.35, -2.6, -0.6], [-0.4, -0.6, -0.6], [-0.48, 1.0, -0.62], [-0.44, 1.66, -0.56], [-0.4, 2.35, -0.5]],
};

export const VESSELS: readonly VesselDef[] = [
  { id: 'V_SPL', from: 'SPL', to: 'SVD', tone: 'portal', radius: 0.06, chain: { name: 'splenic', t0: 0, t1: 0.34 }, label: 'Splenic vein (distal)' },
  { id: 'SV_MID', from: 'SVD', to: 'SV', tone: 'portal', radius: 0.065, chain: { name: 'splenic', t0: 0.34, t1: 0.62 }, label: 'Splenic vein (mid)' },
  { id: 'SV_CONF', from: 'SV', to: 'CONF', tone: 'portal', radius: 0.07, chain: { name: 'splenic', t0: 0.62, t1: 1 }, label: 'Splenic vein (proximal)' },
  { id: 'SMV_CONF', from: 'SMV', to: 'CONF', tone: 'portal', radius: 0.08, pts: [[0.15, -1.95, 0.8], [0.28, -1.05, 0.84], [0.22, -0.3, 0.82], CONF], label: 'Superior mesenteric vein' },
  { id: 'LGV_CONF', from: 'LGV', to: 'CONF', tone: 'portal', radius: 0.035, pts: [[0.62, 1.62, 0.4], [0.72, 1.0, 0.6], [0.45, 0.5, 0.72], CONF], label: 'Left gastric (coronary) vein' },
  { id: 'PV_TRUNK', from: 'CONF', to: 'PVH', tone: 'portal', radius: 0.095, pts: [CONF, [-0.15, 0.6, 0.68], HILUM], label: 'Portal vein' },
  { id: 'PVH_R', from: 'PVH', to: 'RPV', tone: 'portal', radius: 0.06, pts: [HILUM, [-1.0, 1.0, 0.3], [-1.5, 1.05, 0.1]], label: 'Right portal vein' },
  { id: 'PVH_L', from: 'PVH', to: 'LPV', tone: 'portal', radius: 0.055, pts: [HILUM, [-0.15, 1.12, 0.36], [0.55, 1.28, 0.26]], label: 'Left portal vein' },
  { id: 'RHV_IVC', from: 'RHV', to: 'IVCS', tone: 'sys', radius: 0.055, pts: [[-1.45, 1.2, -0.3], [-0.95, 1.4, -0.45], [-0.46, 1.64, -0.58]], label: 'Right hepatic vein' },
  { id: 'MHV_IVC', from: 'MHV', to: 'IVCS', tone: 'sys', radius: 0.05, pts: [[-0.3, 0.9, 0.05], [-0.42, 1.3, -0.3], [-0.46, 1.64, -0.58]], label: 'Middle hepatic vein' },
  { id: 'LHV_IVC', from: 'LHV', to: 'IVCS', tone: 'sys', radius: 0.05, pts: [[0.5, 1.2, 0.05], [0, 1.5, -0.25], [-0.46, 1.64, -0.58]], label: 'Left hepatic vein' },
  { id: 'IVC_IS', from: 'IVCI', to: 'IVCS', tone: 'sys', radius: 0.14, chain: { name: 'ivc', t0: 0, t1: 0.855 }, label: 'IVC' },
  { id: 'IVCS_RA', from: 'IVCS', to: 'RA', tone: 'sys', radius: 0.14, chain: { name: 'ivc', t0: 0.855, t1: 1 }, label: 'IVC' },
  { id: 'SVC_RA', from: 'SVC', to: 'RA', tone: 'sys', radius: 0.12, pts: [[-0.42, 3.6, -0.5], [-0.42, 3.0, -0.52], [-0.4, 2.5, -0.5]], label: 'Superior vena cava' },
];

const V = (a: Vec3) => new Vector3(a[0], a[1], a[2]);

/** Control points of a def, slicing its chain by arc length when it has one. */
export function vesselPoints(def: VesselDef): Vector3[] {
  if (def.pts) return def.pts.map(V);
  const c = def.chain!;
  const master = new CatmullRomCurve3(CHAINS[c.name].map(V));
  const n = Math.max(4, Math.round((c.t1 - c.t0) * 24));
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) out.push(master.getPointAt(c.t0 + ((c.t1 - c.t0) * i) / n));
  return out;
}

export interface VesselGeometry {
  geometry: BufferGeometry;
  curve: CatmullRomCurve3;
  /** Arc length of the centreline in scene units. */
  length: number;
}

/** A tube along the centreline with round caps merged in, so a vessel is one geometry and two draw calls (toon and ink). uv.x = distance along
 *  the flow (0 to 1), uv.y = angle round; `tang` is the unit tangent for the flow chevrons. */
export function buildTube(points: Vector3[], radius: number, caps = true): VesselGeometry {
  const curve = new CatmullRomCurve3(points);
  const tubular = Math.max(16, Math.round(curve.getLength() * 30));
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
  return { geometry, curve, length: curve.getLength() };
}

export function buildVessel(def: VesselDef): VesselGeometry {
  return buildTube(vesselPoints(def), def.radius, true);
}

export const VESSEL_IDS: readonly string[] = VESSELS.map((v) => v.id);
