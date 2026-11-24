// EUS-guided coils and glue (the 2D app's `eusglue`, proc-anim.js ENDO.eusglue; Baveno VIII 5.40): what the echoendoscope leaves in the fundal varix. The scope and its needle are the
// probes' (probes/scope.ts, 'glue' mode); this is the rest of what stage-cath.js and eus-scope.js draw: the coil pushed out of the needle's point that curls on inside the varix and stays
// (eus-scope.js layCoil, run as it is: its wire's centreline is read back from the vertices it lays), the cyanoacrylate cast that sets on the coil and then fills the lumen (an opaque plug in the
// glue's own material, stage-cath.js: first along the coil's span, then out to the spread each way), and the hit's two rings at the needle's point. All of it is laid on C2's own course (the short
// gastric feeder, EUS_GLUE_TARGET) and drawn as cel parts in the device materials, like the vein stent and the bands. It comes and goes with `procFrame('eusglue', t)`: coil, column, flash, opacity.
import { Group, Vector3, type BufferGeometry } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { TIER_Z, UNITS_PER_SCENE, x3, y3 } from '../frame2d.ts';
import { NETWORK_BY_ID, radiusOf, widthPx } from '../vessels/network.ts';
import { GEO2D } from '../procedures/route.ts';
import { zAtArc } from '../editor-anchors.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { EUS_GLUE_ROUTE, EUS_GLUE_TARGET, coilReach, layCoil, pointOn } from './probes/copied/eus-scope.copied.js';
import { DeviceObject } from './device-object.ts';
import { inVesselPass } from '../layers.ts';
import { DEVICE_SIDES, WIRE_SIDES, allocTube, makeRings, showRings, writeRings } from './tube-rings.ts';

type P2 = [number, number];
const U = UNITS_PER_SCENE;
/** How far the glue spreads along the varix each way from the needle's point once it has all gone in, as a share of the vessel's course (stage-cath.js GLUE_SPREAD). */
export const GLUE_SPREAD = 0.3;
/** The coil's samples at most (eus-scope.js COIL_N), and the cast's rings. */
export const COIL_RINGS = 73, CAST_RINGS = 40;
const COIL_RADIAL = WIRE_SIDES, CAST_RADIAL = DEVICE_SIDES;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const ease = (t: number): number => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/** The varix the glue goes into, as the 2D route lays it: C2's course, the needle's point on it, and the stretch of its centreline round the point (lumenPath). */
export interface GlueVarix { id: string; f: number; rad: number; path: { x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array; n: number; at: number; step: number; len: number } }
export function glueVarix(rad = 0): GlueVarix {
  const r: { glue?: GlueVarix & { rad: number } } = {};
  (EUS_GLUE_ROUTE as unknown as { after(r: object, geo: object): void }).after(r, GEO2D);
  const g = r.glue!;
  g.rad = rad || lumenOf(g.id);
  return g;
}
/** The varix's lumen as the figure draws it at the healthy diameter, in figure units. */
const lumenOf = (id: string): number => (NETWORK_BY_ID.get(id)?.radius ?? 0.015) * U;

/** Where the cast lies at a share `col` of the glue in (0..1): from the needle's point it sets on the coil first (its span, a little behind the point), then widens to the spread each way, as shares of the
 *  varix's course (stage-cath.js, the glue's tint). null before any glue. */
export function castRange(col: number, g: Pick<GlueVarix, 'f' | 'rad' | 'path'>): { lo: number; hi: number } | null {
  if (!(col > 0.001)) return null;
  const cr = coilReach(g as never, { dir: 1, rho: 0, span: 0 }) as { dir: number; rho: number; span: number }, L = g.path.len || 0;
  const reach = L > 0 && cr.span > 0 ? (cr.span + cr.rho * 0.6 + 1) / L : 0, W = Math.max(GLUE_SPREAD, reach);
  const cd = cr.dir, behind = L > 0 ? (cr.rho * 0.6 + 1) / L : 0;
  const cLo = g.f + Math.min(0, cd) * reach - Math.max(0, cd) * behind, cHi = g.f + Math.max(0, cd) * reach + Math.max(0, -cd) * behind;
  const u1 = ease(col / 0.55), u2 = ease((col - 0.5) / 0.5);
  const lo1 = g.f + (cLo - g.f) * u1, hi1 = g.f + (cHi - g.f) * u1;
  return { lo: lo1 + (g.f - W - lo1) * u2, hi: hi1 + (g.f + W - hi1) * u2 };
}

