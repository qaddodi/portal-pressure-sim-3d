// One junction skin on the screen (docs/junction-skin-spec.md WP5): a Mesh of the built SkinMesh with its own ShaderMaterial (skin/shaders.ts). Its uniforms object SPREADS the arm tubes' shared uniforms by reference (the vessel data
// texture, the two lens sets, the look's ink colours, the circuit's morph, the body's fade...), so a look change, a lens change or a new frame of the engine reaches it with no copying; only the per-arm handover (fade, highlight, lens position,
// colour) is written here, by the SkinSet, when an arm's own numbers change. Drawn on the vessels' layer, in the vessels' pass.
//
// THE THREE COPIES (spec 10.4). A vessel the 2D figure draws behind the organs (the cava, the SVC's pieces) is drawn by its tube as up to three copies: its front copy (the vessels' pass, over the organs), its solid copy (with the organs: one in front of it hides it)
// and its veil copy (over the organs, seen through them). A skin that has such an arm is drawn the same way: ONE geometry, three meshes with a material each (`defines: { SKIN_COPY: 0 | 1 | 2 }`: one source, three programs), every copy's alpha the sum over the
// arms of weight x that arm's share of that copy x its fade (skin/shaders.ts), the shares being the arm tube's own (VesselObject.copyShares, written through `setArmCopy`). A copy whose arms all have no share of it is not visible, so a plain junction (every
// arm (1, 0, 0)) draws only its front copy, as before, and a skin is never visible where its arms are not: it has no visibility of its own, it inherits the arms' shares, fades, layers and grow state.
import { WEDGE_ABSENT } from '../wedge-glsl.ts';
import { facetSag } from './facet-sag.ts';
import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Group, MaxEquation, Mesh, OneFactor, ShaderMaterial, Vector2, Vector3, Vector4, type IUniform, type Object3D } from 'three';
import { VESSEL_LAYER } from '../../layers.ts';
import { markBlends, setBlendState } from '../../materials/warm.ts';
import { GLOW_LAYER } from '../../glow.ts';
import type { VesselObject } from '../vessel-object.ts';
import { SKIN_ARMS, SKIN_AXIS_PTS, SKIN_FIGURE_UNITS, SKIN_FS, SKIN_VS } from './shaders.ts';
import { MAP_K } from '../../circuit/map.ts';
import type { SkinDraw } from './skin-set.ts';
import { skinKOf } from './sdf.ts';
import { opensIntoCava } from '../fades.ts';
import { skinDebugOn, skinLeaveOut } from './joins-mode.ts';
import { vdbgDefines, vdbgUniforms } from '../debug-view.ts';
import type { SkinMesh, Vec3 } from './types.ts';

/** The uniforms the skin shares with its arm tubes, by reference (taken from the first arm: every vessel's copy has the same value, and each one follows the same writers: the look, the lens, the engine, the Circuit). */
export const SHARED_WITH_TUBES = [
  'inflate', 'vdata', 'vdataSize', 'useData', 'res', 'hiPx', 'tubeDark', 'fade', 'inkColor', 'inkColorCirc', 'circT', 'dpr', 'projY',
  'streamTex', 'chainTex', 'routeTex', 'streakAmt', 'dustP', 'time', 'markDark', 'markLight', 'markRev',
  'lensGradA', 'lensLaneA', 'lensModeA', 'lensGradB', 'lensLaneB', 'lensModeB', 'laneColA', 'laneColB', 'lensMix', 'lensTail', 'lensSmooth',
  'circBoost', 'circPerPx',   // (the Circuit's width rule: the map's skins read them, circuit/skins.ts; the body's skin declares neither)
] as const;

/** The four points of an arm's axis the fragment stage draws its ink from, with the rest radius at each: the node J (the bridge over the art's gap, spec 10.5; the next point again when the arm's end is at J), the start of the straight line
 *  through the seam, the seam, the far point. */
export interface ArmAxis { pts: readonly [Vec3, Vec3, Vec3, Vec3]; radii: readonly [number, number, number, number]; /** the arm this one runs THROUGH the node with (through.ts): their union is a plain minimum, no blend */ mate?: number }

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

/** Writes float `i` of a six-float uniform packed in two vectors (the shader's armFlowAt, armWedgeAt). */
const packSet = (v: Vector4[], i: number, x: number): void => { const q = v[i >> 2]!, c = i & 3; if (c === 0) q.x = x; else if (c === 1) q.y = x; else if (c === 2) q.z = x; else q.w = x; };

