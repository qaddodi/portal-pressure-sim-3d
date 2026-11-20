// The FibroScan probe (2D stage-scan.js): a transducer on the skin at the upper outer edge of the organ the exam reads (the liver's top left, the spleen's upper right), turned 45 degrees down toward the organ
// (135 for the spleen, down and in), with a shear wave sent out of its tip three times a second: a soft arc that spreads and fades as it crosses the organ. The waves' pace follows the stiffness (steeper than
// linear: 35 px/s at 5 kPa, 240 at 25) so a stiff liver's fronts race and a healthy one's drift. Every number (shapes, turn, place on the organ, pace, colours) is the 2D app's, copied by script.
//
// The probe is a screen-sized thing in 2D (a 220 px frame at any zoom), and it keeps itself on the screen there (fibro-place.ts, scanTurn): steeper where its body would run off the left edge, flatter under the
// top bar, away from a slide's card, and its head and cable fade where a card covers them (the waves stay). With a screen (the scene's) it does all of that on the screen's pixels and writes the result back on the
// plate through the figure's own map at the tip; without one (node tests) it keeps the 2D numbers at the figure's scale. The reading printed on the probe's screen and the callout beside it are the labels'
// work (scene/labels/probe-labels.ts); the screen here is the probe's own orange display.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type Box3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { len3 } from '../../frame2d.ts';
import type { OrganEdge } from './fibro-place.ts';
import { SCAN } from './copied/scan-probe.copied.js';
import { ProbePart, TubeBuf, linePart, type PartStyle } from './parts.ts';
import { ArriveTrack } from './ease-track.ts';
import { D_SMALL, D_SURFACE, EASE_MOVE, cssCurve } from '../../../ui/tests/copied/motion.copied.js';
import { LOOKS } from '../../../looks/looks.ts';
import { SCAN_BODY_PX, mixHex } from '../edges.ts';
import { basisAt, newBasis, toPlate, type Basis, type Box, type ScreenEnv } from './screen.ts';
import { headCovered, scanTilt, scanTurnOf } from './fibro-place.ts';
import type { FibroOrgan } from './state.ts';

const RAD = Math.PI / 180;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** The front's speed in px/s for a stiffness (scanSpeed). */
export const waveSpeed = (kpa: number | null): number => SCAN.SPEED.base * (clamp(kpa ?? SCAN.SPEED.dflt, SCAN.SPEED.lo, SCAN.SPEED.hi) / SCAN.SPEED.ref) ** SCAN.SPEED.pow;
const ARC_RINGS = 14;
/** A packet: a ripple, the crest, a ripple. Each arc's half width in px and its stroke opacity (app-06-plate.css .sp-rip 1.4 px at .35, .sp-front 2.2 px at .95). */
export const WAVE_ARCS = 3;
export const WAVE_HALF_PX = [0.7, 1.1, 0.7] as const, WAVE_STROKE_A = [0.35, 0.95, 0.35] as const;
/** A packet's opacity by how far it has gone of its span (stage-scan.js scanTick): in from nothing, full in the middle, away again, a little less the further it is. */
export const fadeOf = (u: number): number => Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04)) ** 1.2 * (1 - u * 0.35);
/** The whole probe fades in and out over D_SURFACE (420 ms) and its head and cable over D_SMALL (240 ms), each on the arrive curve (2D: scanEase op, headOp, cableOp; app-06-plate.css .scan-probe). */
export const SCAN_FADE_MS = D_SURFACE, HEAD_MS = D_SMALL;
/** How far the body's fill is moved toward its line's colour (--text-2), a share. */
export const BODY_LIFT = 0.12;
/** The tip's tap (app-06-plate.css @keyframes sp-tap, scan-ease.js scanStep): once a second the pad moves along the probe's axis, 0, +2, -1.2, +0.6, 0 px at 0, 20, 45, 70, 100 % of D_SURFACE, each leg on --ease-move. */
export const TAP_O = [0, 0.2, 0.45, 0.7, 1] as const, TAP_V = [0, 2, -1.2, 0.6, 0] as const, TAP_EVERY_MS = 1000;
const tapCurve = cssCurve(EASE_MOVE) as (x: number) => number;
/** The pad's offset along the axis (px) at progress p (0 to 1) of a tap. */
export function tapAt(p: number): number {
  if (!(p > 0) || p >= 1) return 0;
  let i = 0;
  while (i < TAP_O.length - 2 && p >= TAP_O[i + 1]!) i++;
  return TAP_V[i]! + (TAP_V[i + 1]! - TAP_V[i]!) * tapCurve((p - TAP_O[i]!) / (TAP_O[i + 1]! - TAP_O[i]!));
}
/** The turn eases over D_SURFACE (2D: scanEase ang). */
const TURN_TAU = 0.14;