/** The coil's wire as the 2D app lays it (eus-scope.js layCoil, run unchanged) once `k` (0..1) of it is out: its centreline in figure units, or [] when none is drawn (not out yet, or the lumen too narrow). */
export function coilLine(k: number, g: GlueVarix): P2[] {
  const V: number[] = [], draws: { first: number; count: number }[] = [];
  const first = (layCoil as (...a: unknown[]) => number)({ coil: k }, g, () => [0, 0, 0], 0, 1, V, draws, 0);
  if (first < 0 || !draws.length) return [];
  const w = draws[0]!, out: P2[] = [];
  // (each sample is two vertices of six numbers, either side of the centreline: its centre is their middle)
  for (let i = 0; i < w.count / 2; i++) { const a = (w.first + 2 * i) * 6, b = a + 6; out.push([(V[a]! + V[b]!) / 2, (V[a + 1]! + V[b + 1]!) / 2]); }
  return out;
}

/** The point 3D of a figure point on the varix's own plane. */
const z0 = (): number => zAtArc(EUS_GLUE_TARGET[0] as string, EUS_GLUE_TARGET[1] as number, TIER_Z[NETWORK_BY_ID.get(EUS_GLUE_TARGET[0] as string)?.tier ?? 'net']);   // (an edited vessel's depth at the needle's point)
/** Where the needle goes in, in the scene (the varix at f of its course). */
export function glueTarget3(out = new Vector3()): Vector3 {
  const p = pointOn(GEO2D[EUS_GLUE_TARGET[0] as string]!.cur, EUS_GLUE_TARGET[1] as number) as P2;
  return out.set(x3(p[0]), y3(p[1]), z0());
}

export interface GlueState { coil: number; column: number; flash: number; opacity: number }

export class GlueCast {
  readonly group = new Group();
  readonly objects: DeviceObject[] = [];
  readonly coil: DeviceObject; private readonly coilGeo: BufferGeometry; private readonly coilRings = makeRings(COIL_RINGS);
  readonly cast: DeviceObject; private readonly castGeo: BufferGeometry; private readonly castRings = makeRings(CAST_RINGS);
  private varix: GlueVarix;
  private readonly course: { P: P2[]; cum: number[]; L: number };
  private key = '';
  private coilN = 0;
  private z = z0();
  private live = false;
  /** the varix's lumen (figure units) the run was started with: the model closes the varix as the glue goes in, and the coil and the cast stay as they were laid */
  get rad(): number { return this.varix.rad; }

