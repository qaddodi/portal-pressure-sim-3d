// The junction skins of a scene (docs/junction-skin-spec.md WP5): which junctions are skinned, the cut each arm tube takes, and the per-frame handover of each arm's live fade, highlight and lens position to its skin.
// The scene builds one SkinSet when the page asks for skins (joins-mode.ts) and Smooth vessel joins is on, and throws it away when either goes. Nothing here draws: a `SkinDraw` (skin-object.ts) does.
//
// What a skin takes over from its arms, and what the arms stop doing:
//   - each arm tube is cut at its seam ring (VesselObject.setSkinCut): the skin starts on those same vertices;
//   - its `mate` at a skinned end is off (the skin's weights blend the arms' live widths; a mate easing on the tube beyond the seam would move the seam ring's radius), and so is the `bury` hold-back on the ink there
//     (the part of the tube it guarded is cut away): the scene's applyMates asks `endsOf`;
//   - the collaterals, shunts and feeders that grow from an arm keep today's fork method (`nbr`, `bury`): their ends land inside the skin, which covers the host's capsule.
// A node whose skin cannot be built (SkinBuildError: no seam ring that clears the blend, a ring the hull misses) keeps today's joins; it warns once and never crashes the scene.
import type { BufferGeometry, Object3D } from 'three';
import { NETWORK_BY_ID } from '../network.ts';
import { REST, coursesOf, tubularOf, type ShapeState } from '../shape.ts';
import { TUBE_RADIAL, buildTubes } from '../tubes.ts';
import { slicesFor } from '../../circuit/geometry.ts';
import { findSkinJunctions, skinNodesForPhase } from './inventory.ts';
import { chooseCuts, type ArmTube } from './cuts.ts';
import { buildSkin, hullCovers } from './mesh.ts';
import { SKIN_CUT_NONE, type SkinCut, type SkinJunction, type SkinMesh } from './types.ts';
import { hiWeightAt, lensUAt, liveFadeAt, type FadeState, type HiState } from './arm-twins.ts';
import type { VesselObject } from '../vessel-object.ts';
import type { ArmAxis, ArmColour } from './skin-object.ts';

/** What the skin's drawing object offers the set (skin-object.ts is the real one; a test hands in a plain recorder). */
export interface SkinDraw {
  readonly object: Object3D;
  /** the live handover for arm `i`: its tube's alpha at its seam, its highlight weight there, and its lens ramp's position there */
  setArm(i: number, fade: number, hi: number, lensU: number, colour: ArmColour): void;
  /** a skin blends only when one of its arms does (a fade zone): opaque otherwise, as the tubes are */
  setTransparent(on: boolean): void;
  dispose(): void;
}

export interface SkinSetDeps {
  /** the drawn vessel of a network id */
  vessel(id: string): VesselObject | undefined;
  /** the shape a vessel is drawn in now (undefined: at rest) */
  stateOf(id: string): ShapeState | undefined;
  /** the object that draws one built skin: its mesh, each arm's three axis points, the arms' drawn vessels (in arm order) */
  make(skin: SkinMesh, axes: readonly ArmAxis[], arms: readonly VesselObject[]): SkinDraw;
  /** where the skins' objects stand (the vessels' own parent, so they share its transform and layer) */
  add(o: Object3D): void;
  remove(o: Object3D): void;
  warn?(message: string): void;
}

/** One arm as the per-frame handover reads it: its tube, the seam's place along it and in the figure. */
interface ArmLink { obj: VesselObject; id: string; end: 0 | 1; u: number; x: number; y: number; span: readonly [number, number]; last: number[] }
interface Built { node: string; mesh: SkinMesh; draw: SkinDraw; arms: ArmLink[] }

/** The seam ring's vertices and normals of one arm, read from the tube `buildTubes` made (spec 4.4: not recomputed): `RADIAL` of them, in the tube's ring order. */
function ringOf(g: BufferGeometry, ring: number): { pos: Float32Array; nor: Float32Array } {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const pos = new Float32Array(TUBE_RADIAL * 3), nor = new Float32Array(TUBE_RADIAL * 3);
  for (let j = 0; j < TUBE_RADIAL; j++) {
    const i = ring * (TUBE_RADIAL + 1) + j;
    pos[j * 3] = p.getX(i); pos[j * 3 + 1] = p.getY(i); pos[j * 3 + 2] = p.getZ(i);
    nor[j * 3] = n.getX(i); nor[j * 3 + 1] = n.getY(i); nor[j * 3 + 2] = n.getZ(i);
  }
  return { pos, nor };
}