/** Where the tip stands on an organ's box (2D: fractions from its left and its top) and the direction the beam points, in the figure's plane. */
export function fibroPlace(box: Box3, organ: FibroOrgan, out: { tip: Vector3; dir: Vector3 } = { tip: new Vector3(), dir: new Vector3() }, edge: OrganEdge | null = null): { tip: Vector3; dir: Vector3 } {
  const [fx, fy] = SCAN.AT[organ] as [number, number], turn = (SCAN.TURN[organ] as number) * RAD;
  out.tip.set(box.min.x + (box.max.x - box.min.x) * fx, box.max.y - (box.max.y - box.min.y) * fy, box.max.z + 0.02);
  out.dir.set(Math.cos(turn), -Math.sin(turn), 0);   // (the 2D turn is clockwise on a y-down screen)
  // The 2D point is a fraction of the organ's outline box, which is on the outline there; a fraction of the 3D mesh's box is not (the mesh is inflated, scaled, a different shape). The tip is the silhouette on the
  // line through that point along the probe's aim: on the organ's edge, the beam going in.
  if (edge && edge(organ, out.tip, out.dir, SNAP)) { out.tip.copy(SNAP); out.tip.z += 0.02; }
  return out;
}
const SNAP = new Vector3();

export class FibroProbe {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  private readonly bufs: TubeBuf[] = [];
  shown = 0;
  organ: FibroOrgan = 'liver';
  private placedOrgan: FibroOrgan | null = null;
  private readonly place = { tip: new Vector3(), dir: new Vector3() };
  private readonly again = { tip: new Vector3(), dir: new Vector3() };
  private readonly padAx = new Vector3(); private readonly padDir = new Vector3(); private padS = 1;
  /** the tap: when the next one is due and when this one began (ms), and the pad's offset along the axis now (px) */
  private nextTap = 0; private tapT0 = -1; tipX = 0;
  private readonly body: TubeBuf; private readonly pad: TubeBuf; private readonly screen: TubeBuf; private readonly cable: TubeBuf;
  /** SCAN.N packets of three arcs each (2D .sp-pk: a ripple ahead, the crest, a ripple behind), WAVE_ARCS per packet */
  private readonly waves: { buf: TubeBuf; part: ProbePart; r: number }[] = [];
  private readonly beamGeo = new BufferGeometry();
  private readonly beamMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly beam: Mesh;
  private fronts: number[] = [];
  private next = 0;
  private colour = new Color();
  private palette: Palette | null = null;
  private readonly a = new Vector3(); private readonly b = new Vector3(); private readonly ax = new Vector3(); private readonly pv = new Vector3();
  private readonly headPartsList: ProbePart[] = [];
  // the screen
  private readonly B: Basis = newBasis();
  private U = len3(1);
  private turn = 0; private turnGoal = 0; private headGoal = 1; private headAt = 0; private shapeKey = '';
  /** the probe's fade, and its head's and cable's, each eased as 2D's are (ArriveTrack) */
  private readonly opT = new ArriveTrack(0); private readonly headT = new ArriveTrack(1);
  private get headOp(): number { return this.headT.value; }
  /** the tilt below the level the probe stands at (2D scan.deg) and its turn on the screen (scan.turn), degrees */
  deg = 45;
  /** the tip on the screen now (px), the probe's turn there (degrees clockwise from +x, y down), and its body's box: what the reading's labels stand by */
  readonly screenAt = { x: 0, y: 0, turn: 45, placed: false, headOp: 1 };
  /** the stiffness the probe's screen reads (kPa), eased to the model's over 0.6 s as 2D scan.k is; null before the model has one */
  reading: number | null = null;

