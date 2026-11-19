// The endoscope (2D eus-scope.js, whose way down is the only scope route the 2D figure draws): in through the top of the figure, down the middle of the esophagus and through the cardia into the proximal
// stomach, a black insertion tube 12 units across with a rigid grey tip and a dark lens. Three ways to work with it, one scope:
//   'scope'  to the cardia, looking (the plain endoscopy card);
//   'band'   to the lowest ligation band's place, with the ligator's clear cap on its tip and a band loaded on it (the bands the model counts are src/scene/devices/bands.ts);
//   'eus'    the linear echoendoscope to a station in the stomach: its bending section turns the tip until the needle's line from the working channel meets the target (eusPose, the 2D app's own), the
//            ultrasound sector fans out, and the 25-gauge needle crosses the wall into the left portal vein (station 'pv') or the left hepatic vein (station 'hv').
// The route, the stations, the targets, the bend's limits and the needle's exit are the 2D app's, copied by script; the scope travels at a steady pace and eases between places, never cutting.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { TIER_Z, len3, x3, y3 } from '../../frame2d.ts';
import { EDGE_PATH_2D } from '../../vessels/paths.copied.ts';
import { BAND } from '../../procedures/copied/band-ring.js';
import { EUS_GLUE_ROUTE, EUS_GLUE_STATION, EUS_GLUE_TARGET, EUS_ROUTE, EUS_SCOPE_R, EUS_STATIONS, EUS_TARGETS, EUS_BEND_MIN, EUS_RIGID, eusPose, newTip, pointOn } from './copied/eus-scope.copied.js';
import { ProbePart, TubeBuf, linePart } from './parts.ts';
import { showRings } from '../tube-rings.ts';
import type { ScopeMode } from './state.ts';

type P2 = [number, number];
export const SCOPE_Z = TIER_Z.mid + 0.03;
/** The scope's pace down its way, figure units a second (the 2D app's pass takes about five seconds for the whole way). */
export const SCOPE_SPEED = 170;
const RAD = Math.PI / 180;
const STEP = 1.2;

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
  return way.cardiaD;
}

/** The scene point of a figure point on the scope's plane. */
const at3 = (p: readonly number[], out: Vector3): Vector3 => out.set(x3(p[0]!), y3(p[1]!), SCOPE_Z);
const dir3 = (t: readonly number[], out: Vector3): Vector3 => out.set(t[0]!, -t[1]!, 0);

const ease01 = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** What the glue slide's procedure sets on the scope each frame (the 2D `procFrame('eusglue')` record): how far in (u, of its way), the port and elevator (aim), the sector (fan) and the needle (0..1). */
export interface ScopeDrive { u: number; aim: number; fan: number; needle: number }

export class EndoScope {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  private readonly bufs: TubeBuf[] = [];
  /** how far down its way the tip is, figure units; the bend's turn (0 straight to 1 aimed), the sector's, the needle's, the cap's: each eased */
  d = 0; aim = 0; fan = 0; needle = 0; cap = 0;
  private way = scopeWay();
  private readonly eusWay = this.way; private readonly glueWay = glueScopeWay();
  /** how far the parked glue scope has faded out (0 whole, 1 gone) once the slide's procedure is taken off */
  private gone = 0;
  private readonly shaft: TubeBuf; private readonly bend: TubeBuf; private readonly tip: TubeBuf; private readonly lens: TubeBuf;
  private readonly capBuf: TubeBuf; private readonly bandBuf: TubeBuf; private readonly needleBuf: TubeBuf;
  private readonly parts_: { shaft: ProbePart; bend: ProbePart; tip: ProbePart; lens: ProbePart; cap: ProbePart; band: ProbePart; needle: ProbePart };
  private readonly fanGeo = new BufferGeometry();
  private readonly fanMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly fanMesh: Mesh;
  private readonly g = newTip() as { c1: P2; c2: P2; a1: P2; side: P2; exit: P2; nd: P2; p2: P2; end: P2; p0: P2; len: number; phi: number; d0: number; bend: number };
  private readonly v = new Vector3(); private readonly w = new Vector3(); private readonly dv = new Vector3();
  private mode: ScopeMode = 'scope';
  private station: 'pv' | 'hv' = 'pv';
  private target: P2 = [0, 0];
  private dirty = true;
  /** the last pose laid, for tests and tags */
  readonly pose = { tip: new Vector3(), dir: new Vector3(), needleEnd: new Vector3(), shaftRings: 0 };

