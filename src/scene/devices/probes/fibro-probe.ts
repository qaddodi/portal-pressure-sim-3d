// The FibroScan probe (2D stage-scan.js): a transducer on the skin at the upper outer edge of the organ the exam reads (the liver's top left, the spleen's upper right), turned 45 degrees down toward the organ
// (135 for the spleen, down and in), with a shear wave sent out of its tip three times a second: a soft arc that spreads and fades as it crosses the organ. The waves' pace follows the stiffness (steeper than
// linear: 35 px/s at 5 kPa, 240 at 25) so a stiff liver's fronts race and a healthy one's drift. Every number (shapes, turn, place on the organ, pace, colours) is the 2D app's, copied by script. The reading
// printed on the probe's screen is a label's work (the labels layer); the screen here is the probe's own orange display.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type Box3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { len3 } from '../../frame2d.ts';
import { SCAN } from './copied/scan-probe.copied.js';
import { ProbePart, TubeBuf, linePart } from './parts.ts';
import type { FibroOrgan } from './state.ts';

const RAD = Math.PI / 180;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** The front's speed in px/s for a stiffness (scanSpeed). */
export const waveSpeed = (kpa: number | null): number => SCAN.SPEED.base * (clamp(kpa ?? SCAN.SPEED.dflt, SCAN.SPEED.lo, SCAN.SPEED.hi) / SCAN.SPEED.ref) ** SCAN.SPEED.pow;
const ARC_RINGS = 14;

/** Where the tip stands on an organ's box (2D: fractions from its left and its top) and the direction the beam points, in the figure's plane. */
export function fibroPlace(box: Box3, organ: FibroOrgan, out: { tip: Vector3; dir: Vector3 } = { tip: new Vector3(), dir: new Vector3() }): { tip: Vector3; dir: Vector3 } {
  const [fx, fy] = SCAN.AT[organ] as [number, number], turn = (SCAN.TURN[organ] as number) * RAD;
  out.tip.set(box.min.x + (box.max.x - box.min.x) * fx, box.max.y - (box.max.y - box.min.y) * fy, box.max.z + 0.02);
  out.dir.set(Math.cos(turn), -Math.sin(turn), 0);   // (the 2D turn is clockwise on a y-down screen)
  return out;
}

