// One junction skin on the screen (docs/junction-skin-spec.md WP5): a Mesh of the built SkinMesh with its own ShaderMaterial (skin/shaders.ts). Its uniforms object SPREADS the arm tubes' shared uniforms by reference (the vessel data
// texture, the two lens sets, the look's ink colours, the circuit's morph, the body's fade...), so a look change, a lens change or a new frame of the engine reaches it with no copying; only the per-arm handover (fade, highlight, lens position,
// colour) is written here, by the SkinSet, when an arm's own numbers change. Drawn on the vessels' layer, in the vessels' pass.
//
// THE THREE COPIES (spec 10.4). A vessel the 2D figure draws behind the organs (the cava, the SVC's pieces) is drawn by its tube as up to three copies: its front copy (the vessels' pass, over the organs), its solid copy (with the organs: one in front of it hides it)
// and its veil copy (over the organs, seen through them). A skin that has such an arm is drawn the same way: ONE geometry, three meshes with a material each (`defines: { SKIN_COPY: 0 | 1 | 2 }`: one source, three programs), every copy's alpha the sum over the
// arms of weight x that arm's share of that copy x its fade (skin/shaders.ts), the shares being the arm tube's own (VesselObject.copyShares, written through `setArmCopy`). A copy whose arms all have no share of it is not visible, so a plain junction (every
// arm (1, 0, 0)) draws only its front copy, as before, and a skin is never visible where its arms are not: it has no visibility of its own, it inherits the arms' shares, fades, layers and grow state.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial, Vector3, Vector4, type IUniform, type Object3D } from 'three';
import { VESSEL_LAYER } from '../../layers.ts';
import type { VesselObject } from '../vessel-object.ts';
import { SKIN_ARMS, SKIN_FS, SKIN_VS } from './shaders.ts';
import type { SkinDraw } from './skin-set.ts';
import { skinKOf } from './sdf.ts';
import type { SkinMesh, Vec3 } from './types.ts';

/** The uniforms the skin shares with its arm tubes, by reference (taken from the first arm: every vessel's copy has the same value, and each one follows the same writers: the look, the lens, the engine, the Circuit). */
export const SHARED_WITH_TUBES = [
  'inflate', 'vdata', 'vdataSize', 'useData', 'res', 'hiPx', 'tubeDark', 'fade', 'inkColor', 'inkColorCirc', 'circT', 'dpr', 'projY',
  'streamTex', 'chainTex', 'streakAmt', 'dustP', 'time', 'markDark', 'markLight', 'markRev',
  'lensGradA', 'lensLaneA', 'lensModeA', 'lensGradB', 'lensLaneB', 'lensModeB', 'laneColA', 'laneColB', 'lensMix', 'lensTail', 'lensSmooth',
] as const;

/** The three points of an arm's axis the fragment stage draws its ink from (junction side first), with the rest radius at each. */
export interface ArmAxis { pts: readonly [Vec3, Vec3, Vec3]; radii: readonly [number, number, number] }

/** An arm's own `color` uniform (rgb) and whether a lens colours it (a: its `lensUse`). */
export interface ArmColour { r: number; g: number; b: number; a: number }

/** The copies, in the order of the shader's `SKIN_COPY` and of an arm's shares (VesselObject.copyShares): front, solid, veil. */
export const SKIN_COPIES = 3;
/** A copy shows when the arms' shares of it add up to more than this (a share this small draws nothing: the shader discards under 0.004 of alpha anyway). */
export const COPY_SEEN = 1e-3;
/** What `layer` each copy is drawn on (the tubes' own): the front copy in the vessels' pass; the solid copy with the organs, hidden by one in front of it; the veil copy in the vessels' pass again (the arm's `overLayer`) and drawn last. */
export const COPY_LAYER = [VESSEL_LAYER, 0, VESSEL_LAYER] as const;
/** The veil copy is drawn after the vessels, as the tube's own veil is (vessel-object.ts setBehindOrgans). */
export const COPY_ORDER = [0, 0, 2] as const;

