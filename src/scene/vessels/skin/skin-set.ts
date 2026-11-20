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
import { planSkins, type ArmTube } from './cuts.ts';
import { buildSkin, hullCovers } from './mesh.ts';
import type { Capsule } from './sdf.ts';
import { SKIN_CUT_NONE, SKIN_HIDDEN, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from './types.ts';
import { armPresenceAt, hiWeightAt, lensUAt, liveFadeAt, type FadeState, type HiState } from './arm-twins.ts';
import type { VesselObject } from '../vessel-object.ts';
import type { ArmAxis, ArmColour } from './skin-object.ts';
import { SKIN_FIGURE_UNITS } from './shaders.ts';

/** What the skin's drawing object offers the set (skin-object.ts is the real one; a test hands in a plain recorder). */
export interface SkinDraw {
  readonly object: Object3D;
  /** the live handover for arm `i`: its tube's alpha at its seam, its highlight weight there, and its lens ramp's position there */
  setArm(i: number, fade: number, hi: number, lensU: number, colour: ArmColour, narrow: number): void;
  setArc(i: number, seamArc: number, dir: number, length: number, restR: number, flow: number): void;
  setPres(i: number, p: number): void;
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
interface ArmLink { /** the seam ring's first vertex in the tube's geometry (`narrow` is read there) */ vi: number; obj: VesselObject; id: string; end: 0 | 1; u: number; x: number; y: number; span: readonly [number, number]; last: number[] }
interface Built { node: string; mesh: SkinMesh; draw: SkinDraw; arms: ArmLink[] }

/** The seam ring's vertices and normals of one arm, read from the tube `buildTubes` made (spec 4.4: not recomputed): `RADIAL` of them, in the tube's ring order. */
function ringOf(g: BufferGeometry, ring: number, radius: number): { pos: Float32Array; nor: Float32Array; rest: Float32Array } {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), rk = g.getAttribute('rk');
  const pos = new Float32Array(TUBE_RADIAL * 3), nor = new Float32Array(TUBE_RADIAL * 3), rest = new Float32Array(TUBE_RADIAL);
  for (let j = 0; j < TUBE_RADIAL; j++) {
    const i = ring * (TUBE_RADIAL + 1) + j;
    pos[j * 3] = p.getX(i); pos[j * 3 + 1] = p.getY(i); pos[j * 3 + 2] = p.getZ(i);
    nor[j * 3] = n.getX(i); nor[j * 3 + 1] = n.getY(i); nor[j * 3 + 2] = n.getZ(i);
    rest[j] = radius * rk.getX(i);   // the tube's own rest radius here: the vertex stage's `radius * rk`
  }
  return { pos, nor, rest };
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
/** The three points of an arm's axis its skin's ink and fillet are made from (spec 4.3, 4.7), junction side first. The seam point is the tube's own seam ring centre and radius (so the outline is exact there); the other two lie on the line through it along the tube's heading at the seam
 *  (the difference of the neighbouring ring centres), the first as far back toward the node as the arm's end ring is, the last `AXIS_REACH_R` radii from that end: a straight capsule through the seam never kinks against the tube's smooth curve at it, which a polyline of the
 *  tube's own, coarse, ring centres does (HA's left branch turns 45 degrees between two rings, a half pixel of ink off at the seam). Their radii are the end ring's and the tube's radius where the far point's ring is. */
export const AXIS_REACH_R = 6;
/** An arm whose end ring lies more than this many of its radii from J gets J put in front of its capsule (spec 10.5). */
export const BRIDGE_MIN_R = 0.1;
export function axisOf(tube: ArmTube, restR: number, cut: SkinCut, J?: Vec3): ArmAxis {
  const out = cut.end ? -1 : 1, last = tube.tubular;
  const end = cut.end ? last : 0, a = ringCentre(tube.geometry, end), s = ringCentre(tube.geometry, cut.ring);
  const lo = Math.min(last, Math.max(0, cut.ring - out)), hi = Math.min(last, Math.max(0, cut.ring + out));   // (the ring nearer the node, the ring farther from it)
  const cl = ringCentre(tube.geometry, lo).c, ch = ringCentre(tube.geometry, hi).c;
  let tx = ch[0] - cl[0], ty = ch[1] - cl[1], tz = ch[2] - cl[2];
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  const d0 = Math.hypot(s.c[0] - a.c[0], s.c[1] - a.c[1], s.c[2] - a.c[2]), d2 = Math.max(AXIS_REACH_R * restR - d0, restR);
  let far = cut.ring, at = s.c;
  for (let k = cut.ring; k >= 0 && k <= last; k += out) { far = k; at = ringCentre(tube.geometry, k).c; if (Math.hypot(at[0] - a.c[0], at[1] - a.c[1], at[2] - a.c[2]) >= AXIS_REACH_R * restR) break; }
  const f = ringCentre(tube.geometry, far);
  const p1: Vec3 = [s.c[0] - tx * d0, s.c[1] - ty * d0, s.c[2] - tz * d0];
  // THE BRIDGE (spec 10.5): every capsule starts AT J. Where the art leaves a gap (the arm's end more than a tenth of a radius from J) J is put in front, with the end ring's radius, so the union bridges the gap with the arm's own width and the hull (the rings alone) is unchanged
  const bridged = J && Math.hypot(J[0] - a.c[0], J[1] - a.c[1], J[2] - a.c[2]) > BRIDGE_MIN_R * restR;   // (judged on the tube's own end ring: a tube that reaches J but bends on the way is not a gap)
  return { pts: [bridged ? J! : p1, p1, s.c, [s.c[0] + tx * d2, s.c[1] + ty * d2, s.c[2] + tz * d2]], radii: [a.r, a.r, s.r, f.r] };
}

/** An arm's arc numbers for the skin's flow marks (the tube's `vUv.x * len * vU` at the seam, 300 figure units to the scene unit on the body): the arc at the seam, which way it grows toward the node, the vessel's length and its rest radius, all in figure units. */
export function armArcOf(end: 0 | 1, u: number, len: number, radius: number): { seamArc: number; dir: number; length: number; restR: number } {
  return { seamArc: u * len * SKIN_FIGURE_UNITS, dir: end === 1 ? 1 : -1, length: len * SKIN_FIGURE_UNITS, restR: radius * SKIN_FIGURE_UNITS };
}

/** An axis as the mesh builder's capsule (sdf.ts): the same three points and radii. */
const capsuleOf = (a: ArmAxis): Capsule => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii) });

