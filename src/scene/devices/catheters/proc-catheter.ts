// One catheter on its route: the HVPG's, the TIPS kit's (sheath, needle, wire, dilation balloon, coil), BRTO's and BATO's occlusion balloon and the sclerosant, the PPG catheters. It draws what
// `procFrame(kind, t)` of the 2D app says at time t (proc-anim.js): how far in the tip is (u), the balloon (0 to 1), the needle and wire tips, the portal hit's rings, the coil and the column
// (wedged blood or sclerosant) — each laid on the route as stage-cath.js cathGL lays them, in the same proportions (the shaft's radius rc, the taper, the marker bands, the balloon fitted to the
// vein by hvpg-balloon.js, the needle's bevel, the wire's hairline). Parts are device objects: drawn over the anatomy, never under a vessel they sit in.
import { Group, SphereGeometry, CylinderGeometry, RingGeometry, type BufferGeometry, Vector3, Float32BufferAttribute } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../../frame2d.ts';
import { NETWORK_BY_ID } from '../../vessels/network.ts';
import { DeviceObject, type DeviceTone } from '../device-object.ts';
import { allocTube, makeRings, showRings, writeRings } from '../tube-rings.ts';
import { type Route3D } from '../../procedures/route3d.ts';
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
const SHAFT_RADIAL = 10, BALLOON_N = 40, BALLOON_RADIAL = 16;
/** The thinnest the shaft is drawn (scene units: about 3 CSS px across at the phone's framing of the cava, Mohammad 20 Nov: "can't see the catheter"), and the share of the vein it never passes. */
export const SHAFT_MIN_R = 0.0065, SHAFT_MAX_OF_LUMEN = 0.5;
export const shaftRadius = (rc: number, lumen: number): number => Math.min(Math.max(rc, SHAFT_MIN_R), SHAFT_MAX_OF_LUMEN * lumen);

export class ProcCatheter {
  readonly group = new Group();
  readonly objects: DeviceObject[] = [];
  private readonly rc: number;
  private readonly n: number;
  private readonly shaft: DeviceObject; private readonly tip: DeviceObject; private readonly band: DeviceObject;
  private readonly needle: DeviceObject; private readonly needleCone: DeviceObject; private readonly wire: DeviceObject;
  private readonly column: DeviceObject; private readonly columnGeo: BufferGeometry;
  private readonly balloon: DeviceObject; private readonly balloonGeo: BufferGeometry; private readonly balloonBands: DeviceObject[];
  private readonly rings: DeviceObject[] = []; private readonly flashes: DeviceObject[] = [];
  private readonly coil: DeviceObject | null; private readonly coilGeo: BufferGeometry | null; private readonly coilN = 120;
  private last: CatheterState = { ...CATHETER_IDLE };
  private readonly v = new Vector3();
  private readonly w = new Vector3();

  readonly r3: Route3D;
  readonly span: string | null;

