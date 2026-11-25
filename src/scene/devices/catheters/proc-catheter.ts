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
import { FLASHBACK_K, flashbackEnv, flashbackFront } from '../flashback.ts';
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

/** The needle's bevelled point: a cone with its axis on +X (the way every part of the route is laid: `orient` turns +X to the route's direction), base radius `r` at the origin, a point `1.4 rc` ahead of it. */
/** The point's apex radius as a share of its base (the needle's). It was an absolute 0.01 scene units, six times the needle's own radius (0.0015): the "cone" was a wide 8-sided disc. */
export const NEEDLE_APEX_K = 0.08;
/** The TIPS needle (owner, 25 Nov: "not too sharp, very thick"): a fine steel needle, a share of the shaft's radius no thicker than the guide wire's, with a long slim bevel; and the sheath over it wider than any other catheter's shaft. */
export const NEEDLE_K = 0.2, NEEDLE_MIN = 0.0009, NEEDLE_POINT_LEN = 3.2, SHEATH_K = 1.5, SHEATH_MAX_SHARE = 0.3;
export const needleRadius = (rc: number): number => Math.max(rc * NEEDLE_K, NEEDLE_MIN);
/** The sheath's radius on a TIPS-kit route (the shaft is the sheath the needle goes out through), the shaft's own radius elsewhere. */
export const SHEATH_KINDS: ReadonlySet<string> = new Set(['tips', 'tipscoil', 'tipscoilin', 'dips']);
export const sheathK = (kind: string): number => (SHEATH_KINDS.has(kind) ? SHEATH_K : 1);
export function needlePoint(rc: number, r: number): BufferGeometry { return new CylinderGeometry(r * NEEDLE_APEX_K, r, rc * NEEDLE_POINT_LEN, 8, 1, false).rotateZ(-Math.PI / 2).translate(rc * NEEDLE_POINT_LEN / 2, 0, 0); }
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
export const HUG = 0.985;
/** The barrel's end shape: 2 is an ellipse (a lens), higher is a flat barrel with short round caps (a real balloon). */
export const BARREL_POW = 8;
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
  const a = new Vector3(), b = new Vector3();
  ol.forEach((o, i) => {
    const q = rings[i]!, d = dC + rx * o.s;
    r3.point(d, a); r3.centre(d, b);
    q.c.copy(a).lerp(b, bl); q.t.set(o.t[0], -o.t[1], 0);
    // (the radius the 2D route knows may be wider than the vein the 3D scene draws: the drawn vessel's own radius, less how far the ring's centre is off its centreline, is the last word)
    // (the DRAWN radius of the vein there, its end tapers included, not the nominal one)
    let room = Infinity;
    for (const id of r.ids) { const c = drawnShare(id, q.c.x, q.c.y, q.c.z); if (c && c.share < 1) room = Math.min(room, Math.max(c.radius * Math.min(r3.swellAt(d), SWELL_FILL) - c.dist, 0)); }
    // (a wedged balloon HUGS: each ring takes the drawn lumen there, at the wall less a hair, whatever width the 2D route knew. The 2D radius capped it at 0.92 of itself, and where the 3D vein is drawn wider than the
    // route's (BATO's splenic vein: 0.81) the glass floated free of the wall, Mohammad 25 Nov: "balloons everywhere on any catheter should wedge, hug the blood vessel, not be smaller than it".)
    const shoulder = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(o.s), BARREL_POW)), 1 / BARREL_POW);
    const lumen = room === Infinity ? (at(d).r / U) : room;
    // (it swells from the shaft's own width to the wall with the inflation; along a TIPS tract the tract IS what it widens, so the glass hugs the tract as it is drawn now and only rises and falls in its own first and last quarter)
    const grow = span ? Math.min(1, bl * 4) : bl;
    q.r = Math.max(Math.min(rc + (lumen * HUG - rc) * grow, lumen * HUG) * Math.max(shoulder, 0.0001), 0.0004);
  });
  return { dC, rx, ol };
}

/** One vessel's line of the wedge's one field (wedge-glsl.ts): its route distance from the balloon's distal edge at u is `d0 + slope u` (route units, so `slope` is minus the vessel's drawn length), and `fade` how far (u) the tint thins toward a branch's tip, 0 for none. */
/** The still column's body alpha on the procedures that draw it as a tube (the sclerosant): partly see-through, the vein's outline showing through (0.55 hid it). */
export const WEDGE_COLUMN_ALPHA = 0.38;
export interface WedgePiece { d0: number; slope: number; fade: number }