export class SkinSet {
  private built: Built[] = [];
  /** the ends that are skinned, by vessel id: [start, end] */
  private readonly ends = new Map<string, [boolean, boolean]>();
  private readonly warned = new Set<string>();
  /** the nodes that fell back to today's method (named, once) */
  readonly fellBack: string[] = [];

  private readonly deps: SkinSetDeps;
  constructor(deps: SkinSetDeps) { this.deps = deps; }

  /** The skinned ends of vessel `id` (both false: its joins are today's). */
  endsOf(id: string): readonly [boolean, boolean] { return this.ends.get(id) ?? [false, false]; }
  /** Whether any junction of this set is skinned. */
  get count(): number { return this.built.length; }
  /** The junction nodes that are skinned. */
  get nodes(): readonly string[] { return this.built.map((b) => b.node); }
  /** The vessel ids of a built skin's arms, in arm order (the draw returned by `make`). */
  armIdsOf(draw: SkinDraw): readonly string[] { return this.built.find((b) => b.draw === draw)?.arms.map((a) => a.id) ?? []; }
  /** The built skin of a node, or undefined. */
  skinOf(node: string): SkinMesh | undefined { return this.built.find((b) => b.node === node)?.mesh; }

  /** The tubes of the junctions' arms exactly as the scene draws them at rest: the vessel's own course first, `buildTubes`' vertex layout. */
  private tubesOf(js: readonly SkinJunction[]): Map<string, ArmTube> {
    const m = new Map<string, ArmTube>();
    for (const j of js) for (const a of j.arms) {
      if (m.has(a.vesselId)) continue;
      const def = NETWORK_BY_ID.get(a.vesselId)!;
      const b = buildTubes(coursesOf(def, this.deps.stateOf(a.vesselId) ?? REST), tubularOf(def, slicesFor(a.vesselId)), def.radius);
      m.set(a.vesselId, { geometry: b.geometry, tubular: b.runs[0]!.tubular });
    }
    return m;
  }