  constructor(r3: Route3D, shared: CelShared, span: string | null = null) {
    this.r3 = r3; this.span = span;
    const r = r3.route, rc = (this.rc = r3.rc);
    const nS = (this.n = Math.max(24, Math.ceil(r.total / 2.4)));
    const mk = (g: BufferGeometry, tone: DeviceTone, order: number, edge: 'ink' | 'polyEdge' | 'latexEdge' = 'ink', px = 0.9): DeviceObject => {
      const o = new DeviceObject(g, tone, shared, { px, order }, edge);
      this.group.add(o.group); this.objects.push(o); return o;
    };
    // the shaft (a polymer tube with its dark hairline), revealed along its length up to the tip
    const rings = makeRings(nS);
    const fill = (rs: typeof rings, radius: (i: number, d: number) => number): void => { rs.forEach((q, i) => { const d = (r.total * i) / (nS - 1); r3.point(d, q.c); r3.dir(d, q.t); q.r = radius(i, d); }); };
    fill(rings, (_i, d) => shaftRadius(rc, r3.lumen(d)));   // (never thinner than SHAFT_MIN_R: a hairline vanished on a phone)
    const sg = allocTube(nS, SHAFT_RADIAL); writeRings(sg, rings, SHAFT_RADIAL);
    // the column of wedged blood or sclerosant lies under everything, as wide as the vein it fills
    const cr = makeRings(nS); fill(cr, (_i, d) => r3.lumen(d) * 0.94);
    this.columnGeo = allocTube(nS, 12); writeRings(this.columnGeo, cr, 12);
    this.column = mk(this.columnGeo, 'trWedge', 0, 'ink', 0.5);
    // the needle and the wire: the shaft's own course, finer, shown from the catheter's tip on to where they are
    const nw0 = Math.max(rc * 0.42, 0.0015);
    const needleRings = makeRings(nS); fill(needleRings, () => nw0);
    const ng = allocTube(nS, 8); writeRings(ng, needleRings, 8);
    this.needle = mk(ng, 'steel', 2, 'ink', 0.7);
    this.needleCone = mk(withTang(new CylinderGeometry(0.01, nw0, rc * 1.4, 8, 1, false).rotateX(Math.PI / 2)), 'steel', 2, 'ink', 0.5);
    const wireRings = makeRings(nS); fill(wireRings, () => Math.max(rc * 0.16, 0.0009));
    const wg = allocTube(nS, 6); writeRings(wg, wireRings, 6);
    this.wire = mk(wg, 'steel', 1, 'ink', 0.5);
    this.shaft = mk(sg, 'poly', 4, 'polyEdge', 0.9);
    this.tip = mk(withTang(new SphereGeometry(rc, 12, 8)), 'poly', 5, 'polyEdge', 0.9);
    this.band = mk(withTang(new CylinderGeometry(rc * 1.05, rc * 1.05, rc * 0.7, 14, 1, true).rotateZ(Math.PI / 2)), 'platinum', 6, 'ink', 0.5);
    // the balloon: refitted to the vein as it swells (hvpg-balloon.js), latex (or clear nylon along a TIPS tract)
    this.balloonGeo = allocTube(BALLOON_N + 1, BALLOON_RADIAL);
    this.balloon = mk(this.balloonGeo, span ? 'nylon' : 'latex', 7, span ? 'ink' : 'latexEdge', 1.1);
    this.balloonBands = [0, 1].map(() => mk(withTang(new CylinderGeometry(rc * 1.0, rc * 1.0, rc * 0.7, 14, 1, true).rotateZ(Math.PI / 2)), 'platinum', 8, 'ink', 0.5));
    for (let i = 0; i < 2; i++) {
      this.flashes.push(mk(withTang(new RingGeometry(0.8, 1, 36)), 'trPv', 9, 'ink', 0));
      this.rings.push(mk(withTang(new RingGeometry(0.8, 1, 36)), 'monFree', 9, 'ink', 0));
    }
    // the coil of a TIPS that coils the coronary vein, curling on up the vein past the tip
    if (r.coilAt) {
      this.coilGeo = allocTube(this.coilN, 6);
      this.coil = mk(this.coilGeo, 'platinum', 3, 'ink', 0.7);
    } else { this.coil = null; this.coilGeo = null; }
    this.set({ ...CATHETER_IDLE });
  }

  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** Where the tip is for a share u of its way (scene units), for tags and the camera. */
  tipAt(u = this.last.u, out = new Vector3()): Vector3 { return this.r3.point(this.r3.tipD(u), out); }
  get current(): Readonly<CatheterState> { return this.last; }