export class SkinObject implements SkinDraw {
  /** the front copy (the only one a plain junction draws), kept under its old names */
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** the three copies of the one geometry: front, solid, veil */
  readonly copies: readonly Mesh[];
  /** the group the copies stand in (it is what the scene adds) */
  readonly object: Object3D;
  private readonly armCopy: Vector3[];
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
    this.armCopy = Array.from({ length: SKIN_ARMS }, () => new Vector3(0, 0, 0));   // (an arm no arm fills has no share of any copy)
    // ONE uniforms object for the three programs (as the tube's veil shares the tube's): a value written once reaches every copy
    const uniforms: Record<string, IUniform> = {
      ...shared,
      // the plain tone the device guard (debug/shader-guard.ts) draws this skin in if a driver refuses the program: the first arm's own colour
      color: du.color!,
      lensUse: { value: 1 },
      armData: { value: this.armData }, armLensU: { value: [0, 0, 0, 0] }, armFade: { value: [1, 1, 1, 1] }, armPres: { value: [1, 1, 1, 1] }, armHi: { value: [0, 0, 0, 0] }, armNarrow: { value: [0, 0, 0, 0] }, armArc: { value: this.armArc }, armFlow: { value: [0, 0, 0, 0] }, armColor: { value: this.armColor },
      armCopy: { value: this.armCopy },
      armAxis: { value: armAxis }, armAxisR: { value: armAxisR }, skinK: { value: skinKOf(skin.junction.arms) },
    };
    this.copies = Array.from({ length: SKIN_COPIES }, (_, c) => {
      const material = new ShaderMaterial({
        name: 'skin',
        vertexShader: SKIN_VS, fragmentShader: SKIN_FS, precision: 'highp', side: DoubleSide, transparent: false, depthWrite: true, defines: { SKIN_COPY: c },
        uniforms,
      });
      const mesh = new Mesh(g, material);
      mesh.frustumCulled = false;   // (the vertex stage moves the skin by the live widths: its rest sphere is not where it is drawn)
      mesh.name = `skin:${skin.junction.node}${c ? (c === 1 ? ':solid' : ':veil') : ''}`;
      mesh.layers.set(COPY_LAYER[c]!);
      mesh.renderOrder = COPY_ORDER[c]!;
      mesh.visible = c === 0;   // (until the arms say which copies they have: a plain junction's arms are (1, 0, 0), so only the front copy ever shows)
      return mesh;
    });
    this.mesh = this.copies[0]!;
    this.material = this.mesh.material as ShaderMaterial;
    const group = new Group();
    group.name = `skin:${skin.junction.node}`;
    for (const m of this.copies) group.add(m);
    this.object = group;
    armObjs.forEach((o, i) => { this.setColour(i, o); this.setArmCopy(i, ...o.copyShares()); });
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

  /** The shares arm `i` has of the three copies (its tube's `copyShares`), and which copies show now: one is visible while the arms' shares of it add up to something and some arm of the skin is there at all. */
  setArmCopy(i: number, front: number, solid: number, veil: number): void {
    this.armCopy[i]!.set(front, solid, veil);
    this.showCopies();
  }
  /** The shares arm `i` has now (front, solid, veil), as written by the handover. */
  armCopyOf(i: number): readonly number[] { const v = this.armCopy[i]!; return [v.x, v.y, v.z]; }
  /** Whether copy `c` is drawn now (a test reads it). */
  copyShown(c: number): boolean { return this.copies[c]!.visible; }

  /** How much of arm `i`'s tube is there at its seam (arm-twins.ts armPresenceAt); with none of them the skin is not drawn at all. */
  setPres(i: number, p: number): void {
    (this.material.uniforms.armPres!.value as number[])[i] = p;
    this.showCopies();
  }
  /** A copy is drawn when the arms' shares of it add up to something (`COPY_SEEN`), counting only an arm that is there (`armPres`): a skin has no visibility of its own, it inherits its arms'. */
  private showCopies(): void {
    const pres = this.material.uniforms.armPres!.value as number[];
    this.copies.forEach((m, c) => { m.visible = this.armCopy.reduce((t, v, k) => t + (this.armData[k]!.x >= 0 && pres[k]! > 0.002 ? (c === 0 ? v.x : c === 1 ? v.y : v.z) : 0), 0) > COPY_SEEN; });
  }

  setTransparent(on: boolean): void { for (const m of this.copies) { const mat = m.material as ShaderMaterial; if (mat.transparent !== on) { mat.transparent = on; mat.needsUpdate = true; } } }

  dispose(): void { this.mesh.geometry.dispose(); for (const m of this.copies) (m.material as ShaderMaterial).dispose(); }
}