/** How much of the shaft is cleared where it passes through the balloon's glass: 0, the whole shaft shows through (Mohammad, 21 Nov). */
export const BALLOON_SHAFT_HOLE = 0;
export class ProcCatheter {
  readonly group = new Group();
  readonly objects: DeviceObject[] = [];
  private readonly rc: number;
  private readonly n: number;
  private readonly shaft: DeviceObject;
  private readonly needle: DeviceObject; private readonly needleCone: DeviceObject; private readonly wire: DeviceObject;
  private readonly column: DeviceObject; private readonly columnGeo: BufferGeometry;
  private readonly shaftGeo: BufferGeometry; private readonly shaftRings: ReturnType<typeof makeRings>; private readonly shaftU: Float32Array; private shaftAt = -1;
  private readonly balloon: DeviceObject; private readonly balloonGeo: BufferGeometry; private readonly balloonBands: DeviceObject[]; private readonly glints: { g: BufferGeometry; o: DeviceObject }[];
  private readonly rings: DeviceObject[] = [];
  /** the portal hit's flashback: the needle's own length filled with portal blood (a sleeve of the needle's course in the portal vein's colour), never a flat ring */
  private readonly flashback: DeviceObject; private readonly flashbackGeo: BufferGeometry;
  private readonly coil: DeviceObject | null; private readonly coilGeo: BufferGeometry | null; private readonly coilN = 120;
  private last: CatheterState = { ...CATHETER_IDLE };
  /** The last `set` showed the catheter (its parts fade in and out on their own: `group` stays drawn until the last of them is gone). */
  private active = false;
  /** The parts the current `set` shows (a part not in it is asked to go, and fades). */
  private readonly lit = new Set<DeviceObject>();
  private liveSeen = 0;
  private followSeen = 0;
  private readonly statics: { rs: ReturnType<typeof makeRings>; g: BufferGeometry; sides: number; radius: (i: number, d: number) => number }[] = [];
  private readonly v = new Vector3();
  private readonly w = new Vector3();

  readonly r3: Route3D;
  readonly span: string | null;

