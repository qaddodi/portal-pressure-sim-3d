// The endoscope (2D eus-scope.js, whose way down is the only scope route the 2D figure draws): in through the top of the figure, down the middle of the esophagus and through the cardia into the proximal
// stomach, a black insertion tube 12 units across with a rigid grey tip and a dark lens. Three ways to work with it, one scope:
//   'scope'  to the cardia, looking (the plain endoscopy card);
//   'band'   to the lowest ligation band's place, with the ligator's clear cap on its tip and a band loaded on it (the bands the model counts are src/scene/devices/bands.ts);
//   'eus'    the linear echoendoscope to a station in the stomach: its bending section turns the tip until the needle's line from the working channel meets the target (eusPose, the 2D app's own), the
//            ultrasound sector fans out, and the 25-gauge needle crosses the wall into the left portal vein (station 'pv') or the left hepatic vein (station 'hv').
// The route, the stations, the targets, the bend's limits and the needle's exit are the 2D app's, copied by script; the scope travels at a steady pace and eases between places, never cutting.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { TIER_Z, VESSEL_PLANE_Z, len3, x3, y3 } from '../../frame2d.ts';
import { EDGE_PATH_2D } from '../../vessels/paths.copied.ts';
import { ORGAN_MESHES } from '../../organs/meshes.ts';
import { ORGAN_Z } from '../../organs/z.ts';
import { bakeGeometry, centreAt, type CentreGrid } from '../../organs/centre-z.ts';
import { BAND } from '../../procedures/copied/band-ring.js';
import { EUS_GLUE_ROUTE, EUS_GLUE_STATION, EUS_GLUE_TARGET, EUS_ROUTE, EUS_SCOPE_R, EUS_STATIONS, EUS_TARGETS, EUS_BEND_MIN, EUS_RIGID, EUS_PORT_R, eusPose, newTip, pointOn } from './copied/eus-scope.copied.js';
import { TAIL_UNITS } from '../device-object.ts';
import { ProbePart, TubeBuf, linePart, lookOf, type PartColour, type PartStyle } from './parts.ts';
import { DEVICE_TOKENS } from '../../procedures/copied/device-tokens.copied.ts';
import { NEEDLE_EDGE, mixHex, scopeEdge, scopeSoftHex } from '../edges.ts';
import { showRings } from '../tube-rings.ts';
import type { ScopeMode } from './state.ts';

type P2 = [number, number];
export const SCOPE_Z = TIER_Z.mid + 0.03;
/** The scope's pace down its way, figure units a second (the 2D app's pass takes about five seconds for the whole way). */
export const SCOPE_SPEED = 170;
const RAD = Math.PI / 180;
const STEP = 1.2;
/** The tip's light: its radius in figure units, its centre's alpha, the disc's segments, and the time it takes to come up (ms). */
export const GLOW_R = 16, GLOW_ALPHA = 0.55, GLOW_SEGS = 24, GLOW_MS = 900;
/** The plain scope (the distal oesophagus view) stops this far above the cardia, figure units, so the tip is in the oesophagus a little above the gastro-oesophageal junction. */
export const SCOPE_UP = 86;   // (was 40: 20 Nov, "a bit higher looking down at the esophagus, maybe 10% higher": 10 % of the way's length from the top of the figure to the cardia, about 46 units, more)

/** The scope's way as the 2D app lays it: the lead-in above the figure, the esophagus, the cardia and the proximal stomach, resampled every STEP units. */
export interface ScopeWay {
  pts: P2[]; cum: number[]; total: number;
  /** the lengths along the way where the cardia ends, the lowest band's place, and the hepatic vein's station is nearest */
  cardiaD: number; bandD: number; hvD: number;
  /** a point and the unit direction at length d */
  at(r: ScopeWay, d: number): { p: P2; t: P2 };
}
let kept: ScopeWay | null = null, keptGlue: ScopeWay | null = null;
export function scopeWay(): ScopeWay { return (kept ||= makeWay(EUS_ROUTE)); }
/** The way of the glue slide's scope (2D EUS_GLUE_ROUTE): the esophagus, one wide turn through the cardia and on under the fundus to the station over the varix. */
export function glueScopeWay(): ScopeWay { return (keptGlue ||= makeWay(EUS_GLUE_ROUTE)); }
function makeWay(route: { build(B: object): void }): ScopeWay {
  const lists: { name: string; pts: P2[] }[] = [];
  route.build({ pts: (list: P2[], _id: string, _f: number, name = 'lead') => { lists.push({ name, pts: list.map((q) => [q[0], q[1]] as P2) }); } });
  const raw: P2[] = [], endOf: Record<string, number> = {};
  for (const l of lists) { for (const q of l.pts) raw.push(q); endOf[l.name] = raw.length - 1; }
  const c0 = [0];
  for (let i = 1; i < raw.length; i++) c0.push(c0[i - 1]! + Math.hypot(raw[i]![0] - raw[i - 1]![0], raw[i]![1] - raw[i - 1]![1]));
  const total = c0[c0.length - 1]!, n = Math.ceil(total / STEP) + 1, pts: P2[] = [], cum: number[] = [];
  for (let i = 0, j = 1; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (j < c0.length - 1 && c0[j]! < d) j++;
    const s = c0[j]! - c0[j - 1]!, u = s > 0 ? Math.min(1, Math.max(0, (d - c0[j - 1]!) / s)) : 0;
    pts.push([raw[j - 1]![0] + (raw[j]![0] - raw[j - 1]![0]) * u, raw[j - 1]![1] + (raw[j]![1] - raw[j - 1]![1]) * u]); cum.push(d);
  }
  const lenAt = (k: number): number => c0[Math.min(k, c0.length - 1)]!;
  const near = (q: readonly number[]): number => { let best = Infinity, d = 0; pts.forEach((p, i) => { const e = Math.hypot(p[0] - q[0]!, p[1] - q[1]!); if (e < best) { best = e; d = cum[i]!; } }); return d; };
  // the way's direction at a length: over a few samples either side
  const way: ScopeWay = {
    pts, cum, total, cardiaD: lenAt(endOf.cardia ?? raw.length - 1), hvD: near(EUS_STATIONS.hv.at), bandD: 0,
    at(r, d) {
      const x = Math.min(r.total, Math.max(0, d)), i = Math.min(r.pts.length - 2, Math.max(0, Math.floor(x / STEP))), u = Math.min(1, Math.max(0, (x - r.cum[i]!) / (r.cum[i + 1]! - r.cum[i]! || 1)));
      const a = r.pts[i]!, b = r.pts[i + 1]!, j0 = Math.max(0, i - 2), j1 = Math.min(r.pts.length - 1, i + 3), dx = r.pts[j1]![0] - r.pts[j0]![0], dy = r.pts[j1]![1] - r.pts[j0]![1], l = Math.hypot(dx, dy) || 1;
      return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [dx / l, dy / l] };
    },
  };
  // the ligator's work: the scope's end just above the lowest band, whose place is the 2D band's own height
  way.bandD = cum[pts.findIndex((p) => p[1] >= (BAND as { y0: number }).y0 - 6)] ?? way.cardiaD;
  return way;
}

