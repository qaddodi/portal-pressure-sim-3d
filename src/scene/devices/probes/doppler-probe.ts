// The Doppler probe on the figure (2D dop-probe.js, "B1 + white"): a small probe off the vessel, its line of sight running straight to the vessel, the sample volume's two bars across the line inside the
// lumen, and the flow axis through the gate. The gate stands at the vessel's middle (a stent: the third the Doppler samples; the hepatic artery: four fifths along), the line meets the flow at the
// monitor's 50 degrees, from the side the flow comes toward, or away from for the hepatic veins and the IVC. All the numbers (PROBE, gateDims, gateFrac, awayFromProbe, the stent's thirds) are the 2D app's,
// copied; the 2D search that moves the probe out of the cards' way is screen space and stays there: here the probe stands on the side of the vessel that looks out from the figure's middle, and the camera
// brings it with the vessel as it turns.
import { Mesh, Vector3, BufferGeometry, BufferAttribute, MeshBasicMaterial, DoubleSide, Color, Group } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { NETWORK_BY_ID } from '../../vessels/network.ts';
import { len3, UNITS_PER_SCENE } from '../../frame2d.ts';
import { STENT_SITES } from '../../../engine/hales/portal/topology.js';
import { PROBE, gateDims, gateFrac, awayFromProbe } from './copied/dop-probe.copied.js';
import { ProbePart, TubeBuf, linePart } from './parts.ts';
import type { DopplerSeg } from './state.ts';

const RAD = Math.PI / 180;
/** The probe's body, face to end, in px along its axis from the face and the radius there (dop-probe.js BODY: the face band, the neck, the handle, its round end). */
const PROFILE: readonly (readonly [number, number])[] = [[0, 9], [2, 11], [10, 11], [18, 6], [42, 6], [46, 4.5], [48, 0.5]];
const FACE: readonly (readonly [number, number])[] = [[-1.5, 10], [0, 11.4], [6, 11.4], [7.5, 10]];

/** A point at arc fraction f along a vessel's course, and its direction of flow, in the figure's plane. */
export function gateOf(id: string, f: number | null, out: { p: Vector3; t: Vector3; r: number } = { p: new Vector3(), t: new Vector3(), r: 0 }): { p: Vector3; t: Vector3; r: number } | null {
  const v = NETWORK_BY_ID.get(id);
  if (!v || v.pts.length < 2) return null;
  const pts = v.pts, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = cum[cum.length - 1]!, want = Math.min(1, Math.max(0, f ?? 0.5)) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < want) i++;
  const s0 = cum[i - 1]!, s1 = cum[i]!, u = s1 > s0 ? (want - s0) / (s1 - s0) : 0;
  const a = pts[i - 1]!, b = pts[i]!;
  out.p.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
  // the direction over a few samples either side, so a corner of the course does not turn the probe
  const j0 = Math.max(0, i - 2), j1 = Math.min(pts.length - 1, i + 1);
  out.t.set(pts[j1]![0] - pts[j0]![0], pts[j1]![1] - pts[j0]![1], 0).normalize();
  out.r = v.radius;
  return out;
}

/** Where along its drawn course the gate stands: a stent's sampled third, the vessel's own gate place, else the middle. */
export const gateFraction = (id: string, seg: DopplerSeg): number | null => (seg ? (STENT_SITES as Record<string, number>)[seg] ?? null : (gateFrac(id) as number | null));

export interface DopplerPose {
  /** the gate, and the probe's face; unit vectors along the line of sight (gate to probe) and across it */
  gate: Vector3; face: Vector3; s: Vector3; across: Vector3; flow: Vector3; rPx: number; k: number;
}

const rot = (v: Vector3, deg: number, out: Vector3): Vector3 => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return out.set(v.x * c - v.y * s, v.x * s + v.y * c, 0); };

