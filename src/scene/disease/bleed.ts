// Active variceal bleeding, as the 2D figure draws it (stage.js bleedSpray, blood.js bleedShapes: copied) and then some: a jet leaves the rupture (the esophageal varix, or the
// fundus for a gastric varix), arcs down into the stomach, necks into beads, sheds spray, and lands in the pool with a splash (jet.ts has the shape; it is steady, never a beat:
// BLEED_STEADY, Mohammad 6 Nov 2026, with a slow flow running down it). It grows out of the tear when a rupture starts and drains off from its tail when the bleed stops (no
// pop). The 3D stomach is opaque, so the pool is the stomach taking the blood's colour (organs/layer.ts, by poolFill), and the jet is a cel-shaded stream in front of it, with an
// ink outline that thins toward its tip.
//
// One dynamic geometry (about 700 triangles, written in place each frame: nothing is allocated), asked for frames while it shows (the layer's `moving`, which the clock turns into
// one more frame), and still under Reduce Motion.
import { BackSide, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Mesh, ShaderMaterial } from 'three';
import { SITES } from './copied/anatomy-b4.ts';
import { bleedShapesInto, makeBleedRows } from './copied/bleed-shapes.js';
import { fitStream } from './stream-fit.ts';
import { streamZ } from './lumen.ts';
import { poolSurfaceY } from '../organs/pool-level.ts';
import { CelObject, type CelShared } from '../materials/cel.ts';
import { FADE_GLSL, INK_RIM_GLSL } from '../materials/shaders.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { Eased } from './follow.ts';
import { bloodColour, recolour } from './paint.ts';
import { type JetBuffers, type JetParams, fillJet, jetIndex, jetUv, makeJetBuffers, smooth, spurtOf, VERTS } from './jet.ts';

/** The depth the stream is drawn at where no organ lies under it (the fixed plane it used everywhere before); over the organs it rides just in front of their own wall (lumen.ts streamZ). */
export const STREAM_Z = 0.36;
export { tearPoint } from './tear.ts';
export interface BleedState { active: boolean; site: 'VAR' | 'GV'; rate: number; total: number }

