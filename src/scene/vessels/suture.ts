// The running stitch at a WELDED sewn end of a surgical shunt (the Warren shunt's end in the left renal vein, the portocaval shunt's in the cava, the mesocaval's two, the Meso-Rex's start), drawn as an object of its own.
//
// ROOT CAUSE of the missing stitches (Mohammad, 22 Nov, "no sutures at the welded shunt ends"): the stitches are painted by the TUBE's fragment stage (vessels/seams.ts, glsl-shared.ts PROCEDURE_MARKS_GLSL), on the stretch of the tube
// within about 40 figure units of its end. Where a junction skin welds the end, the tube is cut at the skin's seam ring (VesselObject.setSkinCut) and the whole of that stretch is not drawn (the weld's discard); the skin's own shader
// carries no marks, and it is shared by every junction in the figure, so the suture was simply gone. (tests/suture.test.ts holds the figures: at every welded end the stitches lie wholly in the cut part.)
//
// THE FIX is a separate object, so the shared skin shader stays as it is: a ribbon laid on the FRONT half of the arm's wall at its seam ring, as the stitch is on the tube:
//   - the marks are the tube's own rule: `seamStitch` (glsl-shared.ts), the very function the tube's marks call, with the same thread, halo, dashes and slant (the curve's offsets from its middle, so it runs through the ring's centre);
//   - the line is as long as the arm is wide NOW: the ring's rest radius times `swellOf` from the vessel data texture (and the seam's waist), read in the vertex stage, so it follows the engine's widening and narrowing;
//   - the ribbon is the half pipe `centre + R (a D + sqrt(1 - a^2) N)`: D across the tube on the screen (the tube's `side`, cross(tangent, view)), N toward the viewer, a the place across the tube is `across` on the tube. A line across the tube
//     on the screen, never a ring round it;
//   - the depth is the tube's rule (the axis' depth, 15 % of the surface's: TUBE_DEPTH_SHARE) lifted a hair, and it is drawn in the vessels' pass with the arm's front copy;
//   - its alpha is the tube's fade at the seam times how much of the tube is there (the shunt's drawing on and off) times the weld's share (the tube's cut end, drawn where the skin is not, wears its own stitches until the skin has it), and it goes with the
//     Circuit's change as the skin does (SKIN_CIRC_SPAN).
// Only where the skin cut the tube's own stitches away: the objects come from `SkinSet.seamsOf`, which lists the arms of the drawn skins. An end the tube still draws itself (no skin, a growing arm the skin dropped) has none.
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, type IUniform } from 'three';
import type { DataTexture, Texture } from 'three';
import { markBlends, setBlendState } from '../materials/warm.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { SEAM_STITCH_GLSL, SWELL_OF_GLSL, THREAD_GLSL } from './glsl-shared.ts';
import { SEWN_IDS, seamsFor, seamAtA, type SeamCurve } from './seams.ts';
import { TUBE_DEPTH_SHARE } from './shaders.ts';
import { widthSwell } from './live-width.ts';
import { SKIN_CIRC_SPAN } from './skin/types.ts';
import { rankAt } from './skin/skin-rank.ts';
import { PEEL_DL } from '../circuit/peel.ts';
import { glslNum as F } from '../cel-glsl.ts';
import type { ArmSeam, SeamRing, SkinSet } from './skin/skin-set.ts';
import type { VesselObject } from './vessel-object.ts';
import { gate } from '../gate.ts';

/** The figure's units in one scene unit on the body (the marks' lengths are figure units, as 2D's). */
export const SUTURE_UNITS = 300;
/** Columns across the ribbon: the half circle it lies on, 24 chords. */
export const SUTURE_COLS = 24;
/** The ribbon stands this far toward the viewer of the wall (a share of the live radius, and a hair in scene units): the skin's surface is the tube's own at the ring and within a fifth of a radius of it half a radius on, and the depth rule's 15 % of that. */
export const SUTURE_LIFT_R = 0.06, SUTURE_LIFT = 0.0004;
/** The sewn ends' vessels. */
const SEWN_SET: ReadonlySet<string> = new Set(SEWN_IDS);
export const isSewn = (id: string): boolean => SEWN_SET.has(id);

