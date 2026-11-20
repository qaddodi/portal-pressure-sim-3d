// The Atlas ascites: the 2D figure's pool (ascites.ts: columns cut to the abdominal cavity, standing to the surface the volume gives, fluid-step.js), drawn in the atlas cel look (shaders.ts
// ATLAS_ASCITES_FS) over the organs. The artist's fluid proxy is a fixed trapezoid squeezed from its floor; it never matched the cavity or the 2D level, and under the bowel it was nearly invisible
// (Mohammad, 20 Nov), so the pool is the 2D one and the proxy mesh is not used. The shown volume follows the model with the same spring as Classic's (FluidFollow), and the bowel floats up with the
// wall's bulge as it does there.
import { BufferAttribute, BufferGeometry, Color, Group, GLSL3, Mesh, RawShaderMaterial, type Vector4 } from 'three';
import { COLS, FLUID_Z, STEP, X0, bulgeStep, crossings, polyOf } from '../disease/ascites.ts';
import { FluidFollow } from '../disease/follow.ts';
import { fluidBase, fluidLevel, poolFade } from '../disease/copied/fluid-step.js';
import { CASING } from '../vessels/cel-ink.ts';
import type { LookId } from '../../looks/looks.ts';
import { ATLAS_ASCITES_FS, ATLAS_POOL_VS, stripVersion } from './shaders.ts';
import { y3, x3 } from '../frame2d.ts';

/** The wash's strength over the organs (the 2D pool is 0.4; a little more here, as the cel look asked for it to read without a label). */
export const POOL_WASH = 0.5;
/** The meniscus band under the surface in scene units (2D draws 7 units of it). */
const BAND = 8 / 300;
/** Drawn after every organ (organs.ts orders them 0 to 9) and the ink hulls, tested against nothing: it is a wash over the cavity, as in 2D. */
const POOL_ORDER = 12;

export class AtlasPool {
  readonly group = new Group();
  readonly mesh: Mesh;
  readonly mat: RawShaderMaterial;
  private readonly pos = new Float32Array(COLS * 2 * 3);
  private readonly edge = new Float32Array(COLS * 2 * 3);
  private readonly fluid = new FluidFollow();
  private lastH = NaN; private lastStep = -1;
  /** the wall's bulge in half units 0..34 (the bowel floats up by bulge / 34 * 26) */
  bulge = 0;
  /** the pool's fade-in at the volume shown (0 under 150 mL) */
  fade = 0;

  constructor(cut: { value: Vector4 }) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('edge', new BufferAttribute(this.edge, 3));
    const idx: number[] = [];
    for (let c = 0; c < COLS - 1; c++) { const p = c * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    g.setIndex(idx);
    this.mat = new RawShaderMaterial({
      glslVersion: GLSL3, vertexShader: stripVersion(ATLAS_POOL_VS), fragmentShader: stripVersion(ATLAS_ASCITES_FS), transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0 }, uWash: { value: POOL_WASH }, uBand: { value: BAND }, inkColor: { value: new Color() }, inkA: { value: 0.5 }, cut },
    });
    this.mat.name = 'atlas ascites';
    this.mesh = new Mesh(g, this.mat);
    this.mesh.renderOrder = POOL_ORDER; this.mesh.frustumCulled = false;
    this.group.name = 'atlas ascites'; this.group.add(this.mesh); this.group.visible = false;
  }

  /** Eases the shown volume toward the model's (`instant`: no ease) and rebuilds the columns when the surface or the wall moved. True while the volume is still easing. */
  step(ml: number, dt: number, instant: boolean): boolean {
    const moving = this.fluid.follow(ml, dt, instant);
    this.set(this.fluid.shown);
    return moving;
  }

  /** The columns for volume `ml`: the surface at its 2D level (fluidBase, a concave meniscus), the floor and walls of the cavity at the wall's bulge. Returns true when they changed. */
  private set(ml: number): boolean {
    this.fade = poolFade(ml);
    const stepB = bulgeStep(ml);
    this.bulge = stepB / 2;
    if (this.fade <= 0) return false;
    const { h } = fluidLevel(ml);
    if (Math.abs(h - this.lastH) < 0.25 && stepB === this.lastStep) return false;
    this.lastH = h; this.lastStep = stepB;
    const poly = polyOf(stepB);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, cr = crossings(poly, x);
      let top = 0, bot = 0;
      if (cr) { top = Math.max(fluidBase(x, h), cr[0]); bot = cr[1]; if (top > bot) top = bot; }
      const px = x3(x), yT = y3(top), yB = y3(bot), ch = Math.max(0, yT - yB);
      this.pos.set([px, yT, FLUID_Z, px, yB, FLUID_Z], c * 6);
      this.edge.set([0, ch, ch, ch, 0, ch], c * 6);
    }
    (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('edge') as BufferAttribute).needsUpdate = true;
    return true;
  }

  /** The colour (the artist's palette), the look's casing ink for the waterline, and the pool's visibility with the body's fade (`a`: 0 hides it). */
  paint(color: Color, look: LookId, a: number): void {
    const u = this.mat.uniforms;
    (u.uColor!.value as Color).copy(color);
    const k = CASING[look];
    (u.inkColor!.value as Color).setRGB(k.rgb[0] / 255, k.rgb[1] / 255, k.rgb[2] / 255);
    u.inkA!.value = Math.min(0.6, k.a);
    u.uAlpha!.value = a * this.fade;
    this.group.visible = a * this.fade > 0.003;
  }
}
