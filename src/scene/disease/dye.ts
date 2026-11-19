// Dye injection and its spread (the 2D figure's bolus: blood.js createBolus, copied with displaySpeed): slugs of dyed blood ride every vessel at its display speed, mix at the
// junctions by flow, and wash out slowly. The bolus gives every vessel 48 bins of concentration along it (in the vessel's own direction); here they go into one float texture
// (a row per vessel) and a thin shell around each dyed vessel's tube reads its bin by uv.x, lime as the 2D figure paints it (--blood-dye #C7F533). Nothing runs until an injection starts.
import { type BufferGeometry, Color, DataTexture, FloatType, Group, Mesh, NearestFilter, RedFormat, ShaderMaterial } from 'three';
import { EDGES, NODES } from '../../engine/hales/portal/topology.js';
import { DYE_BINS, DYE_SECONDS, createBolus, displaySpeed } from './copied/dye-bolus.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';

export const DYE_COLOUR = '#C7F533';
export const DYE_INFLATE = 0.0035;

const VS = /* glsl */ `
uniform float inflate;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position + normal * inflate;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FS = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D dye;
uniform float row;
uniform vec3 colour;
uniform float amount;
varying vec2 vUv;
void main() {
  float x = clamp(vUv.x, 0.0, 1.0) * float(${DYE_BINS - 1});
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, ${DYE_BINS - 1});
  float f = fract(x);
  float c = mix(texelFetch(dye, ivec2(i0, int(row)), 0).r, texelFetch(dye, ivec2(i1, int(row)), 0).r, f);
  if (c < 0.01) discard;
  gl_FragColor = vec4(colour, clamp(c, 0.0, 1.0) * 0.9 * amount);
}`;

interface FrameArrays { Qf?: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }
interface Overlay { mesh: Mesh; k: number; has: boolean }

/** A vessel's mean velocity in cm/s from its flow (mL/s) and diameter (mm). */
/** The two programs, for tests/glsl-compile.test.ts and ?gl (src/debug/gl-programs.ts). */
export { VS as DYE_VS, FS as DYE_FS };

export const velocityOf = (q: number, dmm: number): number => q / (Math.PI * (Math.max(dmm, 0.1) / 20) ** 2);

export class DyeLayer {
  readonly group = new Group();
  private bolus = createBolus(EDGES as never, NODES as never);
  private E = (EDGES as { id: string }[]).length;
  private tex: DataTexture;
  private rows: Float32Array;
  private row = new Float32Array(DYE_BINS);
  private overlays: Overlay[] = [];
  private net: { Q: Float64Array; vd: Float64Array; len: Float64Array };
  private index = new Map<string, number>((EDGES as { id: string }[]).map((e, i) => [e.id, i]));
  private amount = { value: 1 };

  /** `vessels`: each drawn vessel's id and the tube geometry the vessels draw (uv.x along the flow). */
  constructor(vessels: readonly { id: string; geometry: BufferGeometry }[]) {
    this.rows = new Float32Array(DYE_BINS * this.E);
    this.tex = new DataTexture(this.rows, DYE_BINS, this.E, RedFormat, FloatType);
    this.tex.minFilter = this.tex.magFilter = NearestFilter; this.tex.needsUpdate = true;
    this.net = { Q: new Float64Array(this.E), vd: new Float64Array(this.E), len: new Float64Array(this.E) };
    for (const v of vessels) {
      const k = this.index.get(v.id);
      if (k == null) continue;
      const m = new ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
        uniforms: { dye: { value: this.tex }, row: { value: k }, colour: { value: new Color(DYE_COLOUR) }, amount: this.amount, inflate: { value: DYE_INFLATE } },
      });
      const mesh = new Mesh(v.geometry, m);
      mesh.renderOrder = 3; mesh.visible = false; mesh.frustumCulled = false;
      this.group.add(mesh);
      this.overlays.push({ mesh, k, has: false });
    }
    // the length of a drawn vessel in the figure's units; an undrawn one is one second's travel (blood.js: hidden vessels)
    for (const [id, i] of this.index) { const v = NETWORK_BY_ID.get(id); this.net.len[i] = v ? pathLen(v.pts) * 300 : 0; }
  }

  /** The body's dissolve (disease/index.ts setFade): the dye is laid on the anatomy's vessels, so the Circuit does not keep it. */
  setFade(f: number): void { this.amount.value = f; for (const o of this.overlays) (o.mesh.material as ShaderMaterial).visible = f > 0.001; }

  /** Injects into a vessel (edge ID) at `at` (0..1 along the flow) for DYE_SECONDS, or until release() with `hold`. False for a vessel that does not exist. */
  inject(edgeId: string, at = 0, opts: { seconds?: number; hold?: boolean } = {}): boolean {
    const k = this.index.get(edgeId);
    if (k == null) return false;
    this.bolus.inject(k, at, { seconds: opts.seconds ?? DYE_SECONDS, hold: !!opts.hold });
    return true;
  }
  release(): void { this.bolus.release(); }
  clear(): void { this.bolus.clear(); for (const o of this.overlays) { o.mesh.visible = false; o.has = false; } this.rows.fill(0); this.tex.needsUpdate = true; }
  get active(): boolean { return this.bolus.active; }

  /** Steps the bolus by `dt` seconds on the engine's latest flows; true while any dye is in the body (the clock keeps drawing). */
  step(dt: number, f: FrameArrays): boolean {
    if (!this.bolus.active) return false;
    const Q = f.Qf ?? f.Q, { net } = this;
    for (let i = 0; i < this.E; i++) {
      net.Q[i] = Q[i]!;
      net.vd[i] = displaySpeed(velocityOf(Q[i]!, f.D[i] ?? 1));
      if (!net.len[i]) net.len[i] = Math.max(1, Math.abs(net.vd[i]!));   // (an undrawn vessel: one second's travel)
    }
    this.bolus.step(dt, net);
    for (const o of this.overlays) {
      const has = this.bolus.field(o.k, net, this.row);
      if (has) { this.rows.set(this.row, o.k * DYE_BINS); }
      else if (o.has) this.rows.fill(0, o.k * DYE_BINS, (o.k + 1) * DYE_BINS);
      o.mesh.visible = has; o.has = has;
    }
    this.tex.needsUpdate = true;
    return true;
  }
  dispose(): void { this.tex.dispose(); for (const o of this.overlays) (o.mesh.material as ShaderMaterial).dispose(); }
}

function pathLen(pts: readonly (readonly number[])[]): number { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, pts[i]![2]! - pts[i - 1]![2]!); return l; }