/** The centre of a tube's ring and its mean radius. */
function ringCentre(g: BufferGeometry, ring: number): { c: Vec3; r: number } {
  const p = g.getAttribute('position');
  let x = 0, y = 0, z = 0;
  for (let j = 0; j < TUBE_RADIAL; j++) { const i = ring * (TUBE_RADIAL + 1) + j; x += p.getX(i); y += p.getY(i); z += p.getZ(i); }
  x /= TUBE_RADIAL; y /= TUBE_RADIAL; z /= TUBE_RADIAL;
  let r = 0;
  for (let j = 0; j < TUBE_RADIAL; j++) { const i = ring * (TUBE_RADIAL + 1) + j; r += Math.hypot(p.getX(i) - x, p.getY(i) - y, p.getZ(i) - z); }
  return { c: [x, y, z], r: r / TUBE_RADIAL };
}
/** The three points of an arm's axis its skin's ink is drawn from (spec 4.7), junction side first, the tube's own ring centres and radii: the arm's end ring, its seam ring, and the ring `AXIS_REACH_R` radii from the end (the capsule of spec 4.3 reaches 6). */
export const AXIS_REACH_R = 6;
export function axisOf(tube: ArmTube, restR: number, cut: SkinCut): ArmAxis {
  const end = cut.end ? tube.tubular : 0, step = cut.end ? -1 : 1;
  const a = ringCentre(tube.geometry, end), s = ringCentre(tube.geometry, cut.ring);
  let far = cut.ring, at = a.c;
  for (let k = cut.ring; k >= 0 && k <= tube.tubular; k += step) { far = k; at = ringCentre(tube.geometry, k).c; if (Math.hypot(at[0] - a.c[0], at[1] - a.c[1], at[2] - a.c[2]) >= AXIS_REACH_R * restR) break; }
  const f = ringCentre(tube.geometry, far);
  return { pts: [a.c, s.c, f.c], radii: [a.r, s.r, f.r] };
}

export class SkinSet {
  private built: Built[] = [];
  /** the ends that are skinned, by vessel id: [start, end] */
  private readonly ends = new Map<string, [boolean, boolean]>();
  private readonly warned = new Set<string>();
  /** the nodes that fell back to today's method (named, once) */
  readonly fellBack: string[] = [];

  constructor(private readonly deps: SkinSetDeps) {}

  /** The skinned ends of vessel `id` (both false: its joins are today's). */
  endsOf(id: string): readonly [boolean, boolean] { return this.ends.get(id) ?? [false, false]; }
  /** Whether any junction of this set is skinned. */
  get count(): number { return this.built.length; }
  /** The junction nodes that are skinned. */
  get nodes(): readonly string[] { return this.built.map((b) => b.node); }
  /** The built skin of a node, or undefined. */
  skinOf(node: string): SkinMesh | undefined { return this.built.find((b) => b.node === node)?.mesh; }

  /** The tubes of a junction's arms exactly as the scene draws them at rest: the vessel's own course first, `buildTubes`' vertex layout. */
  private tubesOf(j: SkinJunction): Map<string, ArmTube> {
    const m = new Map<string, ArmTube>();
    for (const a of j.arms) {
      const def = NETWORK_BY_ID.get(a.vesselId)!;
      const b = buildTubes(coursesOf(def, this.deps.stateOf(a.vesselId) ?? REST), tubularOf(def, slicesFor(a.vesselId)), def.radius);
      m.set(a.vesselId, { geometry: b.geometry, tubular: b.runs[0]!.tubular });
    }
    return m;
  }

  /** Builds the skins of `phase` (spec 4.1) with the joins as they stand now (Smooth vessel joins on). Any skin built before is removed first. */
  build(phase: 1 | 2): void {
    this.clear();
    const nodes = skinNodesForPhase(phase);
    for (const j of findSkinJunctions()) {
      if (!nodes.has(j.node)) continue;
      try { this.buildOne(j); } catch (e) {
        // (never crashes the scene: this node keeps today's joins)
        this.fellBack.push(j.node);
        if (!this.warned.has(j.node)) { this.warned.add(j.node); (this.deps.warn ?? ((m) => console.warn(m)))(`${(e as Error).message} (keeping today's joins there)`); }
      }
    }
  }