export class FibroProbe {
  readonly group = new Group();
  readonly parts: ProbePart[] = [];
  private readonly bufs: TubeBuf[] = [];
  shown = 0;
  organ: FibroOrgan = 'liver';
  private placedOrgan: FibroOrgan | null = null;
  private readonly place = { tip: new Vector3(), dir: new Vector3() };
  private readonly body: TubeBuf; private readonly pad: TubeBuf; private readonly screen: TubeBuf; private readonly cable: TubeBuf;
  private readonly waves: { buf: TubeBuf; part: ProbePart; r: number }[] = [];
  private readonly beamGeo = new BufferGeometry();
  private readonly beamMat = new MeshBasicMaterial({ transparent: true, vertexColors: true, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly beam: Mesh;
  private fronts: number[] = [];
  private next = 0;
  private colour = new Color();
  private palette: Palette | null = null;
  private readonly a = new Vector3(); private readonly b = new Vector3();

  constructor(shared: CelShared) {
    const fixed = (organ: FibroOrgan) => SCAN.COLOUR[organ] as string;
    const mk = (tone: Parameters<typeof linePart>[1], colour: Parameters<typeof linePart>[2], rings: number, px: number, order: number) => {
      const { part, buf } = linePart(shared, tone, colour, rings, px, order);
      this.parts.push(part); this.bufs.push(buf); this.group.add(part.group);
      return { part, buf };
    };
    this.body = mk('poly', null, 6, 1, 2).buf;
    this.pad = mk('steel', null, 3, 0.9, 3).buf;
    this.screen = mk('marker', () => fixed(this.organ), 2, 0.7, 4).buf;
    this.cable = mk('steel', null, 2, 0.8, 1).buf;
    for (let i = 0; i < SCAN.N; i++) {
      const { part, buf } = mk('marker', () => fixed(this.organ), ARC_RINGS, 0.6, 5);
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

  /** The box of the organ the exam reads, and where its probe stands: laid on the figure once per organ. */
  private lay(box: Box3): void {
    fibroPlace(box, this.organ, this.place);
    const { tip, dir } = this.place, S = (n: number) => len3(n);
    const [tx] = SCAN.TIP as [number, number];
    // the body: a rounded transducer from 76 px behind the tip to 8 px; the frame's x runs along the axis from its left edge, the tip at TIP[0]
    const [bx, , bw, bh] = SCAN.BODY as [number, number, number, number, number];
    const u0 = bx - tx, u1 = bx + bw - tx, R = bh / 2;
    const prof: [number, number][] = [[u0, R * 0.5], [u0 + 2, R * 0.92], [u0 + 7, R], [u1 - 7, R], [u1 - 2, R * 0.92], [u1, R * 0.6]];
    prof.forEach(([u, r], i) => { const g = this.body.rings[i]!; g.c.copy(tip).addScaledVector(dir, S(u)); g.t.copy(dir); g.r = S(r); });
    this.body.commit();
    const [px0, , pw, ph] = SCAN.PAD as [number, number, number, number, number];
    [[px0 - tx, ph / 2 * 0.7], [px0 - tx + pw / 2, ph / 2], [px0 - tx + pw, ph / 2 * 0.7]].forEach(([u, r], i) => { const g = this.pad.rings[i]!; g.c.copy(tip).addScaledVector(dir, S(u!)); g.t.copy(dir); g.r = S(r!); });
    this.pad.commit();
    // the probe's own display along its axis, on the face toward the viewer
    const [sx, , sw, sh] = SCAN.SCREEN as [number, number, number, number, number];
    const lift = S(R * 0.9);
    this.screen.line(this.a.copy(tip).addScaledVector(dir, S(sx - tx)).setZ(tip.z + lift), this.b.copy(tip).addScaledVector(dir, S(sx + sw - tx)).setZ(tip.z + lift), S(sh / 2 * 0.8));
    // the cable: a short stub behind the body (the path's two ends are on the axis)
    const nn = (SCAN.CABLE as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
    this.cable.line(this.a.copy(tip).addScaledVector(dir, S(nn[0]! - tx)), this.b.copy(tip).addScaledVector(dir, S(nn[nn.length - 2]! - tx)), S(1.5));
    // the beam: a sector of radius SPAN either side of the axis, faint at the tip and gone at its rim
    const pos = this.beamGeo.getAttribute('position') as BufferAttribute, col = this.beamGeo.getAttribute('color') as BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z); col.setXYZW(0, 1, 1, 1, 0.22);
    for (let i = 0; i < ARC_RINGS; i++) {
      const a = -SCAN.HALF + (2 * SCAN.HALF * i) / (ARC_RINGS - 1), c = Math.cos(a), s = Math.sin(a);
      const dx = dir.x * c - dir.y * s, dy = dir.x * s + dir.y * c, R2 = S(SCAN.SPAN);
      pos.setXYZ(i + 1, tip.x + dx * R2, tip.y + dy * R2, tip.z);
      col.setXYZW(i + 1, 1, 1, 1, 0);
    }
    pos.needsUpdate = col.needsUpdate = true; this.beamGeo.computeBoundingSphere();
    for (const w of this.waves) w.r = -1;
    this.fronts = []; this.next = 0;
    this.colour.set(SCAN.COLOUR[this.organ] as string);
    this.applyColour();
    if (this.palette) for (const o of this.parts) o.applyPalette(this.palette);
  }
  private applyColour(): void {
    const c = this.colour, col = this.beamGeo.getAttribute('color') as BufferAttribute;
    for (let i = 0; i <= ARC_RINGS; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
    this.beamMat.needsUpdate = true;
  }

  /** One front at radius r px: an arc of the beam's half angle about the axis. */
  private layArc(w: { buf: TubeBuf; part: ProbePart; r: number }, rPx: number, alpha: number): void {
    const { tip, dir } = this.place, R = len3(rPx);
    for (let i = 0; i < ARC_RINGS; i++) {
      const a = -SCAN.HALF + (2 * SCAN.HALF * i) / (ARC_RINGS - 1), c = Math.cos(a), s = Math.sin(a), g = w.buf.rings[i]!;
      const dx = dir.x * c - dir.y * s, dy = dir.x * s + dir.y * c;
      g.c.set(tip.x + dx * R, tip.y + dy * R, tip.z); g.t.set(-dy, dx, 0); g.r = len3(1.1);
    }
    w.buf.commit(); w.part.setAlpha(alpha);
  }

  /** Steps the probe: eases in or out, moves to the other organ by easing out and in, and sends its waves. `box(organ)` is the organ's box in the figure (null while it is not built); `kpa` the stiffness it reads. True while anything moves. */
  update(dtMs: number, nowMs: number, on: boolean, organ: FibroOrgan, box: (o: FibroOrgan) => Box3 | null, kpa: number | null): boolean {
    let want = on ? 1 : 0;
    if (on && this.placedOrgan && organ !== this.placedOrgan && this.shown > 0.001) want = 0;
    if (this.shown <= 0.001 && want === 1 && organ !== this.placedOrgan) {
      const b = box(organ);
      if (b) { this.organ = organ; this.placedOrgan = organ; this.lay(b); } else want = 0;
    }
    const k = 1 - Math.exp(-Math.max(0, dtMs) / 90), prev = this.shown;
    this.shown += (want - this.shown) * k;
    if (Math.abs(want - this.shown) < 0.004) this.shown = want;
    const vis = this.shown > 0.002;
    if (this.shown !== prev) {
      this.group.visible = vis;
      for (const o of this.parts) { o.group.visible = vis; if (vis && !this.waves.some((w) => w.part === o)) o.setAlpha(this.shown); }
      this.beam.visible = vis; this.beamMat.opacity = this.shown;
    }
    if (!vis) { this.fronts = []; return this.shown !== prev; }
    // the shear wave: a front every EVERY seconds; each spreads at the pace the stiffness gives and fades by the time it has crossed `span`
    const v = waveSpeed(kpa), span = clamp(v * 2.5, 70, SCAN.SPAN), dt = dtMs / 1000;
    if (nowMs >= this.next) { this.fronts.push(SCAN.GAP); this.next = nowMs + SCAN.EVERY * 1000; }
    for (let i = 0; i < this.fronts.length; i++) this.fronts[i]! += v * dt;
    this.fronts = this.fronts.filter((r) => r < span).slice(-SCAN.N);
    this.waves.forEach((w, i) => {
      const r = this.fronts[i];
      if (r == null) { w.part.group.visible = false; return; }
      w.part.group.visible = true;
      this.layArc(w, r, this.shown * (1 - r / span) * 0.95);
    });
    return true;
  }

  applyPalette(p: Palette): void { this.palette = p; for (const o of this.parts) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.parts) o.setPhone(phone); }
  /** The tip and the beam's direction as laid now (for tests and tags). */
  get placement(): { tip: Vector3; dir: Vector3 } { return this.place; }
  dispose(): void { for (const o of this.parts) o.dispose(); for (const b of this.bufs) b.geometry.dispose(); this.beamGeo.dispose(); this.beamMat.dispose(); }
}
