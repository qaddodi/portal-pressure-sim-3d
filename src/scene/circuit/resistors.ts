// The circuit's resistors on the GPU: each a zigzag laid along its vessel on the map (the liver's two lobes between their stations, the collaterals' on C1b, the gut's on A_SMA),
// drawn as the 2D app's overlay painter does (stage-resistors.js resPaint): a veil over the vessel under the liver's, a solid black outline, and the line itself, which thickens
// and warms (green, amber, red) as the resistance rises. The lines are screen-space ribbons (a width in px, a square cap), so a zigzag keeps its px sizes at every zoom; the
// geometry is rebuilt only when the scale steps a quarter octave, the ratio changes its width or heat, or a lead moves. The reading beside each is a caption (captions.ts).
import { BufferAttribute, BufferGeometry, Group, Mesh, ShaderMaterial, Vector2, Vector3, type Color } from 'three';
import { rawColor } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { COURSES } from './course.ts';
import { CIRC_C, MAP_K } from './map.ts';
import { NODE_CIRCUIT, RES_LIVER, RES_SIZES } from './data.copied.ts';
import { courseOf } from './paths.ts';
import { laneCourseOf } from './segment-lane.ts';
import { peelAt, peelRank } from './peel.ts';
import { type ResKey, RES_OUTLINE, RES_TEETH, resAmp, resHeat, resInk, resWidthFit, zigzag } from './res-model.ts';