  constructor(shared: CelShared) {
    const fixed = (organ: FibroOrgan) => SCAN.COLOUR[organ] as string;
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number, head = false, style: PartStyle = {}) => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order, style);
      this.parts.push(part); this.bufs.push(buf); this.group.add(part.group);
      if (head) this.headPartsList.push(part);
      return { part, buf };
    };
    // the body, its pad, its screen and its cable are the head (they fade where a card covers them); the waves and the beam are not
    // The materials are 2D's (app-06-plate.css .scan-probe): the body in the look's surface under a 1.6 px line in --text-2 (the line sits half inside the fill: `fat`), the tip --text-2 and the cable --text-3, no outline
    // on either, the screen and the waves in the exam's own colour, no outline. Not the look's ink.
    // (Flat, not cel-banded: a banded surface colour is a black band on the dark looks (owner, 20 Nov 2026: "the fibroscan probe shading is too strong black"), and 2D's body is one flat fill. It is lifted a little
    //  toward its line's colour, so it reads as the probe's own body and not as a hole in the figure.)
    this.body = mk('poly', (_t, look) => mixHex(LOOKS[look].card, LOOKS[look].text2, BODY_LIFT), 6, SCAN_BODY_PX, 2, true, { edge: { colour: ({ look }) => LOOKS[look].text2 }, fat: -SCAN_BODY_PX / 2, flat: true, spec: 0 }).buf;
    this.pad = mk('steel', (_t, look) => LOOKS[look].text2, 3, 0.9, 3, true, { edge: 'none', flat: true, spec: 0 }).buf;
    this.screen = mk('marker', () => fixed(this.organ), 2, 0.7, 4, true, { edge: 'none', flat: true, spec: 0 }).buf;
    this.cable = mk('steel', (_t, look) => LOOKS[look].text3, 2, 0.8, 1, true, { edge: 'none', flat: true, spec: 0 }).buf;
    // The waves are 2D's packets (app-06-plate.css .sp-rip, .sp-front: strokes in the exam's colour, never filled, no outline, no highlight): the crest 2.2 px at .95, the ripples 1.4 px at .35, each arc see-through
    // at the packet's own opacity (fadeOf), so the organ and the vessels show through them.
    for (let i = 0; i < SCAN.N * WAVE_ARCS; i++) {
      const { part, buf } = mk('marker', () => fixed(this.organ), ARC_RINGS, 0.6, 5, false, { edge: 'none', flat: true, fat: 0, spec: 0 });
      this.waves.push({ buf, part, r: -1 });
    }
    const pos = new Float32Array((ARC_RINGS + 1) * 3), col = new Float32Array((ARC_RINGS + 1) * 4);
    this.beamGeo.setAttribute('position', new BufferAttribute(pos, 3));
    this.beamGeo.setAttribute('color', new BufferAttribute(col, 4));
    const idx: number[] = [];
    for (let i = 1; i < ARC_RINGS; i++) idx.push(0, i, i + 1);
    this.beamGeo.setIndex(idx);
    this.beam = new Mesh(this.beamGeo, this.beamMat);
    this.beam.renderOrder = 1000; this.beam.frustumCulled = false; this.beam.visible = false;
    this.group.add(this.beam);
    this.group.visible = false;
  }

  /** A direction on the screen (degrees clockwise from +x, y down) as the plate's vector per px there: the legacy figure scale has none (the probe's own turn is the plate's direction). */
  private vec(deg: number, out: Vector3, env: ScreenEnv | null): Vector3 {
    if (env) { toPlate(this.B, Math.cos(deg * RAD), Math.sin(deg * RAD), out); out.z = 0; return out.multiplyScalar(1); }
    return out.set(Math.cos(deg * RAD), -Math.sin(deg * RAD), 0).multiplyScalar(this.U);
  }

  /** The probe's shapes along its axis from the tip and the beam's sector, for the tip, the turn and the scale now. */
  private shape(env: ScreenEnv | null): void {
    const { tip } = this.place, U = this.U, S = (n: number) => n * U, ax = this.vec(this.turn, this.ax, env);
    const dir = this.pv.copy(ax).normalize();
    this.place.dir.copy(dir);
    const [tx] = SCAN.TIP as [number, number];
    // the body: a rounded transducer from 76 px behind the tip to 8 px; the frame's x runs along the axis from its left edge, the tip at TIP[0]
    const [bx, , bw, bh] = SCAN.BODY as [number, number, number, number, number];
    const u0 = bx - tx, u1 = bx + bw - tx, R = bh / 2;
    const along = (u: number, o: Vector3): Vector3 => o.copy(tip).addScaledVector(ax, u);
    const prof: [number, number][] = [[u0, R * 0.5], [u0 + 2, R * 0.92], [u0 + 7, R], [u1 - 7, R], [u1 - 2, R * 0.92], [u1, R * 0.6]];
    prof.forEach(([u, r], i) => { const g = this.body.rings[i]!; along(u, g.c); g.t.copy(dir); g.r = S(r); });
    this.body.commit();
    this.padAx.copy(ax); this.padDir.copy(dir); this.padS = U;
    this.layPad();
    // the probe's own display along its axis, on the face toward the viewer
    const [sx, , sw, sh] = SCAN.SCREEN as [number, number, number, number, number];
    const lift = S(R * 0.9);
    this.screen.line(along(sx - tx, this.a).setZ(tip.z + lift), along(sx + sw - tx, this.b).setZ(tip.z + lift), S(sh / 2 * 0.8));
    // the cable: a short stub behind the body (the path's two ends are on the axis)
    const nn = (SCAN.CABLE as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
    this.cable.line(along(nn[0]! - tx, this.a), along(nn[nn.length - 2]! - tx, this.b), S(1.5));
    // the beam: a sector of radius SPAN either side of the axis, faint at the tip and gone at its rim
    const pos = this.beamGeo.getAttribute('position') as BufferAttribute, col = this.beamGeo.getAttribute('color') as BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z); col.setW(0, 0.22);
    for (let i = 0; i < ARC_RINGS; i++) {
      const a = (-SCAN.HALF + (2 * SCAN.HALF * i) / (ARC_RINGS - 1)) / RAD, d = this.vec(this.turn + a, this.a, env).multiplyScalar(SCAN.SPAN);
      pos.setXYZ(i + 1, tip.x + d.x, tip.y + d.y, tip.z);
      col.setW(i + 1, 0);
    }
    pos.needsUpdate = col.needsUpdate = true; this.beamGeo.computeBoundingSphere();
  }

  /** The pad (2D .sp-tip) along the axis, `tipX` px along it: the tap moves only this. */
  private layPad(): void {
    const { tip } = this.place, [px0, , pw, ph] = SCAN.PAD as [number, number, number, number, number], [tx] = SCAN.TIP as [number, number], S = this.padS, X = this.tipX;
    [[px0 - tx, ph / 2 * 0.7], [px0 - tx + pw / 2, ph / 2], [px0 - tx + pw, ph / 2 * 0.7]].forEach(([u, r], i) => { const g = this.pad.rings[i]!; g.c.copy(tip).addScaledVector(this.padAx, u! + X); g.t.copy(this.padDir); g.r = S * r!; });
    this.pad.commit();
  }

  /** The box of the organ the exam reads, and where its probe stands: laid on the figure once per organ. */
  private anchor(box: Box3, edge: OrganEdge | null): void {
    fibroPlace(box, this.organ, this.place, edge);
    for (const w of this.waves) w.r = -1;
    this.fronts = []; this.next = 0; this.shapeKey = '';
    this.colour.set(SCAN.COLOUR[this.organ] as string);
    const col = this.beamGeo.getAttribute('color') as BufferAttribute, c = this.colour;
    for (let i = 0; i <= ARC_RINGS; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
    this.beamMat.needsUpdate = true;
    if (this.palette) for (const o of this.parts) o.applyPalette(this.palette);
  }

  /** One front at radius r px: an arc of the beam's half angle about the axis. */
  private layArc(w: { buf: TubeBuf; part: ProbePart; r: number }, rPx: number, alpha: number, env: ScreenEnv | null, halfPx: number): void {
    const { tip } = this.place;
    for (let i = 0; i < ARC_RINGS; i++) {
      const a = (-SCAN.HALF + (2 * SCAN.HALF * i) / (ARC_RINGS - 1)) / RAD, g = w.buf.rings[i]!;
      const d = this.vec(this.turn + a, this.a, env).multiplyScalar(rPx);
      g.c.set(tip.x + d.x, tip.y + d.y, tip.z);
      // the front's tangent is square to its radius
      const n = this.vec(this.turn + a + 90, this.b, env).normalize();
      g.t.copy(n); g.r = this.U * halfPx;
    }
    w.buf.commit(); w.part.setAlpha(alpha);
  }

  /** Steps the probe: eases in or out, moves to the other organ by easing out and in, and sends its waves. `box(organ)` is the organ's box in the figure (null while it is not built); `kpa` the stiffness it reads.
   *  `env`: the screen (the scene's), for its turn, its head and its size. True while anything moves. */
  update(dtMs: number, nowMs: number, on: boolean, organ: FibroOrgan, box: (o: FibroOrgan) => Box3 | null, kpa: number | null, env: ScreenEnv | null = null, edge: OrganEdge | null = null): boolean {
    let want = on ? 1 : 0;
    if (on && this.placedOrgan && organ !== this.placedOrgan && this.shown > 0.001) want = 0;
    if (this.shown <= 0.001 && want === 1 && organ !== this.placedOrgan) {
      const b = box(organ);
      if (b) { this.organ = organ; this.placedOrgan = organ; this.anchor(b, edge); this.turn = this.turnGoal = SCAN.TURN[organ] as number; this.deg = 45; this.headT.set(1); this.headGoal = 1; } else want = 0;
    }
    const prev = this.shown;
    this.opT.go(want, SCAN_FADE_MS, nowMs);
    this.opT.step(nowMs);
    this.shown = this.opT.value;
    const vis = this.shown > 0.002;
    let moving = this.shown !== prev || this.opT.running;
    if (this.shown !== prev) {
      this.group.visible = vis;
      for (const o of this.parts) { o.group.visible = vis; if (vis && !this.waves.some((w) => w.part === o) && !this.headPartsList.includes(o)) o.setAlpha(this.shown); }
      this.beam.visible = vis; this.beamMat.opacity = this.shown;
    }
    this.screenAt.placed = vis;
    if (!vis) { this.fronts = []; this.reading = null; this.nextTap = 0; this.tapT0 = -1; this.tipX = 0; return moving; }
    // The tip stays on the organ's edge as the organ changes (a spleen that grows, a liver that shrinks): found again from the organ now, the tip following its edge.
    if (edge && this.placedOrgan) {
      const b = box(this.organ);
      if (b) {
        fibroPlace(b, this.organ, this.again, edge);
        if (this.again.tip.distanceToSquared(this.place.tip) > 1e-10) { this.place.tip.copy(this.again.tip); this.shapeKey = ''; moving = true; }
      }
    }
    if (kpa != null && Number.isFinite(kpa)) {
      const was = this.reading;
      this.reading = was == null || (env?.reduceMotion?.() ?? false) ? kpa : was + (kpa - was) * (1 - Math.exp(-Math.max(0, dtMs) / 1000 / 0.6));
      if (Math.abs(this.reading - kpa) < 0.005) this.reading = kpa;
    }
    // where it stands on the screen and how it turns there
    const spleen = this.organ === 'spleen', dt = Math.max(0, dtMs) / 1000;
    if (env) {
      const B = basisAt(env, this.place.tip, this.B);
      this.U = 1 / B.sc;
      const size = env.size();
      // (a slide's cards turn it only while a slide is presenting; its head fades under any card: 2D scanCards, scanHead)
      const cards: readonly Box[] = env.cards();
      const deg = scanTilt(B.ox, B.oy, spleen, size.w, env.presenting?.() ? cards : []);
      this.deg = deg; this.turnGoal = scanTurnOf(deg, spleen);
      const df = ((this.turnGoal - this.turn + 540) % 360) - 180;
      if (Math.abs(df) > 0.05) { this.turn += df * (1 - Math.exp(-dt / TURN_TAU)); moving = true; } else this.turn = this.turnGoal;
      // the head looks again four times a second
      if (!(nowMs < this.headAt)) { this.headAt = nowMs + 250; this.headGoal = headCovered(B.ox, B.oy, this.turnGoal, cards) ? 0 : 1; }
      this.headT.go(this.headGoal, HEAD_MS, nowMs);
      if (this.headT.step(nowMs)) moving = true;
      this.screenAt.x = B.ox; this.screenAt.y = B.oy; this.screenAt.turn = this.turn; this.screenAt.headOp = this.headOp;
    } else { this.U = len3(1); this.turn = this.turnGoal = SCAN.TURN[this.organ] as number; this.screenAt.turn = this.turn; }
    const key = `${this.U.toFixed(6)}|${this.turn.toFixed(2)}|${this.B.a.toFixed(3)}|${this.B.b.toFixed(3)}|${this.B.c.toFixed(3)}|${this.B.d.toFixed(3)}`;
    if (key !== this.shapeKey) { this.shapeKey = key; this.shape(env); }
    for (const o of this.headPartsList) { const a = this.shown * this.headOp; if (a > 0.002) o.setAlpha(a); o.group.visible = a > 0.002; }
    // the tip's tap, once a second from the first frame the probe shows: only the pad moves, a little, along the probe's own axis (2D scanTick / scanStep; none with Reduce Motion)
    if (env?.reduceMotion?.()) { this.tapT0 = -1; }
    else {
      if (!(nowMs < this.nextTap)) { this.nextTap = this.nextTap && nowMs - this.nextTap < 250 ? this.nextTap + TAP_EVERY_MS : nowMs + TAP_EVERY_MS; this.tapT0 = nowMs; }
    }
    const tx = this.tapT0 >= 0 ? tapAt((nowMs - this.tapT0) / D_SURFACE) : 0;
    if (this.tapT0 >= 0 && nowMs - this.tapT0 >= D_SURFACE) this.tapT0 = -1;
    if (tx !== this.tipX) { this.tipX = tx; this.layPad(); }
    // the shear wave: a front every EVERY seconds; each spreads at the pace the stiffness gives and fades by the time it has crossed `span`
    const v = waveSpeed(kpa), span = clamp(v * 2.5, 70, SCAN.SPAN);
    if (nowMs >= this.next) { this.fronts.push(0); this.next = nowMs + SCAN.EVERY * 1000; }   // (a front starts at the tip: 2D scan.fronts.push(0); SCAN.GAP is the ripples' widest gap)
    for (let i = 0; i < this.fronts.length; i++) this.fronts[i]! += v * dt;
    this.fronts = this.fronts.filter((r) => r < span).slice(-SCAN.N);
    // (the ripples tighten when fronts are close, so neighbours never merge: 2D gap)
    const gap = clamp(v * SCAN.EVERY * 0.4, 2, SCAN.GAP);
    this.waves.forEach((w, i) => {
      const pk = Math.floor(i / WAVE_ARCS), j = i % WAVE_ARCS, r = this.fronts[pk];
      if (r == null) { w.part.group.visible = false; return; }
      w.part.group.visible = true;
      this.layArc(w, Math.max(1, r + (j - 1) * gap), this.shown * fadeOf(r / span) * WAVE_STROKE_A[j]!, env, WAVE_HALF_PX[j]!);
    });
    return true;
  }

  applyPalette(p: Palette): void { this.palette = p; for (const o of this.parts) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  /** The tip and the beam's direction as laid now (for tests and tags). */
  get placement(): { tip: Vector3; dir: Vector3 } { return this.place; }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.beamGeo.dispose(); this.beamMat.dispose(); }
}