  private buildOne(j: SkinJunction): void {
    const tubes = this.tubesOf(j);
    const ringsFor = (cuts: SkinCut[]): { pos: Float32Array[]; nor: Float32Array[] } => {
      const r = cuts.map((c) => ringOf(tubes.get(c.vesselId)!.geometry, c.ring));
      return { pos: r.map((x) => x.pos), nor: r.map((x) => x.nor) };
    };
    const cuts = chooseCuts(j, tubes, (cs) => hullCovers(ringsFor(cs).pos));
    const { pos, nor } = ringsFor(cuts);
    const mesh = buildSkin(j, cuts, pos, nor);
    for (const t of tubes.values()) t.geometry.dispose();
    const objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
    if (objs.some((o) => !o)) return;   // (a vessel not in this scene: no skin; the tubes are untouched)
    const draw = this.deps.make(mesh, j.arms.map((a, i) => axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!)), objs as VesselObject[]);
    this.deps.add(draw.object);
    const arms: ArmLink[] = j.arms.map((a, i) => {
      const cut = cuts[i]!, ring = pos[i]!;
      let x = 0, y = 0;
      for (let v = 0; v < TUBE_RADIAL; v++) { x += ring[v * 3]!; y += ring[v * 3 + 1]!; }
      const def = NETWORK_BY_ID.get(a.vesselId)!;
      return { obj: objs[i]!, id: a.vesselId, end: a.end, u: cut.u, x: x / TUBE_RADIAL, y: y / TUBE_RADIAL, span: def.lensSpan ?? [0, 1], last: [] };
    });
    // the tubes: cut at the seam, their ends' mates and burial off (the scene's applyMates reads `endsOf`)
    const cutOf = new Map<string, [number, number]>();
    for (const a of arms) {
      const c = cutOf.get(a.id) ?? [SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]];
      if (a.end === 0) c[0] = a.u; else c[1] = a.u;
      cutOf.set(a.id, c);
      const e = this.ends.get(a.id) ?? [false, false];
      e[a.end] = true; this.ends.set(a.id, e);
    }
    for (const [id, c] of cutOf) this.deps.vessel(id)!.setSkinCut(c[0], c[1]);
    this.built.push({ node: j.node, mesh, draw, arms });
  }

  /** Every cut, skin and flag back to today's joins (the caller runs applyMates afterwards, which reads `endsOf` again). */
  clear(): void {
    for (const id of this.ends.keys()) this.deps.vessel(id)?.setSkinCut(SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]);
    this.ends.clear();
    for (const b of this.built) { this.deps.remove(b.draw.object); b.draw.dispose(); }
    this.built = [];
    this.fellBack.length = 0;
  }

  dispose(): void { this.clear(); }

  /** The live handover, once a frame after the vessels have moved: for each arm what its tube has at its seam, copied to the skin only when it changed. True when any skin's numbers changed (the scene draws a frame). */
  sync(): boolean {
    let changed = false;
    for (const b of this.built) {
      let any = false, blend = false;
      b.arms.forEach((a, i) => {
        const u = a.obj.toon.uniforms, v = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
        const fade: FadeState = { mode: u.fadeMode!.value as number, a: [v('fadeA').x, v('fadeA').y, v('fadeA').z, v('fadeA').w], line: [v('fadeLine').x, v('fadeLine').y, v('fadeLine').z, v('fadeLine').w], cavaEnd: [v('cavaEnd').x, v('cavaEnd').y], stumpCut: v('stump').x, len: u.len!.value as number, units: 300 };
        const hi: HiState = { on: u.hiOn!.value as number, dir: u.hiDir!.value as number, offset: u.hiOffset!.value as number, ahead: u.hiAhead!.value as number, behind: u.hiBehind!.value as number, ends: [v('hiEnds').x, v('hiEnds').y], fade: u.hiFade!.value as number, len: u.len!.value as number };
        const f = liveFadeAt(fade, a.u, a.x, a.y), h = hiWeightAt(hi, a.u), l = lensUAt(a.span, a.u);
        const col = u.color!.value as { r: number; g: number; b: number }, lu = (u.lensUse!.value as number) > 0.5 ? 1 : 0;
        if (a.last[0] !== f || a.last[1] !== h || a.last[2] !== l || a.last[3] !== col.r || a.last[4] !== col.g || a.last[5] !== col.b || a.last[6] !== lu) {
          a.last = [f, h, l, col.r, col.g, col.b, lu]; b.draw.setArm(i, f, h, l, { r: col.r, g: col.g, b: col.b, a: lu }); any = true;
        }
        if (a.obj.toon.transparent) blend = true;
      });
      if (any) changed = true;
      b.draw.setTransparent(blend);
    }
    return changed;
  }
}
