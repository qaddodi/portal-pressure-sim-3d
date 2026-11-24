// The Doppler probe on the figure (2D dop-probe.js, "B1 + white"; stage-doppler.js places it): a small probe off the vessel, its line of sight running straight to the vessel, the sample volume's two bars
// across the line inside the lumen, and the flow axis through the gate. The gate stands at the vessel's middle (a stent: the third the Doppler samples; the hepatic artery: four fifths along), the line
// meets the flow at the monitor's 50 degrees, from the side the flow comes toward, or away from for the hepatic veins and the IVC. All the numbers (PROBE, gateDims, gateFrac, awayFromProbe, the stent's
// thirds, and the search that finds the probe a place clear of the cards: fitPoseInto, createProbeMind, probeSwing, probeTurn, probeFade) are the 2D app's, copied.
//
// Where it stands is worked out on the screen, as 2D does (the probe is a screen-sized thing: 65 px long at any zoom), and written back on the plate through the figure's own map at the gate (screen.ts):
//  - with a screen (the scene's), the search picks the side, end and distance clear of the Tests card, the slide's cards and the bars, and of the labels where a side allows; the probe swings round the
//    gate to a new place in real time, swings out (turning 60 degrees away from the vessel and fading) when it goes or its vessel changes, and comes back already turned to its place;
//  - without one (node tests, a bare layer) it keeps the 2D numbers at the figure's own scale, on the side that looks out from the figure's middle, and eases in and out.
import { Mesh, Vector3, BufferGeometry, BufferAttribute, MeshBasicMaterial, DoubleSide, Color, Group } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { NETWORK, NETWORK_BY_ID } from '../../vessels/network.ts';
import { centrelineOf } from '../../vessels/centreline.ts';
import { PLACED } from '../../anatomy/source.ts';
import { len3, UNITS_PER_SCENE } from '../../frame2d.ts';
import { STENT_SITES } from '../../../engine/hales/portal/topology.js';
import { PROBE, SLACK, gateFrac, awayFromProbe, createProbeMind, fitPoseInto, probePoseInto, makeProbePose, makeProbeGeom, probeGeomInto, probeSwing, probeTurn, probeFade } from './copied/dop-probe.copied.js';
import { easeMove } from '../../../ui/tests/copied/ease.copied.js';
import { smooth01 } from '../../../ui/tests/copied/num.copied.js';
import type { Ring } from '../tube-rings.ts';
import { ProbePart, TubeBuf, linePart, lookOf, type PartColour, type PartStyle } from './parts.ts';
import { DEVICE_TOKENS, type DeviceTokens } from '../../procedures/copied/device-tokens.copied.ts';
import type { LookId } from '../../palette.ts';
import { LOOKS } from '../../../looks/looks.ts';
import { DOP_BODY_PX, DOP_INK, DOP_RIM_PX, mixHex } from '../edges.ts';
import { BANDS, BEAD, CABLE, SEAMS, SEAM_INK_PX, SEAM_SOFT, SEAM_SOFT_PX, SWATCH, bodyStations, cableAt, radiusAt, stations, type Station } from './probe-shape.ts';
import { basisAt, newBasis, toPlate, toScreen, type Basis, type Box, type Pt, type ScreenEnv } from './screen.ts';
import type { DopplerSeg } from './state.ts';
import { addClaim, addStroke } from '../../labels/probe-claims.ts';

const RAD = Math.PI / 180;
/** The marks' places in `lines`. */
/** How long after the view last changed it still counts as moving, ms. */
export const VIEW_SETTLE_MS = 300;
/** The place is chosen once the camera has been still, and the cards unchanged, this long (ms); verified against the cards and the stage this often; and chosen again only when the cards have covered it this long. */
export const LAND_MS = 150, CARD_STILL_MS = 150, VERIFY_MS = 120, COVERED_MS = 350;
export const LINE_SIGHT = 0, LINE_AXIS = 1, LINE_BAR_A = 2, LINE_BAR_B = 3;
/** The probe's body, face to end: its rings (probe-shape.ts, the approved 1A: a convex face, head, waist, grip and boot), and the rings of each band that lies flush on it. */
const BODY_ST: readonly Station[] = bodyStations();
const BAND_ST: readonly (readonly Station[])[] = BANDS.map((b) => stations(b.x0, b.x1));
const schemeOf = (look: string): 'light' | 'dark' => (LOOKS[look as keyof typeof LOOKS].scheme === 'dark' ? 'dark' : 'light');
/** The beam's opacity at its face, at 0.8 of its length, and at the far end (dop-probe.js #dpr-wedge), and where the middle stop is. */
export const WEDGE_STOPS = [0.46, 0.22, 0] as const, WEDGE_MID = 0.8;