/** How far down the way the scope's tip goes for a mode and a station (figure units). */
export function workD(mode: ScopeMode, station: 'pv' | 'hv', way: ScopeWay = scopeWay()): number {
  if (mode === 'band') return way.bandD;
  if (mode === 'glue') return way.total;
  if (mode === 'eus') return station === 'hv' ? way.hvD : way.total;
  return Math.max(0, way.cardiaD - SCOPE_UP);
}

/** The stomach organ's middle in depth (the oesophagus is part of it): the scope travels on it, inside the lumen. Baked once, when the organ file is in; until then the scope's own plane. */
let eso: CentreGrid | null | undefined;
function esoCentre(): CentreGrid | null {
  if (eso !== undefined) return eso;
  try { eso = bakeGeometry(ORGAN_MESHES.stomach!()); } catch { return null; }   // (not loaded yet: asked again at the next pose)
  return eso;
}
/** The scope's depth at a scene point: the middle of the oesophagus and stomach there. */
// (The organ is drawn moved along z by ORGAN_Z (organs/z.ts), but the grid is baked from the raw mesh: the scope ran 0.06 in front of the oesophagus's real middle, so any turned view slid it off the tube
//  (owner, 20 Nov 2026: "the scope is NOT inside the esophagus"). The middle is the placed organ's: the raw middle plus the organ's own shift.)
export const scopeZ = (x: number, y: number): number => { const g = esoCentre(); return g ? centreAt(g, x, y) + (ORGAN_Z.stomach ?? 0) : SCOPE_Z; };
/** The scene point of a figure point on the scope's way: through the middle of the oesophagus and stomach. */
const at3 = (p: readonly number[], out: Vector3): Vector3 => { const x = x3(p[0]!), y = y3(p[1]!); return out.set(x, y, scopeZ(x, y)); };
/** The scene point of a target in the liver (a vein the needle enters): on the vessels' plane. */
const atVessel = (p: readonly number[], out: Vector3): Vector3 => out.set(x3(p[0]!), y3(p[1]!), VESSEL_PLANE_Z);
const dir3 = (t: readonly number[], out: Vector3): Vector3 => out.set(t[0]!, -t[1]!, 0);

const ease01 = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const withTang = (g: BufferGeometry): BufferGeometry => { if (!g.getAttribute('tang')) g.setAttribute('tang', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3)); return g; };
/** The figure's hepatic-vein blue (--tr-hv) and the portal vein's (the device tokens' trPv), for the hit's rings and the manometer's ripples. */
const HV_RING = (_t: unknown, look: string): string => (look === 'dark' || look === 'navy' || look === 'black' ? '#5CA4F2' : '#2A78D6');
/** The needle's half width (figure units) and the bevel it comes to a point over (2D eus-scope.js nw0, bev; a little wider than 2D's 0.62 so a thin steel needle still reads on the figure). */
const CAP_RINGS = 8;
/** The sector's mesh: arcs (rows) of points (columns) and the apex; its alpha at the apex and at the far arc, and the share of it left at the two sides. */
export const FAN_ROWS = 4, FAN_COLS = 19, FAN_VERTS = 1 + FAN_ROWS * FAN_COLS, FAN_A0 = 0.26, FAN_A1 = 0.03, FAN_SIDE = 0.35;
const FACE_Z = new Vector3(), FACE_N = new Vector3(), FACE_A = new Vector3(), FACE_B = new Vector3();
const NEEDLE_HALF = 0.8, NEEDLE_BEV = 2.6, NEEDLE_RINGS = 12;
/** The insertion tube's depth marks (a real scope's thin white rings, a heavier one every fifth): every MARK_UNITS figure units back from the tip, half MARK_HALF wide; the bending section's fine grooves (BEND_GROOVES of them). */
export const MARK_UNITS = 30, MARK_HALF = 0.32, MARK_EVERY = 5, BEND_GROOVES = 8;
/** The metals and the cap the scope is drawn in, from the device tokens: the distal housing a polished silver (the tip's grey lifted toward white), the bending section the tube's black a little lifted with grooves a shade down, the transducer's cap a warm cream and its dark acoustic face, the needle bright steel. */
export const SCOPE_SILVER = (t: { scopeTip: string }): string => mixHex(t.scopeTip, '#FFFFFF', 0.38);
/** The plain scope's distal end: the tube's black a shade lifted, not chrome. */
export const SCOPE_DISTAL = (t: { scope: string; scopeTip: string }): string => mixHex(t.scope, t.scopeTip, 0.35);
const SCOPE_SILVER_C: PartColour = (t) => SCOPE_SILVER(t), SCOPE_DISTAL_C: PartColour = (t) => SCOPE_DISTAL(t);
export const SCOPE_BEND = (t: { scope: string; scopeTip: string }): string => mixHex(t.scope, t.scopeTip, 0.22);
export const SCOPE_GROOVE = (t: { scope: string }): string => mixHex(t.scope, '#000000', 0.55);
export const SCOPE_CREAM = (t: { scopeTip: string }): string => mixHex(t.scopeTip, '#FFFFFF', 0.3);
/** The insertion tube's tone: 2D's black polymer lifted a little toward the tip's grey, a soft glossy black, never a near-black slab (owner, 20 Nov 2026: "too cartoony and too prominent"). */
export const SCOPE_TUBE = (t: { scope: string; scopeTip: string }): string => mixHex(t.scope, t.scopeTip, 0.18);
/** The scope is slimmer than 2D's radius (owner's photos: a slim tube), and every tube of it is round (SCOPE_RADIAL sides, not 8 facets). */
export const SCOPE_SLIM = 0.7, SCOPE_RADIAL = 24;
export const SCOPE_NEEDLE = '#D5DAE2', SCOPE_LIGHT = '#F6EEDB', MARK_WHITE = '#F4F2EC';
/** The tip's face on a forward-viewing endoscope: the lens, two light guides and the working channel, as stubs standing this far (figure units) off the end, at offsets of the tube's radius. */
export const FACE_STUB = 0.35;
/** The 2D procedure frame's fields the echoendoscope follows while the EUS-PPG plays (proc-anim.js eusFrame): the scope's way in (u of the way to the station), the station the aim has gone to (tgt, 0 portal vein to 1 hepatic vein), the port open and the elevator up (aim), the sector, the needle, the hit's rings and the reading. */
export interface EusDrive { u: number; tgt: number; aim: number; fan: number; needle: number; flash: number; read: number }