  /** Builds the skins of `phase` (spec 4.1) with the joins as they stand now (Smooth vessel joins on). Any skin built before is removed first. Planned together (cuts.ts planSkins: two skins on one vessel merge when they would crowd); a node that cannot be
   *  built keeps today's joins, is named in `fellBack` and warned once. */
  build(phase: 1 | 2): void {
    this.clear();
    const nodes = skinNodesForPhase(phase);
    const js = findSkinJunctions().filter((j) => nodes.has(j.node));
    if (!js.length) return;
    const tubes = this.tubesOf(js);
    const warn = this.deps.warn ?? ((m: string) => console.warn(m));
    const ringsFor = (cuts: SkinCut[]): { pos: Float32Array[]; nor: Float32Array[]; rest: Float32Array[] } => {
      const r = cuts.map((c) => ringOf(tubes.get(c.vesselId)!.geometry, c.ring, NETWORK_BY_ID.get(c.vesselId)!.radius));
      return { pos: r.map((x) => x.pos), nor: r.map((x) => x.nor), rest: r.map((x) => x.rest) };
    };
    const { plans, failures } = planSkins(js, tubes, () => (cs) => hullCovers(ringsFor(cs).pos));
    for (const f of failures) this.fail(f.node, f.message, warn);
    const cutOf = new Map<string, [number, number]>();
    for (const plan of plans) {
      const j = plan.junction;
      try {
        const objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
        if (objs.some((o) => !o)) continue;   // (a vessel not in this scene: no skin; the tubes are untouched)
        const { pos, nor, rest } = ringsFor(plan.cuts);
        // the arms' axes: the tubes' own ring centres and radii, the SAME three-point polylines the skin's fragment stage draws its ink from, so the mesh's fillet and its outline are one shape
        const axes = j.arms.map((a, i) => axisOf(tubes.get(a.vesselId)!, a.restR, plan.cuts[i]!, j.J));
        const mesh = buildSkin(j, plan.cuts, pos, nor, axes.map(capsuleOf));
        // on a seam ring the skin's rest radius is the tube's own, exactly (the mesh builder measures the ring's mean radius, a few parts in 10^4 off the tube's `radius * rk`): the live move of a seam vertex is then the tube's to the last bit (spec 4.6)
        mesh.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { mesh.restR[v] = rest[a]![q]!; }));
        const draw = this.deps.make(mesh, axes, objs as VesselObject[]);
        this.deps.add(draw.object);
        const arms: ArmLink[] = j.arms.map((a, i) => {
          const cut = plan.cuts[i]!, ring = pos[i]!;
          let x = 0, y = 0;
          for (let v = 0; v < TUBE_RADIAL; v++) { x += ring[v * 3]!; y += ring[v * 3 + 1]!; }
          return { vi: cut.ring * (TUBE_RADIAL + 1), obj: objs[i]!, id: a.vesselId, end: a.end, u: cut.u, x: x / TUBE_RADIAL, y: y / TUBE_RADIAL, span: NETWORK_BY_ID.get(a.vesselId)!.lensSpan ?? [0, 1], last: [] };
        });
        this.built.push({ node: j.node, mesh, draw, arms });
        // the tubes: cut at their seams, both ends of a vessel that two skins share in ONE cut (the second never overwrites the first); a vessel a merged skin replaces whole is hidden (2, -1)
        for (const a of arms) {
          const c = cutOf.get(a.id) ?? [SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]];
          if (a.end === 0) c[0] = a.u; else c[1] = a.u;
          cutOf.set(a.id, c);
          const e = this.ends.get(a.id) ?? [false, false]; e[a.end] = true; this.ends.set(a.id, e);
        }
        for (const id of plan.hidden) { cutOf.set(id, [SKIN_HIDDEN[0], SKIN_HIDDEN[1]]); this.ends.set(id, [true, true]); }
      } catch (e) { this.fail(j.node, (e as Error).message, warn); }   // (never crashes the scene: this node keeps today's joins)
    }
    for (const [id, c] of cutOf) this.deps.vessel(id)?.setSkinCut(c[0], c[1]);
    for (const t of tubes.values()) t.geometry.dispose();
  }

  private fail(node: string, message: string, warn: (m: string) => void): void {
    this.fellBack.push(node);
    if (!this.warned.has(node)) { this.warned.add(node); warn(`${message} (keeping today's joins there)`); }
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
        const nar = a.obj.toonMesh.geometry.getAttribute('narrow')?.getX(a.vi) ?? 0;   // (the stenosis waist the tube has at its seam; disease/clamps.ts writes it, only for a vessel that is stenosed)
        if (a.last[0] !== f || a.last[1] !== h || a.last[2] !== l || a.last[3] !== col.r || a.last[4] !== col.g || a.last[5] !== col.b || a.last[6] !== lu || a.last[7] !== nar) {
          a.last = [f, h, l, col.r, col.g, col.b, lu, nar, a.last[8] ?? NaN, a.last[9] ?? NaN, a.last[10] ?? NaN]; b.draw.setArm(i, f, h, l, { r: col.r, g: col.g, b: col.b, a: lu }, nar); any = true;
        }
        // the arm's presence: the skin is there as much as its tube is (visible, drawn on, dissolved)
        const pr = armPresenceAt(a.obj.group.visible, u.reveal!.value as number, u.fade!.value as number, a.u);
        if (a.last[10] !== pr) { a.last[10] = pr; b.draw.setPres(i, pr); any = true; }
        // the arm's flow marks ride on its arc (armArcOf: the tube's own u x len x figure units) and its tube's flowAmount
        const ln = u.len!.value as number, rd = u.radius!.value as number, fl = u.flowAmount!.value as number;
        if (a.last[8] !== ln || a.last[9] !== fl) {
          a.last[8] = ln; a.last[9] = fl;
          const arc = armArcOf(a.end, a.u, ln, rd); b.draw.setArc(i, arc.seamArc, arc.dir, arc.length, arc.restR, fl); any = true;
        }
        if (a.obj.toon.transparent) blend = true;
      });
      if (any) changed = true;
      b.draw.setTransparent(blend);
    }
    return changed;
  }
}
