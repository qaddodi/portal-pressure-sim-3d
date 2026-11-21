// One catheter on its route: the HVPG's, the TIPS kit's (sheath, needle, wire, dilation balloon, coil), BRTO's and BATO's occlusion balloon and the sclerosant, the PPG catheters. It draws what
// `procFrame(kind, t)` of the 2D app says at time t (proc-anim.js): how far in the tip is (u), the balloon (0 to 1), the needle and wire tips, the portal hit's rings, the coil and the column
// (wedged blood or sclerosant) — each laid on the route as stage-cath.js cathGL lays them, in the same proportions (the shaft's radius rc, the taper, the marker bands, the balloon fitted to the
// vein by hvpg-balloon.js, the needle's bevel, the wire's hairline). Parts are device objects: drawn over the anatomy, never under a vessel they sit in.
import { Color, Group, CylinderGeometry, RingGeometry, type BufferGeometry, Vector3, Float32BufferAttribute } from 'three';
import { rawColor, type CelShared } from '../../materials/cel.ts';
import { PALETTES, type LookId, type Palette } from '../../palette.ts';
import { DEVICE_TOKENS } from '../../procedures/copied/device-tokens.copied.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../../frame2d.ts';
import { NETWORK, NETWORK_BY_ID } from '../../vessels/network.ts';
import { type Centreline, centrelineOf } from '../../vessels/centreline.ts';
import { smoothJoinsOn } from '../../vessels/join-mode.ts';
import { DeviceObject, TAIL_UNITS, type DeviceTone } from '../device-object.ts';
import { DEVICE_SIDES, WIRE_SIDES, allocTube, makeRings, showRings, writeRings } from '../tube-rings.ts';
import { BALLOON_EDGE, CATH_EDGE, type EdgeRule } from '../edges.ts';
import { type Route3D, drawnShare } from '../../procedures/route3d.ts';
import { GEO2D, routeAt } from '../../procedures/route.ts';
import { balloonOutline, balloonRy } from '../../procedures/copied/hvpg-balloon.js';

const U = UNITS_PER_SCENE;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const withTang = (g: BufferGeometry): BufferGeometry => { if (!g.getAttribute('tang')) g.setAttribute('tang', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3)); return g; };

/** What a procedure shows at one moment: the fields of the 2D `procFrame` record the catheter draws, and the colour name of the tip's reading ring. */
/** The reading ripples' colour, by name: the HVPG's free and wedged pressures, a bad (aborted) read, the portal vein's and the IVC's. */
export type RingName = 'free' | 'wedge' | 'bad' | 'pv' | 'ivc';
export interface CatheterState {
  /** how far in the tip is, 0 to 1 of its way from the route's start to where it stops */
  u: number;
  balloon: number; column: number; opacity: number;
  /** the TIPS needle's and wire's tips, as u (0: not out), the portal hit's rings (0 none to 1), the coil pushed out (0 to 1) */
  needle: number; wire: number; flash: number; coil: number;
  /** the tip's reading: the ripples running out of it, by name ('free', 'wedge', 'bad'), or null */
  ring: RingName | null;
  /** the tone of the column: the wedged blood's amber, or the sclerosant's */
  columnTone?: DeviceTone;
  /** the model's own milliseconds, for the ripples */
  clock: number;
}
export const CATHETER_IDLE: CatheterState = { u: 0, balloon: 0, column: 0, opacity: 0, needle: 0, wire: 0, flash: 0, coil: 0, ring: null, clock: 0 };

const RING_TONE = { free: 'monFree', wedge: 'monWedge', bad: 'monAlarm', pv: 'trPv', ivc: 'trIvc' } as const;
const SHAFT_RADIAL = DEVICE_SIDES, BALLOON_N = 40, BALLOON_RADIAL = DEVICE_SIDES, GLINT_N = 24, GLINT_SIDES = 8;

/** The shaft's end is part of the shaft: its last TIP_RINGS rings taper over TIP_LEN_R radii to a tip TIP_END_K of the shaft's radius wide and close in a hemisphere, so there is no seam, no second part and no lump at a bend
 *  (owner, 20 Nov 2026: "a blunt, lumpy tip"; before it was a lathe part set on the end of the shaft, straight, so on a bend it stood off the tube's own direction). */