/** The probe's place at a vessel's gate (pure: the scene's pose for an edge, a stent's third). Null for a vessel the figure does not draw. */
export function dopplerPose(id: string, seg: DopplerSeg, out: DopplerPose = { gate: new Vector3(), face: new Vector3(), s: new Vector3(), across: new Vector3(), flow: new Vector3(), rPx: 0, k: 1 }): DopplerPose | null {
  const g = gateOf(id, gateFraction(id, seg));
  if (!g) return null;
  const away = awayFromProbe(id) as boolean;
  // the line of sight leaves the gate at the Doppler angle from the flow (toward: the flow comes at the probe; away: it runs from it); it stands on the side that looks out to the figure's left,
  // clear of the cards on the right (the Tests card is on the right of a wide screen)
  const base = away ? new Vector3().copy(g.t).negate() : g.t;
  const a = rot(base, PROBE.ANGLE, new Vector3()), b = rot(base, -PROBE.ANGLE, new Vector3());
  const s = a.x < b.x - 1e-6 ? a : b.x < a.x - 1e-6 ? b : (a.y > b.y ? a : b);
  const rPx = g.r * UNITS_PER_SCENE, D = len3(rPx + PROBE.GAP);
  out.gate.copy(g.p); out.s.copy(s); out.flow.copy(g.t); out.across.set(-s.y, s.x, 0);
  out.face.copy(g.p).addScaledVector(s, D); out.rPx = rPx; out.k = 1;
  return out;
}