/** How far the ribbon reaches along the arm each way, as the vertex stage works it out: `x` figure units that do not depend on the width (the curve's slant from its middle at most, the thread's edge), `y` the share of the edge's reach that does (the edge is 0.8 of the distance square to
 *  the curve, which is a step of 1 + slope along the arm; the slope is the curve's own per the lumen's half width). Three ticks (no dashes) are 3.5 either side of the line. */
export function seamReach(s: SeamCurve): { slant: number; reach: number; der: number } {
  let slant = 0, der = 0;
  const a0 = seamAtA(s, 0);
  for (let i = 0; i <= 40; i++) {
    const a = -1 + i / 20;
    slant = Math.max(slant, Math.abs(seamAtA(s, a) - a0));
    der = Math.max(der, Math.abs(s.c[1] + a * (2 * s.c[2] + a * (3 * s.c[3] + a * 4 * s.c[4]))));
  }
  return { slant, reach: 0.4, der };
}

export const SUTURE_VS = /* glsl */ `
uniform vec3 sCentre;   // the seam ring's centre (model space)
uniform vec3 sHead;     // the unit heading from the ring away from the node, into the tube
uniform float sCourse;  // +1 where the tube's course runs along the heading (the vessel's start), -1 where it runs against it (its end)
uniform float sRest;    // the ring's mean rest radius (scene units)
uniform vec4 sData;     // the arm's data texel (index, built diameter, width kind) and the waist its tube has at the ring
uniform vec3 sExt;      // how far the ribbon reaches along the arm: figure units, and the share that grows with the curve's slope per the half width
uniform float frontDepth;
uniform float useData;
uniform sampler2D vdata;
uniform vec2 vdataSize;
attribute vec2 aq;      // x the place across (-1 to 1, the tube's \`across\`), y which side of the line along the arm (-1 or 1)
varying vec3 vMark;     // the place across; the distance along the arm from the ring's centre, figure units; the lumen's half width, figure units
${SWELL_OF_GLSL}
void main() {
  // the arm's live width at the seam: the skin's own rule for an arm (skin/shaders.ts: swellOf, less the waist), so the line is as long as the wall the skin carries on from the tube is wide
  float sw = swellOf(sData.x, sData.y, sData.z) * (1.0 - clamp(sData.w, 0.0, 0.97));
  float R = sRest * sw;
  float rr = max(R * ${F(SUTURE_UNITS)}, 0.3);
  float sig = aq.y * (sExt.x + sExt.y / rr + sExt.z * rr);
  vec3 axisM = sCentre + sHead * (sig / ${F(SUTURE_UNITS)});
  vec3 camM = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vec3 V = normalize(camM - axisM);
  vec3 Tc = sHead * sCourse;
  // the tube's own \`side\` (shaders.ts: cross(tangent, view)), a fixed one for a tube seen end on, and the way toward the viewer square to both
  vec3 D = cross(Tc, V);
  float dl = length(D);
  D = dl > 1e-4 ? D / dl : normalize(cross(Tc, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 N = cross(D, Tc);
  if (dot(N, V) < 0.0) N = -N;
  float a = aq.x;
  vec3 S = axisM + R * (a * D + sqrt(max(0.0, 1.0 - a * a)) * N);
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(axisM, 1.0));
  vec4 c = projectionMatrix * (modelViewMatrix * vec4(S, 1.0));
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)}) * c.w;   // depth by the axis, as the tube's and the skin's
  c.z -= (frontDepth + ${F(SUTURE_LIFT_R)} * R + ${F(SUTURE_LIFT)}) * (-projectionMatrix[3][2]) / c.w;
  gl_Position = c;
  vMark = vec3(a, sig, rr);
}`;