/** The jet's ink: the toon's own hull, but its width and its dither follow a per-vertex strength (`ik`: full at the tear, a quarter at the tip), so the line fades with the stream. */
export const JET_INK_VS = /* glsl */ `
${INK_RIM_GLSL}
attribute float ik;
uniform float px;
uniform vec2 res;
uniform float inkK;
varying float vIk;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 nd = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  vIk = ik * inkK;
  c.xy += nd * px * vIk * inkRim(normal) * 2.0 / res * c.w;
  gl_Position = c;
}`;
export const JET_INK_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 color;
varying float vIk;
void main() {
  if (fadedOut()) discard;
  float k = smoothstep(0.02, 0.5, vIk);
  if (k < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= k) discard;
  gl_FragColor = vec4(color, 1.0);
}`;

/** What the jet's ink material is built with besides its shaders (the program stand-in, materials/prototypes.ts, wears the same). */
export const JET_INK_FLAGS = { side: BackSide } as const;

/** The balloon is drawn up this far (0..1) when it covers the tear and the stream stops. */
export const SEAT_STOPS_JET = 0.35;

export class BleedLayer {
  readonly group = new Group();
  private obj: CelObject | null = null;
  private inkMat: ShaderMaterial | null = null;
  private bufs: JetBuffers = makeJetBuffers();
  private geo: BufferGeometry | null = null;
  /** how far the jet has grown out of the tear (0 to 1), and how far it has drained off from its tail (0 to 1) */
  private grow = new Eased(0, 0.45, 0.003);
  private drain = new Eased(0, 0.7, 0.003);
  /** where it lands (2D units): eased, so a rising pool never makes it jump */
  private land = new Eased(0, 0.4, 0.05);
  private surf = new Eased(0, 0.4, 0.05);
  /** how steeply it leaves the wall, eased too: the fit may change it with the fill, and the stream must never jump */
  private lift = new Eased(0, 0.4, 0.05);
  private radius = new Eased(0, 0.4, 0.01);
  private last: BleedState | null = null;
  private palette: Palette | null = null; private look: LookId = 'light';
  private shared: CelShared;
  private body = 1;
  private wanted = false;
  private time = 0;
  private rows = makeBleedRows();
  private params: JetParams = { x0: 0, y0: 0, xl: 0, yl: 0, r0: 3, brk: 0.7, spurt: 0.5 };
  /** How far the tamponade's gastric balloon is drawn up against the cardia (0..1, the scene sets it each frame): a seated balloon covers the tear, so the jet stops as it comes (its tail drains, easing) and runs again if it is let go. */
  seat = 0;
  /** Reduce Motion: the jet holds still (it still grows out and drains off, easing). */
  still = false;
  constructor(shared: CelShared) { this.shared = shared; this.group.visible = false; }
  /** The body's dissolve (disease/index.ts setFade): the stream is drawn on the anatomy, so it goes with it. */
  setFade(f: number): void { this.body = f; this.obj?.setFade(f); this.group.visible = this.wanted && f > 0.001; }
  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; if (this.obj) recolour(this.obj, bloodColour(), p); }
  /** True while the jet grows, drains or runs (a running jet asks for a frame after each one: it flows). */
  /** `fill` is how full the stomach's pool stands (the organ layer's eased poolFill): the jet lands on the pool's own surface,
   *  so the two never part. Without it the surface follows the blood lost (the layer used alone). */
  set(b: BleedState, dt: number, instant = false, fill?: number): boolean {
    if (b.active) this.last = { ...b };
    const live = b.active && this.seat < SEAT_STOPS_JET;
    let moving = false;
    if (instant) { this.grow.value = live ? 1 : 0; this.drain.value = 0; }
    else if (live) { moving = this.grow.to(1, dt) || moving; moving = this.drain.to(0, dt) || moving; }   // (it grows out, whatever it was doing)
    else if (this.grow.value > 0.003) moving = this.drain.to(1, dt) || moving;   // (the tail leaves; the head stays where it was)
    // (a jet that never grew has no tail to drain: easing the drain toward 1 and then resetting it to 0 below, as "nothing is shown",
    //  restarted that ease on every frame, so the figure asked for a frame forever and Pause never let the Anatomy rest: review D1)
    else this.drain.value = 0;
    this.wanted = this.grow.value > 0.003 && this.drain.value < 0.995 && !!this.last;
    this.group.visible = this.wanted && this.body > 0.001;
    if (!this.wanted) {
      if (!live) { this.grow.value = 0; this.drain.value = 0; }   // (nothing is shown: ready for the next one)
      this.time = 0;
      return moving;
    }
    const s = this.last!;
    bleedShapesInto(this.rows, { site: s.site, total: s.total }, s.rate, { varix: SITES.varix, fundus: SITES.fundus });
    const st = this.rows[1] as number[];   // [x0, y0, x1, y1, r0, brk, alpha, kind 2]
    const first = this.radius.value === 0 && this.land.value === 0;
    // (the pool's surface is eased already, by the organ layer: the landing takes it as it is, no second ease to lag behind it. The tear and the landing come from the stream's fit: inside
    //  the esophagus and the stomach for any fill. Used alone, with no pool, the surface follows the blood lost.)
    const ly = fill !== undefined ? poolSurfaceY(fill) : st[3]!;
    const fit = fitStream(s.site, s.rate, ly);
    moving = this.land.to(fit.xl, dt, instant || first) || moving;
    moving = this.lift.to(fit.lift, dt, instant || first) || moving;
    if (fill !== undefined) this.surf.value = ly; else moving = this.surf.to(ly, dt, instant || first) || moving;
    moving = this.radius.to(st[4]!, dt, instant || first) || moving;
    const p = this.params;
    p.x0 = fit.x0; p.y0 = fit.y0; p.lift = this.lift.value; p.xl = this.land.value; p.yl = this.surf.value; p.r0 = this.radius.value; p.brk = st[5]!; p.spurt = spurtOf(s.rate);
    if (!this.still) this.time += Math.min(dt, 0.05);
    this.ensure();
    const thick = fillJet(this.bufs, p, { grow: this.grow.value, drain: this.drain.value }, this.time, STREAM_Z, streamZ);
    const g = this.geo!;
    for (const a of ['position', 'normal', 'tang', 'ik'] as const) (g.getAttribute(a) as BufferAttribute).needsUpdate = true;
    if (this.inkMat) this.inkMat.uniforms.inkK!.value = smooth(0, 0.45, thick);
    return moving || !this.still;
  }
  /** The mesh, made the first time it is wanted. */
  private ensure(): void {
    if (this.obj) return;
    const g = this.geo = new BufferGeometry();
    const b = this.bufs;
    g.setAttribute('position', new BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new BufferAttribute(b.nor, 3));
    g.setAttribute('tang', new BufferAttribute(b.tang, 3));
    g.setAttribute('ik', new BufferAttribute(b.ik, 1));
    g.setAttribute('uv', new BufferAttribute(jetUv(), 2));
    g.setIndex(new BufferAttribute(jetIndex(), 1));
    for (const a of ['position', 'normal', 'tang', 'ik']) (g.getAttribute(a) as BufferAttribute).setUsage(DynamicDrawUsage);
    const obj = this.obj = new CelObject(g, { tone: 'heart', bands: 3, spec: 0, px: 1.1 }, this.shared);
    // the ink: a hull whose line thins toward the tip, sharing the toon's colour, width and fade
    const mat = this.inkMat = new ShaderMaterial({ name: 'bleed jet ink',
      vertexShader: JET_INK_VS, fragmentShader: JET_INK_FS, ...JET_INK_FLAGS,
      uniforms: { color: obj.ink.uniforms.color!, px: obj.ink.uniforms.px!, res: this.shared.res, fade: obj.toon.uniforms.fade!, inkK: { value: 1 } },
    });
    const inkMesh = obj.group.children[0] as Mesh;
    obj.ink.dispose(); inkMesh.material = mat;
    for (const m of obj.group.children) m.frustumCulled = false;   // (the geometry moves every frame: its bounds are never right)
    this.group.add(obj.group);
    obj.setFade(this.body);
    if (this.palette) { obj.applyPalette(this.palette); recolour(obj, bloodColour(), this.palette); }
  }
  /** What the layer draws, for the tests: the vertex count it writes and whether it holds a mesh. */
  get vertexCount(): number { return VERTS; }
  get meshed(): boolean { return !!this.obj; }
  dispose(): void { this.obj?.dispose(); this.inkMat?.dispose(); this.geo?.dispose(); }
}