  constructor(r3: Route3D, shared: CelShared, span: string | null = null) {
    this.r3 = r3; this.span = span;
    const r = r3.route, rc = (this.rc = r3.rc);
    const nS = (this.n = Math.max(24, Math.ceil(r.total / 2.4)));
    const mk = (g: BufferGeometry, tone: DeviceTone, order: number, edge: EdgeRule = 'ink', px = 0.9, more: { bands?: 2 | 3; tubeTones?: boolean; fat?: number; shadow?: number } = {}): DeviceObject => {
      const o = new DeviceObject(g, tone, shared, { px, order, ...more }, edge);
      o.park(); this.group.add(o.group); this.objects.push(o); return o;
    };
    // the shaft (a polymer tube with its dark hairline), revealed along its length up to the tip
    const rings = makeRings(nS);
    const fill = (rs: typeof rings, radius: (i: number, d: number) => number): void => { rs.forEach((q, i) => { const d = (r.total * i) / (nS - 1); r3.point(d, q.c); r3.dir(d, q.t); q.r = radius(i, d); }); };
    // (the parts laid once along the whole route: laid again by `follow` when the vessel they lie in is drawn at another shape)
    const keep = (rs: typeof rings, g: BufferGeometry, sides: number, radius: (i: number, d: number) => number): void => { this.statics.push({ rs, g, sides, radius }); };
    fill(rings, () => rc);
    const sg = allocTube(nS, SHAFT_RADIAL); writeRings(sg, rings, SHAFT_RADIAL);
    this.shaftGeo = sg; this.shaftRings = rings; this.shaftU = new Float32Array(nS);
    // the column of wedged blood or sclerosant lies under everything, as wide as the vein it fills
    const cr = makeRings(nS), colR = (_i: number, d: number): number => r3.lumen(d) * 0.94; fill(cr, colR);
    this.columnGeo = allocTube(nS, DEVICE_SIDES); writeRings(this.columnGeo, cr, DEVICE_SIDES); keep(cr, this.columnGeo, DEVICE_SIDES, colR);
    this.column = mk(this.columnGeo, 'trWedge', 0, 'ink', 0.5);
    // the needle and the wire: the shaft's own course, finer, shown from the catheter's tip on to where they are
    const nw0 = needleRadius(rc);
    const needleRings = makeRings(nS), nwR = (): number => nw0; fill(needleRings, nwR);
    const ng = allocTube(nS, WIRE_SIDES + 4); writeRings(ng, needleRings, WIRE_SIDES + 4); keep(needleRings, ng, WIRE_SIDES + 4, nwR);
    this.needle = mk(ng, 'steel', 2, 'ink', 0.45);
    const fr = makeRings(nS), frR = (): number => nw0 * FLASHBACK_K; fill(fr, frR);
    this.flashbackGeo = allocTube(nS, WIRE_SIDES + 4); writeRings(this.flashbackGeo, fr, WIRE_SIDES + 4); keep(fr, this.flashbackGeo, WIRE_SIDES + 4, frR);
    this.flashback = mk(this.flashbackGeo, 'trPv', 3, 'none', 0);
    // (the needle's bevelled point: a cone along +X, base on the needle's end, apex ahead. It had an apex radius of 0.01 against a base of 0.0015 (an inverted cone: a wide 8-sided disc) and its axis on Z where `orient` lays an X-axis part, so it stood end-on: a grey octagonal knob on the wire where the needle ends; owner, 22 Nov: "wtf is this circle in tips")
    this.needleCone = mk(withTang(needlePoint(rc, nw0)), 'steel', 2, 'ink', 0.4);
    const wireRings = makeRings(nS), wR = (): number => Math.max(rc * 0.16, 0.0009); fill(wireRings, wR);
    const wg = allocTube(nS, WIRE_SIDES); writeRings(wg, wireRings, WIRE_SIDES); keep(wireRings, wg, WIRE_SIDES, wR);
    this.wire = mk(wg, 'steel', 1, 'ink', 0.5);
    // (lit by the world with a highlight, three bands: a round polymer line, not the vessels' flat screen tones, which read as a ribbon)
    this.shaft = mk(sg, 'poly', 4, CATH_EDGE, 0.7, { bands: 3, tubeTones: false, fat: 0.7, shadow: rc });
    // the lead-in above the figure fades out as a gradient (the catheter's free end), shaft, needle and wire alike
    for (const o of [this.shaft, this.needle, this.wire]) o.setTailFade(Math.min(0.5, TAIL_UNITS / r.total));
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
      this.rings.push(mk(withTang(new RingGeometry(0.8, 1, 72)), 'monFree', 9, 'ink', 0));
    }
    // the coil of a TIPS that coils the coronary vein, curling on up the vein past the tip
    if (r.coilAt) {
      this.coilGeo = allocTube(this.coilN, WIRE_SIDES);
      this.coil = mk(this.coilGeo, 'platinum', 3, 'ink', 0.7);
    } else { this.coil = null; this.coilGeo = null; }
    this.set({ ...CATHETER_IDLE });
  }

  /** True when the vessels it runs in moved and it laid itself on them again (nothing is drawn when it is not out). */
  refollow(): boolean { if (!this.active) return false; const was = this.followSeen; this.r3.follow(); if (was === this.r3.followVersion()) return false; this.set(this.last); return true; }

  /** Lays the parts again along the route where the vessels it runs in are drawn now (route3d.ts follow): a shunt that curves as it fills carries the shaft, the balloon and the column with it. */
  private followVessels(): void {
    const { r3 } = this;
    r3.follow();
    if (this.followSeen === r3.followVersion()) return;
    this.followSeen = r3.followVersion();
    const total = r3.route.total, nS = this.n;
    for (const q of this.statics) {
      q.rs.forEach((c, i) => { const d = (total * i) / (nS - 1); r3.point(d, c.c); r3.dir(d, c.t); c.r = q.radius(i, d); });
      writeRings(q.g, q.rs, q.sides);
    }
    this.shaftAt = -1;
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
    if (this.active) this.set(this.last);
    return true;
  }

  /** The wedge's amber column on the HVPG route, as a tint on the vessels themselves: everything upstream of the balloon in the vein the tip is in, and the branches that leave it, fading out toward their tips.
   *  `pieces`: for each vessel id, how far up its own course the tint reaches (a share of the course from its outer end; 2 is all of it) and over how much of it it thins toward the tip. Null when there is none. */
  wedgeTint(): { amount: number; color: Color; front: number; frontSoft: number; behind: number; pieces: Map<string, WedgePiece> } | null {
    const { r3 } = this, r = r3.route, s = this.last, col = clamp01(s.column);
    if (r.kind !== 'hvpg' || col <= 0.001 || !this.active) return null;
    // ONE FIELD (wedge-glsl.ts). The tint starts AT the balloon's distal edge (the glass ends 4.2 shaft radii behind the tip: fitBalloon's `gap`) and is a function of the distance along the network from there:
    // every vessel of the hepatic tree (the vein, its forks, the branch) is given the line `d0 + slope u` of its own drawn length, the junction skins blend their arms' seams' values, and the column's front is ONE
    // advancing distance with a soft edge, so it flows from the balloon through the vein, the join and out to every branch at one speed, and nothing lags or jumps (Mohammad, 21 Nov: "the tubes filled, the join did
    // NOT fill, then it filled all of a sudden"). At a full column the front is past the farthest tip by its own softness: everything is covered.
    const edgeD = r3.tipD(s.u) - this.rc * U * 4.2, soft = this.rc * U * 5, frontSoft = soft * 5;   // (a long gradient front: the amber thins out ahead of the flow, never a hard edge)
    const pieces = new Map<string, WedgePiece>();
    let far = 0;
    const put = (id: string, dStart: number, uStart: number, fallbackLen: number, fade: number): void => {
      // (u runs from `uStart` at the piece's start toward the outer end, 0; the vessel's drawn length is the course's own)
      const c = this.courseOf(id), len = c ? c.length * U : fallbackLen;
      pieces.set(id, { d0: dStart + uStart * len, slope: -len, fade });
      far = Math.max(far, dStart + uStart * len);
    };
    // WHERE a distance along the route is on the vein AS DRAWN: the shader's u is the share of the DRAWN tube's own length, and the vein's drawn course is not the 2D course the route was laid on, so the balloon's
    // edge is placed by projecting the route's own point there (it lies ON the drawn centreline) on that centreline.
    const uAt = (id: string, d: number, fb: number): number => { const c = this.courseOf(id); if (!c) return fb; const p = r3.centre(d, this.v); return c.nearestU([p.x, p.y, p.z]); };
    const hv = r.parts.find((q) => q.name === 'hv'), br = r.parts.find((q) => q.name === 'branch');
    // (the placed anatomy wedges in the lower branch (route-placed.ts): the branch is one more stretch of the vein the tip is in, tinted from the balloon out to its tip like the trunk's pieces)
    const inBranch = !!br?.id && NETWORK_BY_ID.has(br.id);
    for (const sub of [...(hv?.subs?.length ? hv.subs : hv ? [hv] : []), ...(inBranch ? [br!] : [])]) {
      if (!sub.id || edgeD >= sub.d1 - 1e-6) continue;   // (downstream of the balloon: not tinted)
      const inside = edgeD > sub.d0;
      const uRef = uAt(sub.id, inside ? edgeD : sub.d0, sub.fa), dRef = inside ? 0 : sub.d0 - edgeD;
      put(sub.id, dRef, uRef, (sub.d1 - sub.d0) / Math.max(1e-6, Math.abs(sub.fb - sub.fa)), 0);
      // (a child starts where its parent's line says it is, so the field is one number across the seam, by construction)
      const mine = pieces.get(sub.id)!;
      // (a fork leaves its host WHERE ITS OWN END 1 TOUCHES IT, not at the host's outer end: it starts at the host's line there, so host and fork share one distance at the join and one front crosses both)
      for (const v of NETWORK) if (v.id.startsWith(`${sub.id}~F`)) put(v.id, this.forkStartD(sub.id, v.id, mine), 1, Math.max(1e-6, r.total - sub.d1), 0.6);
    }
    if (!inBranch && br?.id && NETWORK_BY_ID.has(br.id)) {
      const host = hv?.subs?.find((q) => q.id && pieces.has(q.id) && br.d0 >= q.d0 - 1e-6 && br.d0 <= q.d1 + 1e-6), hp = host?.id ? pieces.get(host.id) : undefined;
      put(br.id, hp && host?.id ? hp.d0 + hp.slope * uAt(host.id, br.d0, host.fb) : br.d0 - edgeD, 1, Math.max(1e-6, br.d1 - br.d0), 0.6);
    }
    if (!pieces.size) return null;
    // the front: LINEAR in the column, from the balloon (0) to past the farthest tip by its own softness. The column is already eased once by the procedure's clock (2D's own `reach = a + (total - a) * col`);
    // easing it a second time here (a smootherstep) made the middle of the fill 3.5 times as fast, so whole vessels flooded at once (Mohammad, 21 Nov: "filling in segments")
    const front = col * (far + frontSoft);
    return { amount: clamp01(col * 6) * clamp01(s.opacity), color: this.wedgeColor, front, frontSoft, behind: soft, pieces };
  }
  /** The host's route-distance line (`d0 + slope u`) read where child `id`'s end (u = 1) touches the host's drawn centreline (the host's outer end when either has no drawn course). */
  private forkStartD(hostId: string, id: string, host: WedgePiece): number {
    const h = this.courseOf(hostId), c = this.courseOf(id);
    if (!h || !c) return host.d0;
    const p = c.pointAt(1);
    return host.d0 + host.slope * h.nearestU(p);
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
    this.followVessels();
    const tipD = r3.tipD(s.u);
    const lit = this.lit; lit.clear();
    this.active = showing;
    if (!showing) { this.settle(); return; }
    lit.add(this.shaft); this.shaft.setAlpha(op);
    this.layShaft(tipD);

    // the wire (a fine dark line on into the portal trunk) and the needle (steel, narrowing to a bevelled point), only ahead of the catheter's tip
    const toD = (u: number): number => r3.tipD(u);
    const wD = s.wire > 0 ? toD(s.wire) : 0, nD = s.needle > 0 ? toD(s.needle) : 0;
    const wShow = wD > tipD + rc * U * 0.6;
    if (wShow) { lit.add(this.wire); this.wire.setAlpha(op); this.wire.setReveal(Math.min(1, wD / r.total)); }
    const nShow = nD > tipD + rc * U * 0.6;
    if (nShow) {
      lit.add(this.needle); lit.add(this.needleCone);
      this.needle.setAlpha(op); this.needleCone.setAlpha(op);
      const bev = rc * U * NEEDLE_POINT_LEN;
      this.needle.setReveal(Math.min(1, Math.max(0, (nD - bev * 0.5) / r.total)));
      r3.point(nD - bev * 0.5, this.v); this.needleCone.group.position.copy(this.v); this.orient(this.needleCone, nD - bev * 0.5);
      if (s.flash > 0) this.flashBack(s.flash, tipD, nD, op);
    }

    // the column of wedged blood or sclerosant from the tip on (a hepatic vein beyond the wedged balloon, or the shunt the sclerosant fills)
    const col = clamp01(s.column);
    // (the HVPG's column is a tint on the vessels themselves, upstream of the balloon: wedgeTint, laid by the scene; the other procedures' columns are still this tube)
    if (col > 0.001 && r.kind !== 'hvpg') {
      lit.add(this.column);
      // (2D's `reach = a + (total - a) * col`, ONE arc length over the whole route: it flows out of the tip's vessel on into the next and its branches, never stopping at the end of the part the tip is in)
      this.column.setTone(s.columnTone ?? 'trWedge'); this.column.setAlpha(WEDGE_COLUMN_ALPHA * op);
      const reach = tipD + (r.total - tipD) * col, i0 = Math.max(0, Math.floor((tipD / r.total) * (this.n - 1))), i1 = Math.min(this.n - 1, Math.ceil((reach / r.total) * (this.n - 1)));
      showRings(this.columnGeo, i0, i1, DEVICE_SIDES);
    }

    // the balloon
    const bl = clamp01(s.balloon);
    if (bl > 0.001) { lit.add(this.balloon); for (const b of this.balloonBands) lit.add(b); for (const q of this.glints) lit.add(q.o); this.fitBalloon(bl, tipD, op); } else this.shaft.setHole(0, 0, 0);

    // the tip's reading ripples, and the coil
    if (s.ring) this.ripple(s.ring, tipD, s.clock, op);
    if (this.coil && s.coil > 0.001) this.layCoil(s.coil, op);
    this.settle();
  }
  /** Every part is asked to show or go as the last `set` lit it (each fades over DEVICE_FADE_MS and leaves the draw list when it is gone; the container is never switched). */
  private settle(): void { for (const o of this.objects) o.show(this.lit.has(o)); }

  /** The shaft from the route's start to the tip, tip included: the body's rings are spread evenly over the way, the last TIP_RINGS (closer together toward the end) are the taper and its rounded point (tipRadius).
   *  uv.x stays the share of the whole route, so the lead-in's fade and the depth marks (counted back from the tip) are as before. Rewritten only when the tip has moved. */
  private layShaft(tipD: number): void {
    if (Math.abs(tipD - this.shaftAt) < 1e-6) return;
    this.shaftAt = tipD;
    const { r3 } = this, total = r3.route.total, rings = this.shaftRings, us = this.shaftU, n = rings.length, nb = n - TIP_RINGS;
    const sk = sheathK(r3.route.kind), rc = this.rc * sk, share = sk > 1 ? SHEATH_MAX_SHARE : SHAFT_MAX_SHARE;
    const rcTip = Math.min(rc, share * r3.lumen(tipD)), dTip = Math.max(0, tipD - rcTip * U * TIP_LEN_R);
    for (let i = 0; i < n; i++) {
      const q = rings[i]!;
      const d = i < nb ? (dTip * i) / Math.max(1, nb - 1) : dTip + (tipD - dTip) * Math.sin(((i - nb + 1) / TIP_RINGS) * Math.PI / 2);
      r3.point(d, q.c); r3.dir(d, q.t);
      q.r = Math.max(Math.min(tipRadius((tipD - d) / U, rcTip), share * r3.lumen(d), rc), 1e-5);
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
    // the shaft is seen THROUGH the glass (Mohammad, 21 Nov: "why can't I see the catheter inside the balloon"). It had been cleared to a 10% ghost (BALLOON_SHAFT_HOLE 0.9) for "the balloon still has shit in it",
    // which was the collars and dark bars, long gone; the shaft itself is a light polymer line and belongs in there. The hole stays as a mechanism (share 0 = whole shaft).
    const total = Math.max(1e-6, this.r3.route.total), half = ol.rx, soft = this.rc * U * 1.5 / total;
    this.shaft.setHole((ol.dC - half) / total + soft, (ol.dC + half) / total - soft, BALLOON_SHAFT_HOLE * e, soft);
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

  /** The portal hit as flashback: portal blood runs back along the needle from its point (as it does through a real needle's hub), holds, and drains; the sleeve is the needle's own course, so it can never read as a disc floating in the liver.
   *  `f` is the hit's 0..1 window (proc-anim.js flash0..flash1). */
  private flashBack(f: number, tipD: number, nD: number, op: number): void {
    const { n } = this, total = this.r3.route.total, e = flashbackEnv(f);
    const reach = Math.max(0, nD - tipD) * flashbackFront(f), from = Math.max(tipD, nD - reach);
    this.lit.add(this.flashback);
    this.flashback.setAlpha(e * op);
    showRings(this.flashbackGeo, Math.floor((from / total) * (n - 1)), Math.ceil((nD / total) * (n - 1)), WIRE_SIDES + 4);
  }
  /** The tip's reading, two ripples running out of it in the reading's colour. */
  private ripple(ring: RingName, tipD: number, clock: number, op: number): void {
    const ph = (clock / 1300) % 1;
    this.r3.point(tipD, this.v);
    this.rings.forEach((o, i) => {
      const k = i ? (ph + 0.5) % 1 : ph, s = this.rc * (1.6 + 4.2 * k), a = (1 - k) * (1 - k) * 0.9;
      o.setTone(RING_TONE[ring]); this.lit.add(o); o.setAlpha(a * op); o.group.position.copy(this.v); o.group.scale.setScalar(s);
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
    this.lit.add(this.coil!); this.coil!.setAlpha(op);
  }
  private coilRings: ReturnType<typeof makeRings> | null = null;
}

/** How far the coil runs on up the vein, in figure units (eus-scope.js COIL_PATH_HALF). */
const COIL_REACH = 16;
const Z = new Vector3(0, 0, 1);
/** A point and direction `len` figure units from share f along vein `id`, going with its drawn course (dir +1) or against it (-1), in the scene. */
export function veinPoint(id: string, f: number, dir: number, len: number, pos: Vector3, tan: Vector3): void {
  // (on the vein's drawn centreline, depth included, never its 2D course on a tier)
  const c = centrelineOf(id);
  if (c) {
    const u = Math.min(1, Math.max(0, f + (dir * len) / Math.max(1e-6, c.length * U))), p = c.pointAt(u), t = c.tangentAt(u);
    pos.set(p[0], p[1], p[2]); tan.set(dir * t[0], dir * t[1], dir * t[2]).normalize();
    return;
  }
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