  set(s: CatheterState): void {
    this.last = s;
    const { r3, rc } = this, r = r3.route, op = clamp01(s.opacity), showing = s.u > 0.001 && op > 0.002;
    const tipD = r3.tipD(s.u);
    for (const o of this.objects) o.group.visible = false;
    if (!showing) { this.group.visible = false; return; }
    this.group.visible = true;
    for (const o of [this.shaft, this.tip, this.band]) { o.group.visible = true; o.setAlpha(op); }
    this.shaft.setReveal(Math.min(1, tipD / r.total));
    r3.point(tipD, this.v); this.tip.group.position.copy(this.v);
    this.orient(this.tip, tipD);
    // the marker band, just behind the taper
    r3.point(Math.max(0, tipD - (rc * U) * 2.75), this.v); this.band.group.position.copy(this.v); this.orient(this.band, tipD - rc * U * 2.75);

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
    this.column.group.visible = col > 0.001;
    if (col > 0.001) {
      this.column.setTone(s.columnTone ?? 'trWedge'); this.column.setAlpha(0.55 * op);
      const reach = tipD + (r.total - tipD) * col, i0 = Math.max(0, Math.floor((tipD / r.total) * (this.n - 1))), i1 = Math.min(this.n - 1, Math.ceil((reach / r.total) * (this.n - 1)));
      showRings(this.columnGeo, i0, i1, 12);
    }

    // the balloon
    const bl = clamp01(s.balloon);
    this.balloon.group.visible = bl > 0.001;
    for (const b of this.balloonBands) b.group.visible = bl > 0.001;
    if (bl > 0.001) this.fitBalloon(bl, tipD, op);

    // the tip's reading ripples, and the coil
    if (s.ring) this.ripple(s.ring, tipD, s.clock, op);
    if (this.coil && s.coil > 0.001) this.layCoil(s.coil, op);
  }

  private orient(o: DeviceObject, d: number): void {
    this.r3.dir(d, this.w);
    o.group.quaternion.setFromUnitVectors(X, this.w);
  }

  /** The balloon, fitted inside the vein as the 2D app fits it (stage-cath.js cathGL): along a TIPS tract its whole length, else just behind the tip; wedged it lies on the vein's own centreline and fills the lumen. */
  private fitBalloon(bl: number, tipD: number, op: number): void {
    const { r3, rc } = this, r = r3.route, rc2 = rc * U, proc = r.kind !== 'hvpg';
    const at = (d: number) => routeAt(r, d, { p: [0, 0], t: [1, 0], w: [0, 0], r: 0 });
    const Rf = at(r.free).r, gap = rc2 * 4.2, Rb = at(tipD - gap - Rf * 1.6).r, sp = this.span ? r.spans[this.span] : null;
    const rx = sp ? (sp[1] - sp[0]) * 0.45 : proc ? lerp(rc2 * 3.4, Rb * 2.6, bl) : lerp(rc2 * 3.4, Rb * 1.6, bl);
    const dC = sp ? (sp[0] + sp[1]) / 2 : tipD - gap - rx;
    const ry0 = balloonRy(at, dC, rx, proc ? Math.max(rc2 * 1.35, Rb) : rc2 * 1.35, { floor: rc2 * 1.05 });
    const ol = balloonOutline(at, dC, rx, ry0, bl, { floor: rc2 * 1.05 }) as { c: [number, number]; t: [number, number]; h: number; s: number }[];
    const rings = this.ballRings ||= makeRings(ol.length);
    ol.forEach((o, i) => {
      const q = rings[i]!, d = dC + rx * o.s;
      q.c.set(x3(o.c[0]), y3(o.c[1]), r3.point(d, this.v).z); q.t.set(o.t[0], -o.t[1], 0); q.r = Math.max(o.h / U, 0.0004);
    });
    writeRings(this.balloonGeo, rings, BALLOON_RADIAL);
    this.balloon.setAlpha((0.7 + 0.3 * bl) * op);
    // its two marker bands, at the shoulders
    [-1, 1].forEach((side, i) => {
      const b = this.balloonBands[i]!, d = dC + side * rx * 0.72;
      b.setAlpha(op); b.group.position.copy(r3.point(d, this.v)); this.orient(b, d);
    });
  }
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
    writeRings(geo, rs, 6);
    showRings(geo, 0, Math.round(k * (N - 1)), 6);
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