/** The program's defines for copy `c` (the page's `?joins=` diagnostics: debug paints dropped pixels, nomarks and noink leave a part out). */
function skinDefines(c: number): Record<string, number> {
  const d: Record<string, number> = { SKIN_COPY: c, ...vdbgDefines() }, out = skinLeaveOut();
  if (skinDebugOn()) d.SKIN_DEBUG = 1;
  if (out === 'marks') d.SKIN_NOMARKS = 1;
  if (out === 'ink') d.SKIN_NOINK = 1;
  if (out === 'dust') d.SKIN_NODUST = 1;
  if (out === 'heads') d.SKIN_NOHEADS = 1;
  if (out === 'dustblend') d.SKIN_DUSTBLEND = 1;
  return d;
}

/** The defines the page's `?joins=` diagnostics set on a skin program (skinDefines): the inspector switches exactly these. */
export const SKIN_DIAGNOSTICS = ['SKIN_DEBUG', 'SKIN_NOMARKS', 'SKIN_NOINK', 'SKIN_NODUST', 'SKIN_NOHEADS', 'SKIN_DUSTBLEND'] as const;
/** The inspector's switch for the build-time diagnostics (`?joins=debug`, `nomarks`, `noink`, `nodust`, `noheads`, `dustblend`): every skin program under `root` has its defines set from the page's live answer and is compiled again (a second or so on a phone). A skin built later takes them from `skinDefines` itself. Returns how many programs changed. */
export function reapplySkinDefines(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = (o as Mesh).material as ShaderMaterial | undefined;
    if (!m || !(m instanceof ShaderMaterial) || (m.name !== 'skin' && m.name !== 'skin-glow')) return;
    const d = m.defines ?? (m.defines = {}), want = skinDefines(Number(d.SKIN_COPY ?? 0));
    let changed = false;
    for (const k of SKIN_DIAGNOSTICS) {
      if (want[k] !== undefined && d[k] === undefined) { d[k] = want[k]!; changed = true; }
      else if (want[k] === undefined && d[k] !== undefined) { delete d[k]; changed = true; }
    }
    if (changed) { m.needsUpdate = true; n++; }
  });
  return n;
}

export class SkinObject implements SkinDraw {
  /** the front copy (the only one a plain junction draws), kept under its old names */
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** the three copies of the one geometry: front, solid, veil */
  readonly copies: readonly Mesh[];
  /** the selection glow (glow.ts): the same geometry and uniforms through the program built with `GLOW`, drawn only while some arm's pick weight is above nothing */
  readonly glow: Mesh;
  /** the group the copies stand in (it is what the scene adds) */
  readonly object: Object3D;
  private readonly armAF: Vector4[]; private readonly armCopy: Vector4[];
  private readonly armData: Vector4[]; private readonly armColor: Vector4[]; private readonly armArc: Vector4[];
  /** the weld pair's share (skin-set.ts): x the mode (+1 the welded skin, -1 the plain trunk, 0 neither), y how much of the welded skin is in */
  private readonly kw = new Vector3(0, 0, 1);   // (x the blend width skinK, y the mode, z the share: skinKW in the fragment stage)

