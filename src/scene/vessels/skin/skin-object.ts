// One junction skin on the screen (docs/junction-skin-spec.md WP5): a Mesh of the built SkinMesh with its own ShaderMaterial (skin/shaders.ts). Its uniforms object SPREADS the arm tubes' shared uniforms by reference (the vessel data
// texture, the two lens sets, the look's ink colours, the circuit's morph, the body's fade...), so a look change, a lens change or a new frame of the engine reaches it with no copying; only the per-arm handover (fade, highlight, lens position,
// colour) is written here, by the SkinSet, when an arm's own numbers change. Drawn on the vessels' layer, in the vessels' pass.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3, Vector4, type IUniform, type Object3D } from 'three';
import { VESSEL_LAYER } from '../../layers.ts';
import type { VesselObject } from '../vessel-object.ts';
import { SKIN_ARMS, SKIN_FS, SKIN_VS } from './shaders.ts';
import type { SkinDraw } from './skin-set.ts';
import { skinKOf } from './sdf.ts';
import type { SkinMesh, Vec3 } from './types.ts';

/** The uniforms the skin shares with its arm tubes, by reference (taken from the first arm: every vessel's copy has the same value, and each one follows the same writers: the look, the lens, the engine, the Circuit). */
export const SHARED_WITH_TUBES = [
  'inflate', 'vdata', 'vdataSize', 'useData', 'res', 'hiPx', 'tubeDark', 'fade', 'inkColor', 'inkColorCirc', 'circT', 'dpr', 'projY',
  'streamTex', 'chainTex', 'routeTex', 'streakAmt', 'dustP', 'time', 'markDark', 'markLight', 'markRev',
  'lensGradA', 'lensLaneA', 'lensModeA', 'lensGradB', 'lensLaneB', 'lensModeB', 'laneColA', 'laneColB', 'lensMix', 'lensTail', 'lensSmooth',
] as const;

/** The three points of an arm's axis the fragment stage draws its ink from (junction side first), with the rest radius at each. */
export interface ArmAxis { pts: readonly [Vec3, Vec3, Vec3]; radii: readonly [number, number, number] }

/** An arm's own `color` uniform (rgb) and whether a lens colours it (a: its `lensUse`). */
export interface ArmColour { r: number; g: number; b: number; a: number }

export class SkinObject implements SkinDraw {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly object: Object3D;
  private readonly armData: Vector4[]; private readonly armColor: Vector4[]; private readonly armArc: Vector4[];

  constructor(skin: SkinMesh, donor: VesselObject, axes: readonly ArmAxis[], armObjs: readonly VesselObject[]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(skin.position, 3));
    g.setAttribute('normal', new BufferAttribute(skin.normal, 3));
    g.setAttribute('cen', new BufferAttribute(skin.cen, 3));
    g.setAttribute('weight', new BufferAttribute(skin.weight, 4));
    g.setAttribute('restR', new BufferAttribute(skin.restR, 1));
    g.setIndex(new BufferAttribute(skin.index, 1));
    g.computeBoundingSphere();
    const du = donor.toon.uniforms, shared: Record<string, IUniform> = {};
    for (const k of SHARED_WITH_TUBES) if (du[k]) shared[k] = du[k]!;
    this.armData = Array.from({ length: SKIN_ARMS }, (_, i) => {
      const a = skin.junction.arms[i];
      return a ? new Vector4(a.dataIndex, a.baseD, a.widthKind, a.lensIndex) : new Vector4(-1, 1, 0, 0);
    });
    this.armColor = Array.from({ length: SKIN_ARMS }, () => new Vector4(0, 0, 0, 1));
    this.armArc = Array.from({ length: SKIN_ARMS }, () => new Vector4(0, 1, 1, 1));
    const armAxis = Array.from({ length: SKIN_ARMS * 3 }, () => new Vector3()), armAxisR: number[] = new Array(SKIN_ARMS * 3).fill(0);
    axes.forEach((ax, i) => ax.pts.forEach((p, k) => { armAxis[i * 3 + k]!.set(p[0], p[1], p[2]); armAxisR[i * 3 + k] = ax.radii[k]!; }));
    this.material = new ShaderMaterial({
      name: 'skin',
      vertexShader: SKIN_VS, fragmentShader: SKIN_FS, precision: 'highp', side: DoubleSide, transparent: false, depthWrite: true,
      uniforms: {
        ...shared,
        // the plain tone the device guard (debug/shader-guard.ts) draws this skin in if a driver refuses the program: the first arm's own colour
        color: du.color!,
        lensUse: { value: 1 },
        armData: { value: this.armData }, armLensU: { value: [0, 0, 0, 0] }, armFade: { value: [1, 1, 1, 1] }, armPres: { value: [1, 1, 1, 1] }, armHi: { value: [0, 0, 0, 0] }, armNarrow: { value: [0, 0, 0, 0] }, armArc: { value: this.armArc }, armFlow: { value: [0, 0, 0, 0] }, armColor: { value: this.armColor },
        armAxis: { value: armAxis }, armAxisR: { value: armAxisR }, skinK: { value: skinKOf(skin.junction.arms) },
      },
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;   // (the vertex stage moves the skin by the live widths: its rest sphere is not where it is drawn)
    this.mesh.name = `skin:${skin.junction.node}`;
    this.mesh.layers.set(VESSEL_LAYER);
    this.mesh.renderOrder = 0;
    this.object = this.mesh;
    armObjs.forEach((o, i) => this.setColour(i, o));
  }

  private setColour(i: number, o: VesselObject): void {
    const c = o.toon.uniforms.color!.value as Color;
    this.armColor[i]!.set(c.r, c.g, c.b, (o.toon.uniforms.lensUse!.value as number) > 0.5 ? 1 : 0);
  }

  setArm(i: number, fade: number, hi: number, lensU: number, colour?: ArmColour, narrow = 0): void {
    const u = this.material.uniforms;
    (u.armFade!.value as number[])[i] = fade; (u.armHi!.value as number[])[i] = hi; (u.armLensU!.value as number[])[i] = lensU; (u.armNarrow!.value as number[])[i] = narrow;
    if (colour) this.armColor[i]!.set(colour.r, colour.g, colour.b, colour.a);
  }

  /** The arm's flow marks (the fragment stage's THE FLOW MARKS): the arc at the seam (figure units), which way it grows toward the node (+1 the vessel's end 1, -1 its start), the vessel's length and its rest radius (figure units), and the tube's flowAmount. */
  setArc(i: number, seamArc: number, dir: number, length: number, restR: number, flow: number): void {
    this.armArc[i]!.set(seamArc, dir, length, restR);
    (this.material.uniforms.armFlow!.value as number[])[i] = flow;
  }

  /** How much of arm `i`'s tube is there at its seam (arm-twins.ts armPresenceAt); with none of them the skin is not drawn at all. */
  setPres(i: number, p: number): void {
    const a = this.material.uniforms.armPres!.value as number[];
    a[i] = p;
    this.mesh.visible = a.some((x, k) => this.armData[k]!.x >= 0 && x > 0.002);
  }

  setTransparent(on: boolean): void { if (this.material.transparent !== on) { this.material.transparent = on; this.material.needsUpdate = true; } }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}