export const SUTURE_FS = /* glsl */ `
uniform vec4 sSeamA;    // the seam as the tube's own uniform has it (seams.ts: c0..c3, then c4, how many dashes, one dash, one dash and its gap)
uniform vec4 sSeamB;
uniform float sAlpha;   // the tube's fade at the seam, the arm's presence, the weld's share, the front copy's
uniform float circT;
uniform float sRank;    // where in the flow the seam lies (skin-rank.ts rankAt): the thread goes as ITS tubes leave, not as the whole change does
varying vec3 vMark;
${THREAD_GLSL}
${SEAM_STITCH_GLSL}
void main() {
  float fwAcr = fwidth(vMark.x);   // (before any discard)
  // the seam's own share of the change: the tubes peel by rank (circuit/peel.ts), so the whole change's clock left the thread standing in place after its tubes had gone
  float px = (circT - ${F(PEEL_DL)} * sRank) / ${F(1 - PEEL_DL)};
  float own = circT <= 0.0 ? 0.0 : circT >= 1.0 || px >= 1.0 ? 1.0 : px <= 0.0 ? 0.0 : px * px * (3.0 - 2.0 * px);
  float k = sAlpha * (1.0 - smoothstep(0.0, ${F(SKIN_CIRC_SPAN)}, own));
  vec2 st = seamStitch(sSeamA, sSeamB, sSeamA.x + vMark.y, clamp(vMark.x, -1.0, 1.0), vMark.z, fwAcr);
  float te = st.y * 0.85;
  float al = st.x + (1.0 - st.x) * te;   // (the tube's marks as an overlay: mix(mix(body, EDGE, te * 0.4), THREAD, tw) is body (1 - al) + rgb al)
  if (al * k < 0.004) discard;
  gl_FragColor = vec4((THREAD * st.x + THREAD_EDGE * (1.0 - st.x) * te) / max(al, 1e-5), al * k);
}`;

let shared: BufferGeometry | null = null;
/** The ribbon's one geometry (every suture shares it): SUTURE_COLS + 1 columns across, two rows along the arm. */
function ribbon(): BufferGeometry {
  if (shared) return shared;
  const n = SUTURE_COLS + 1, aq = new Float32Array(n * 2 * 2), index: number[] = [];
  for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) { const v = i * 2 + r; aq[v * 2] = -1 + (2 * i) / SUTURE_COLS; aq[v * 2 + 1] = r ? 1 : -1; }
  for (let i = 0; i < SUTURE_COLS; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; index.push(a, b, c, b, d, c); }
  const g = new BufferGeometry();
  g.setAttribute('aq', new BufferAttribute(aq, 2));
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 2 * 3), 3));   // (three wants one; the vertex stage places the ribbon)
  g.setIndex(index);
  shared = g;
  return g;
}

/** The uniforms a suture takes from its arm's tube by reference: the vessel data texture and the Circuit's change. */
const FROM_ARM = ['vdata', 'vdataSize', 'useData', 'circT'] as const;

/** One suture: the stitch at one welded end of one shunt. */
export class SutureObject {
  readonly vesselId: string;
  readonly end: 0 | 1;
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly arm: VesselObject;
  private restR = 0;
  private narrow = 0;
  private curve: SeamCurve | null = null;
  private alpha = 0;