const VS = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aS;
uniform float wpx;
uniform vec2 res;
void main() {
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec2 sa = ca.xy / ca.w * res * 0.5;
  vec2 sb = cb.xy / cb.w * res * 0.5;
  vec2 d = sb - sa;
  float l = length(d);
  d = l > 1e-4 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  bool at0 = aS.y < 0.5;
  vec4 c = at0 ? ca : cb;
  vec2 off = n * aS.x * wpx * 0.5 + d * (at0 ? -1.0 : 1.0) * wpx * 0.5;
  c.xy += off * 2.0 / res * c.w;
  gl_Position = c;
}`;
const FS = /* glsl */ `
uniform vec3 col;
uniform float alpha;
void main() { gl_FragColor = vec4(col, alpha); }`;

/** Where a resistor's polylines stand on the map (map units): the liver's two between their stations (with leads to each dot), or one zigzag along a lane. */
/** The two programs, for tests/glsl-compile.test.ts and ?gl (src/debug/gl-programs.ts). */
export { VS as RES_VS, FS as RES_FS };

export interface ResShape { key: ResKey; polys: number[][]; veil: number[][] }

function pointAndTangent(pts: readonly (readonly [number, number])[], u: number): [number, number, number, number] {
  let total = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); cum.push(total); }
  const want = total * u;
  let k = 1;
  while (k < pts.length - 1 && cum[k]! < want) k++;
  const a = pts[k - 1]!, b = pts[k]!, span = cum[k]! - cum[k - 1]! || 1, f = Math.min(1, Math.max(0, (want - cum[k - 1]!) / span));
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * f, a[1] + dy * f, dx / L, dy / L];
}

/** The dot radius of the liver's stations (circuit-nodes.js dotRadius: 4.5), and the dot's least size in px and the ring's half outside the radius (as the stage draws them). */
const LIVER_DOT = 4.5, DOT_MIN_PX = 4, DOT_RING_OUT = 0.8;

/** The polylines of a resistor at the scale `scQ` (px a map unit) and line width `w` (px). Pure. */
export function resShape(key: ResKey, ratio: number, scQ: number): ResShape {
  const amp = resAmp(scQ);
  if (key === 'rLiver') {
    const w = resWidthFit(ratio, RES_LIVER[2]! - RES_LIVER[0]!, amp, scQ);
    const ends: [readonly number[], readonly number[]][] = [[NODE_CIRCUIT.SIN_R!, NODE_CIRCUIT.CV_R!], [NODE_CIRCUIT.SIN_L!, NODE_CIRCUIT.CV_L!]];
    const polys: number[][] = [], veil: number[][] = [];
    ends.forEach(([A, B], i) => {
      const j = i * 4, edge = Math.max(LIVER_DOT, DOT_MIN_PX / scQ) + DOT_RING_OUT + (w / 2 + RES_OUTLINE) / scQ;
      const zx0 = RES_LIVER[j]!, zy0 = RES_LIVER[j + 1]!, zx1 = RES_LIVER[j + 2]!, zy1 = RES_LIVER[j + 3]!;
      const lx0 = Math.min(A[0]! + edge, zx0), lx1 = Math.max(B[0]! - edge, zx1);
      const p: number[] = [];
      if (lx0 < zx0) p.push(lx0, A[1]!);
      p.push(...zigzag(zx0, zy0, zx1, zy1, RES_TEETH, amp));
      if (lx1 > zx1) p.push(lx1, B[1]!);
      polys.push(p);
      veil.push([p[0]!, p[1]!, p[p.length - 2]!, p[p.length - 1]!]);
    });
    return { key, polys, veil };
  }
  const lane = key === 'rGut' ? 'A_SMA' : 'C1b';
  // (the arteries are not in the body's courses: the lane's own map drawing is the course)
  const pts = laneCourseOf(lane);   // (a segment's whole run, centred: the coronary vein to the azygos is one lane)
  if (!pts) return { key, polys: [], veil: [] };
  const [x, y, tx, ty] = pointAndTangent(pts, 0.5);
  return { key, polys: [zigzag(x - tx * 34, y - ty * 34, x + tx * 34, y + ty * 34, RES_TEETH, amp)], veil: [] };
}

/** A resistor's flow rank (0 gut to 1 heart) from where it sits on the map: it comes in as its own stretch of the map lands (the flow peel), not on the whole change's clock. */
export function resRank(key: ResKey): number {
  if (key === 'rLiver') return peelRank((RES_LIVER[0]! + RES_LIVER[2]!) / 2);
  const lane = key === 'rGut' ? 'A_SMA' : 'C1b';
  const pts = laneCourseOf(lane);
  return pts ? peelRank(pointAndTangent(pts, 0.5)[0]!) : 1;
}

/** The ribbons of polylines as geometry: four vertices to a segment, in the group's local scene units. */
function ribbons(polys: readonly (readonly number[])[], z: number): BufferGeometry {
  let segs = 0;
  for (const p of polys) segs += Math.max(0, p.length / 2 - 1);
  const aA = new Float32Array(segs * 12), aB = new Float32Array(segs * 12), aS = new Float32Array(segs * 8), ix = new Uint32Array(segs * 6);
  let s = 0;
  for (const p of polys) {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = (p[i]! - CIRC_C[0]) * MAP_K, ay = -(p[i + 1]! - CIRC_C[1]) * MAP_K, bx = (p[i + 2]! - CIRC_C[0]) * MAP_K, by = -(p[i + 3]! - CIRC_C[1]) * MAP_K;
      for (let v = 0; v < 4; v++) {
        const o = s * 4 + v;
        aA[3 * o] = ax; aA[3 * o + 1] = ay; aA[3 * o + 2] = z;
        aB[3 * o] = bx; aB[3 * o + 1] = by; aB[3 * o + 2] = z;
        aS[2 * o] = v % 2 ? 1 : -1; aS[2 * o + 1] = v < 2 ? 0 : 1;
      }
      const b = s * 4;
      ix.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], s * 6);
      s++;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('aA', new BufferAttribute(aA, 3));
  g.setAttribute('aB', new BufferAttribute(aB, 3));
  g.setAttribute('aS', new BufferAttribute(aS, 2));
  g.setAttribute('position', new BufferAttribute(new Float32Array(segs * 12), 3));
  g.setIndex(new BufferAttribute(ix, 1));
  return g;
}

interface Drawn {
  veil: Mesh | null; line: Mesh; ink: Mesh;
  goal: number; amount: number; sig: string; rank: number;
}

/** What a resistor's material is built with besides its shaders (the program stand-in, materials/prototypes.ts, wears the same). */
export const RESISTOR_FLAGS = { transparent: true, depthTest: false, depthWrite: false } as const;

export class ResistorLayer {
  readonly group = new Group();
  private readonly drawn = new Map<ResKey, Drawn>();
  private readonly res = { value: new Vector2(1, 1) };
  private bg: Color = rawColor('#000000');
  private ok = [0, 0, 0]; private caution = [0, 0, 0]; private danger = [0, 0, 0];
  private alpha = 0;
  private lookId: LookId = 'light';

  constructor(res?: { value: Vector2 }) { if (res) this.res = res; this.group.name = 'resistors'; this.group.renderOrder = 30; }

  private material(): ShaderMaterial {
    return new ShaderMaterial({ name: 'circuit resistors',
      vertexShader: VS, fragmentShader: FS, ...RESISTOR_FLAGS,
      uniforms: { wpx: { value: 4 }, res: this.res, col: { value: new Vector3() }, alpha: { value: 0 } },
    });
  }
  private mesh(g: BufferGeometry, order: number): Mesh {
    const m = new Mesh(g, this.material());
    m.frustumCulled = false; m.renderOrder = 30 + order;
    return m;
  }

  setLook(look: LookId): void {
    this.lookId = look;
    const l = LOOKS[look], c = (hex: string) => { const k = rawColor(hex); return [k.r, k.g, k.b]; };
    this.ok = c(l.ok); this.caution = c(l.caution); this.danger = c(l.danger);
    this.bg = rawColor(l.bg);
    for (const d of this.drawn.values()) d.sig = '';   // painted again with the look's colours on the next set
  }

  /** The layer's opacity (the map's ramp). */
  setAlpha(a: number, t = 1): void { this.alpha = a; this.t = t; this.group.visible = a > 0.001; this.paintAlpha(); }
  private t = 1;

  /**
   * The resistors to show now and their ratios, at `scQ` px a map unit. A resistor not wanted (or with no ratio) fades out; a wanted one fades in.
   * Returns whether anything is easing (the scene asks for another frame).
   */
  set(ratios: Readonly<Partial<Record<ResKey, number | null>>>, scQ: number): void {
    const q = 2 ** (Math.round(Math.log2(Math.max(1e-6, scQ)) * 4) / 4);
    for (const key of ['rLiver', 'rColl', 'rGut'] as const) {
      const r = ratios[key];
      let d = this.drawn.get(key);
      if (r == null) { if (d) d.goal = 0; continue; }
      const sig = `${this.lookId}|${q}|${Math.round(r * 20) / 20}`;
      if (!d) {
        d = { veil: null, line: this.mesh(new BufferGeometry(), 2), ink: this.mesh(new BufferGeometry(), 1), goal: 1, amount: 0, sig: '', rank: resRank(key) };
        if (key === 'rLiver') d.veil = this.mesh(new BufferGeometry(), 0);
        this.group.add(...[d.veil, d.ink, d.line].filter((m): m is Mesh => !!m));
        this.drawn.set(key, d);
      }
      d.goal = 1;
      if (d.sig === sig) continue;
      d.sig = sig;
      const shape = resShape(key, r, q), w = this.widthOf(key, r, q);
      const heat = resHeat(r), ink = resInk(heat, this.ok, this.caution, this.danger);
      d.line.geometry.dispose(); d.ink.geometry.dispose();
      d.line.geometry = ribbons(shape.polys, 0.3); d.ink.geometry = ribbons(shape.polys, 0.29);
      (d.line.material as ShaderMaterial).uniforms.wpx!.value = w;
      (d.line.material as ShaderMaterial).uniforms.col!.value.set(ink[0]!, ink[1]!, ink[2]!);
      (d.ink.material as ShaderMaterial).uniforms.wpx!.value = w + 2 * RES_OUTLINE;
      (d.ink.material as ShaderMaterial).uniforms.col!.value.set(0, 0, 0);
      if (d.veil) {
        // the veil over the vessel under the liver's: 8 map units wide as the lane is (grown as lanes grow when the map is small), a unit each side, in the ground's colour at 40%
        d.veil.geometry.dispose();
        d.veil.geometry = ribbons(shape.veil, 0.28);
        const veilW = (8 * Math.min(1.75, Math.max(1, 10 / (15 * q))) + 2) * q;
        (d.veil.material as ShaderMaterial).uniforms.wpx!.value = veilW;
        (d.veil.material as ShaderMaterial).uniforms.col!.value.set(this.bg.r, this.bg.g, this.bg.b);
      }
    }
    this.paintAlpha();
  }

  private widthOf(key: ResKey, ratio: number, q: number): number {
    const amp = resAmp(q);
    return resWidthFit(ratio, key === 'rLiver' ? RES_LIVER[2]! - RES_LIVER[0]! : 68, amp, q);
  }

  /** The line's width in px a resistor is drawn at now (for tests and the caption's clearance), or 0 when it is not drawn. */
  widthNow(key: ResKey): number {
    const d = this.drawn.get(key);
    return d ? ((d.line.material as ShaderMaterial).uniforms.wpx!.value as number) : 0;
  }
  /** Whether a resistor is on its way in or out, or standing. */
  stateOf(key: ResKey): { goal: number; amount: number } | null { const d = this.drawn.get(key); return d ? { goal: d.goal, amount: d.amount } : null; }

  /** Eases each resistor's opacity (320 ms); returns true while any moves. */
  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / 320);
    let moving = false;
    for (const d of this.drawn.values()) {
      if (d.amount === d.goal) continue;
      d.amount = Math.abs(d.goal - d.amount) <= k ? d.goal : d.amount + Math.sign(d.goal - d.amount) * k;
      moving = true;
    }
    if (moving) this.paintAlpha();
    return moving;
  }

  private paintAlpha(): void {
    for (const d of this.drawn.values()) {
      const a = this.alpha * d.amount * peelAt(this.t, d.rank), vis = a > 0.002;
      for (const m of [d.veil, d.ink, d.line]) {
        if (!m) continue;
        m.visible = vis;
        (m.material as ShaderMaterial).uniforms.alpha!.value = m === d.veil ? a * RES_SIZES.veil : a;
      }
    }
  }

  dispose(): void {
    for (const d of this.drawn.values()) for (const m of [d.veil, d.ink, d.line]) if (m) { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); }
    this.drawn.clear();
  }
}
