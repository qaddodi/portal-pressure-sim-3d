// The paracentesis needle: a slim, pale needle with a light hub and a drain line, through the abdominal wall into the ascites (the abdomen's outline as it is drawn now, which bulges with the volume), in on the
// procedure's clock (instrument-frames.ts paracentesisAt) and drawn out again. Devices are light, never dark-shaded: the catheters' pale polymer and a hair-fine outline. It comes and goes by `show`, so it fades.
import { Group, Vector3 } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { TIER_Z, x3, y3, UNITS_PER_SCENE } from '../frame2d.ts';
import { DeviceObject } from './device-object.ts';
import { DEVICE_SIDES, WIRE_SIDES, allocTube, makeRings, writeRings } from './tube-rings.ts';
import { bulgeStep, polyOf } from '../disease/ascites-pool.ts';

const U = UNITS_PER_SCENE;
const SHAFT_N = 8, HUB_N = 5, LINE_N = 14, STREAM_N = 16, RIPPLE_N = 33;
/** 2D units: the needle's radius, the hub's, the drain line's; the length of the shaft and of the hub; how far outside the wall the tip waits and how far inside the ascites it ends; the line's reach. */
export const NEEDLE = { r: 1.1, hubR: 3.4, lineR: 1.5, shaft: 120, hub: 20, outside: 50, inside: 80, line: 90 } as const;
/** The fluid that drains (approved 24 Nov 2026, Ascites 13, mock B "thin tapered stream with a soft ripple": docs/approved/ascites-stream.md): an amber core inside the drain line, a thin stream falling from its tip that thins as it falls,
 *  and a flat ripple where it lands. 2D units: the core's radius; the stream's radius at the tip and at its foot, and its length; the ripple's half width and half height, and its line's radius. */
export const FLUID = { coreR: 0.85, streamTop: 2.4, streamFoot: 1.1, length: 100, ripple: [15, 2.7] as const, rippleR: 0.5 } as const;
/** Down the lower belly on the figure's right flank (where the wall is crossed), pointing in and a little up. */
const ENTRY_Y = 0.5, DIR: [number, number] = (() => { const l = Math.hypot(-1, -0.28); return [-1 / l, -0.28 / l]; })();

export interface NeedlePath { wall: [number, number]; dir: [number, number] }
/** Where the needle crosses the abdominal wall for a volume (mL): the wall's outermost point on the figure's right at the lower belly, and the way the needle points. Pure. */
export function needleEntry(ml: number): NeedlePath {
  const poly = polyOf(bulgeStep(ml));
  let y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const y = y0 + ENTRY_Y * (y1 - y0);
  let x = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xa, ya] = poly[j]!, [xb, yb] = poly[i]!;
    if ((ya <= y && y < yb) || (yb <= y && y < ya)) x = Math.max(x, xa + ((y - ya) / (yb - ya)) * (xb - xa));
  }
  return { wall: [x, y], dir: DIR };
}

export class ParacentesisNeedle {
  readonly group = new Group();
  readonly shaft: DeviceObject; readonly hub: DeviceObject; readonly line: DeviceObject;
  /** the amber fluid: a core in the drain line, the stream from its tip, the ripple where it lands */
  readonly core: DeviceObject; readonly stream: DeviceObject; readonly ripple: DeviceObject;
  readonly objects: DeviceObject[];
  /** how far in the needle is now (0 outside the skin, 1 in the ascites) */
  depth = 0;
  private ml = 0;
  /** the fluid's level (0 none, 1 flowing: it comes and goes by fading) and how far down the stream has reached (0 at the tip, 1 at the ripple) */
  private flow = 0; private reach = 0;
  private readonly coreRings = makeRings(LINE_N); private readonly streamRings = makeRings(STREAM_N); private readonly rippleRings = makeRings(RIPPLE_N);
  private readonly shaftRings = makeRings(SHAFT_N); private readonly hubRings = makeRings(HUB_N); private readonly lineRings = makeRings(LINE_N);
  private dirty = true;
  private readonly v = new Vector3();

  constructor(shared: CelShared) {
    this.shaft = new DeviceObject(allocTube(SHAFT_N, DEVICE_SIDES), 'poly', shared, { px: 0.7, order: 0, bands: 3, tubeTones: false, fat: 0.7 }, 'polyEdge');
    this.hub = new DeviceObject(allocTube(HUB_N, DEVICE_SIDES), 'nylon', shared, { px: 0.7, order: 1, bands: 3, tubeTones: false, fat: 0.5 }, 'polyEdge');
    this.line = new DeviceObject(allocTube(LINE_N, DEVICE_SIDES), 'poly', shared, { px: 0.7, order: 0, bands: 3, tubeTones: false, fat: 0.6 }, 'polyEdge');
    this.core = new DeviceObject(allocTube(LINE_N, WIRE_SIDES), 'latex', shared, { px: 0.5, order: 2, bands: 3, tubeTones: false, fat: 0 }, 'none');
    this.stream = new DeviceObject(allocTube(STREAM_N, WIRE_SIDES), 'latex', shared, { px: 0.5, order: 2, bands: 3, tubeTones: false, fat: 0.2 }, 'none');
    this.ripple = new DeviceObject(allocTube(RIPPLE_N, WIRE_SIDES), 'latex', shared, { px: 0.5, order: 2, bands: 3, tubeTones: false, fat: 0 }, 'none');
    this.objects = [this.shaft, this.hub, this.line, this.core, this.stream, this.ripple];
    for (const o of this.objects) { this.group.add(o.group); o.park(); }
  }
  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** The belly's volume now (mL): the wall the needle crosses follows it. */
  setBelly(ml: number): void { if (bulgeStep(ml) !== bulgeStep(this.ml)) { this.ml = ml; this.dirty = true; } else this.ml = ml; }