  constructor(vesselId: string, end: 0 | 1, arm: VesselObject) {
    this.vesselId = vesselId; this.end = end; this.arm = arm;
    const au = arm.toon.uniforms, uniforms: Record<string, IUniform> = {};
    for (const k of FROM_ARM) uniforms[k] = au[k]!;
    Object.assign(uniforms, {
      sCentre: { value: [0, 0, 0] }, sHead: { value: [0, 0, 1] }, sCourse: { value: end === 0 ? 1 : -1 }, sRest: { value: 0 },
      sData: { value: [(au.vindex!.value as number), (au.baseD!.value as number), (au.widthKind!.value as number), 0] },
      sExt: { value: [0, 0, 0] }, sSeamA: { value: [0, 0, 0, 0] }, sSeamB: { value: [0, 0, 0, 0] }, sAlpha: { value: 0 }, sRank: { value: rankAt(vesselId, end) || 0 }, frontDepth: au.frontDepth!,
    });
    // (plain arrays hold the vectors: three takes an array of 3 or 4 numbers for a vec3 / vec4 uniform, and the tests read them as they are)
    this.material = setBlendState(markBlends(new ShaderMaterial({ name: 'suture', vertexShader: SUTURE_VS, fragmentShader: SUTURE_FS, precision: 'highp', transparent: true, depthWrite: false, depthTest: true, uniforms })), true);
    this.mesh = new Mesh(ribbon(), this.material);
    this.mesh.name = `suture:${vesselId}:${end}`;
    this.mesh.frustumCulled = false;   // (the vertex stage places it)
    this.mesh.layers.set(VESSEL_LAYER);   // (the arm's front copy's: the vessels' pass)
    this.mesh.renderOrder = 4;   // (after the tubes' veil copy 2 and the crossing shadow 3: the thread lies over the line)
    gate(this.mesh, 0);
    this.mesh.raycast = () => {};   // (the pick is the tube's)
  }

  /** Puts the suture on a seam ring with the seam's curve and its alpha; the ring's rest radius and the waist the tube has there. Returns whether anything changed. */
  update(ring: SeamRing, curve: SeamCurve | null, alpha: number, narrow: number): boolean {
    const u = this.material.uniforms;
    let changed = false;
    const c = u.sCentre!.value as number[], h = u.sHead!.value as number[];
    if (c[0] !== ring.c[0] || c[1] !== ring.c[1] || c[2] !== ring.c[2] || h[0] !== ring.h[0] || h[1] !== ring.h[1] || h[2] !== ring.h[2] || this.restR !== ring.r) {
      u.sCentre!.value = [ring.c[0], ring.c[1], ring.c[2]]; u.sHead!.value = [ring.h[0], ring.h[1], ring.h[2]]; u.sRest!.value = this.restR = ring.r; changed = true;
    }
    if (this.narrow !== narrow) { this.narrow = narrow; (u.sData!.value as number[])[3] = narrow; changed = true; }
    if (curve !== this.curve) {
      this.curve = curve;
      if (curve) {
        const r = seamReach(curve);
        u.sSeamA!.value = [curve.c[0], curve.c[1], curve.c[2], curve.c[3]]; u.sSeamB!.value = [curve.c[4], curve.n, curve.dash, curve.per];
        u.sExt!.value = [r.slant + r.reach + 0.2, 0, 0.42 * 1.0];   // (a bite reaches 0.27 R along the arm, its thread and ink 0.13 R more)
      }
      changed = true;
    }
    const a = curve ? alpha : 0;
    if (Math.abs(a - this.alpha) > 1e-6) { this.alpha = a; u.sAlpha!.value = a; changed = true; }
    const was = this.mesh.visible;
    if (gate(this.mesh, curve ? this.alpha : 0, 0.0039) !== was) changed = true;   // (the stitch's own eased alpha: drawn from one 8-bit step up)
    return changed;
  }