  constructor(shared: CelShared) {
    this.group.name = 'eus-glue';
    this.varix = glueVarix();
    const P = GEO2D[this.varix.id]!.cur, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1]! + Math.hypot(P[i]![0] - P[i - 1]![0], P[i]![1] - P[i - 1]![1]));
    this.course = { P, cum, L: cum[cum.length - 1]! };
    const mk = (g: BufferGeometry, tone: ConstructorParameters<typeof DeviceObject>[1], order: number, px: number): DeviceObject => {
      const o = new DeviceObject(g, tone, shared, { px, order }, 'ink');
      o.park(); this.group.add(inVesselPass(o.group)); this.objects.push(o); return o;
    };
    this.castGeo = allocTube(CAST_RINGS, CAST_RADIAL); writeRings(this.castGeo, this.castRings, CAST_RADIAL);
    this.cast = mk(this.castGeo, 'glue', 1, 0.6);
    this.coilGeo = allocTube(COIL_RINGS, COIL_RADIAL); writeRings(this.coilGeo, this.coilRings, COIL_RADIAL);
    this.coil = mk(this.coilGeo, 'platinum', 2, 0.7);
  }

  /** The varix's centreline at share f of its course and the unit direction there (scene units). */
  private at(f: number, p: Vector3, t: Vector3): void {
    const { P, cum, L } = this.course, s = clamp01(f) * L;
    let i = 1; while (i < P.length - 1 && cum[i]! < s) i++;
    const a = P[i - 1]!, b = P[i]!, d = cum[i]! - cum[i - 1]!, u = d > 0 ? (s - cum[i - 1]!) / d : 0;
    p.set(x3(a[0] + (b[0] - a[0]) * u), y3(a[1] + (b[1] - a[1]) * u), this.z);
    t.set(b[0] - a[0], -(b[1] - a[1]), 0).normalize();
  }

  /** The engine's newest frame: the varix is as wide as the model draws it (the caliber the coil must stay inside). Taken only while no glue is in, so the closing varix does not shrink the coil it holds. */
  sync(frame: { D: ArrayLike<number> } | null): void {
    if (this.live || !frame) return;
    const d = frame.D[indexOf(this.varix.id)], edge = NETWORK_BY_ID.get(this.varix.id);
    if (!(d > 0) || !edge) return;
    const rad = radiusOf(widthPx(edge as never, Math.max(d, 1))) * U;
    if (Math.abs(rad - this.varix.rad) > 0.02) { this.varix.rad = rad; this.key = ''; }
  }

  /** Lays what the frame says: the coil out so far, the glue in so far, the hit's rings, all at `opacity`. */
  set(s: GlueState): void {
    const op = clamp01(s.opacity), coil = clamp01(s.coil), col = clamp01(s.column), g = this.varix;
    this.live = op > 0.002 && (coil > 0.01 || col > 0.001 || s.flash > 0);
    // the coil: layCoil's own wire, curling on as it is pushed out
    const ck = `${coil.toFixed(3)}|${g.rad.toFixed(2)}`;
    if (op > 0.002 && ck !== this.key) {
      const line = coilLine(coil, g);
      this.coilN = line.length;
      if (line.length > 1) {
        const rs = this.coilRings, r = Math.max(0.56 * 1.25 / U, 0.0012);
        for (let i = 0; i < COIL_RINGS; i++) {
          const j = Math.min(i, line.length - 1), q = line[j]!, a = line[Math.max(0, j - 1)]!, b = line[Math.min(line.length - 1, j + 1)]!;
          rs[i]!.c.set(x3(q[0]), y3(q[1]), this.z + 0.004); rs[i]!.t.set(b[0] - a[0], -(b[1] - a[1]), 0).normalize(); rs[i]!.r = r;
        }
        writeRings(this.coilGeo, rs, COIL_RADIAL);
        showRings(this.coilGeo, 0, line.length - 1, COIL_RADIAL);
      }
      this.key = ck;
    }
    const coilOn = op > 0.002 && this.coilN > 1;
    this.coil.show(coilOn); if (coilOn) this.coil.setAlpha(op);
    // the cast: an opaque plug as wide as the lumen, its ends soft, from lo to hi along the varix
    const range = op > 0.002 ? castRange(col, g) : null;
    if (range) {
      const rs = this.castRings, p = new Vector3(), t = new Vector3(), lo = Math.max(0, range.lo), hi = Math.min(1, range.hi), span = (hi - lo) * this.course.L, soft = Math.max(2, g.rad * 0.7);
      for (let i = 0; i < CAST_RINGS; i++) {
        this.at(lo + ((hi - lo) * i) / (CAST_RINGS - 1), p, t);
        const dEnd = (Math.min(i, CAST_RINGS - 1 - i) / (CAST_RINGS - 1)) * span, k = ease(dEnd / soft);
        rs[i]!.c.copy(p); rs[i]!.t.copy(t); rs[i]!.r = (g.rad * 0.92 * (0.3 + 0.7 * k)) / U;
      }
      writeRings(this.castGeo, rs, CAST_RADIAL);
    }
    this.cast.show(!!range); if (range) this.cast.setAlpha(op);
    // (the hit is the scope's needle filling with blood: scope.ts flashback; this cast draws no ring)
  }

  /** Take it all away (the slide is left, or the procedure is played again). */
  clear(): void { this.set({ coil: 0, column: 0, flash: 0, opacity: 0 }); this.live = false; }

  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }
  setFade(f: number): void { for (const o of this.objects) o.setFade(f); }
  dispose(): void { for (const o of this.objects) o.dispose(); this.castGeo.dispose(); this.coilGeo.dispose(); }
}