export const TIP_RINGS = 18, TIP_LEN_R = 4.5, TIP_END_K = 0.42;
/** The shaft's radius `s` behind the tip's end (the same unit as `rc`): `rc` beyond the taper, a smoothstep down to the tip's radius, then a hemisphere to a point. Continuous in value and slope. */
export function tipRadius(s: number, rc: number): number {
  const L = rc * TIP_LEN_R, rt = rc * TIP_END_K;
  if (s >= L) return rc;
  if (s <= rt) return Math.sqrt(Math.max(0, rt * rt - (rt - Math.max(0, s)) ** 2));
  const t = (L - s) / (L - rt), e = t * t * (3 - 2 * t);
  return rc + (rt - rc) * e;
}
/** The depth marks along the shaft (a real catheter's centimetre rings, fine like the scope's): a thin ring every MARK_UNITS figure units back from the tip, a heavier one every fifth, none within MARK_CLEAR of the tip (the balloon's). */
/** The most of the live lumen's radius the shaft takes: a catheter is thin in its vein, and in a narrowed one (cirrhosis) it is drawn thinner with it rather than filling it (owner, 20 Nov 2026: "thick, chunky"). */
export const SHAFT_MAX_SHARE = 0.2;
export const MARK_UNITS = 22, MARK_HALF = 0.26, MARK_CLEAR = 36, MARK_HEX = '#7E889A';


/** The balloon's rings (centre, direction, radius) fitted in the vein, as the 2D app fits it (stage-cath.js cathGL): along a TIPS tract its whole length, else just behind the tip. It sits ON the vessel's own
 *  centreline once wedged (on the shaft while it is small) and its radius is held under the lumen's with a margin, so the glass and its outline stay inside the drawn wall at any zoom (Mohammad, 20 Nov:
 *  "the balloon has to be maintained within the bounds of the vessel"). Before, its centre was 2D's own and only the depth was the 3D vessel's: a vessel drawn a unit off 2D's course put one wall outside. */
export const BALLOON_FIT = 0.92;
/** (a balloon fills a narrowed vein whole; in a dilated one it is held to the width it was built for) */
const SWELL_FILL = 1.6;
export function balloonFit(r3: Route3D, rc: number, bl: number, tipD: number, span: string | null, rings: ReturnType<typeof makeRings>): { dC: number; rx: number; ol: { s: number }[] } {
  const r = r3.route, rc2 = rc * U, proc = r.kind !== 'hvpg';
  // (the vein as drawn now: its radius at the engine's live width, `swellAt`)
  const at = (d: number) => { const o = routeAt(r, d, { p: [0, 0], t: [1, 0], w: [0, 0], r: 0 }); o.r *= r3.swellAt(d); return o; };
  const Rf = at(r.free).r, gap = rc2 * 4.2, Rb = at(tipD - gap - Rf * 1.6).r, sp = span ? r.spans[span] : null;
  const rx = sp ? (sp[1] - sp[0]) * 0.45 : proc ? lerp(rc2 * 3.4, Rb * 2.6, bl) : lerp(rc2 * 3.4, Rb * 1.6, bl);
  const dC = sp ? (sp[0] + sp[1]) / 2 : tipD - gap - rx;
  const ry0 = balloonRy(at, dC, rx, proc ? Math.max(rc2 * 1.35, Rb) : rc2 * 1.35, { floor: rc2 * 1.05 });
  const ol = balloonOutline(at, dC, rx, ry0, bl, { floor: rc2 * 1.05 }) as { c: [number, number]; t: [number, number]; h: number; s: number }[];
  const a = new Vector3(), b = new Vector3(), hFull = Math.max(...ol.map((o) => o.h)) / U;
  ol.forEach((o, i) => {
    const q = rings[i]!, d = dC + rx * o.s;
    r3.point(d, a); r3.centre(d, b);
    q.c.copy(a).lerp(b, bl); q.t.set(o.t[0], -o.t[1], 0);
    // (the radius the 2D route knows may be wider than the vein the 3D scene draws: the drawn vessel's own radius, less how far the ring's centre is off its centreline, is the last word)
    // (the DRAWN radius of the vein there, its end tapers included, not the nominal one)
    let room = Infinity;
    for (const id of r.ids) { const c = drawnShare(id, q.c.x, q.c.y, q.c.z); if (c && c.share < 1) room = Math.min(room, Math.max(c.radius * Math.min(r3.swellAt(d), SWELL_FILL) - c.dist, 0)); }
    // (a barrel, as a Fogarty's glass: the profile is a round superellipse of the fullest ring, not 2D's flat-shouldered one, held under what the vein has room for at each ring)
    const shoulder = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(o.s), 2.6)), 1 / 2.6);
    q.r = Math.max(Math.min(hFull * Math.max(shoulder, 0.0001), (at(d).r / U) * BALLOON_FIT, room === Infinity ? Infinity : room * 0.96), 0.0004);
  });
  return { dC, rx, ol };
}