/** What the glue slide's procedure sets on the scope each frame (the 2D `procFrame('eusglue')` record): how far in (u, of its way), the port and elevator (aim), the sector (fan) and the needle (0..1). */
export interface ScopeDrive { u: number; aim: number; fan: number; needle: number }

export class EndoScope {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  private readonly bufs: TubeBuf[] = [];
  /** how far down its way the tip is, figure units; the bend's turn (0 straight to 1 aimed), the sector's, the needle's, the cap's: each eased */
  d = 0; aim = 0; fan = 0; needle = 0; cap = 0; opacity = 1;
  private way = scopeWay();
  private readonly eusWay = this.way; private readonly glueWay = glueScopeWay();
  /** how far the parked glue scope has faded out (0 whole, 1 gone) once the slide's procedure is taken off */
  private gone = 0;
  /** the glue slide's target: the varix, at its needle's point */
  private glueT: P2 = [0, 0];
  private readonly shaft: TubeBuf; private readonly bend: TubeBuf; private readonly tip: TubeBuf; private readonly lens: TubeBuf;
  private readonly capBuf: TubeBuf; private readonly bandBuf: TubeBuf; private readonly needleBuf: TubeBuf; private readonly faceBuf: TubeBuf; private readonly portBuf: TubeBuf; private readonly arrayBuf: TubeBuf;
  private readonly lightBufs: TubeBuf[] = []; private readonly chanBuf: TubeBuf;
  private readonly parts_: { shaft: ProbePart; bend: ProbePart; tip: ProbePart; lens: ProbePart; cap: ProbePart; band: ProbePart; needle: ProbePart; face: ProbePart; port: ProbePart; array: ProbePart; lights: ProbePart[]; chan: ProbePart };
  /** the shaft's rings in all (the longer of the two ways): its uv.x runs 0 to 1 over them */
  private readonly N: number;
  /** the hit's two rings and the manometer's two ripples at the target (2D eusDraw: flash, ring) */
  private readonly flashRings: ProbePart[] = []; private readonly rippleRings: ProbePart[] = [];
  /** where the needle is aimed, for both stations; and how far the aim has gone from the portal vein's to the hepatic vein's (0 to 1) */
  private readonly targets: [P2, P2] = [[0, 0], [0, 0]];
  tgt = 0;
  /** the hit's rings (0 none to 1) and the reading (0 none, 1 portal, 2 hepatic) the last drive gave */
  flash = 0; read = 0;
  private drove = false;
  /** The Tests card's EUS run (or a slide's) is driving the scope: the camera may follow its tip. */
  get driven(): boolean { return this.drove; }
  private readonly tgtPt: P2 = [0, 0];
  private readonly fanGeo = new BufferGeometry();
  private readonly fanMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly fanMesh: Mesh;
  /** The soft light at the tip (owner, 20 Nov 2026): a round glow that fades in once the scope is on the figure, a centre of warm white easing to nothing at its edge. */
  private readonly glowGeo = new BufferGeometry();
  private readonly glowMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly glowMesh: Mesh;
  private glow = 0;
  private readonly g = newTip() as { c1: P2; c2: P2; a1: P2; side: P2; exit: P2; nd: P2; p2: P2; end: P2; p0: P2; len: number; phi: number; d0: number; bend: number };
  private readonly v = new Vector3(); private readonly w = new Vector3(); private readonly dv = new Vector3();
  private mode: ScopeMode = 'scope';
  private station: 'pv' | 'hv' = 'pv';
  private dirty = true;
  /** the bending section is laid (turning, or straight behind the rigid tip) */
  private bendOn = false;
  /** the last pose laid, for tests and tags */
  readonly pose = { tip: new Vector3(), dir: new Vector3(), needleEnd: new Vector3(), shaftRings: 0 };