  /** `circuit`: this is a skin of the Circuit's map (circuit/skins.ts): its mesh is built on the map's courses, its program is the one built with SKIN_CIRC and its name says so. */
  constructor(skin: SkinMesh, donor: VesselObject, axes: readonly ArmAxis[], armObjs: readonly VesselObject[], circuit = false) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(skin.position, 3));
    g.setAttribute('normal', new BufferAttribute(skin.normal, 3));
    g.setAttribute('cen', new BufferAttribute(skin.cen, 3));
    g.setAttribute('weight', new BufferAttribute(skin.weight, 4));
    g.setAttribute('weight2', new BufferAttribute(skin.weight2, 2));
    g.setAttribute('restR', new BufferAttribute(skin.restR, 1));
    g.setAttribute('sagK', new BufferAttribute(facetSag(skin.position, skin.index, skin.restR, skin.seamVerts.flatMap((a) => [...a])), 1));
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
    const armAxisP = Array.from({ length: SKIN_ARMS * SKIN_AXIS_PTS }, () => new Vector4());
    axes.forEach((ax, i) => ax.pts.forEach((p, k) => armAxisP[i * SKIN_AXIS_PTS + k]!.set(p[0], p[1], p[2], ax.radii[k]!)));
    this.armAF = Array.from({ length: SKIN_ARMS }, () => new Vector4(0, 1, 0, 1));
    this.armCopy = Array.from({ length: SKIN_ARMS }, (_, i) => new Vector4(0, 0, 0, axes[i]?.mate ?? (skin.junction.arms[i] && opensIntoCava(skin.junction.arms[i]!.vesselId) && skin.junction.arms[i]!.end === 1 ? -2 : -1)));   // (an arm no arm fills has no share of any copy; w is the arm it runs through the node with, -1 none, -2 none and it opens into the side of the trunk: its opacity eases to the trunk's, the fade rule)
    // ONE uniforms object for the three programs (as the tube's veil shares the tube's): a value written once reaches every copy
    const uniforms: Record<string, IUniform> = {
      ...shared,
      // the plain tone the device guard (debug/shader-guard.ts) draws this skin in if a driver refuses the program: the first arm's own colour
      color: du.color!,
      lensUse: { value: 1 },
      armData: { value: this.armData }, armAF: { value: this.armAF }, armNarrow: { value: new Array(SKIN_ARMS).fill(0) }, armArc: { value: this.armArc }, armFlow: { value: [new Vector4(), new Vector4()] }, armWedge: { value: [new Vector4(WEDGE_ABSENT, WEDGE_ABSENT, WEDGE_ABSENT, WEDGE_ABSENT), new Vector4(WEDGE_ABSENT, WEDGE_ABSENT, WEDGE_ABSENT, WEDGE_ABSENT)] }, wedgeColS: { value: new Color(1, 0.6, 0.1) }, wedgeS: { value: new Vector4(0, 0.02, -1, 0.02) }, armColor: { value: this.armColor },
      armCopy: { value: this.armCopy },
      armAxisP: { value: armAxisP }, skinKW: { value: this.kw.setX(skinKOf(skin.junction.arms)) },
      
      // the Circuit's own skins (circuit/skins.ts) are the same programs as the body's: the map's units and its widths, line and fade are a uniform, so a map skin compiles nothing the body's skins have not
      skinMap: { value: new Vector2(circuit ? 1 / MAP_K : SKIN_FIGURE_UNITS, circuit ? 1 : 0) },
      ...vdbgUniforms('skin'),   // (the inspector's view of the skins: none without ?inspect, debug-view.ts)
    };
    this.copies = Array.from({ length: SKIN_COPIES }, (_, c) => {
      const material = markBlends(new ShaderMaterial({
        name: 'skin',
        vertexShader: SKIN_VS, fragmentShader: SKIN_FS, precision: 'highp', side: DoubleSide, transparent: false, depthWrite: true, defines: skinDefines(c),
        uniforms,
      }));
      const mesh = new Mesh(g, material);
      mesh.frustumCulled = false;   // (the vertex stage moves the skin by the live widths: its rest sphere is not where it is drawn)
      mesh.name = `skin:${circuit ? 'circuit:' : ''}${skin.junction.node}${c ? (c === 1 ? ':solid' : ':veil') : ''}`;
      mesh.layers.set(COPY_LAYER[c]!);
      mesh.renderOrder = COPY_ORDER[c]!;
      mesh.visible = c === 0;   // (until the arms say which copies they have: a plain junction's arms are (1, 0, 0), so only the front copy ever shows)
      return mesh;
    });
    const glowMat = new ShaderMaterial({ name: 'skin-glow', vertexShader: SKIN_VS, fragmentShader: SKIN_FS, precision: 'highp', side: DoubleSide, transparent: true, depthWrite: false, depthTest: false, defines: { ...skinDefines(0), GLOW: 1 }, uniforms,
      blending: CustomBlending, blendEquation: MaxEquation, blendSrc: OneFactor, blendDst: OneFactor });   // (the glow's mask, painted by max with the tubes': glow-fx.ts)
    this.glow = new Mesh(g, glowMat);
    this.glow.frustumCulled = false; this.glow.visible = false; this.glow.name = `skin:${circuit ? 'circuit:' : ''}${skin.junction.node}:glow`; this.glow.renderOrder = 30;
    this.glow.layers.set(GLOW_LAYER);
    this.mesh = this.copies[0]!;
    this.material = this.mesh.material as ShaderMaterial;
    const group = new Group();
    group.name = `skin:${circuit ? 'circuit:' : ''}${skin.junction.node}`;
    for (const m of this.copies) group.add(m);
    group.add(this.glow);
    this.object = group;
    armObjs.forEach((o, i) => { this.setColour(i, o); this.setArmCopy(i, ...o.copyShares()); });
  }

  private setColour(i: number, o: VesselObject): void {
    const c = o.toon.uniforms.color!.value as Color;
    this.armColor[i]!.set(c.r, c.g, c.b, (o.toon.uniforms.lensUse!.value as number) > 0.5 ? 1 : 0);
  }

  setArm(i: number, fade: number, hi: number, lensU: number, colour?: ArmColour, narrow = 0): void {
    const u = this.material.uniforms;
    this.armAF[i]!.set(lensU, fade, hi, this.armAF[i]!.w); (u.armNarrow!.value as number[])[i] = narrow;
    this.showGlow();
    if (colour) this.armColor[i]!.set(colour.r, colour.g, colour.b, colour.a);
  }

  /** The wedge's one field at arm `i`'s seam: its tube's route distance from the balloon's distal edge there (WEDGE_ABSENT: no wedge on that tube), and the column as every tube has it (how much, how softly it ends behind the balloon's edge, the front, how softly the front ends) with its amber. */
  setWedge(i: number, d: number, col?: { amount: number; behind: number; front: number; frontSoft: number; color: Color }): void {
    const u = this.material.uniforms;
    packSet(u.armWedge!.value as Vector4[], i, d);
    if (col) { (u.wedgeS!.value as Vector4).set(col.amount, col.behind, col.front, col.frontSoft); (u.wedgeColS!.value as Color).copy(col.color); }
  }

  /** The arm's flow marks (the fragment stage's THE FLOW MARKS): the arc at the seam (figure units), which way it grows toward the node (+1 the vessel's end 1, -1 its start), the vessel's length and its rest radius (figure units), and the tube's flowAmount. */
  setArc(i: number, seamArc: number, dir: number, length: number, restR: number, flow: number): void {
    this.armArc[i]!.set(seamArc, dir, length, restR);
    packSet(this.material.uniforms.armFlow!.value as Vector4[], i, flow);
  }

  /** The shares arm `i` has of the three copies (its tube's `copyShares`), and which copies show now: one is visible while the arms' shares of it add up to something and some arm of the skin is there at all. */
  setArmCopy(i: number, front: number, solid: number, veil: number): void {
    this.armCopy[i]!.set(front, solid, veil, this.armCopy[i]!.w);
    this.showCopies();
  }
  /** The shares arm `i` has now (front, solid, veil), as written by the handover. */
  armCopyOf(i: number): readonly number[] { const v = this.armCopy[i]!; return [v.x, v.y, v.z]; }
  /** Whether copy `c` is drawn now (a test reads it). */
  copyShown(c: number): boolean { return this.copies[c]!.visible; }

  /** This skin is one of a growing arm's pair: the WELDED skin (mode +1, with the arm at full size) or the PLAIN one (mode -1, the trunk without it), and `w` how far the weld is (0 the flared tube alone, 1 the welded skin). The two draw complementary pixels
   *  of one screen pattern (the tubes' own dither), so a pixel is one or the other and nothing is two skins at once; the welded one is not drawn at all at 0 and the plain one not at 1. */
  setWeld(mode: 1 | -1 | 0, w: number): void {
    if (this.kw.y === mode && this.kw.z === w) return;
    this.kw.y = mode; this.kw.z = w;
    this.showCopies();
  }
  /** The weld mode and share (a test reads them). */
  weldOf(): readonly [number, number] { return [this.kw.y, this.kw.z]; }
  /** How much of arm `i`'s tube is there at its seam (arm-twins.ts armPresenceAt); with none of them the skin is not drawn at all. */
  setPres(i: number, p: number): void {
    this.armAF[i]!.w = p;
    this.showCopies();
  }
  /** Whether arm `k` is there at all: its tube's presence at the seam. */
  private isThere(k: number): boolean { return this.armAF[k]!.w > 0.002; }
  /** A copy is drawn when the arms' shares of it add up to something (`COPY_SEEN`), counting only an arm that is there (its presence): a skin has no visibility of its own, it inherits its arms'. */
  private showCopies(): void {
    const weldOut = (this.kw.y > 0 && this.kw.z < 0.002) || (this.kw.y < 0 && this.kw.z > 0.998);   // (the welded skin before the weld begins, the plain one once it is whole: nothing to draw)
    this.copies.forEach((m, c) => { m.visible = !weldOut && this.armCopy.reduce((t, v, k) => t + (this.armData[k]!.x >= 0 && this.isThere(k) ? (c === 0 ? v.x : c === 1 ? v.y : v.z) : 0), 0) > COPY_SEEN; });
    this.showGlow();
  }

  /** The glow shows while the front copy does and some arm has a pick weight (the shader weights its reach and alpha by it, so it is nothing where no arm is picked). */
  private showGlow(): void { this.glow.visible = this.armAF.some((a, k) => a.z > 0.001 && this.armData[k]!.x >= 0 && this.isThere(k)) && this.copies[0]!.visible; }

  setTransparent(on: boolean): void { for (const m of this.copies) { const mat = m.material as ShaderMaterial; setBlendState(mat, on); } }

  dispose(): void { this.mesh.geometry.dispose(); for (const m of this.copies) (m.material as ShaderMaterial).dispose(); (this.glow.material as ShaderMaterial).dispose(); }
}