  constructor(shared: CelShared) {
    const R = len3(EUS_SCOPE_R as number);
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number) => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order);
      this.parts.push(part); this.bufs.push(buf); this.group.add(part.group);
      return { part, buf };
    };
    const N = Math.max(this.way.pts.length, this.glueWay.pts.length);
    const sh = mk('poly', (t) => t.polyEdge, N, 1, 1), bd = mk('poly', (t) => t.polyEdge, 17, 1, 1), tp = mk('steel', null, 4, 1, 2), ln = mk('poly', (t) => t.polyEdge, 2, 0.7, 3);
    const cp = mk('graft', null, 2, 0.8, 3), bn = mk('platinum', null, 18, 0.9, 4), nd = mk('steel', null, 2, 0.8, 4);
    this.shaft = sh.buf; this.bend = bd.buf; this.tip = tp.buf; this.lens = ln.buf; this.capBuf = cp.buf; this.bandBuf = bn.buf; this.needleBuf = nd.buf;
    this.parts_ = { shaft: sh.part, bend: bd.part, tip: tp.part, lens: ln.part, cap: cp.part, band: bn.part, needle: nd.part };
    for (const b of [this.shaft, this.bend, this.tip, this.lens]) b.rings.forEach((r) => { r.r = R; });
    this.fanGeo.setAttribute('position', new BufferAttribute(new Float32Array(20 * 3), 3));
    this.fanGeo.setAttribute('color', new BufferAttribute(new Float32Array(20 * 4), 4));
    const idx: number[] = [];
    for (let i = 1; i < 19; i++) idx.push(0, i, i + 1);
    this.fanGeo.setIndex(idx);
    this.fanMesh = new Mesh(this.fanGeo, this.fanMat);
    this.fanMesh.renderOrder = 1000; this.fanMesh.frustumCulled = false; this.fanMesh.visible = false;
    this.group.add(this.fanMesh);
    this.group.visible = false;
    this.setTarget('pv');
  }

  /** Where the needle is aimed: the station's target on the figure (the left portal vein's near end, or the left hepatic vein). */
  private setTarget(station: 'pv' | 'hv'): void {
    const [id, f] = (EUS_TARGETS as unknown as Record<string, [string, number]>)[station]!;
    const path = (EDGE_PATH_2D as Record<string, P2[]>)[id]!;
    this.target = pointOn(path, f) as P2;
  }
  /** The glue slide's target: the varix, at its needle's point (EUS_GLUE_TARGET). */
  private setGlueTarget(): void {
    const [id, f] = EUS_GLUE_TARGET as unknown as [string, number];
    this.target = pointOn((EDGE_PATH_2D as Record<string, P2[]>)[id]!, f) as P2;
  }

  /** Lays the scope for the tip at `this.d`: the shaft along the way to where its bend starts, the bending section, the rigid tip with its lens, the ligator's cap or the needle and its sector. */
  private lay(): void {
    const way = this.way, R = len3(EUS_SCOPE_R as number), g = this.g, v = this.v, w = this.w, dv = this.dv;
    const D = this.d, eus = this.mode === 'eus' || this.mode === 'glue';
    const dA = Math.max(0, D - (EUS_RIGID as number));
    let end: P2, a1: P2, shaftEnd = dA, phi = 0, bendLen = 0, tipFrom: P2;
    if (eus) {
      const st = this.mode === 'glue' ? (EUS_GLUE_STATION as { exit: number; hand: number }) : (EUS_STATIONS as Record<string, { exit: number; hand: number }>)[this.station]!;
      eusPose(way, D, way.at, this.target, ease01(this.aim), st.exit, st.hand, g);
      end = g.end; a1 = g.a1; phi = g.phi; bendLen = g.bend; tipFrom = g.p2;
      // a scope still straight (the bend not begun) is the way itself to the rigid tip
      if (Math.abs(phi) > 1e-4 && bendLen > 0.01) shaftEnd = g.d0; else tipFrom = way.at(way, dA).p;
    } else {
      const e = way.at(way, D);
      end = e.p; a1 = e.t; tipFrom = way.at(way, dA).p;
    }
    // the shaft: the way's rings up to where the bend (or the rigid tip) begins
    way.pts.forEach((p, i) => { const r = this.shaft.rings[i]!; at3(p, r.c); const q = way.at(way, way.cum[i]!); dir3(q.t, r.t); });
    this.shaft.commit();
    const k = Math.max(0, Math.min(way.pts.length - 1, Math.floor(shaftEnd / STEP)));
    showRings(this.shaft.geometry, 0, k, this.shaft.radial);
    this.pose.shaftRings = k;
    // the bending section: BEND_N + 1 points walked from the way's own direction at its start, turning by phi across it (eus-scope.js bendWalk)
    const showBend = eus && bendLen > 0.01 && Math.abs(phi) > 1e-4;
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
    for (let i = 0; i < this.tip.n; i++) { const r = this.tip.rings[i]!, u = i / (this.tip.n - 1); r.c.lerpVectors(v, w, u); r.t.copy(dv); r.r = R * (i === this.tip.n - 1 ? 1.04 : 1.08); }
    this.tip.commit();
    const lensA = this.v.copy(w), lensB = this.w.copy(w).addScaledVector(dv, len3(0.6));
    this.lens.line(lensA, lensB, R * 0.8);
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
      const ex = at3(g.exit, this.v), nd = this.dv.set(g.nd[0], -g.nd[1], 0), len = len3(g.len);
      const tipPt = this.w.copy(ex).addScaledVector(nd, len * this.needle);
      this.needleBuf.line(ex.clone(), tipPt, len3(1.1));
      this.pose.needleEnd.copy(tipPt);
      // the sector: the fan from the array on the transducer's side, centred on the needle's line, 30 degrees either side (FAN_HALF), reaching a little past the target
      const apex = new Vector3(x3(g.end[0] - g.a1[0] * (EUS_RIGID as number) * 0.55 + g.side[0] * (EUS_SCOPE_R as number)), y3(g.end[1] - g.a1[1] * (EUS_RIGID as number) * 0.55 + g.side[1] * (EUS_SCOPE_R as number)), SCOPE_Z);
      const pos = this.fanGeo.getAttribute('position') as BufferAttribute, col = this.fanGeo.getAttribute('color') as BufferAttribute;
      const reach = len3(g.len + 14), ang0 = Math.atan2(nd.y, nd.x), half = (30 * RAD);
      pos.setXYZ(0, apex.x, apex.y, apex.z);
      for (let i = 0; i < 19; i++) { const a = ang0 - half + (2 * half * i) / 18; pos.setXYZ(i + 1, apex.x + Math.cos(a) * reach, apex.y + Math.sin(a) * reach, apex.z); }
      pos.needsUpdate = true; this.fanGeo.computeBoundingSphere();
      for (let i = 0; i < 20; i++) col.setW(i, i === 0 ? 0.3 : 0.04);
      col.needsUpdate = true;
    }
  }

  /** Steps the scope toward what is asked; true while it moves. `u` and `needleSet` override the scope's own pace (a pane that plays the steps). */
  update(dtMs: number, on: boolean, mode: ScopeMode, station: 'pv' | 'hv', u?: number, needleSet?: number, drive?: ScopeDrive): boolean {
    const dt = Math.max(0, dtMs) / 1000;
    let moving = false;
    if (mode !== this.mode || station !== this.station) {
      // another job or station: the needle goes in, the cap off, and the tip travels to the new place
      if (this.needle > 0.002 || this.cap > 0.002 && mode !== 'band') { this.needle = Math.max(0, this.needle - dt / 0.5); this.cap = mode === 'band' ? this.cap : Math.max(0, this.cap - dt / 0.3); this.lay(); return true; }
      this.mode = mode; this.station = station; if (mode === 'glue') this.setGlueTarget(); else this.setTarget(station); this.aim = 0; this.fan = 0; this.dirty = true;
      const w = mode === 'glue' ? this.glueWay : this.eusWay;
      if (w !== this.way) { this.way = w; this.d = 0; }
    }
    if (drive && this.gone > 0) this.restore();
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
    if (drive) { this.d = goal; this.aim = drive.aim; this.fan = drive.fan; this.needle = drive.needle; }
    moving = this.d !== was || this.aim !== a0 || this.fan !== f0 || this.needle !== n0 || this.cap !== c0;
    const vis = this.d > 0.5;
    this.group.visible = vis;
    if (vis && (moving || this.dirty)) {
      this.dirty = false;
      this.lay();
      const p = this.parts_;
      for (const o of this.parts) o.group.visible = true;
      p.bend.group.visible = eus && this.bendShown();
      p.cap.group.visible = this.cap > 0.002; if (this.cap > 0.002) { p.cap.setAlpha(this.cap * 0.55); p.band.setAlpha(this.cap); } else p.band.group.visible = false;
      p.needle.group.visible = eus && this.needle > 0.002;
      this.fanMesh.visible = eus && this.fan > 0.002; this.fanMat.opacity = this.fan;
    }
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
  private restore(): void { this.gone = 0; for (const o of this.parts) o.setFade(1); this.fanMat.opacity = this.fan; }
  private bendShown(): boolean { return Math.abs(this.g.phi) > 1e-4 && this.g.bend > 0.01; }

  applyPalette(p: Palette): void {
    for (const o of this.parts) o.applyPalette(p);
    const c = new Color(p.ink);
    const col = this.fanGeo.getAttribute('color') as BufferAttribute;
    for (let i = 0; i < 20; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
  }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.fanGeo.dispose(); this.fanMat.dispose(); }
}
void EUS_BEND_MIN;