/** One vessel's share of the wedge tint (vessel-object.ts setWedge): `cut` where it stops on the balloon's side and `edge` how softly (both u, 1 at the piece's start on the route to 0 at its outer end), `front` how far toward the outer end the tint has come and `frontEdge` how softly. */
export interface WedgePiece { cut: number; fade: number; edge: number; front: number; frontEdge: number }
const smoother = (k: number): number => { const x = clamp01(k); return x * x * x * (x * (x * 6 - 15) + 10); };

export class ProcCatheter {
  readonly group = new Group();
  readonly objects: DeviceObject[] = [];
  private readonly rc: number;
  private readonly n: number;
  private readonly shaft: DeviceObject; private readonly band: DeviceObject;
  private readonly needle: DeviceObject; private readonly needleCone: DeviceObject; private readonly wire: DeviceObject;
  private readonly column: DeviceObject; private readonly columnGeo: BufferGeometry;
  private readonly shaftGeo: BufferGeometry; private readonly shaftRings: ReturnType<typeof makeRings>; private readonly shaftU: Float32Array; private shaftAt = -1;
  private readonly balloon: DeviceObject; private readonly balloonGeo: BufferGeometry; private readonly balloonBands: DeviceObject[]; private readonly glints: { g: BufferGeometry; o: DeviceObject }[];
  private readonly rings: DeviceObject[] = []; private readonly flashes: DeviceObject[] = [];
  private readonly coil: DeviceObject | null; private readonly coilGeo: BufferGeometry | null; private readonly coilN = 120;
  private last: CatheterState = { ...CATHETER_IDLE };
  private liveSeen = 0;
  private readonly v = new Vector3();
  private readonly w = new Vector3();

  readonly r3: Route3D;
  readonly span: string | null;