  /** The ring's centre, as placed. */
  centre(): readonly [number, number, number] { const c = this.material.uniforms.sCentre!.value as number[]; return [c[0]!, c[1]!, c[2]!]; }
  /** The unit heading from the ring into the tube, as placed. */
  heading(): readonly [number, number, number] { const h = this.material.uniforms.sHead!.value as number[]; return [h[0]!, h[1]!, h[2]!]; }
  /** The ring's rest radius (the mesh's, scene units). */
  restRadius(): number { return this.restR; }
  /** The alpha it is drawn with (before the Circuit's change takes it away). */
  alphaNow(): number { return this.alpha; }
  /** The seam's curve it wears now (null: none at this end). */
  curveNow(): SeamCurve | null { return this.curve; }
  /** The line's half length NOW, scene units: the CPU's twin of the vertex stage's `sRest * swellOf(...) * (1 - waist)`, read from the same vessel data texture. */
  liveHalfLength(): number {
    const u = this.material.uniforms, use = (u.useData!.value as number) > 0.5, data = u.sData!.value as number[];
    let d: number | undefined;
    if (use) {
      const tex = u.vdata!.value as Texture & { image: { data?: ArrayLike<number> } }, size = u.vdataSize!.value as { x: number; y: number }, idx = data[0]!;
      const arr = (tex as DataTexture).image.data;
      if (arr && size.x > 0) d = arr[((Math.floor(idx / size.x)) * size.x + (idx % size.x)) * 4 + 2];
    }
    return this.restR * widthSwell(data[2] as 0 | 1 | 2, data[1]!, d) * (1 - Math.min(0.97, Math.max(0, data[3]!)));
  }
  /** The arm's tube this suture belongs to. */
  get armObject(): VesselObject { return this.arm; }
  dispose(): void { this.material.dispose(); }
}

/** What the set needs of the scene (a test hands in plain ones). */
export interface SutureDeps {
  add(o: Mesh): void;
  remove(o: Mesh): void;
  /** the portocaval shunt is side to side (the Warren-style start is then sewn too: seams.ts seamsFor) */
  side(): boolean;
}

/** The sutures of a scene: one per welded sewn end, made when a skin cuts the tube's own stitches away and given back when it does not. */
export class SutureSet {
  private readonly objects = new Map<string, SutureObject>();
  private readonly deps: SutureDeps;
  constructor(deps: SutureDeps) { this.deps = deps; }

  /** Every suture there is (a shunt that is off has its object still, undrawn: the program is built and warm). */
  all(): readonly SutureObject[] { return [...this.objects.values()]; }
  /** The sutures drawn now. */
  shown(): readonly SutureObject[] { return this.all().filter((o) => o.mesh.visible); }
  of(vesselId: string, end: 0 | 1): SutureObject | undefined { return this.objects.get(`${vesselId}:${end}`); }

  /** The handover, once a frame after the skins' own (skin-set.ts sync): each welded end's suture takes its ring, curve and alpha. True when anything changed. */
  sync(skins: SkinSet | null): boolean {
    const seams: ArmSeam[] = skins ? skins.seamsOf(SEWN_SET).filter((s) => !s.obj.behindOrgans) : [], side = this.deps.side(), seen = new Set<string>();
    let changed = false;
    for (const s of seams) {
      const key = `${s.vesselId}:${s.end}`;
      // (an end the tube never stitches in either portocaval case, the Warren shunt's start, is no suture's)
      if (!seamsFor(s.vesselId, false)[s.end] && !seamsFor(s.vesselId, true)[s.end]) continue;
      seen.add(key);
      let o = this.objects.get(key);
      if (!o) { o = new SutureObject(s.vesselId, s.end, s.obj); this.objects.set(key, o); this.deps.add(o.mesh); changed = true; }
      const front = s.obj.copyShares()[0], narrow = s.obj.toonMesh.geometry.getAttribute('narrow')?.getX(s.vi) ?? 0;
      if (o.update(s.ring, seamsFor(s.vesselId, side)[s.end], s.fade * s.presence * s.weld * front, narrow)) changed = true;
    }
    for (const [key, o] of [...this.objects]) {
      if (seen.has(key)) continue;
      this.deps.remove(o.mesh); o.dispose(); this.objects.delete(key); changed = true;
    }
    return changed;
  }

  dispose(): void { for (const o of this.objects.values()) { this.deps.remove(o.mesh); o.dispose(); } this.objects.clear(); }
}