export class DopplerProbe {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  /** 0 to 1: how much of the probe shows (it eases in and out; a change of vessel eases out, moves, and eases in) */
  shown = 0;
  private placedKey = '';
  private readonly head: TubeBuf; private readonly face: TubeBuf;
  private readonly bufs: TubeBuf[] = [];
  private readonly sight: TubeBuf; private readonly axis: TubeBuf; private readonly barA: TubeBuf; private readonly barB: TubeBuf; private readonly light: TubeBuf;
  private readonly wedgeGeo = new BufferGeometry();
  private readonly wedge: Mesh;
  private readonly wedgeMat = new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, side: DoubleSide });
  private pose: DopplerPose | null = null;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor(shared: CelShared) {
    const add = (buf: TubeBuf, part: ProbePart) => { this.bufs.push(buf); this.parts.push(part); this.group.add(part.group); };
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number): TubeBuf => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order);
      add(buf, part);
      return buf;
    };
    this.head = mk('poly', null, PROFILE.length, 0.9, 2);
    this.face = mk('steel', (t) => t.polyEdge, FACE.length, 0.9, 3);
    this.light = mk('graft', null, 2, 0.5, 4);
    this.sight = mk('graft', null, 2, 0.9, 5);
    this.axis = mk('graft', null, 2, 0.9, 5);
    this.barA = mk('graft', null, 2, 0.9, 6);
    this.barB = mk('graft', null, 2, 0.9, 6);
    this.wedgeGeo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    this.wedge = new Mesh(this.wedgeGeo, this.wedgeMat);
    this.wedge.renderOrder = 1000; this.wedge.frustumCulled = false; this.wedge.visible = false;
    this.group.add(this.wedge);
    this.group.visible = false;
  }

  /** Writes the probe's geometry for a pose. */
  private lay(p: DopplerPose): void {
    const S = PROBE.SCALE, px = (v: number) => len3(v * S);
    const { at, half } = gateDims(p.rPx) as { at: number; half: number };
    const axisL = len3(Math.min(36, Math.max(16, 1.7 * p.rPx)));
    const { gate, s, across, flow, face } = p;
    const t = this.tmp, u = this.tmp2;
    // the body and the face band, along the line of sight from the face outward
    const lay = (buf: TubeBuf, prof: readonly (readonly [number, number])[]) => {
      for (let i = 0; i < prof.length; i++) { const r = buf.rings[i]!; r.c.copy(face).addScaledVector(s, px(prof[i]![0])); r.t.copy(s); r.r = px(prof[i]![1]); }
      buf.commit();
    };
    lay(this.head, PROFILE); lay(this.face, FACE);
    // the light on the handle: a bead facing the viewer
    this.light.line(t.copy(face).addScaledVector(s, px(33)).setZ(face.z + 0.004), u.copy(face).addScaledVector(s, px(33)).setZ(face.z + 0.007), px(3), px(2.2));
    // the line of sight ends at the near gate bar; the flow axis runs a little past both
    const nearBar = len3(at);
    this.sight.line(t.copy(face).addScaledVector(s, -len3(PROBE.EDGE)), u.copy(gate).addScaledVector(s, nearBar), len3(1.3));
    this.axis.line(t.copy(gate).addScaledVector(flow, -axisL), u.copy(gate).addScaledVector(flow, axisL), len3(1.3));
    // the sample volume: two short bars across the line, `at` px either side of the gate, half-width `half`
    const hw = len3(half);
    this.barA.line(t.copy(gate).addScaledVector(s, nearBar).addScaledVector(across, -hw), u.copy(gate).addScaledVector(s, nearBar).addScaledVector(across, hw), len3(1.7));
    this.barB.line(t.copy(gate).addScaledVector(s, -nearBar).addScaledVector(across, -hw), u.copy(gate).addScaledVector(s, -nearBar).addScaledVector(across, hw), len3(1.7));
    // the faded ultrasound beam: a narrow wedge from the face to past the vessel's far wall
    const far = -(Math.max(0, p.rPx) + 10), D = face.distanceTo(gate), wk = Math.tan(PROBE.BEAM_DEG * RAD) * (D * UNITS_PER_SCENE - far);
    const pos = this.wedgeGeo.getAttribute('position') as BufferAttribute;
    const f0 = t.copy(gate).addScaledVector(s, len3(far));
    pos.setXYZ(0, face.x, face.y, face.z);
    pos.setXYZ(1, f0.x + across.x * len3(wk), f0.y + across.y * len3(wk), f0.z);
    pos.setXYZ(2, f0.x - across.x * len3(wk), f0.y - across.y * len3(wk), f0.z);
    pos.needsUpdate = true; this.wedgeGeo.computeBoundingSphere();
  }

  /** Steps the probe toward what is asked (on a vessel, or away); true while it moves. */
  update(dtMs: number, on: boolean, edge: string, seg: DopplerSeg): boolean {
    const key = `${edge}|${seg ?? ''}`;
    let want = on ? 1 : 0;
    // a new vessel or third: it eases out where it stands, moves, and eases in at the new place
    if (on && this.placedKey && key !== this.placedKey && this.shown > 0.001) want = 0;
    if (this.shown <= 0.001 && want === 1 && key !== this.placedKey) {
      this.pose = dopplerPose(edge, seg, this.pose ?? undefined) ?? null;
      this.placedKey = key;
      if (this.pose) this.lay(this.pose);
    }
    if (on && !this.pose) want = 0;
    const k = 1 - Math.exp(-Math.max(0, dtMs) / 90), prev = this.shown;
    this.shown += (want - this.shown) * k;
    if (Math.abs(want - this.shown) < 0.004) this.shown = want;
    const moving = this.shown !== prev || (on && key !== this.placedKey);
    if (this.shown !== prev) {
      const a = this.shown, vis = a > 0.002;
      this.group.visible = vis;
      for (const o of this.parts) { o.group.visible = vis; if (vis) o.setAlpha(a); }
      this.wedge.visible = vis; this.wedgeMat.opacity = 0.2 * a;
    }
    return moving;
  }

  applyPalette(p: Palette): void {
    for (const o of this.parts) o.applyPalette(p);
    this.wedgeMat.color = new Color(p.ink);
  }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  /** The pose the probe is laid at now (for tests and tags). */
  get placed(): DopplerPose | null { return this.shown > 0 ? this.pose : null; }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.wedgeGeo.dispose(); this.wedgeMat.dispose(); }
}