  constructor(r3: Route3D, shared: CelShared, span: string | null = null) {
    this.r3 = r3; this.span = span;
    const r = r3.route, rc = (this.rc = r3.rc);
    const nS = (this.n = Math.max(24, Math.ceil(r.total / 2.4)));
    const mk = (g: BufferGeometry, tone: DeviceTone, order: number, edge: EdgeRule = 'ink', px = 0.9, more: { bands?: 2 | 3; tubeTones?: boolean; fat?: number } = {}): DeviceObject => {
      const o = new DeviceObject(g, tone, shared, { px, order, ...more }, edge);
      this.group.add(o.group); this.objects.push(o); return o;
    };
    // the shaft (a polymer tube with its dark hairline), revealed along its length up to the tip
    const rings = makeRings(nS);
    const fill = (rs: typeof rings, radius: (i: number, d: number) => number): void => { rs.forEach((q, i) => { const d = (r.total * i) / (nS - 1); r3.point(d, q.c); r3.dir(d, q.t); q.r = radius(i, d); }); };
    fill(rings, () => rc);
    const sg = allocTube(nS, SHAFT_RADIAL); writeRings(sg, rings, SHAFT_RADIAL);
    this.shaftGeo = sg; this.shaftRings = rings; this.shaftU = new Float32Array(nS);
    // the column of wedged blood or sclerosant lies under everything, as wide as the vein it fills
    const cr = makeRings(nS); fill(cr, (_i, d) => r3.lumen(d) * 0.94);
    this.columnGeo = allocTube(nS, DEVICE_SIDES); writeRings(this.columnGeo, cr, DEVICE_SIDES);
    this.column = mk(this.columnGeo, 'trWedge', 0, 'ink', 0.5);
    // the needle and the wire: the shaft's own course, finer, shown from the catheter's tip on to where they are
    const nw0 = Math.max(rc * 0.42, 0.0015);
    const needleRings = makeRings(nS); fill(needleRings, () => nw0);
    const ng = allocTube(nS, WIRE_SIDES + 4); writeRings(ng, needleRings, WIRE_SIDES + 4);
    this.needle = mk(ng, 'steel', 2, 'ink', 0.7);
    this.needleCone = mk(withTang(new CylinderGeometry(0.01, nw0, rc * 1.4, 8, 1, false).rotateX(Math.PI / 2)), 'steel', 2, 'ink', 0.5);
    const wireRings = makeRings(nS); fill(wireRings, () => Math.max(rc * 0.16, 0.0009));
    const wg = allocTube(nS, WIRE_SIDES); writeRings(wg, wireRings, WIRE_SIDES);
    this.wire = mk(wg, 'steel', 1, 'ink', 0.5);
    // (lit by the world with a highlight, three bands: a round polymer line, not the vessels' flat screen tones, which read as a ribbon)
    this.shaft = mk(sg, 'poly', 4, CATH_EDGE, 0.7, { bands: 3, tubeTones: false, fat: 0.7 });
    // the lead-in above the figure fades out as a gradient (the catheter's free end), shaft, needle and wire alike
    for (const o of [this.shaft, this.needle, this.wire]) o.setTailFade(Math.min(0.5, TAIL_UNITS / r.total));
    // (no marker ring behind the tip: the only rings are the two collars at the balloon's ends)
    this.band = mk(withTang(new CylinderGeometry(rc, rc, rc * 0.1, 6, 1, true).rotateZ(Math.PI / 2)), 'platinum', 6, 'ink', 0);
    // the balloon: refitted to the vein as it swells (hvpg-balloon.js), latex (or clear nylon along a TIPS tract)
    // A balloon is clear and glassy (a Fogarty's: a colourless barrel, the shaft seen straight through it): a faint pale body, a thin crisp outline, two curved white highlights on its near side.
    this.balloonGeo = allocTube(BALLOON_N + 1, BALLOON_RADIAL);
    this.balloon = mk(this.balloonGeo, 'nylon', 7, BALLOON_EDGE, 0.7);
    this.balloon.setGlass(1.4, 0.4);
    this.glints = [0, 1].map(() => { const g = allocTube(GLINT_N, GLINT_SIDES); return { g, o: mk(g, 'graft', 9, 'none', 0, { fat: 0.4 }) }; });   // (a specular streak of light: no ink round it, or it read as a dark bar inside the glass)
    // the two small dark collars where the balloon is bonded to the shaft
    // (no collars or marker bands inside the glass: the solid dark bars Mohammad saw through the balloon, 21 Nov; the balloon is glass, the shaft seen through it, and its streaks of light)
    this.balloonBands = [];
    for (let i = 0; i < 2; i++) {
      this.flashes.push(mk(withTang(new RingGeometry(0.8, 1, 72)), 'trPv', 9, 'ink', 0));
      this.rings.push(mk(withTang(new RingGeometry(0.8, 1, 72)), 'monFree', 9, 'ink', 0));
    }
    // the coil of a TIPS that coils the coronary vein, curling on up the vein past the tip
    if (r.coilAt) {
      this.coilGeo = allocTube(this.coilN, WIRE_SIDES);
      this.coil = mk(this.coilGeo, 'platinum', 3, 'ink', 0.7);
    } else { this.coil = null; this.coilGeo = null; }
    this.set({ ...CATHETER_IDLE });
  }