  constructor(shared: CelShared) {
    const R = len3(EUS_SCOPE_R as number) * SCOPE_SLIM;
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number, style: PartStyle = {}) => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order, style);
      this.parts.push(part); this.bufs.push(buf); this.group.add(part.group);
      return { part, buf };
    };
    const N = Math.max(this.way.pts.length, this.glueWay.pts.length);
    // The materials and the edges are 2D's (eus-scope.js, tokens.css): the insertion tube black polymer (--dev-scope) and the rigid tip grey (--dev-scope-tip), each in a faint hairline of the scope's own colour
    // (the edge moved 55 % to the body's, drawn at 0.26: devices/edges.ts), the needle's steel in the catheter's dark edge at 0.8, the transducer's face and the port as the device table has them. Not the look's ink.
    const SOFT: PartStyle = { edge: scopeEdge(), radial: SCOPE_RADIAL };
    // (the redesign, 20 Nov 2026, from the owner's photos of echoendoscopes: a black flexible tube with thin white depth rings; a bending section a shade lifted and grooved; a polished silver distal housing; the curvilinear transducer's
    //  cream cap with its dark acoustic face; a thin bright needle out of the port behind it. A forward-viewing endoscope has the bending section too, and a tip with a lens, two light guides and the working channel.)
    const sh = mk('poly', (t) => SCOPE_TUBE(t), N, 1, 1, SOFT), bd = mk('poly', (t) => SCOPE_BEND(t), 17, 1, 1, SOFT), tp = mk('steel', (t) => SCOPE_SILVER(t), 4, 1, 2, { edge: scopeEdge(), radial: SCOPE_RADIAL }), ln = mk('poly', (t) => t.port, 2, 0.7, 3, SOFT);
    const cp = mk('graft', null, 2, 0.8, 3), bn = mk('platinum', null, 18, 0.9, 4, { edge: 'none' }), nd = mk('steel', SCOPE_NEEDLE, NEEDLE_RINGS, 0.8, 5, { edge: NEEDLE_EDGE });
    // the transducer's cap (cream, curved, on the side that meets the wall), its dark face, and the working channel's port, where the needle leaves (2D --dev-scope-face, --dev-port; the port has no outline)
    const fc = mk('graft', (t) => SCOPE_CREAM(t), CAP_RINGS, 0.6, 3, { edge: scopeEdge(), radial: SCOPE_RADIAL }), pt = mk('graft', (t) => t.port, 2, 0.4, 4, { edge: 'none' });
    const ar = mk('graft', (t) => t.port, CAP_RINGS, 0.4, 4, { edge: 'none' });
    const lights = [0, 1].map(() => mk('graft', SCOPE_LIGHT, 2, 0.4, 3, { edge: 'none' })), ch = mk('graft', (t) => t.port, 2, 0.4, 3, { edge: 'none' });
    this.faceBuf = fc.buf; this.portBuf = pt.buf; this.arrayBuf = ar.buf; this.chanBuf = ch.buf; this.lightBufs = lights.map((l) => l.buf); this.N = N;
    const ringPart = (colour: PartColour, order: number): ProbePart => { const part = new ProbePart(withTang(new RingGeometry(0.8, 1, 48)), 'steel', shared, colour, { px: 0, order }, { edge: 'none' }); this.parts.push(part); this.group.add(part.group); return part; };
    for (let i = 0; i < 2; i++) { this.flashRings.push(ringPart((t) => t.trPv, 6)); this.rippleRings.push(ringPart((t) => t.trPv, 6)); }
    this.shaft = sh.buf; this.bend = bd.buf; this.tip = tp.buf; this.lens = ln.buf; this.capBuf = cp.buf; this.bandBuf = bn.buf; this.needleBuf = nd.buf;
    this.parts_ = { shaft: sh.part, bend: bd.part, tip: tp.part, lens: ln.part, cap: cp.part, band: bn.part, needle: nd.part, face: fc.part, port: pt.part, array: ar.part, lights: lights.map((l) => l.part), chan: ch.part };
    for (const b of [this.shaft, this.bend, this.tip, this.lens]) b.rings.forEach((r) => { r.r = R; });
    // The sector is a see-through wash (owner, 20 Nov 2026: "like the FibroScan waves"): the apex, then FAN_ROWS arcs of FAN_COLS points; its alpha falls off with the reach and toward its two sides, never a flat sheet.
    this.fanGeo.setAttribute('position', new BufferAttribute(new Float32Array(FAN_VERTS * 3), 3));
    this.fanGeo.setAttribute('color', new BufferAttribute(new Float32Array(FAN_VERTS * 4), 4));
    const idx: number[] = [];
    for (let j = 0; j < FAN_COLS - 1; j++) idx.push(0, 1 + j, 2 + j);
    for (let r = 1; r < FAN_ROWS; r++) for (let j = 0; j < FAN_COLS - 1; j++) { const a = 1 + (r - 1) * FAN_COLS + j, b = a + FAN_COLS; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    this.fanGeo.setIndex(idx);
    this.fanMesh = new Mesh(this.fanGeo, this.fanMat);
    this.fanMesh.renderOrder = 1000; this.fanMesh.frustumCulled = false; this.fanMesh.visible = false;
    this.group.add(this.fanMesh);
    {
      const n = GLOW_SEGS, pos = new Float32Array((n + 1) * 3), col = new Float32Array((n + 1) * 4), idx: number[] = [];
      col.set([1, 0.93, 0.74, GLOW_ALPHA], 0);
      for (let i = 1; i <= n; i++) { col.set([1, 0.93, 0.74, 0], i * 4); idx.push(0, i, i === n ? 1 : i + 1); }
      this.glowGeo.setAttribute('position', new BufferAttribute(pos, 3));
      this.glowGeo.setAttribute('color', new BufferAttribute(col, 4));
      this.glowGeo.setIndex(idx);
      this.glowMesh = new Mesh(this.glowGeo, this.glowMat);
      this.glowMesh.renderOrder = 1001; this.glowMesh.frustumCulled = false; this.glowMesh.visible = false;
      this.group.add(this.glowMesh);
    }
    this.group.visible = false;
    this.setTargets();
  }

  /** Where the needle is aimed at each station: the target on the figure (the left portal vein's near end, the left hepatic vein). */
  private setTargets(): void {
    (['pv', 'hv'] as const).forEach((station, i) => {
      const [id, f] = (EUS_TARGETS as unknown as Record<string, [string, number]>)[station]!;
      const path = (EDGE_PATH_2D as Record<string, P2[]>)[id]!;
      const q = pointOn(path, f) as P2;
      this.targets[i] = [q[0], q[1]];
    });
  }
  /** One of the two targets in the scope's plane (0 the portal vein's, 1 the hepatic vein's): where the EUS-PPG's cards point. */
  targetAt(i: 0 | 1, out: Vector3): Vector3 { return atVessel(this.targets[i]!, out); }
  /** The aim's target now: between the two (the 2D TGT). */
  private target(out: P2 = [0, 0]): P2 {
    if (this.mode === 'glue') { out[0] = this.glueT[0]; out[1] = this.glueT[1]; return out; }
    const a = this.targets[0], b = this.targets[1], k = this.tgt;
    out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k;
    return out;
  }
  /** The glue slide's target: the varix, at its needle's point (EUS_GLUE_TARGET). */
  private setGlueTarget(): void {
    const [id, f] = EUS_GLUE_TARGET as unknown as [string, number];
    const q = pointOn((EDGE_PATH_2D as Record<string, P2[]>)[id]!, f) as P2;
    this.glueT = [q[0], q[1]];
  }

  /** Lays the scope for the tip at `this.d`: the shaft along the way to where its bend starts, the bending section, the rigid tip with its lens, the ligator's cap or the needle and its sector. */
  private lay(): void {
    const way = this.way, R = len3(EUS_SCOPE_R as number) * SCOPE_SLIM, g = this.g, v = this.v, w = this.w, dv = this.dv;
    const D = this.d, eus = this.mode === 'eus' || this.mode === 'glue';
    const dA = Math.max(0, D - (EUS_RIGID as number));
    let end: P2, a1: P2, shaftEnd = dA, phi = 0, bendLen = 0, tipFrom: P2;
    if (eus) {
      const ST = EUS_STATIONS as Record<string, { exit: number; hand: number }>;
      const glue = this.mode === 'glue', G = EUS_GLUE_STATION as { exit: number; hand: number }, S = glue ? G : this.tgt < 0.5 ? ST.pv! : ST.hv!, exitA = glue ? G.exit : ST.pv!.exit + (ST.hv!.exit - ST.pv!.exit) * this.tgt;
      eusPose(way, D, way.at, this.target(this.tgtPt), this.drove ? this.aim : ease01(this.aim), exitA, S.hand, g);
      end = g.end; a1 = g.a1; phi = g.phi; bendLen = g.bend; tipFrom = g.p2;
      // a scope still straight (the bend not begun) is the way itself to the rigid tip
      if (Math.abs(phi) > 1e-4 && bendLen > 0.01) shaftEnd = g.d0; else { tipFrom = way.at(way, dA).p; phi = 0; bendLen = 0; }
    } else {
      const e = way.at(way, D);
      end = e.p; a1 = e.t; tipFrom = way.at(way, dA).p;
    }
    // The bending section is on every scope (owner, 20 Nov 2026: the endoscope redesign): where it is not turning it lies straight along the way, the bend's shortest length behind the rigid tip, and the shaft ends where it starts.
    const straight = !(Math.abs(phi) > 1e-4 && bendLen > 0.01), len0 = Math.min(EUS_BEND_MIN as number, dA);
    if (straight && len0 > 0.5) { shaftEnd = dA - len0; bendLen = len0; phi = 0; }
    // the shaft: the way's rings up to where the bend (or the rigid tip) begins
    way.pts.forEach((p, i) => { const r = this.shaft.rings[i]!; at3(p, r.c); const q = way.at(way, way.cum[i]!); dir3(q.t, r.t); });
    this.shaft.commit();
    this.parts_.shaft.setTailFade(Math.min(0.5, TAIL_UNITS / way.total));
    // the depth marks: thin white rings every MARK_UNITS back from the tip's end (so they travel with the tube), a heavier one every fifth; the way's length is uv.x over the shaft's rings
    const uvU = (way.pts.length - 1) / (way.total * (this.N - 1));
    this.parts_.shaft.setStripes(MARK_UNITS * uvU, D * uvU, MARK_HALF * uvU, 0, MARK_WHITE, 1.6);
    const k = Math.max(0, Math.min(way.pts.length - 1, Math.floor(shaftEnd / STEP)));
    showRings(this.shaft.geometry, 0, Math.min(way.pts.length - 1, k + 1), this.shaft.radial);   // (one ring more, so the shaft runs under the tip's start)
    this.pose.shaftRings = k;
    // the bending section: BEND_N + 1 points walked from the way's own direction at its start, turning by phi across it (eus-scope.js bendWalk)
    const showBend = bendLen > 0.01;
    this.bendOn = showBend;
    if (showBend) {
      const n = this.bend.n - 1, q0 = way.at(way, shaftEnd), ds = bendLen / n;
      let x = q0.p[0], y = q0.p[1];
      const h0 = Math.atan2(way.at(way, shaftEnd + bendLen * 0.5).t[1], way.at(way, shaftEnd + bendLen * 0.5).t[0]);
      for (let i = 0; i <= n; i++) {
        if (i) { const h = Math.atan2(way.at(way, shaftEnd + ds * (i - 0.5)).t[1], way.at(way, shaftEnd + ds * (i - 0.5)).t[0]) + (phi * (i - 0.5)) / n; x += Math.cos(h) * ds; y += Math.sin(h) * ds; }
        const r = this.bend.rings[i]!;
        at3([x, y], r.c);
        const hh = (i ? Math.atan2(way.at(way, shaftEnd + ds * (i - 0.5)).t[1], way.at(way, shaftEnd + ds * (i - 0.5)).t[0]) + (phi * (i - 0.5)) / n : h0);
        r.t.set(Math.cos(hh), -Math.sin(hh), 0);
      }
      this.bend.commit();
    }
    // the rigid tip, from the bend's end (or the way at D - RIGID) to the end, with the lens a hair beyond it
    at3(tipFrom, v); at3(end, w); dir3(a1, dv);
    // (One tube with the shaft: the tip is the shaft's own width from end to end, and it starts a ring's length back inside the shaft, so there is no step and no gap at the seam: owner, 20 Nov 2026, "the tip of the
    //  scope is disconnected from its body". It was 8 % wider than the shaft and started where the shaft's last ring stopped.)
    v.addScaledVector(dv, -len3(STEP * 1.5));
    for (let i = 0; i < this.tip.n; i++) { const r = this.tip.rings[i]!, u = i / (this.tip.n - 1); r.c.lerpVectors(v, w, u); r.t.copy(dv); r.r = R * (u < 1 ? 1 : 0.86); }   // (the end's edge softly rounded, not a box)
    this.tip.commit();
    // the tip's face: a forward-viewing endoscope's lens (dead centre, a hair toward the eye), two light guides either side and the working channel behind them; the echoendoscope has its lens alone (its working end is the transducer)
    {
      const nz = FACE_Z.set(0, 0, 1), n1 = FACE_N.set(-dv.y, dv.x, 0), stub = len3(FACE_STUB), fa = FACE_A, fb = FACE_B;
      const put = (buf: TubeBuf, side: number, up: number, r: number): void => {
        fa.copy(w).addScaledVector(n1, side * R).addScaledVector(nz, up * R); fb.copy(fa).addScaledVector(dv, stub);
        buf.line(fa, fb, R * r);
      };
      if (eus) put(this.lens, 0, 0.1, 0.34);
      else { put(this.lens, 0, 0.1, 0.34); put(this.lightBufs[0]!, -0.56, 0, 0.22); put(this.lightBufs[1]!, 0.56, 0, 0.22); put(this.chanBuf, 0, -0.42, 0.26); }
    }
    this.pose.tip.copy(w); this.pose.dir.copy(dv);
    // the ligator's clear cap on the tip, with a band loaded on its rim
    if (this.mode === 'band') {
      const a = at3(end, this.v), b = this.w.copy(a).addScaledVector(dv, len3(9));
      this.capBuf.line(a, b, R * 1.28);
      const c = this.dv.clone(), n1 = new Vector3(-c.y, c.x, 0), n2 = new Vector3(0, 0, 1), cr = R * 1.3, nb = this.bandBuf.n;
      for (let i = 0; i < nb; i++) {
        const th = (i / (nb - 1)) * Math.PI * 2, r = this.bandBuf.rings[i]!;
        r.c.copy(b).addScaledVector(n1, Math.cos(th) * cr).addScaledVector(n2, Math.sin(th) * cr);
        r.t.copy(n1).multiplyScalar(-Math.sin(th)).addScaledVector(n2, Math.cos(th)).normalize(); r.r = len3(1.6);
      }
      this.bandBuf.commit();
    }
    // the needle out of the working channel, and the ultrasound sector it works in
    if (eus) {
      const R2 = (EUS_SCOPE_R as number) * SCOPE_SLIM, RIG = EUS_RIGID as number;
      // the transducer: its curved array, a pale face on the side that meets the wall, just behind the tip's end (2D: centred 0.3 rigid lengths back and 0.52 radii across, 0.56 rigid lengths long)
      // (the redesign: the cap is the curvilinear array's cream housing, proud of the silver tip on the wall's side and rounded at both ends; on its outer face a darker, narrower strip, the acoustic lens)
      const fx = g.end[0] - g.a1[0] * RIG * 0.3 + g.side[0] * R2 * 0.62, fy = g.end[1] - g.a1[1] * RIG * 0.3 + g.side[1] * R2 * 0.62;
      const fr = len3(R2 * 0.55), fh = Math.max(0, len3(RIG * 0.56) - fr), U1 = len3(1);
      const capRings = (buf: TubeBuf, cx: number, cy: number, half: number, r0: number): void => {
        const a = at3([cx - g.a1[0] * half / U1, cy - g.a1[1] * half / U1], this.v), b = at3([cx + g.a1[0] * half / U1, cy + g.a1[1] * half / U1], this.w);
        const t = this.dv.subVectors(b, a).normalize();
        for (let i = 0; i < buf.n; i++) { const u = i / (buf.n - 1), r = buf.rings[i]!; r.c.lerpVectors(a, b, u); r.t.copy(t); r.r = r0 * (0.5 + 0.5 * Math.sqrt(Math.max(0, Math.sin(Math.PI * u)))); }
        buf.commit();
      };
      capRings(this.faceBuf, fx, fy, fh, fr);
      capRings(this.arrayBuf, fx + g.side[0] * R2 * 0.5, fy + g.side[1] * R2 * 0.5, fh * 0.8, fr * 0.34);
      // the working channel's port, where the needle leaves the scope
      const pr = len3(R2 * (EUS_PORT_R as number)), ps = at3(g.exit, this.v), pe = this.w.copy(ps).addScaledVector(dv.set(g.a1[0], -g.a1[1], 0), len3(0.15));
      this.portBuf.line(ps.clone(), pe, pr);
      // the needle: steel from the port to its bevelled point, the last 2.6 units narrowing to a fifth of its width (2D nw)
      const ex = at3(g.exit, this.v), nd = this.dv.set(g.nd[0], -g.nd[1], 0), nl = g.len * this.needle, nU = len3(nl), bev = Math.min(len3(NEEDLE_BEV), nU);
      const stem = nU - bev, last = this.needleBuf.n - 1, body = this.needleBuf.n - 5;
      for (let i = 0; i <= last; i++) {
        const l = i <= body ? (stem * i) / Math.max(1, body) : stem + (bev * (i - body)) / (last - body), r = this.needleBuf.rings[i]!;
        r.c.copy(ex).addScaledVector(nd, l); r.t.copy(nd);
        const k = bev > 0 ? ease01((l - stem) / bev) : 0;
        r.r = len3(NEEDLE_HALF) * (1 - 0.8 * k);
      }
      this.needleBuf.commit();
      const tipPt = this.w.copy(ex).addScaledVector(nd, nU);
      this.pose.needleEnd.copy(tipPt);
      // the sector: from the array toward the target, a little past it, 30 degrees either side (2D: apex 0.45 rigid lengths back and 0.85 radii across, reach 1.12 times the distance to the target)
      const ax = g.end[0] - g.a1[0] * RIG * 0.45 + g.side[0] * R2 * 0.85, ay = g.end[1] - g.a1[1] * RIG * 0.45 + g.side[1] * R2 * 0.85;
      const T = this.tgtPt, apex = at3([ax, ay], new Vector3());
      const fdx = T[0] - ax, fdy = T[1] - ay, reach = len3(Math.hypot(fdx, fdy) * 1.12), ang0 = Math.atan2(-fdy, fdx), half = 30 * RAD;
      const pos = this.fanGeo.getAttribute('position') as BufferAttribute, col = this.fanGeo.getAttribute('color') as BufferAttribute;
      pos.setXYZ(0, apex.x, apex.y, apex.z); col.setW(0, FAN_A0);
      for (let r = 1; r <= FAN_ROWS; r++) {
        const k = r / FAN_ROWS, rr = reach * k, a0 = FAN_A0 + (FAN_A1 - FAN_A0) * k * (2 - k);   // (the alpha falls fast near the apex and slowly out at the far arc)
        for (let j = 0; j < FAN_COLS; j++) {
          const a = ang0 - half + (2 * half * j) / (FAN_COLS - 1), side = 1 - (1 - FAN_SIDE) * Math.pow(Math.abs(j / (FAN_COLS - 1) - 0.5) * 2, 2), i = 1 + (r - 1) * FAN_COLS + j;
          pos.setXYZ(i, apex.x + Math.cos(a) * rr, apex.y + Math.sin(a) * rr, apex.z); col.setW(i, a0 * side);
        }
      }
      pos.needsUpdate = true; this.fanGeo.computeBoundingSphere();
      col.needsUpdate = true;
    }
  }

  /** The hit's rings and the manometer's ripples at the target (2D eusDraw: two discs running out and fading, in the vein's colour), at `now` ms. */
  private layRings(now: number, vis: boolean): void {
    const eus = this.mode === 'eus' && vis, T = atVessel(this.target(this.tgtPt), this.v);
    const hv = this.tgt >= 0.5, pvC: PartColour = (t) => t.trPv, hvC: PartColour = HV_RING as PartColour;
    const rings = (parts: ProbePart[], on: boolean, ph: number, r0: number, r1: number, a0: number, colour: PartColour): void => {
      parts.forEach((o, i) => {
        if (!on) { o.group.visible = false; return; }
        const k = i ? (ph + 0.5) % 1 : ph, s = len3(r0 + r1 * k);
        o.recolour(colour);
        o.group.position.copy(T); o.group.scale.setScalar(s); o.setAlpha((1 - k) * (1 - k) * a0 * this.opacity);
      });
    };
    // the hit: two rings in the station's colour, from the needle's point out to 7.4 units (flash 0 none to 1)
    rings(this.flashRings, eus && this.flash > 0, this.flash, 1.4, 6, 0.85, hv ? hvC : pvC);
    // the reading: two ripples in the vein it reads, one cycle every 1.3 s
    rings(this.rippleRings, eus && this.read > 0, (now / 1300) % 1, 2, 5, 0.9, this.read === 2 ? hvC : pvC);
  }

  /**
   * Steps the scope toward what is asked; true while it moves. `u` and `needleSet` override the scope's own pace (a pane that plays the steps). `drive`: for mode 'eus' the EUS-PPG's procedure frame (an
   * EusDrive, 2D proc-anim.js eusFrame): the scope then goes where the frame puts it, the way in, the aim and the station, the sector, the needle, the hit's rings and the ripples, and has no pace of its own;
   * for mode 'glue' the glue slide's frame (a ScopeDrive): how far in, the port, the sector and the needle. `now`: the clock's ms, for the ripples' cycle.
   */
  update(dtMs: number, on: boolean, mode: ScopeMode, station: 'pv' | 'hv', u?: number, needleSet?: number, drive: EusDrive | ScopeDrive | null = null, now = 0): boolean {
    const dt = Math.max(0, dtMs) / 1000;
    let moving = false;
    const driven = !!drive && on && mode === 'eus', glued = !!drive && mode === 'glue';
    if (!driven && this.drove) { this.drove = false; this.flash = 0; this.read = 0; this.dirty = true; this.aim = 0; this.fan = 0; this.needle = 0; }
    if (driven) {
      const D = drive as EusDrive;
      if (this.way !== this.eusWay) { this.way = this.eusWay; this.d = 0; }
      if (this.gone > 0) this.restore();
      const goal = D.u * (this.way.total + (this.way.hvD - this.way.total) * D.tgt);
      moving = Math.abs(goal - this.d) > 1e-6 || D.aim !== this.aim || D.fan !== this.fan || D.needle !== this.needle || D.tgt !== this.tgt || D.flash !== this.flash || D.read !== this.read || this.mode !== 'eus';
      this.mode = 'eus'; this.station = D.tgt >= 0.5 ? 'hv' : 'pv'; this.drove = true;
      this.d = goal; this.aim = D.aim; this.fan = D.fan; this.needle = D.needle; this.tgt = D.tgt; this.flash = D.flash; this.read = D.read; this.cap = 0;
      if (this.read > 0 || this.flash > 0) moving = true;
    } else {
      if (mode !== this.mode || station !== this.station) {
        // another job or station: the needle goes in, the cap off, and the tip travels to the new place
        if (this.needle > 0.002 || this.cap > 0.002 && mode !== 'band') { this.needle = Math.max(0, this.needle - dt / 0.5); this.cap = mode === 'band' ? this.cap : Math.max(0, this.cap - dt / 0.3); this.lay(); return true; }
        this.mode = mode; this.station = station; this.tgt = station === 'hv' ? 1 : 0; if (mode === 'glue') this.setGlueTarget(); this.aim = 0; this.fan = 0; this.dirty = true;
        const w = mode === 'glue' ? this.glueWay : this.eusWay;
        if (w !== this.way) { this.way = w; this.d = 0; }
      }
      if (glued && this.gone > 0) this.restore();
      const goal = on ? (u == null ? workD(this.mode, this.station, this.way) : Math.min(1, Math.max(0, u)) * workD(this.mode, this.station, this.way)) : 0;
      const was = this.d;
      if (Math.abs(goal - this.d) > 1e-3) { this.d += Math.sign(goal - this.d) * Math.min(Math.abs(goal - this.d), SCOPE_SPEED * dt); }
      const there = Math.abs(goal - this.d) < 1e-3 && on;
      const eus = this.mode === 'eus' || this.mode === 'glue', aimGoal = eus && there ? 1 : 0, fanGoal = eus && this.aim > 0.98 ? 1 : 0;
      const needleGoal = needleSet != null ? needleSet : eus && this.fan > 0.98 ? 1 : 0;
      const capGoal = this.mode === 'band' && on ? 1 : 0;
      const step = (x: number, g: number, secs: number): number => (Math.abs(g - x) < 1e-3 ? g : x + Math.sign(g - x) * Math.min(Math.abs(g - x), dt / secs));
      const a0 = this.aim, f0 = this.fan, n0 = this.needle, c0 = this.cap;
      this.aim = step(this.aim, aimGoal, 1.3); this.fan = step(this.fan, fanGoal, 0.5); this.needle = step(this.needle, needleGoal, 0.9); this.cap = step(this.cap, capGoal, 0.3);
      // (a pane that plays the glue slide's steps (the procedure layer's frame) sets all of it: how far in, the elevator and port, the sector and the needle)
      if (glued) { const G = drive as ScopeDrive; this.d = goal; this.aim = G.aim; this.fan = G.fan; this.needle = G.needle; }
      moving = this.d !== was || this.aim !== a0 || this.fan !== f0 || this.needle !== n0 || this.cap !== c0;
    }
    const eus = this.mode === 'eus' || this.mode === 'glue';
    const vis = this.d > 0.5;
    this.group.visible = vis;
    if (vis && (moving || this.dirty)) {
      this.dirty = false;
      this.lay();
      const p = this.parts_;
      for (const o of this.parts) o.group.visible = true;
      p.bend.group.visible = this.bendShown();
      // a forward-viewing gastroscope's end is short, black and rounded (owner's Fujifilm photo); the echoendoscope's is the chrome housing
      p.tip.recolour(eus ? SCOPE_SILVER_C : SCOPE_DISTAL_C);
      p.cap.group.visible = this.cap > 0.002; if (this.cap > 0.002) { p.cap.setAlpha(this.cap * 0.55); p.band.setAlpha(this.cap); } else p.band.group.visible = false;
      p.needle.group.visible = eus && this.needle * this.g.len > 0.4;
      p.face.group.visible = eus; p.array.group.visible = eus; for (const l of p.lights) l.group.visible = !eus; p.chan.group.visible = !eus; p.port.group.visible = eus && this.aim > 0.002; if (eus && this.aim > 0.002) p.port.setAlpha(0.9 * this.aim);
      this.fanMesh.visible = eus && this.fan > 0.002; this.fanMat.opacity = this.fan;
    }
    // the light at the tip fades in once the scope is on the figure and goes with it
    const glow0 = this.glow;
    this.glow = vis ? Math.min(1, this.glow + Math.max(0, dtMs) / GLOW_MS) : 0;
    if (this.glow !== glow0) moving = true;
    this.glowMesh.visible = vis && this.glow > 0.002;
    if (this.glowMesh.visible) {
      const pos = this.glowGeo.getAttribute('position') as BufferAttribute, t = this.pose.tip, r = len3(GLOW_R), z = t.z + 0.01;
      pos.setXYZ(0, t.x, t.y, z);
      for (let i = 0; i < GLOW_SEGS; i++) { const a = (i / GLOW_SEGS) * Math.PI * 2; pos.setXYZ(i + 1, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, z); }
      pos.needsUpdate = true; this.glowGeo.computeBoundingSphere();
      this.glowMat.opacity = ease01(this.glow) * this.gloneK();
    }
    this.layRings(now, vis);
    if (vis && this.mode === 'eus' && (this.read > 0 || this.flash > 0)) moving = true;   // (the ripples run on their own clock while a reading is taken)
    return moving;
  }
  /** The glue slide's scope once its procedure is taken off: parked where it stood, it fades out in place (2D parkMs, 600 ms), never travelling back up the esophagus. True while it fades. */
  leave(dtMs: number): boolean {
    if (this.d < 0.5 && this.gone === 0) return false;
    this.gone = Math.min(1, this.gone + Math.max(0, dtMs) / 600);
    const k = 1 - ease01(this.gone);
    for (const o of this.parts) o.setFade(k);
    this.fanMat.opacity = this.fan * k;
    if (this.gone < 1) return true;
    this.restore(); this.d = 0; this.aim = 0; this.fan = 0; this.needle = 0; this.mode = 'scope'; this.way = this.eusWay;
    this.group.visible = false; this.dirty = true;
    return false;
  }
  /** The light follows the scope's own fade when the glue scope is parked and leaving. */
  private gloneK(): number { return this.gone > 0 ? 1 - ease01(this.gone) : 1; }
  private restore(): void { this.gone = 0; for (const o of this.parts) o.setFade(1); this.fanMat.opacity = this.fan; }
  private bendShown(): boolean { return this.bendOn; }

  applyPalette(p: Palette): void {
    for (const o of this.parts) o.applyPalette(p);
    const c = new Color(DEVICE_TOKENS[lookOf(p)].dopGlow);   // (the sector is drawn in the Doppler's glow, --dop-glow: eus-scope.js MAT.fan)
    const col = this.fanGeo.getAttribute('color') as BufferAttribute;
    for (let i = 0; i < FAN_VERTS; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
    // the bending section's fine grooves, a shade down from its tube
    const t = DEVICE_TOKENS[lookOf(p)];
    this.parts_.bend.setStripes(1 / (BEND_GROOVES + 1), 1, 0.014, 0, SCOPE_GROOVE(t), 1);
  }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.fanGeo.dispose(); this.fanMat.dispose(); this.glowGeo.dispose(); this.glowMat.dispose(); }
}
void EUS_BEND_MIN;