/** A point at arc fraction f along a vessel's course, and its direction of flow, in the figure's plane. */
export function gateOf(id: string, f: number | null, out: { p: Vector3; t: Vector3; r: number } = { p: new Vector3(), t: new Vector3(), r: 0 }): { p: Vector3; t: Vector3; r: number } | null {
  const v = NETWORK_BY_ID.get(id);
  if (!v || v.pts.length < 2) return null;
  // (the placed anatomy, `?anatomy=new`: on the vessel's DRAWN centreline, by its length in 3D, so the gate is in the lumen that is on the screen whatever depth the vessel runs at; the flow's heading in the figure's plane, as today)
  const c = PLACED ? centrelineOf(id) : null;
  if (c) {
    const fu = Math.min(1, Math.max(0, f ?? 0.5)), p = c.pointAt(fu), t = c.tangentAt(fu);
    out.p.set(p[0], p[1], p[2]); out.t.set(t[0], t[1], 0);
    if (out.t.lengthSq() < 1e-12) out.t.set(1, 0, 0);
    out.t.normalize(); out.r = v.radius;
    return out;
  }
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

/** The probe's place at a vessel's gate when nothing is known of the screen (pure: the scene's pose for an edge, a stent's third, at the figure's own scale). Null for a vessel the figure does not draw. */
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

/** The probe's frame: scene = gate + ex * u + ey * v for a screen offset (u along the line of sight, v across it) in px; `U` scene units to a px (radii and thicknesses). */
interface Frame { gate: Vector3; ex: Vector3; ey: Vector3; U: number }
/** What is drawn: the gate's distance to the face (px), the lumen's radius (px), the probe's size, the flow axis's turn from the line of sight (degrees), how far the marks have closed (0 to 1). */
interface Draw { D: number; r: number; k: number; phi: number; out: number }

/** The stretch of the sampled vessel round the gate that is not counted as busy, px (its own course there is what the line of sight meets). */
export const OWN_CLEAR = 46;
/** How far a label keeps off the probe's body and cable, px: the cable's tail reaches the end of the search's room and a name 4 px from it read as touching it (TIPS Doppler review, item 11: "Portal vein 36 cm/s" on the cable). */
export const BODY_CLAIM_PAD = 9;
const NO_AVOID: readonly Box[] = [], NO_BUSY: number[][] = [], NO_BAN: string[] = [];
const hMix = (h: number, v: number): number => Math.imul(h ^ (v | 0), 16777619) >>> 0;
const hStr = (v: string): number => { let h = 2166136261; for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); return h >>> 0; };
/** b - a in -180 to 180. */
const angTo = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
type Fit = ReturnType<typeof makeProbePose> & { side: number; rev: boolean; reach: number; ang: number; D: number; k: number; phi: number; headOff?: boolean; none?: boolean; box: Box };