  applyPalette(p: Palette): void {
    for (const o of this.objects) o.applyPalette(p);
    const look = (Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light';
    this.latexA = Number(DEVICE_TOKENS[look].latexA) || 0.4;
    this.wedgeColor.copy(rawColor(DEVICE_TOKENS[look].trWedge));
  }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** Where the tip is for a share u of its way (scene units), for tags and the camera. */
  tipAt(u = this.last.u, out = new Vector3()): Vector3 { return this.r3.point(this.r3.tipD(u), out); }
  /** The point just ahead of the tip, where a wedged reading hangs. On the HVPG's route that is 2D's own place (stage-cath.js: the route's point 6.4 of the free vein's radii on, which runs on past the end of the tip's way); on the others, `share` of the way on. */
  aheadAt(u: number, out = new Vector3(), share = 0.04): Vector3 {
    const { r3 } = this, r = r3.route;
    // (inside the amber column, which runs from the tip to the end of the vein it is in: 2D's place, held to 0.6 of that stretch so the reading hangs IN the column, never past it)
    if (r.kind === 'hvpg') { const d = r3.tipD(u), end = r.parts.find((q) => q.id && d <= q.d1 + 1e-6 && d >= q.d0 - 1e-6)?.d1 ?? r.total; return r3.point(d + Math.min(r3.lumen(r.free) * U * 6.4, (end - d) * 0.6), out); }
    return r.kind === 'hvpg' ? r3.point(Math.min(r.total, r3.tipD(u) + r3.lumen(r.free) * U * 6.4), out) : r3.point(r3.tipD(Math.min(1, u + share)), out);
  }
  get current(): Readonly<CatheterState> { return this.last; }
  /** The engine's diameters changed (the veins are drawn at their live width): the catheter follows its veins, shaft and balloon alike. True when it moved. */
  setLive(D: ArrayLike<number> | null | undefined): boolean {
    this.r3.setLive(D);
    if (this.liveSeen === this.r3.liveVersion()) return false;
    this.liveSeen = this.r3.liveVersion();
    this.shaftAt = -1;
    if (this.group.visible) this.set(this.last);
    return true;
  }

  /** The wedge's amber column on the HVPG route, as a tint on the vessels themselves: everything upstream of the balloon in the vein the tip is in, and the branches that leave it, fading out toward their tips.
   *  `pieces`: for each vessel id, how far up its own course the tint reaches (a share of the course from its outer end; 2 is all of it) and over how much of it it thins toward the tip. Null when there is none. */
  wedgeTint(): { amount: number; color: Color; pieces: Map<string, WedgePiece> } | null {
    const { r3 } = this, r = r3.route, s = this.last, col = clamp01(s.column);
    if (r.kind !== 'hvpg' || col <= 0.001 || !this.group.visible) return null;
    // The tint starts AT the balloon's distal edge (the glass ends 4.2 shaft radii behind the tip: fitBalloon's `gap`) and its front travels forward from there, into the vein and then its branches, as the column
    // fills (Mohammad, 20 Nov: "the yellow/orange highlighting should start basically from the balloon edge and move forward into the hepatic vein and branches to cover it"). The front is one distance along the route,
    // so it crosses the vein's pieces and runs on into the branch in order; at a full column it covers all of it. The tint is whole at the edge (it was 0 there and rose over 8% of the vein's course, so an
    // untinted stretch of about ten shaft radii stood between the balloon and the amber).
    const edgeD = r3.tipD(s.u) - this.rc * U * 4.2, soft = this.rc * U * 5;
    const front = edgeD + smoother(col) * Math.max(1e-6, r.total - edgeD) * 1.02;
    const pieces = new Map<string, WedgePiece>();
    // (u runs 1 at a piece's start on the route to 0 at its outer end: a piece is tinted from the front's u to the cut's u)
    // WHERE a distance along the route is on the vein AS DRAWN: the shader's u is the share of the DRAWN tube's own length, and the vein's drawn course is not the 2D course the route was laid on (eased in depth, cut where the
    // branches leave it, joined to its neighbours), so the route's share of the piece (fa to fb, linear in distance) put the tint's edge up to a tenth of the vein away from the balloon (a band of plain vein between them; Mohammad,
    // 21 Nov). The route's own point there lies ON the drawn centreline: its place on that centreline is the u.
    const uAt = (sub: { id: string | null; d0: number; d1: number; fa: number; fb: number }, d: number): number => {
      if (d <= sub.d0) return sub.fa;
      if (d >= sub.d1) return sub.fb;
      const c = sub.id ? this.courseOf(sub.id) : null;
      if (!c) return sub.fa + (sub.fb - sub.fa) * clamp01((d - sub.d0) / Math.max(1e-6, sub.d1 - sub.d0));
      const p = r3.centre(d, this.v);
      return c.nearestU([p.x, p.y, p.z]);
    };
    const edgeU = (sub: { id: string | null; d0: number; d1: number; fa: number; fb: number }) => { const c = sub.id ? this.courseOf(sub.id) : null; return c ? soft / U / Math.max(1e-6, c.length) : soft * Math.abs(sub.fb - sub.fa) / Math.max(1e-6, sub.d1 - sub.d0); };
    const hv = r.parts.find((q) => q.name === 'hv');
    for (const sub of hv?.subs?.length ? hv.subs : hv ? [hv] : []) {
      if (!sub.id || edgeD >= sub.d1 - 1e-6) continue;   // (downstream of the balloon: not tinted)
      if (front <= sub.d0) continue;   // (the front has not reached it yet)
      const cut = edgeD <= sub.d0 ? 2 : uAt(sub, edgeD), e = edgeU(sub);
      pieces.set(sub.id, { cut, fade: 0, edge: e, front: uAt(sub, front), frontEdge: e * 3 });
      const into = (front - sub.d1) / Math.max(1e-6, (r.total - sub.d1) * 0.5);
      if (into > 0) for (const v of NETWORK) if (v.id.startsWith(`${sub.id}~F`)) pieces.set(v.id, { cut: 2, fade: 0.6, edge: 0.02, front: 1 - clamp01(into), frontEdge: 0.08 });
    }
    const br = r.parts.find((q) => q.name === 'branch');
    if (br?.id && NETWORK_BY_ID.has(br.id) && front > br.d0) pieces.set(br.id, { cut: 2, fade: 0.6, edge: 0.02, front: 1 - clamp01((front - br.d0) / Math.max(1e-6, br.d1 - br.d0)), frontEdge: 0.08 });
    return { amount: clamp01(col * 6) * clamp01(s.opacity), color: this.wedgeColor, pieces };
  }
  private readonly wedgeColor = new Color();
  private readonly courses = new Map<string, Centreline | null>();
  /** The drawn centreline of vessel `id` (kept: the wedge tint asks every frame while the column is up). */
  private courseOf(id: string): Centreline | null {
    const key = `${id}|${smoothJoinsOn()}`;
    if (!this.courses.has(key)) this.courses.set(key, centrelineOf(id));
    return this.courses.get(key)!;
  }

  set(s: CatheterState): void {
    this.last = s;
    const { r3, rc } = this, r = r3.route, op = clamp01(s.opacity), showing = s.u > 0.001 && op > 0.002;
    const tipD = r3.tipD(s.u);
    for (const o of this.objects) o.group.visible = false;
    if (!showing) { this.group.visible = false; return; }
    this.group.visible = true;
    this.shaft.group.visible = true; this.shaft.setAlpha(op);
    this.layShaft(tipD);

    // the wire (a fine dark line on into the portal trunk) and the needle (steel, narrowing to a bevelled point), only ahead of the catheter's tip
    const toD = (u: number): number => r3.tipD(u);
    const wD = s.wire > 0 ? toD(s.wire) : 0, nD = s.needle > 0 ? toD(s.needle) : 0;
    const wShow = wD > tipD + rc * U * 0.6;
    this.wire.group.visible = wShow; if (wShow) { this.wire.setAlpha(op); this.wire.setReveal(Math.min(1, wD / r.total)); }
    const nShow = nD > tipD + rc * U * 0.6;
    this.needle.group.visible = this.needleCone.group.visible = nShow;
    if (nShow) {
      this.needle.setAlpha(op); this.needleCone.setAlpha(op);
      const bev = rc * U * 1.4;
      this.needle.setReveal(Math.min(1, Math.max(0, (nD - bev * 0.5) / r.total)));
      r3.point(nD - bev * 0.5, this.v); this.needleCone.group.position.copy(this.v); this.orient(this.needleCone, nD - bev * 0.5);
      if (s.flash > 0) this.flash(s.flash, nD, op);
    }

    // the column of wedged blood or sclerosant from the tip on (a hepatic vein beyond the wedged balloon, or the shunt the sclerosant fills)
    const col = clamp01(s.column);
    // (the HVPG's column is a tint on the vessels themselves, upstream of the balloon: wedgeTint, laid by the scene; the other procedures' columns are still this tube)
    this.column.group.visible = col > 0.001 && r.kind !== 'hvpg';
    if (col > 0.001 && r.kind !== 'hvpg') {
      this.column.setTone(s.columnTone ?? 'trWedge'); this.column.setAlpha(0.55 * op);
      const part = r.parts.find((q) => q.id && tipD <= q.d1 + 1e-6 && tipD >= q.d0 - 1e-6), end = part ? part.d1 : r.total, reach = tipD + (end - tipD) * col, i0 = Math.max(0, Math.floor((tipD / r.total) * (this.n - 1))), i1 = Math.min(this.n - 1, Math.ceil((reach / r.total) * (this.n - 1)));
      showRings(this.columnGeo, i0, i1, DEVICE_SIDES);
    }

    // the balloon
    const bl = clamp01(s.balloon);
    this.balloon.group.visible = bl > 0.001;
    for (const b of this.balloonBands) b.group.visible = bl > 0.001;
    for (const q of this.glints) q.o.group.visible = bl > 0.001;
    if (bl > 0.001) this.fitBalloon(bl, tipD, op);

    // the tip's reading ripples, and the coil
    if (s.ring) this.ripple(s.ring, tipD, s.clock, op);
    if (this.coil && s.coil > 0.001) this.layCoil(s.coil, op);
  }

  /** The shaft from the route's start to the tip, tip included: the body's rings are spread evenly over the way, the last TIP_RINGS (closer together toward the end) are the taper and its rounded point (tipRadius).
   *  uv.x stays the share of the whole route, so the lead-in's fade and the depth marks (counted back from the tip) are as before. Rewritten only when the tip has moved. */
  private layShaft(tipD: number): void {
    if (Math.abs(tipD - this.shaftAt) < 1e-6) return;
    this.shaftAt = tipD;
    const { r3, rc } = this, total = r3.route.total, rings = this.shaftRings, us = this.shaftU, n = rings.length, nb = n - TIP_RINGS;
    const rcTip = Math.min(rc, SHAFT_MAX_SHARE * r3.lumen(tipD)), dTip = Math.max(0, tipD - rcTip * U * TIP_LEN_R);
    for (let i = 0; i < n; i++) {
      const q = rings[i]!;
      const d = i < nb ? (dTip * i) / Math.max(1, nb - 1) : dTip + (tipD - dTip) * Math.sin(((i - nb + 1) / TIP_RINGS) * Math.PI / 2);
      r3.point(d, q.c); r3.dir(d, q.t);
      q.r = Math.max(Math.min(tipRadius((tipD - d) / U, rcTip), SHAFT_MAX_SHARE * r3.lumen(d), rc), 1e-5);
      us[i] = d / total;
    }
    writeRings(this.shaftGeo, rings, SHAFT_RADIAL, 0, 1, us);
    // the depth marks, counted back from the tip so they travel with the tube (as the scope's do)
    this.shaft.setStripes(MARK_UNITS / total, tipD / total, MARK_HALF / total, MARK_CLEAR / total, MARK_HEX, 1.7);
  }

  private orient(o: DeviceObject, d: number): void {
    this.r3.dir(d, this.w);
    o.group.quaternion.setFromUnitVectors(X, this.w);
  }

  /** The balloon, fitted inside the vein as the 2D app fits it (stage-cath.js cathGL): along a TIPS tract its whole length, else just behind the tip; wedged it lies on the vein's own centreline and fills the lumen. */
  private fitBalloon(bl: number, tipD: number, op: number): void {
    const { rc } = this, r3 = this.r3;
    // it swells on a smootherstep of the model's own 0..1, so it starts and ends gently and never jumps (owner, 20 Nov 2026: "easing as it inflates")
    const sw = bl * bl * bl * (bl * (bl * 6 - 15) + 10);
    const ol = balloonFit(r3, rc, Math.max(sw, 1e-4), tipD, this.span, (this.ballRings ||= makeRings(BALLOON_N + 1)));
    const rings = this.ballRings!;
    writeRings(this.balloonGeo, rings, BALLOON_RADIAL);
    // a solid-looking latex balloon: a body that reads against the vein (0.42, it was a barely-there 0.12 and the balloon vanished into the vessel; Mohammad, 20 Nov: "make the HVPG balloon less transparent") with a firm outline that eases in with the swelling
    const e = bl * bl * (3 - 2 * bl);
    this.balloon.setAlphas(0.42 * Math.min(1, e * 2.2) * op, (0.45 + 0.5 * e) * op * Math.min(1, bl * 4));
    this.lay(ol.ol, rings, e, op);
  }
  private readonly gr = [makeRings(GLINT_N), makeRings(GLINT_N)];
  private readonly n1 = new Vector3(); private readonly n2 = new Vector3(); private readonly tt = new Vector3();
  /** Two white curved highlights on the glass's near side (the figure's front is +z): arcs a hair inside the balloon's surface, one long above the shaft and one short below it, as a Fogarty's light curves round its barrel. */
  private lay(ol: { s: number }[], rings: ReturnType<typeof makeRings>, e: number, op: number): void {
    const arcs = [{ phi: 0.62, s0: -0.62, s1: 0.5, a: 0.95 }, { phi: -0.5, s0: 0.12, s1: 0.62, a: 0.6 }];
    arcs.forEach((arc, k) => {
      const out = this.gr[k]!;
      for (let i = 0; i < GLINT_N; i++) {
        const s = arc.s0 + ((arc.s1 - arc.s0) * i) / (GLINT_N - 1);
        let j = 0; while (j < ol.length - 1 && ol[j]!.s < s) j++;
        const q = rings[j]!, tt = this.tt.copy(q.t).normalize();
        this.n1.crossVectors(tt, Z); if (this.n1.lengthSq() < 1e-6) this.n1.crossVectors(tt, X);
        this.n1.normalize(); this.n2.crossVectors(tt, this.n1).normalize();
        // up on the screen is -n1, toward the viewer is -n2
        const c = Math.cos(arc.phi), sn = Math.sin(arc.phi), r = out[i]!;
        r.c.copy(q.c).addScaledVector(this.n2, -c * q.r * 0.9).addScaledVector(this.n1, -sn * q.r * 0.9);
        r.t.copy(tt); r.r = Math.max(this.rc * 0.13 * Math.pow(Math.sin(Math.PI * (i / (GLINT_N - 1))), 0.8) + this.rc * 0.01, 0.0003);
      }
      writeRings(this.glints[k]!.g, out, GLINT_SIDES);
      this.glints[k]!.o.setAlpha(arc.a * e * op);
    });
  }
  private latexA = 0.4;
  private ballRings: ReturnType<typeof makeRings> | null = null;

  /** The portal hit: two rings in the portal vein's colour, running out from the needle's point and fading as they go. */
  private flash(f: number, nD: number, op: number): void {
    this.r3.point(nD, this.v);
    this.flashes.forEach((o, i) => {
      const k = i ? (f + 0.5) % 1 : f, s = (this.rc * (1.2 + 5 * k)), a = (1 - k) * (1 - k) * 0.85;
      o.group.visible = true; o.setAlpha(a * op); o.group.position.copy(this.v); o.group.scale.setScalar(s);
    });
  }
  /** The tip's reading, two ripples running out of it in the reading's colour. */
  private ripple(ring: RingName, tipD: number, clock: number, op: number): void {
    const ph = (clock / 1300) % 1;
    this.r3.point(tipD, this.v);
    this.rings.forEach((o, i) => {
      const k = i ? (ph + 0.5) % 1 : ph, s = this.rc * (1.6 + 4.2 * k), a = (1 - k) * (1 - k) * 0.9;
      o.setTone(RING_TONE[ring]); o.group.visible = true; o.setAlpha(a * op); o.group.position.copy(this.v); o.group.scale.setScalar(s);
    });
  }

  /** The coil: pushed out of the tip, it curls on up the vein inside its walls and stays there (a helix on the vein's own centreline past the tip, eus-scope.js layCoil). */
  private layCoil(k: number, op: number): void {
    const c = this.r3.route.coilAt!, geo = this.coilGeo!, N = this.coilN;
    const lumen = this.r3.lumen(this.r3.tipD(1)), rs = (this.coilRings ||= makeRings(N));
    const side = new Vector3(), tan = new Vector3(), pos = new Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      veinPoint(c.id, c.f, c.dir, COIL_REACH * u, pos, tan);
      side.set(-tan.y, tan.x, 0).normalize();
      const ang = u * Math.PI * 2 * 6, rr = lumen * 0.55;
      rs[i]!.c.copy(pos).addScaledVector(side, Math.cos(ang) * rr).addScaledVector(Z, Math.sin(ang) * rr * 0.4);
      rs[i]!.t.copy(tan); rs[i]!.r = Math.max(this.rc * 0.3, 0.0012);
    }
    writeRings(geo, rs, WIRE_SIDES);
    showRings(geo, 0, Math.round(k * (N - 1)), WIRE_SIDES);
    this.coil!.group.visible = true; this.coil!.setAlpha(op);
  }
  private coilRings: ReturnType<typeof makeRings> | null = null;
}