  /** Put the needle at a depth (0..1) and a level of opacity (the procedure's fade). True while it needs a frame. */
  set(depth: number, opacity: number, fluid: { on: number; reach: number } = { on: 0, reach: 0 }): void {
    const on = depth > 0.001;
    this.flow = fluid.on; this.reach = fluid.reach;
    if (on) { this.draw(depth); for (const o of [this.shaft, this.hub, this.line]) o.setAlpha(opacity); }
    for (const o of [this.shaft, this.hub, this.line]) o.show(on);
    const wet = on && fluid.on > 0.001;
    for (const o of [this.core, this.stream, this.ripple]) { if (wet) o.setAlpha(fluid.on * opacity); o.show(wet); }
    if (wet) this.stream.setReveal(Math.min(1, Math.max(0.02, fluid.reach)));
    this.depth = on ? depth : 0;
  }
  /** Redraw at the current depth when the wall moved (the belly drained). */
  update(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    if (this.depth > 0.001) this.draw(this.depth);
    return this.depth > 0.001;
  }
  clear(): void { this.set(0, 0, { on: 0, reach: 0 }); }

  private pt(x: number, y: number, out: Vector3): Vector3 { return out.set(x3(x), y3(y), TIER_Z.mid); }

  private draw(depth: number): void {
    const { wall, dir } = needleEntry(this.ml), [dx, dy] = dir;
    // the tip: `outside` beyond the wall (depth 0) to `inside` within it (depth 1), along the needle's line
    const along = -NEEDLE.outside + (NEEDLE.outside + NEEDLE.inside) * depth, tx = wall[0] + dx * along, ty = wall[1] + dy * along;
    const fill = (rings: ReturnType<typeof makeRings>, p0: [number, number], p1: [number, number], r: number, geo: DeviceObject): void => {
      const n = rings.length;
      for (let i = 0; i < n; i++) { const f = i / (n - 1), q = rings[i]!; this.pt(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, q.c); q.t.set(p1[0] - p0[0], -(p1[1] - p0[1]), 0).normalize(); q.r = r / U; }
      writeRings(geo.toonMesh.geometry, rings, DEVICE_SIDES);
    };
    const back: [number, number] = [tx - dx * NEEDLE.shaft, ty - dy * NEEDLE.shaft];
    fill(this.shaftRings, back, [tx, ty], NEEDLE.r, this.shaft);                       // (tail first: uv 0 at the hub end, 1 at the tip)
    const hubEnd: [number, number] = [back[0] - dx * NEEDLE.hub, back[1] - dy * NEEDLE.hub];
    fill(this.hubRings, hubEnd, back, NEEDLE.hubR, this.hub);
    // the drain line: out of the hub and drooping, in a curve (a quarter turn down)
    for (let i = 0; i < LINE_N; i++) {
      const f = i / (LINE_N - 1), q = this.lineRings[i]!, bx = hubEnd[0] - dx * NEEDLE.line * f * 0.9, by = hubEnd[1] - dy * NEEDLE.line * f * 0.9 + NEEDLE.line * 0.55 * f * f;
      this.pt(bx, by, q.c); q.r = NEEDLE.lineR / U;
    }
    for (let i = 0; i < LINE_N; i++) { const a = this.lineRings[Math.max(0, i - 1)]!, b = this.lineRings[Math.min(LINE_N - 1, i + 1)]!; this.lineRings[i]!.t.copy(b.c).sub(a.c).normalize(); }
    writeRings(this.line.toonMesh.geometry, this.lineRings, DEVICE_SIDES);
    // the fluid: a core along the drain line, the stream from its tip (down, thinning), the ripple under it
    if (this.flow > 0.001) {
      for (let i = 0; i < LINE_N; i++) { const q = this.coreRings[i]!, l = this.lineRings[i]!; q.c.copy(l.c); q.t.copy(l.t); q.r = FLUID.coreR / U; }
      writeRings(this.core.toonMesh.geometry, this.coreRings, WIRE_SIDES);
      const tip = this.lineRings[LINE_N - 1]!.c, ex = tip.x, ey = tip.y, drop = FLUID.length / U;
      for (let i = 0; i < STREAM_N; i++) { const f = i / (STREAM_N - 1), q = this.streamRings[i]!; q.c.set(ex, ey - drop * f, tip.z); q.t.set(0, -1, 0); q.r = (FLUID.streamTop + (FLUID.streamFoot - FLUID.streamTop) * f) / U; }
      writeRings(this.stream.toonMesh.geometry, this.streamRings, WIRE_SIDES);
      const [rx, ry] = FLUID.ripple, cy = ey - drop - ry / U;
      for (let i = 0; i < RIPPLE_N; i++) { const a = (i / (RIPPLE_N - 1)) * Math.PI * 2, q = this.rippleRings[i]!; q.c.set(ex + (Math.cos(a) * rx) / U, cy + (Math.sin(a) * ry) / U, tip.z); q.t.set(-Math.sin(a) * rx, Math.cos(a) * ry, 0).normalize(); q.r = FLUID.rippleR / U; }
      writeRings(this.ripple.toonMesh.geometry, this.rippleRings, WIRE_SIDES);
    }
    void this.v;
  }
  dispose(): void { for (const o of this.objects) o.dispose(); }
}