export class DopplerProbe {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  /** 0 to 1: how much of the probe shows (it eases in and out; a change of vessel eases out, moves, and eases in) */
  shown = 0;
  private headA = 1;
  private placedKey = '';
  private readonly head: TubeBuf; private readonly bands: TubeBuf[] = []; private readonly seams: TubeBuf[] = []; private readonly light: TubeBuf; private readonly cable: TubeBuf;
  private readonly bufs: TubeBuf[] = [];
  private readonly sight: TubeBuf; private readonly axis: TubeBuf; private readonly barA: TubeBuf; private readonly barB: TubeBuf;
  private readonly headParts: ProbePart[] = []; private readonly markParts: ProbePart[] = [];
  private readonly rim: ProbePart; private readonly cableRim: ProbePart;
  private readonly wedgeGeo = new BufferGeometry();
  private readonly wedge: Mesh;
  private readonly wedgeMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });   // (the beam fades from the probe's face to nothing past the vessel: 2D #dpr-wedge, .46 to 0)
  private pose: DopplerPose | null = null;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly w0 = new Vector3(); private readonly w1 = new Vector3(); private readonly w2 = new Vector3(); private readonly axisT = new Vector3();
  private readonly fr: Frame = { gate: new Vector3(), ex: new Vector3(), ey: new Vector3(), U: len3(1) };
  private readonly geom = makeProbeGeom();
  private shut = false;
  /** the gate's place and the plate's map as last seen, and when they last changed (the view is moving under the hand until VIEW_SETTLE_MS after) */
  private readonly viewKey = [0, 0, 1, 0, 0, 1]; private viewAt = -1e9;
  /** the marks as thin screen strokes (the label layer draws them): 4 lines of x0, y0, x1, y1 in stage px, and whether they are what shows of the marks (a screen is given) */
  readonly lines = new Float32Array(16);
  overlay = false;
  /** the sample volume is closed: its axis and bars are gone */
  get sampleShut(): boolean { return this.shut; }
  /** the parts the sample volume's closing takes away: the axis and the two bars */
  private closing: ProbePart[] = [];

  // ── the screen's search (stage-doppler.js dprobePaint): the 2D record `dpr`, kept ──
  private on = false;                  // drawn at its place (2D dpr.on)
  private has = false;
  private oP = 1;                      // how far it has swung out: 0 at its place, 1 out
  private headP = 1; private headOff = false;
  private swap = false;                // drawing back to move to another vessel or third
  private cur = { ang: 0, d: 0, k: 1 };
  private tgt = { ang: 0, d: 0, k: 1, ax: 0, r: 0, sw: 0 };
  private readonly mind = createProbeMind();
  private readonly fit = makeProbePose() as Fit;
  private readonly opt = { g: [0, 0], t: [0, 0], r: 0, away: false, w: 0, h: 0, cards: [] as readonly Box[], keep: 0, keepReach: 0, keepRev: false, keepK: 1, sc: 1, avoid: [] as readonly Box[], busy: [] as number[][], ban: [] as string[], lock: false, slack: 0, k: 1 };
  private side = 0; private reach = 0; private rev = false; private k = 1; private keyOn = false;
  private syncKey = 0; private searchAt = -1e9;
  /** the camera's last glide (ms), the cards' last change and their signature, and when the place first stood covered (-1: it does not) */
  private movedAt = -1e9; private cardAt = -1e9; private cardSig = 0; private coveredAt = -1;
  private readonly verify = makeProbePose() as Fit;
  private readonly basis: Basis = newBasis();
  private readonly gate3 = new Vector3(); private readonly tan3 = new Vector3();
  private sm = { x: 0, y: 0 };
  private readonly busyPool: number[][] = [];
  /** where the probe's gate stands on the screen now (px), for the label that names its reading; null while it is not drawn */
  readonly gateAtScreen: Pt = { x: 0, y: 0 };
  /** the probe's body on the screen now (a box), for what keeps clear of it */
  readonly bodyBox: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** the gate on the plate, the probe's turn on the screen (degrees), its distance from the gate (px) and the vessel it stands on: what the reading's label is placed by */
  readonly stand = { edge: '', seg: null as DopplerSeg, ang: 0, D: 0, k: 1, headOff: false };

  constructor(shared: CelShared) {
    const add = (buf: TubeBuf, part: ProbePart, head: boolean) => { this.bufs.push(buf); this.parts.push(part); (head ? this.headParts : this.markParts).push(part); this.group.add(part.group); };
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number, head = false, style: PartStyle = {}): TubeBuf => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order, style);
      add(buf, part, head);
      return buf;
    };
    // The head is the classic curvilinear probe (owner, 23 Nov 2026, "just build 1A", docs/approved/us-probe.md; shapes and swatches in probe-shape.ts): one body (a cream shell on the light looks, a pale one on the dark) with the
    // lens, the accent ring and the rubber boot lying flush on it as bands, the seams between them, a bead in the look's accent on the grip, and a short cable that fades out. Its line is 2D's (--dop-head-ink, white on the
    // light looks and black on the dark ones, 1.6 px) on a 4 px rim in --dop-head-rim (the inverse), so it reads on any vessel. A stroke 2D centres on the path sits half inside it: the fill shrinks by half the line (`fat`),
    // the line is drawn out to half beyond. The colours are authored as drawn (`raw`): the vessels' caps would grey a cream shell.
    const swatch = (look: string) => SWATCH[schemeOf(look)];
    const BODY: PartStyle = { raw: true, fat: -DOP_BODY_PX / 2 };
    this.head = mk('poly', (_t, look) => swatch(look).shell, BODY_ST.length, DOP_BODY_PX, 2, true, { ...BODY, edge: DOP_INK });
    const bandColour = { lens: (_t: unknown, look: string) => swatch(look).lens, ring: (_t: unknown, look: string) => LOOKS[look as keyof typeof LOOKS].accent, boot: (_t: unknown, look: string) => swatch(look).boot };
    BANDS.forEach((b, i) => this.bands.push(mk('poly', bandColour[b.id] as PartColour, BAND_ST[i]!.length, DOP_BODY_PX, 3, true, { ...BODY, edge: 'none' })));
    // the seams across the body: the lens's end inked like the head's line (1.4 px), the others a soft dark hairline over the shell (0.9 px)
    const seamFlat: PartStyle = { flat: true, edge: 'none', fat: 0 };
    for (const s of SEAMS) {
      const soft = SEAM_SOFT;
      this.seams.push(mk('graft', s.ink ? (t: DeviceTokens) => t.dopHeadInk : (_t: DeviceTokens, look: LookId) => { const k = soft[schemeOf(look)]; return mixHex(swatch(look).shell, '#' + k.rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), k.a); }, 2, 0.5, 4, true, seamFlat));
    }
    this.light = mk('graft', (_t, look) => LOOKS[look].accent, 2, 0.9, 4, true, { flat: true, edge: DOP_INK, fat: 0 });
    // the cable runs from its free end (ring 0) to the boot, so the tail fade takes the free end out as a gradient, never a cut
    this.cable = mk('poly', (_t, look) => swatch(look).boot, CABLE.rings, 0.5, 3, true, { raw: true, edge: 'none', fat: 0, radial: 12 });
    this.parts[this.parts.length - 1]!.setTailFade(CABLE.fade);
    // the marks are the 2D's: white lines on a black rim in every theme (--dop-mark, --dop-rim), the rim 1.2 px outside a 2 px line (the gate's bars 3 px with 1.3)
    const MARK: PartStyle = { flat: true, rim: '#000000' };
    const m0 = this.parts.length;
    this.sight = mk('graft', '#FFFFFF', 2, 1.2, 5, false, MARK);
    this.axis = mk('graft', '#FFFFFF', 2, 1.2, 5, false, MARK);
    this.barA = mk('graft', '#FFFFFF', 2, 1.3, 6, false, MARK);
    this.barB = mk('graft', '#FFFFFF', 2, 1.3, 6, false, MARK);
    this.closing = [this.parts[m0 + 1]!, this.parts[m0 + 2]!, this.parts[m0 + 3]!];
    // the rim: the body's own tube once more, one flat fill under it grown to the rim's half width (no outline, no highlight)
    this.rim = new ProbePart(this.head.geometry, 'poly', shared, (t) => t.dopHeadRim, { px: 0, order: 1, spec: 0 }, { flat: true, edge: 'none', fat: DOP_RIM_PX / 2 });
    this.parts.push(this.rim); this.headParts.push(this.rim); this.group.add(this.rim.group);
    this.cableRim = new ProbePart(this.cable.geometry, 'poly', shared, (t) => t.dopHeadRim, { px: 0, order: 1, spec: 0 }, { flat: true, edge: 'none', fat: DOP_RIM_PX / 2, radial: 12 });
    this.cableRim.setTailFade(CABLE.fade); this.parts.push(this.cableRim); this.headParts.push(this.cableRim); this.group.add(this.cableRim.group);
    // the beam's stops are 2D's (dop-probe.js #dpr-wedge: --dop-glow at .46 at the face, .22 at .8 of the way, 0 at the far wall): the apex, the far corners, and the 0.8 line between
    this.wedgeGeo.setAttribute('position', new BufferAttribute(new Float32Array(15), 3));
    this.wedgeGeo.setAttribute('color', new BufferAttribute(new Float32Array([0, 0, 0, WEDGE_STOPS[0], 0, 0, 0, WEDGE_STOPS[2], 0, 0, 0, WEDGE_STOPS[2], 0, 0, 0, WEDGE_STOPS[1], 0, 0, 0, WEDGE_STOPS[1]]), 4));
    this.wedgeGeo.setIndex([0, 3, 4, 3, 1, 2, 3, 2, 4]);
    this.wedge = new Mesh(this.wedgeGeo, this.wedgeMat);
    this.wedge.renderOrder = 1000; this.wedge.frustumCulled = false; this.wedge.visible = false;
    this.group.add(this.wedge);
  }

  /** Writes the probe's geometry for a frame and what is drawn (the 2D probe's marks in its own frame: x from the gate toward the probe, y across). */
  private lay(f: Frame, d: Draw, scr: { ox: number; oy: number; ang: number } | null = null): void {
    const S = PROBE.SCALE * d.k, U = f.U, px = (v: number) => v * S * U;
    const g = probeGeomInto(this.geom, d.D, d.r, d.phi, d.k, d.out) as ReturnType<typeof makeProbeGeom>;
    const { gate, ex, ey } = f;
    const t = this.tmp, u = this.tmp2;
    const at = (x: number, y: number, o: Vector3): Vector3 => o.copy(gate).addScaledVector(ex, x).addScaledVector(ey, y);
    const axisT = this.axisT.copy(ex).normalize();
    // the body and its bands, along the line of sight from the face outward
    const lay = (buf: TubeBuf, st: readonly Station[]) => {
      for (let i = 0; i < st.length; i++) { const r = buf.rings[i]!; at(g.dh + st[i]!.x * S, 0, r.c); r.t.copy(axisT); r.r = st[i]!.r * S * U; }
      buf.commit();
    };
    lay(this.head, BODY_ST);
    this.bands.forEach((b, i) => lay(b, BAND_ST[i]!));
    // the seams: a hairline across the body at x, a little short of the outline both sides
    SEAMS.forEach((s, i) => { const h = (radiusAt(s.x) - 0.3) * S; this.seams[i]!.line(at(g.dh + s.x * S, -h, t), at(g.dh + s.x * S, h, u), U * (s.ink ? SEAM_INK_PX : SEAM_SOFT_PX) / 2); });
    // the bead on the grip, facing the viewer
    this.light.line(at(g.dh + BEAD.x * S, 0, t).setZ(gate.z + 0.004), at(g.dh + BEAD.x * S, 0, u).setZ(gate.z + 0.007), U * BEAD.r, U * BEAD.r * 0.92);
    // the cable, from its free end to the boot (the curve is in the probe's own frame: x along the axis, y across)
    {
      const cb = this.cable, n = cb.n, w = this.w0, w2 = this.w1;
      for (let i = 0; i < n; i++) {
        const tt = 1 - i / (n - 1), c = cableAt(tt), c2 = cableAt(Math.min(1, Math.max(0, tt - 0.02))), c1 = cableAt(Math.min(1, tt + 0.02)), r = cb.rings[i]!;
        at(g.dh + c.x * S, c.y * S, r.c);
        r.t.copy(at(g.dh + c2.x * S, c2.y * S, w)).sub(at(g.dh + c1.x * S, c1.y * S, w2)).normalize();
        r.r = (CABLE.w / 2) * S * U;
      }
      cb.commit();
    }
    // the line of sight runs from the face to the near gate bar; the flow axis a little past both bars
    this.sight.line(at(g.dh - PROBE.EDGE, 0, t), at(g.bx1, 0, u), U * 1.0);
    // the sample volume: two short bars across the line, `at` px either side of the gate, half-width `half`; the axis through the gate at the flow's angle
    const shut = !g.open;
    this.barA.line(at(g.at, -g.half, t), at(g.at, g.half, u), U * 1.5);
    this.barB.line(at(-g.at, -g.half, t), at(-g.at, g.half, u), U * 1.5);
    this.axis.line(at(-g.axx, -g.axy, t), at(g.axx, g.axy, u), U * 1.0);
    this.shut = shut;
    // With a screen the lines are not tubes: they are thin strokes laid over the figure in screen px (the label layer draws them, like the leaders), from these ends: the sight line, the flow axis and the
    // two gate bars (owner, 20 Nov 2026: "they should look 2D and thin and almost like they're overlaid on top"). The head and the beam stay 3D.
    this.overlay = !!scr;
    if (scr) {
      const c = Math.cos(scr.ang * RAD), s = Math.sin(scr.ang * RAD), L = this.lines;
      const put = (i: number, x0: number, y0: number, x1: number, y1: number): void => {
        L[i * 4] = scr.ox + x0 * c - y0 * s; L[i * 4 + 1] = scr.oy + x0 * s + y0 * c; L[i * 4 + 2] = scr.ox + x1 * c - y1 * s; L[i * 4 + 3] = scr.oy + x1 * s + y1 * c;
      };
      put(LINE_SIGHT, g.dh - PROBE.EDGE, 0, g.bx1, 0);
      put(LINE_AXIS, -g.axx, -g.axy, g.axx, g.axy);
      put(LINE_BAR_A, g.at, -g.half, g.at, g.half);
      put(LINE_BAR_B, -g.at, -g.half, -g.at, g.half);
    }
    // the faded ultrasound beam: a narrow wedge from the probe's face, to past the vessel's far wall
    const pos = this.wedgeGeo.getAttribute('position') as BufferAttribute;
    const a = at(g.dh, 0, this.w0), b = at(g.far, g.wk, this.w1), c = at(g.far, -g.wk, this.w2);
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.setXYZ(2, c.x, c.y, c.z);
    pos.setXYZ(3, a.x + (b.x - a.x) * WEDGE_MID, a.y + (b.y - a.y) * WEDGE_MID, a.z + (b.z - a.z) * WEDGE_MID);
    pos.setXYZ(4, a.x + (c.x - a.x) * WEDGE_MID, a.y + (c.y - a.y) * WEDGE_MID, a.z + (c.z - a.z) * WEDGE_MID);
    pos.needsUpdate = true; this.wedgeGeo.computeBoundingSphere();
  }

  /** The screen's map into the plate, at the gate: the probe's frame for a direction on the screen (degrees, y down) and the scene units a px takes there. */
  private frameFor(B: Basis, gate: Vector3, angDeg: number): Frame {
    const c = Math.cos(angDeg * RAD), s = Math.sin(angDeg * RAD), f = this.fr;
    f.gate.copy(gate);
    toPlate(B, c, s, f.ex); toPlate(B, -s, c, f.ey);
    f.ex.z = 0; f.ey.z = 0;
    f.U = 1 / B.sc;
    return f;
  }

  /** Steps the probe toward what is asked (on a vessel, or away); true while it moves. `env`: the screen (the scene's); without it the probe keeps the 2D numbers at the figure's scale. `nowMs`: the clock. */
  update(dtMs: number, on: boolean, edge: string, seg: DopplerSeg, env: ScreenEnv | null = null, nowMs = 0): boolean {
    return env ? this.stepScreen(dtMs, nowMs, on, edge, seg, env) : this.stepFigure(dtMs, on, edge, seg);
  }

  // ── without a screen ──
  private stepFigure(dtMs: number, on: boolean, edge: string, seg: DopplerSeg): boolean {
    const key = `${edge}|${seg ?? ''}`;
    let want = on ? 1 : 0;
    // a new vessel or third: it eases out where it stands, moves, and eases in at the new place
    if (on && this.placedKey && key !== this.placedKey && this.shown > 0.001) want = 0;
    if (this.shown <= 0.001 && want === 1 && key !== this.placedKey) {
      this.pose = dopplerPose(edge, seg, this.pose ?? undefined) ?? null;
      this.placedKey = key;
      if (this.pose) {
        const p = this.pose, f = this.fr;
        f.gate.copy(p.gate); f.ex.copy(p.s).multiplyScalar(len3(1)); f.ey.copy(p.across).multiplyScalar(len3(1)); f.U = len3(1);
        const phi = Math.atan2(p.across.dot(p.flow), p.s.dot(p.flow)) / RAD;
        this.lay(f, { D: p.rPx + PROBE.GAP, r: p.rPx, k: 1, phi, out: 0 });
      }
    }
    if (on && !this.pose) want = 0;
    const k = 1 - Math.exp(-Math.max(0, dtMs) / 90), prev = this.shown;
    this.shown += (want - this.shown) * k;
    if (Math.abs(want - this.shown) < 0.004) this.shown = want;
    const moving = this.shown !== prev || (on && key !== this.placedKey);
    if (this.shown !== prev) this.paint(this.shown, 1);
    return moving;
  }

  /** Marks and head at their strengths (the whole probe's, the head's own) and the group visible while any shows. */
  private paint(a: number, headA: number): void {
    this.headA = headA;
    const vis = a > 0.002;
    // (a mark's presence is STRUCTURAL only (the screen is not on top of it, the display is not shut on it) and never gated on the probe's own fade: the two multiply, and presence is already whole when the probe's `a` starts to rise, so the marks arrive with the probe, not after it; the head's alpha is its own, so its alpha alone brings it and takes it away)
    for (const o of this.markParts) { o.setAlpha(vis ? a : 0); o.show(!this.overlay && !(this.shut && this.closing.includes(o))); }
    for (const o of this.headParts) { o.present(); o.setAlpha(a * headA); }
    this.wedge.visible = vis; this.wedgeMat.opacity = a;
  }

  // ── with a screen: the 2D probe's own rules ──
  private busyAround(env: ScreenEnv, B: Basis, id: string, R: number, out: number[][]): number[][] {
    let n = 0;
    const g = this.gate3, rs = R / B.sc + 0.1, p = this.tmp, pt = this.sm;
    for (const v of NETWORK) {
      if (v.pts.length < 2) continue;
      // the vessel the probe samples counts too, but only where it is away from the gate: its own course right at the gate is what the line of sight meets, and further along a stent or a vein runs under a probe standing
      // beside it (TIPS Doppler review, item 10: the probe lay across the mid stent on the slide that samples the hepatic end)
      const own = v.id === id;
      // a quick look in the plate: the course's box against the room the search looks into
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of v.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      if (x1 < g.x - rs || x0 > g.x + rs || y1 < g.y - rs || y0 > g.y + rs) continue;
      const q = v.radius * B.sc;
      let lx = NaN, ly = NaN;
      for (let i = 0; i < v.pts.length; i++) {
        const a = v.pts[i]!;
        env.project(p.set(a[0], a[1], g.z), pt);
        if (Math.abs(pt.x - B.ox) >= R + q || Math.abs(pt.y - B.oy) >= R + q) { lx = NaN; continue; }
        if (own && Math.hypot(pt.x - B.ox, pt.y - B.oy) < OWN_CLEAR + q) { lx = NaN; continue; }
        if (!Number.isNaN(lx)) {
          // a point every 6 px along the stretch from the last
          const dx = pt.x - lx, dy = pt.y - ly, m = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
          for (let j = 1; j <= m; j++) { const e = (this.busyPool[n] ||= [0, 0, 0, 1]); e[0] = lx + (dx * j) / m; e[1] = ly + (dy * j) / m; e[2] = q; e[3] = 1; out[n++] = e; }
        } else { const e = (this.busyPool[n] ||= [0, 0, 0, 1]); e[0] = pt.x; e[1] = pt.y; e[2] = q; e[3] = 1; out[n++] = e; }
        lx = pt.x; ly = pt.y;
      }
    }
    out.length = n;
    return out;
  }

  /** The probe's place (stage-doppler.js dprobePaint's search), chosen ONCE and then held (owner, 23 Nov 2026: "just pick a spot right away and doesn't change so easily unless needed").
   *  The 2D search ran every 50 to 150 ms for as long as the slide stood, against inputs that never stop changing (the labels that settle around the probe, the camera's map, the quieter-figure score), and its kept
   *  place gave way to a "better" one whenever any of them shifted: the probe jumped from side to side. Now:
   *   - a probe not yet shown picks when the camera has landed and the cards have stopped moving (LAND_MS, CARD_STILL_MS), at once and without a second wait for the place to hold;
   *   - a probe shown only checks that its place is still clear of the cards and the stage (labels and the quieter-figure score are not asked: they make way for the probe, it does not make way for them), every VERIFY_MS;
   *   - it picks again only when the vessel or third changes (stepScreen), or the cards have covered its place for COVERED_MS together (a new card truly lands on it). It then glides there (swings), as before.
   *  True while it is placed afresh. */
  private place(now: number, edge: string, seg: DopplerSeg, env: ScreenEnv, B: Basis, reduce: boolean, swing: boolean): 'go' | 'hide' | 'hold' | 'wait' {
    const g = gateOf(edge, gateFraction(edge, seg))!;
    // the gate and the flow on the screen
    const gx = B.ox, gy = B.oy, ts = toScreen(B, g.t.x, g.t.y, { x: 0, y: 0 });
    const tl = Math.hypot(ts.x, ts.y) || 1, rPx = g.r * B.sc, cards = env.cards(), size = env.size();
    const sameKey = this.keyOn && this.placedKey === `${edge}|${seg ?? ''}`;
    // the cards' signature (to 8 px): they have to hold still before a fresh place is chosen
    let cs = 0;
    for (const c of cards) { cs = hMix(cs, Math.round(c.x0 / 8)); cs = hMix(cs, Math.round(c.y0 / 8)); cs = hMix(cs, Math.round(c.x1 / 8)); cs = hMix(cs, Math.round(c.y1 / 8)); }
    cs = hMix(hMix(cs, Math.round(size.w / 8)), Math.round(size.h / 8));
    if (cs !== this.cardSig) { this.cardSig = cs; this.cardAt = now; }
    const placed = this.on && sameKey;
    if (!placed && (now - this.movedAt < LAND_MS || now - this.cardAt < CARD_STILL_MS)) return 'wait';
    if (placed) {
      // it rides the vessel's turn on the screen every frame (the camera moves under it; its side, end and distance are the place's and do not change): the line of sight leaves at the Doppler angle from the flow
      const aw = (awayFromProbe(edge) as boolean) !== this.rev, t = this.tgt, ang = Math.atan2(ts.y, ts.x) * 180 / Math.PI + this.side * (aw ? 180 - PROBE.ANGLE : PROBE.ANGLE);
      t.ang = ang; t.ax = ang + (aw ? this.side : -this.side) * PROBE.ANGLE; t.r = rPx;
      this.cur.ang = ang + angTo(ang, this.cur.ang);   // the short way round
      if (now - this.searchAt < VERIFY_MS) return 'go';
    }
    this.searchAt = now;
    const O = this.opt;
    O.g[0] = gx; O.g[1] = gy; O.t[0] = ts.x / tl; O.t[1] = ts.y / tl; O.r = rPx; O.away = awayFromProbe(edge) as boolean; O.w = size.w; O.h = size.h; O.cards = cards;
    O.keep = sameKey ? this.side : 0; O.keepReach = this.reach; O.keepRev = this.rev; O.keepK = this.k; O.sc = B.sc / (UNITS_PER_SCENE / 1);
    O.slack = this.headOff ? 0 : SLACK;
    if (placed) {
      // Is the place it stands at still clear of the cards and the stage? Asked of the same search, with no labels and no drawings to weigh, locked to that place at its size: it answers with the place itself while it is
      // clear (through SLACK px of give), and with another only when this one is covered. Its angle and distance follow the vessel's turn on the screen (the camera) either way.
      O.avoid = NO_AVOID; O.busy = NO_BUSY; O.ban = NO_BAN; O.lock = true; O.k = this.k;
      const v = probePoseInto(this.verify, O) as Fit;
      const holds = !v.none && v.side === this.side && v.reach === this.reach && v.rev === this.rev && !!v.headOff === this.headOff;
      if (holds) {
        this.coveredAt = -1;
        this.tgt.d = v.D - Math.max(0, rPx); this.tgt.k = v.k;
        return 'go';
      }
      if (this.coveredAt < 0) this.coveredAt = now;
      // (covered for a moment only: a card passing, the view under the hand. It stays and follows the vessel; the place is asked again at the next look.)
      if (now - this.coveredAt < COVERED_MS) return 'go';
    }
    this.coveredAt = -1;
    let key = hMix(hStr(edge), hStr(seg ?? ''));
    key = hMix(key, Math.round(size.w / 8)); key = hMix(key, Math.round(size.h / 8));
    for (const c of cards) { key = hMix(key, Math.round(c.x0 / 16)); key = hMix(key, Math.round(c.y0 / 16)); key = hMix(key, Math.round(c.x1 / 16)); key = hMix(key, Math.round(c.y1 / 16)); }
    this.mind.sync(key);
    // (the labels showing when the place is chosen are weighed, as 2D does; they are never asked again)
    O.avoid = env.avoid?.() ?? []; O.busy = this.busyAround(env, B, edge, PROBE.GAP + PROBE.LEN + 140, O.busy); O.ban = this.mind.banned() as string[]; O.lock = false;
    const pose = fitPoseInto(this.fit, O) as Fit;
    const n = this.tgt;
    const next = { ang: pose.ang, d: pose.D - Math.max(0, rPx), k: pose.k, ax: pose.ang + pose.phi, r: rPx, sw: probeSwing(pose.side, O.away === pose.rev) as number };
    // (what a fresh show waits to see hold still is the PLACE it would take: side, end, size, vessel. `sig` also holds the plate's map, the gate to 4 px and the turn to 5 degrees, which the gentle tilt
    //  changes every frame in free play, so a probe not yet shown waited for ever: the same fresh-show wait, keyed on the place only)
    const holds = hMix(hMix(hMix(hMix(hMix(hStr(edge), hStr(seg ?? '')), pose.side), pose.reach), +pose.rev), Math.round(pose.k * 1000));
    const act = this.mind.act({ pose, tgt: next, on: this.on, cur: this.has ? this.cur : null, sig: holds, now, instant: true, swing }) as 'go' | 'hide' | 'hold' | 'restart' | 'wait' | 'jump';
    if (act === 'hold') return 'hold';
    // (While the view is being moved it never goes: the figure under the hand is a layout that changes every frame, and "no place" there is not an answer yet. It is asked again, and if there is still none
    //  450 ms after the view settles it hides then: the 2D app's own rule, whose camera never turned under the hand.)
    if (act === 'hide') return swing && this.on ? 'hold' : 'hide';
    if (act === 'restart') { this.searchAt = -1e9; return 'wait'; }
    if (act === 'wait') return 'wait';
    if (act === 'jump') { this.leave(); this.swap = true; return 'wait'; }
    if (!this.on || !this.has || reduce) {
      if (!this.on || !this.has) this.oP = 1;   // shown afresh: it comes in from out, fading, and with motion swinging
      this.has = true;
      this.cur.ang = next.ang; this.cur.d = next.d; this.cur.k = next.k;
      this.headP = pose.headOff ? 0 : 1;
    } else this.cur.ang = next.ang + angTo(next.ang, this.cur.ang);   // the short way round
    Object.assign(n, next);
    this.k = pose.k; this.headOff = !!pose.headOff;
    this.on = true; this.keyOn = true; this.placedKey = `${edge}|${seg ?? ''}`;
    this.side = pose.side; this.reach = pose.reach; this.rev = pose.rev;
    return 'go';
  }

  private leave(): void { if (this.on) { this.on = false; this.keyOn = false; this.mind.hide(); } }

  private stepScreen(dtMs: number, now: number, want: boolean, edge: string, seg: DopplerSeg, env: ScreenEnv): boolean {
    const reduce = env.reduceMotion?.() ?? false, dt = Math.min(0.1, Math.max(0, dtMs) / 1000);
    const g = want ? gateOf(edge, gateFraction(edge, seg), { p: this.gate3, t: this.tan3, r: 0 }) : null;
    const key = `${edge}|${seg ?? ''}`;
    let moving = false;
    if (env.moving?.() ?? false) this.movedAt = now;
    if (!g) this.leave();
    else if ((env.moving?.() ?? false) && !this.on) { this.mind.hide(); moving = true; }   // a camera glide hides it until it lands; shown, it stays and rides the vessel
    else if (this.on && key !== this.placedKey) { this.leave(); this.swap = true; }       // another vessel or third: it swings out where it stood
    else if (!this.on && this.has && this.oP < 1) moving = true;                          // still drawing back to go: it never jumps from half way out
    else {
      this.swap = false;
      const B = basisAt(env, this.gate3, this.basis);
      // The view moves under the hand as well as in a glide (an orbit, a pan, a pinch): the gate's place and the plate's map change from frame to frame. 2D's rules for a camera that moves (swing to a far
      // place, never fade out and in at it; never hide) are for all of it, not only the glides `env.moving` names: the probe used to jump (fade out, fade in) or hide at random as the figure was turned.
      const V = this.viewKey;
      if (Math.abs(B.ox - V[0]!) > 0.4 || Math.abs(B.oy - V[1]!) > 0.4 || Math.abs(B.a - V[2]!) > 0.2 || Math.abs(B.b - V[3]!) > 0.2 || Math.abs(B.c - V[4]!) > 0.2 || Math.abs(B.d - V[5]!) > 0.2) { V[0] = B.ox; V[1] = B.oy; V[2] = B.a; V[3] = B.b; V[4] = B.c; V[5] = B.d; this.viewAt = now; }
      const act = this.place(now, edge, seg, env, B, reduce, ((env.moving?.() ?? false) || now - this.viewAt < VIEW_SETTLE_MS) && this.on);
      if (act === 'hide') this.leave(); else if (act !== 'go') moving = true;
    }
    // the easing: place, size and distance in about 0.3 s, the head on its own clock, the swing out and in on PROBE.OUT_MS
    const f = 1 - Math.exp(-dt / 0.1), c = this.cur, t = this.tgt;
    if (this.on) {
      c.ang += (t.ang - c.ang) * f; c.d += (t.d - c.d) * f; c.k += (t.k - c.k) * f;
      if (Math.abs(t.ang - c.ang) < 0.3) c.ang = t.ang;
      if (Math.abs(t.d - c.d) < 0.3) c.d = t.d;
      if (Math.abs(t.k - c.k) < 0.004) c.k = t.k;
      const hStep = (dt * 1000) / 420;
      this.headP = this.headOff ? Math.max(0, this.headP - hStep) : Math.min(1, this.headP + hStep);
    }
    const stepP = (dt * 1000) / PROBE.OUT_MS, was = this.oP;
    this.oP = this.on ? Math.max(0, this.oP - stepP) : Math.min(1, this.oP + stepP);
    const placed = this.has && this.oP < 1;
    if (!placed) {
      if (this.shown !== 0) { this.shown = 0; this.paint(0, 1); }
      if (!this.on && this.oP >= 1) { this.has = false; if (!this.swap) this.placedKey = ''; }
      return moving || this.on || this.swap;
    }
    // draw: the whole probe swings round the gate (the target never moves); its marks close up as it goes; the flow axis stays along the flow
    const B = basisAt(env, this.gate3, this.basis);
    const o = easeMove(this.oP) as number, angDraw = probeTurn(c.ang, reduce ? 0 : t.sw, o) as number;
    const fr = this.frameFor(B, this.gate3, angDraw);
    const rNow = g ? g.r * B.sc : t.r;
    this.lay(fr, { D: Math.max(0, rNow) + c.d, r: rNow, k: c.k, phi: angTo(angDraw, t.ax), out: o }, { ox: B.ox, oy: B.oy, ang: angDraw });
    const op = probeFade(this.oP) as number, headA = smooth01(this.headP) as number;
    this.shown = op; this.paint(op, headA);
    // where it stands, for the labels and the tests
    this.gateAtScreen.x = B.ox; this.gateAtScreen.y = B.oy;
    const rad = angDraw * RAD, cc = Math.cos(rad), ss = Math.sin(rad), D = Math.max(0, rNow) + c.d, S = PROBE.SCALE * c.k;
    const fx = B.ox + D * cc, fy = B.oy + D * ss, L = PROBE.LEN * c.k, H = PROBE.HALF * c.k;
    const xs = [fx + -3 * cc + H * ss, fx + -3 * cc - H * ss, fx + L * cc + H * ss, fx + L * cc - H * ss], ys = [fy + -3 * ss - H * cc, fy + -3 * ss + H * cc, fy + L * ss - H * cc, fy + L * ss + H * cc];
    this.bodyBox.x0 = Math.min(...xs); this.bodyBox.x1 = Math.max(...xs); this.bodyBox.y0 = Math.min(...ys); this.bodyBox.y1 = Math.max(...ys);
    this.stand.edge = edge; this.stand.seg = seg; this.stand.ang = angDraw; this.stand.D = D; this.stand.k = c.k; this.stand.headOff = this.headOff;
    void S;
    if (!this.pose) this.pose = { gate: new Vector3(), face: new Vector3(), s: new Vector3(), across: new Vector3(), flow: new Vector3(), rPx: 0, k: 1 };
    const P = this.pose;
    P.gate.copy(fr.gate); P.s.copy(fr.ex).normalize(); P.across.copy(fr.ey).normalize(); P.flow.copy(g?.t ?? this.tan3); P.face.copy(fr.gate).addScaledVector(fr.ex, D); P.rPx = rNow; P.k = c.k;
    const settled = this.on ? c.ang === t.ang && c.d === t.d && c.k === t.k && this.oP === 0 && this.headP === (this.headOff ? 0 : 1) : this.oP >= 1;
    return moving || !settled || this.oP !== was || !!env.moving?.();
  }

  applyPalette(p: Palette): void {
    for (const o of this.parts) o.applyPalette(p);
    const c = new Color(DEVICE_TOKENS[lookOf(p)].dopGlow), col = this.wedgeGeo.getAttribute('color') as BufferAttribute;   // (--dop-glow: ink on the light looks, white on the dark ones)
    for (let i = 0; i < 5; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
  }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  /** The pose the probe is laid at now (for tests and tags). */
  /** The head's outline on the screen for the label layer (labels/probe-cover.ts); null while it is not shown. */
  coverRuns(): { runs: { rings: readonly Ring[]; from: number; to: number }[]; sc: number; alpha: number } | null {
    const a = this.shown * this.headA;
    return a > 0.01 && this.fr.U > 0 ? { runs: [{ rings: this.head.rings, from: 0, to: this.head.n - 1 }], sc: 1 / this.fr.U, alpha: a } : null;
  }
  get placed(): DopplerPose | null { return this.shown > 0 ? this.pose : null; }
  /** What the probe takes of the figure once it stands (stage px, appended to `out`): the body, the line of sight from its face to the gate and the gate with the flow axis. Nothing while it is not placed or is leaving, so
   *  the labels have it as an obstacle from the moment it is chosen and give the room back as it goes. */
  footprint(out: Box[]): void {
    if (!this.on || this.shown <= 0 || !this.overlay) return;
    const b = this.bodyBox, L = this.lines;
    addClaim(out, b.x0, b.y0, b.x1, b.y1, BODY_CLAIM_PAD);
    addStroke(out, L[LINE_SIGHT * 4]!, L[LINE_SIGHT * 4 + 1]!, L[LINE_SIGHT * 4 + 2]!, L[LINE_SIGHT * 4 + 3]!, 6);
    addClaim(out, L[LINE_AXIS * 4]!, L[LINE_AXIS * 4 + 1]!, L[LINE_AXIS * 4 + 2]!, L[LINE_AXIS * 4 + 3]!, 6);
  }
  /** The place it stands at (side of the vessel, reach, end, size: the 2D search's names), for tests; null while it is not placed. */
  get standsAt(): { side: number; reach: number; rev: boolean; k: number } | null { return this.on ? { side: this.side, reach: this.reach, rev: this.rev, k: this.k } : null; }
  /** True while the probe is drawn or swinging out (the layer keeps asking for frames). */
  get active(): boolean { return this.shown > 0 || this.on; }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.wedgeGeo.dispose(); this.wedgeMat.dispose(); }
}