/** How far the coil runs on up the vein, in figure units (eus-scope.js COIL_PATH_HALF). */
const COIL_REACH = 16;
const Z = new Vector3(0, 0, 1);
/** A point and direction `len` figure units from share f along vein `id`, going with its drawn course (dir +1) or against it (-1), in the scene. */
export function veinPoint(id: string, f: number, dir: number, len: number, pos: Vector3, tan: Vector3): void {
  const P = GEO2D[id]!.cur, cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1]! + Math.hypot(P[i]![0] - P[i - 1]![0], P[i]![1] - P[i - 1]![1]));
  const L = cum[cum.length - 1]!, s = Math.min(L, Math.max(0, f * L + dir * len));
  let i = 1; while (i < P.length - 1 && cum[i]! < s) i++;
  const a = P[i - 1]!, b = P[i]!, u = cum[i]! > cum[i - 1]! ? (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!) : 0;
  const v = NETWORK_BY_ID.get(id), z = v ? TIER_Z[v.tier] : TIER_Z.net;
  pos.set(x3(lerp(a[0], b[0], u)), y3(lerp(a[1], b[1], u)), z);
  tan.set(dir * (b[0] - a[0]), -dir * (b[1] - a[1]), 0).normalize();
}
const X = new Vector3(1, 0, 0);
