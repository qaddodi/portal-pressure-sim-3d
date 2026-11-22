import { CIRC_ARTERY, CIRC_BED, MIN_PX } from '../circuit/width.ts';
import { vdbgDefines, vdbgUniforms } from './debug-view.ts';
import { HI_NONE } from '../materials/shaders.ts';
import { markBlends, setBlendState } from '../materials/warm.ts';
import { BufferAttribute, BufferGeometry, Color, CustomBlending, DataTexture, DoubleSide, FloatType, LinearSRGBColorSpace, MaxEquation, Mesh, Sphere, NearestFilter, OneFactor, RGBAFormat, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS, VESSEL_VS } from './shaders.ts';
import type { BloodShared } from '../blood/field.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import type { LookId } from '../palette.ts';
import { CIRCUIT_ATTRIBUTES, withCircuitAttributes } from '../circuit/geometry.ts';
import { CASING, RIM_A, RIM_INK, SHADOW, SHADOW_DEPTH, SHADOW_DEPTH_MAP, SHADOW_PX } from './cel-ink.ts';
import type { SeamCurve } from './seams.ts';
import { CEL_STYLE } from '../cel-style.ts';
import type { CircuitShared } from '../circuit/uniforms.ts';
import { cavaWholeAlpha } from './fades.ts';
import { SKIN_CUT_C_NONE, SKIN_CUT_NONE, SKIN_HOLE_NONE } from './skin/types.ts';
import { GLOW_LAYER } from '../glow.ts';

/** Uniforms every vessel shares: the two lens textures held for the crossfade, their stream colours, and the cross-fade itself. */
export interface LensShared {
  lensGradA: { value: Texture }; lensLaneA: { value: Texture }; lensModeA: { value: number }; lensRawA: { value: number };
  lensGradB: { value: Texture }; lensLaneB: { value: Texture }; lensModeB: { value: number }; lensRawB: { value: number };   // (lensRaw: 1 when that set's colours are authored as drawn, the pressure ramp: cel-glsl.ts tubeRawK)
  laneColA: { value: Vector3[] }; laneColB: { value: Vector3[] };
  lensMix: { value: number }; lensTail: { value: number };
}

export function createLensShared(): LensShared {
  const blank = (): Texture => { const t = new DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  const lanes = () => Array.from({ length: 5 }, () => new Vector3());
  return {
    lensGradA: { value: blank() }, lensLaneA: { value: blank() }, lensModeA: { value: 0 }, lensRawA: { value: 0 },
    lensGradB: { value: blank() }, lensLaneB: { value: blank() }, lensModeB: { value: 0 }, lensRawB: { value: 0 },
    laneColA: { value: lanes() }, laneColB: { value: lanes() },
    lensMix: { value: 1 }, lensTail: { value: 0 },
  };
}

export interface VesselOptions extends Omit<CelOptions, 'tone'> {
  tone: 'portal' | 'sys' | 'artery';
  /** the vessel's texel in the lens textures (its topology edge index) */
  lensIndex: number;
  /** how the width follows the engine's diameter (network.ts widthKind) */
  widthKind: 0 | 1 | 2;
  /** arteries keep their own colour under every lens (the 2D figure's rule) */
  artery?: boolean;
  /** the width in the Circuit (see circuitWidth): map units, or -1 for the engine's diameter; 1 when circBoost applies; the least width. Default by `widthKind`. */
  circW?: readonly [number, number, number, number];
  /** the Circuit rounds the vessel's start and/or end (1): the ends nothing joins */
  circCap?: readonly [number, number];
  /** the vessel casts the crossing shadow (cel-ink.ts SHADOW): one extra draw of its own tube, the SHADOW program. The anatomy's and the map's vessels do; a liver bed's lanes and the strands do not. */
  shadow?: boolean;
}

/** 2D stage-tubes.js widthAt at the Circuit (t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) and the boost, an artery 3 (finer shunts less), a liver bed 8 and the boost. */
export const circuitWidth = (widthKind: 0 | 1 | 2, fine = 1): readonly [number, number, number, number] => (widthKind === 1 ? [CIRC_ARTERY * fine, 0, 0, MIN_PX.artery] : widthKind === 2 ? [CIRC_BED, 1, 0, MIN_PX.bed] : [-1, 1, 0, MIN_PX.vein]);

/** Every per-vertex attribute a built tube carries for the vessel shader. `lensR` (a fan's stretch of the host's colour ramp) and `tipK` (a fan's fading tip) were left off this list, so `withRk` dropped them and every course of a fan wore the whole ramp
 *  from its own start (a pink-to-violet step at every fork) and none faded: one list, and tests/fan-joins.test.ts reads it against what buildTubes makes. */
export const TUBE_ATTRIBUTES = ['position', 'normal', 'uv', 'tang', 'rk', 'rkc', 'nbr', 'lensR', 'tipK'] as const;
/** The tube's geometry with the attributes the vessel shader reads (a missing `rk`, the tube's radius share, is 1). One copy: the outline is part of the tube (vessels/shaders.ts), not a second mesh. */
export function withRk(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of [...TUBE_ATTRIBUTES, ...CIRCUIT_ATTRIBUTES]) {
    const a = g.getAttribute(name);
    if (a) out.setAttribute(name, a.clone());   // (a copy: reshape writes in place)
  }
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('rk')) out.setAttribute('rk', new BufferAttribute(new Float32Array(n).fill(1), 1));
  if (!g.getAttribute('rkc')) out.setAttribute('rkc', out.getAttribute('rk')!.clone());   // (a tube built without the map's own radius share draws the map at the body's)
  const idx = g.getIndex();
  if (idx) out.setIndex(idx.clone());
  else {
    const ix = new Uint32Array(n);
    for (let i = 0; i < n; i++) ix[i] = i;
    out.setIndex(new BufferAttribute(ix, 1));
  }
  withCircuitAttributes(out);   // (a vessel with no map course carries zeros: it stays where it is in the Circuit's change and fades, circuit/shader.ts)
  out.computeBoundingSphere();
  return out;
}

/** The attributes `reshape` and `reshapeLerp` write. */
export const RESHAPE_ATTRIBUTES = ['position', 'normal', 'uv', 'tang', 'rk', 'rkc', 'nbr'] as const;
/** A key frame of a vessel's shape: its reshape attributes and the course's length. */
export interface ReshapeFrame { arrays: Map<string, Float32Array>; length: number }

/** The camera layer nothing is drawn from: the cava's solid mesh, kept only to be picked. */
export const FAINT_ONLY_LAYER = 2;
/** The copies' shares of a vessel that is not behind the organs, or one that is shown whole: its front copy alone (`copyShares`). */
const COPIES_FRONT: readonly [number, number, number] = [1, 0, 0];

const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

/** One vessel: the scene's CelObject (highlight, flow-mark fade) with the toon and ink passes merged into one lens- and blood-aware draw. `ink`
 *  stays as the highlight's handle on the uniforms (colour, hiOn, hiDir, ...) but is never drawn. */
export class VesselObject extends CelObject {
  readonly artery: boolean;

  constructor(geometry: BufferGeometry, opts: VesselOptions, shared: CelShared, lens: LensShared, blood: BloodShared, circuit: CircuitShared) {
    super(withRk(geometry), { ...opts, tone: opts.tone === 'artery' ? 'portal' : opts.tone }, shared);
    this.artery = !!opts.artery;
    const old = this.toon;
    const u = old.uniforms;
    const toon = markBlends(new ShaderMaterial({ name: 'vessel toon',
      vertexShader: VESSEL_VS,
      fragmentShader: VESSEL_FS,
      precision: 'highp',   // the ink's lateral distance is a device-pixel difference of two large clip-space numbers: never mediump (a phone's default for a missing statement)
      side: DoubleSide,
      uniforms: {
        ...u,
        inkColor: { value: new Color() }, shadeK: { value: 0.62 }, dotted: { value: 0 }, inkOn: { value: 1 },
        mapDepth: { value: 0 }, frontDepth: { value: 0 }, shadowPx: { value: SHADOW_PX }, shadowDepth: { value: SHADOW_DEPTH }, shadowDepthC: { value: SHADOW_DEPTH_MAP }, shadowA: { value: SHADOW.light.a }, shadowCol: { value: new Color() }, shadowEnd: { value: new Vector2(0, 0) },
        liveW: { value: 1 }, skinWeld: { value: new Vector3(1, 1, 1) }, skinWeldC: { value: new Vector2(1, 1) }, lensSmooth: { value: 0 }, lensSpan: { value: new Vector2(0, 1) }, mate0: { value: new Vector3(-1, 1, 0) }, mate1: { value: new Vector3(-1, 1, 0) }, cmate0: { value: new Vector3(-1, 1, 0) }, cmate1: { value: new Vector3(-1, 1, 0) }, cease: { value: new Vector2(0, 0) }, bury: { value: new Vector2(0, 0) }, skinCut: { value: new Vector2(SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]) }, skinCutC: { value: new Vector2(SKIN_CUT_C_NONE[0], SKIN_CUT_C_NONE[1]) }, skinHole: { value: new Vector2(SKIN_HOLE_NONE[0], SKIN_HOLE_NONE[1]) }, skinHole2: { value: new Vector2(SKIN_HOLE_NONE[0], SKIN_HOLE_NONE[1]) }, nbrOn: { value: 0 }, nbrMate: { value: new Vector3(-1, 1, 0) }, stump: { value: new Vector3(0, 0, 0) }, stentU: { value: new Vector4(0, 0, 1, 0) }, stentT0: { value: 0 }, stentWire: { value: new Vector4(0.9, 0.8, 0.5, 0) }, stentGoldC: { value: new Vector4(0.7, 0.5, 0.1, 0) }, seamA: { value: [new Vector4(), new Vector4()] }, seamB: { value: [new Vector4(), new Vector4()] }, px: { value: opts.px }, res: shared.res, hiColor: { value: new Color() }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiEnds: { value: new Vector2(HI_NONE, HI_NONE) }, hiFade: { value: 1 }, hiPx: { value: 1.6 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        circT: circuit.circT, circRot: circuit.circRot, circM: circuit.circM, circTrack: circuit.circTrack, circTrackSize: circuit.circTrackSize, circRow: { value: -1 }, circFlat: { value: 0 }, circAnchA: { value: new Vector3() }, circAnchC: { value: new Vector3() }, circBoost: circuit.circBoost, circPerPx: circuit.circPerPx, circW: { value: new Vector4(...(opts.circW ?? circuitWidth(opts.widthKind))) }, circCap: { value: new Vector2(opts.circCap?.[0] ?? 0, opts.circCap?.[1] ?? 0) },
        glowK: { value: 1 }, veilA: { value: 0.4 }, fadeMode: { value: 0 }, fadeA: { value: new Vector4(0, 1, 1, 1) }, fadeLine: { value: new Vector4(0, 0, 0, 1) }, fadeKeep: { value: 0 }, mapFade: { value: new Vector3(0, 1, 0) }, cavaEnd: { value: new Vector2(0, 1) }, cavaCut: { value: 0 }, cavaA: { value: 1 }, solidK: { value: 1 }, veilK: { value: 1 }, cavaRef: { value: new Vector2(0, 1) },
        lensUse: { value: this.artery ? 0 : 1 }, streamTex: blood.streamTex, streakAmt: blood.streakAmt, dustP: blood.dustP, chainTex: blood.chainTex, routeTex: blood.routeTex, projY: blood.projY, dpr: blood.dpr, casingA: { value: 0.64 }, quietK: { value: 0 }, wedge: { value: new Vector4(0, 0.02, 0.6, 0) }, wedgeD: { value: new Vector4(0, 0, -1, 0.02) }, wedgeCol: { value: new Color() }, wallLine: { value: this.artery ? 1 : 0 }, pageCol: { value: new Color() }, casingCircA: { value: 0.64 }, inkColorCirc: { value: new Color() }, rimInk: { value: new Vector4(0, 0, 0, 0) }, widthKind: { value: opts.widthKind }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 0 },
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensModeA: lens.lensModeA, lensRawA: lens.lensRawA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, lensModeB: lens.lensModeB, lensRawB: lens.lensRawB,
        laneColA: lens.laneColA, laneColB: lens.laneColB, lensMix: lens.lensMix, lensTail: lens.lensTail,
        ...vdbgUniforms('tube'),   // (the inspector's view of the tubes: none without ?inspect, debug-view.ts)
      },
      defines: vdbgDefines(),
    }));
    old.dispose();
    // One mesh, one material, one draw: the outline is part of the tube (the vertex stage builds it ink wider than its lumen, the fragment stage paints the band), so it is continuous by construction.
    this.toonMesh.material = toon;
    // (the mesh's bounding sphere is the body course's; in the Circuit the vertices stand on the map, far from it, so a vessel was culled once the camera came in on the map and its body sphere left the view)
    this.toonMesh.frustumCulled = false;
    (this as unknown as { toon: ShaderMaterial }).toon = toon;
    // the ink is part of this draw now: its mesh goes, and `ink.uniforms` becomes the handle on the merged material's own uniforms
    this.group.remove(this.group.children[0]!);
    const iu = this.ink.uniforms, tu = toon.uniforms;
    iu.color = tu.inkColor!; iu.hiColor = tu.hiColor!; iu.inflate = tu.inflate!; iu.px = tu.px!; iu.res = tu.res!; iu.len = tu.len!; iu.reveal = tu.reveal!;
    for (const k of ['hiOn', 'hiDir', 'hiOffset', 'hiAhead', 'hiBehind', 'hiEnds', 'hiFade', 'hiPx']) iu[k] = tu[k]!;
    // THE GLOW'S MASK (glow.ts, glow-fx.ts): the same geometry and the very same uniforms (so every width, fade, join and pick weight is the tube's own), through the program built with GLOW: the vessel as it is drawn, in its
    // colour, premultiplied by its pick weight, painted by MAX into the mask texture on the glow's own layer. Hidden until a pick.
    const glow = new ShaderMaterial({ name: 'vessel glow', vertexShader: VESSEL_VS, fragmentShader: VESSEL_FS, precision: 'highp', side: DoubleSide, transparent: true, depthWrite: false, depthTest: false, defines: { GLOW: 1 }, uniforms: tu,
      blending: CustomBlending, blendEquation: MaxEquation, blendSrc: OneFactor, blendDst: OneFactor });
    const gm = (this.glowMesh = new Mesh(this.toonMesh.geometry, glow));
    gm.frustumCulled = false; gm.visible = false; gm.name = 'highlight/glow'; gm.renderOrder = 30;
    gm.layers.set(GLOW_LAYER);   // (not the figure's passes: the glow's own mask pass draws it)
    this.group.add(gm);
    // THE CROSSING SHADOW (cel-ink.ts SHADOW): the same geometry and uniforms once more, through the program built with SHADOW: the tube made SHADOW_PX wider than its line, laid behind its own depth, blended over what is behind it.
    // After every opaque tube of the vessels' pass (transparent, so the sort puts it last), depth test on, no depth write; it takes the tube's fades, reveal and cuts, so it eases with the vessel it belongs to.
    if (opts.shadow) {
      const mat = new ShaderMaterial({ name: 'vessel crossing shadow', vertexShader: VESSEL_VS, fragmentShader: VESSEL_FS, precision: 'highp', side: DoubleSide, transparent: true, depthWrite: false, depthTest: true, defines: { SHADOW: 1 }, uniforms: tu });
      const sm = (this.shadowMesh = new Mesh(this.toonMesh.geometry, mat));
      sm.frustumCulled = false; sm.name = 'crossing/shadow'; sm.renderOrder = 3;
      sm.raycast = () => {};   // (the pick is the tube's)
      this.group.add(sm);
    }
  }

  /** The crossing shadow's draw (null where this vessel casts none). */
  shadowMesh: Mesh | null = null;
  /** The fade of the shadow's band over each end that joins another vessel, in this vessel's radii (0: a free end): vessels/shadow.ts. */
  setShadowEnds(start: number, end: number): void { (this.toon.uniforms.shadowEnd!.value as Vector2).set(start, end); }
  /** How far toward the viewer this vessel's line stands on the Circuit's plate (circuit/map-depth.ts). */
  setMapDepth(z: number): void { this.toon.uniforms.mapDepth!.value = z; }
  /** This vessel is drawn this far toward the viewer in the depth buffer, scene units (the caput fan: feeder-fan.ts FAN_FRONT); a depth offset only, always (not the Circuit's). */
  setFrontDepth(z: number): void { this.toon.uniforms.frontDepth!.value = z; }

  /** Colours for a look. An artery wears the look's artery red; a vein its portal or systemic tone; a lens covers veins on top of it. The scene
   *  calls this through CelObject.applyPalette, with the look's palette. */
  override applyPalette(p: Palette): void {
    super.applyPalette(p);
    const look = lookOf(p);
    const u = this.toon.uniforms;
    if (this.artery) rawColor(LENS_TOKENS[look].artery, u.color!.value as Color);
    { const [r, g, b] = CASING[look].rgb; (u.inkColor!.value as Color).setRGB(r / 255, g / 255, b / 255, LinearSRGBColorSpace); }   // (the look's casing ink, tokens.css --casing-rgb)
    u.shadeK!.value = p.shade;
    rawColor(p.body, u.pageCol!.value as Color);   // (the plate: where the back tier eases to on a turn)
    // the 2D look's line: its casing ink (set above, p.ink) at its casing alpha, and a dark lumen's light rim on the dark looks
    u.casingA!.value = CASING[look].a; u.casingCircA!.value = CASING[look].circ.a;
    { const [r, g, b] = CASING[look].circ.rgb; (u.inkColorCirc!.value as Color).setRGB(r / 255, g / 255, b / 255, LinearSRGBColorSpace); }
    const rim = rawColor(RIM_INK);
    (u.rimInk!.value as Vector4).set(rim.r, rim.g, rim.b, RIM_A[look] * CEL_STYLE.TUBE.RIM_SHARE);   // (no pale inner rim: the ink is a vessel's only edge)
    rawColor(LENS_TOKENS[look].flowReversed, u.markRev!.value as Color);
    { const [r, g, b] = SHADOW[look].rgb; (u.shadowCol!.value as Color).setRGB(r / 255, g / 255, b / 255, LinearSRGBColorSpace); u.shadowA!.value = SHADOW[look].a; }   // (the crossing shadow's tone and strength, once per look)
  }

  /** A liver branch drawing on with the change (circuit/grow.ts): the points its two courses start from, and how squeezed toward them it is now (0 whole). */
  setStretchAnchors(body: Vector3, map: Vector3): void { (this.toon.uniforms.circAnchA!.value as Vector3).copy(body); (this.toon.uniforms.circAnchC!.value as Vector3).copy(map); }
  setFlat(flat: number): void { this.toon.uniforms.circFlat!.value = flat; }

  /** The Circuit rounds this vessel's start and/or end (1 each): the ends no drawn vessel meets. */
  setCircCap(start: number, end: number): void { (this.toon.uniforms.circCap!.value as Vector2).set(start, end); }

  /** Swaps in a new shape of the same vertex count (a collateral coiling, a fan changing width): the positions are written in place, so nothing is rebuilt. */
  reshape(g: BufferGeometry, len: number): void {
    const geo = this.toonMesh.geometry;
    for (const name of RESHAPE_ATTRIBUTES) {
      const src = g.getAttribute(name), dst = geo.getAttribute(name);
      if (!src || !dst) continue;
      const a = src.array as Float32Array, b = dst.array as Float32Array;
      if (a.length !== b.length) throw new Error(`reshape: ${name} has ${a.length} values, the vessel was built with ${b.length}`);
      b.set(a, 0);
      dst.needsUpdate = true;
    }
    geo.computeBoundingSphere();
    this.lerpPlan = null;   // (the arrays were written whole: a blend writes everything again first)
    this.toon.uniforms.len!.value = len;
  }

  /** What a blend between two key frames touches (kept for as long as the pair stands): per attribute the stretch of values where the two differ (a held end, the uv, the Circuit's widths are the same in both and are never written again). */
  private lerpFull = false;
  private lerpPlan: { a: ReshapeFrame; b: ReshapeFrame; spans: { name: string; lo: number; hi: number; dir: boolean }[] } | null = null;

  /** The shape `t` of the way from key frame `a` to key frame `b` (shape-track.ts: the same tubes built at two coil strengths), written into the geometry's own arrays: no geometry is built, nothing is allocated. Centres and radii are exactly linear in the coil, the rings only turn a hair
   *  between two keys (tests/shape-pin.test.ts pins the error), and a ring that is the same in both stays the same. Only the stretch of each attribute that differs between the two frames is written per blend, and the bounding sphere is worked out once for the pair
   *  (the whole-array blend and a sphere per blend were 4 ms a frame for ten growing vessels: the 21 Nov audit's 18 to 26 fps while collaterals grew). */
  reshapeLerp(a: ReshapeFrame, b: ReshapeFrame, t: number): void {
    const geo = this.toonMesh.geometry;
    let plan = this.lerpPlan;
    if (!plan || plan.a !== a || plan.b !== b) {
      const spans: { name: string; lo: number; hi: number; dir: boolean }[] = [];
      for (const name of RESHAPE_ATTRIBUTES) {
        const A = a.arrays.get(name), B = b.arrays.get(name), dst = geo.getAttribute(name);
        if (!A || !B || !dst) continue;
        const out = dst.array as Float32Array;
        if (A.length !== out.length || B.length !== out.length) throw new Error(`reshape: ${name} has ${A.length} values, the vessel was built with ${out.length}`);
        out.set(A, 0);   // (what is the same in both frames is now written for good; the stretch that differs is written by each blend)
        dst.needsUpdate = true;
        const k = dst.itemSize;
        let lo = -1, hi = -1;
        for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) { if (lo < 0) lo = i; hi = i; }
        if (lo >= 0) spans.push({ name, lo: lo - (lo % k), hi: hi - (hi % k) + k, dir: k === 3 && (name === 'normal' || name === 'tang') });
      }
      plan = this.lerpPlan = { a, b, spans };
      this.lerpFull = true;   // (the whole-array write above goes up in full with this frame's first blend)
      // one sphere round the vertices of both shapes: culling and picking only need it to hold the shape wherever it is between them
      const P = a.arrays.get('position'), Q = b.arrays.get('position');
      if (P && Q) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (const F of [P, Q]) for (let i = 0; i < F.length; i += 3) { const x = F[i]!, y = F[i + 1]!, z = F[i + 2]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
        let r2 = 0;
        for (const F of [P, Q]) for (let i = 0; i < F.length; i += 3) r2 = Math.max(r2, (F[i]! - cx) ** 2 + (F[i + 1]! - cy) ** 2 + (F[i + 2]! - cz) ** 2);
        geo.boundingSphere ??= new Sphere();
        geo.boundingSphere.center.set(cx, cy, cz); geo.boundingSphere.radius = Math.sqrt(r2);
      }
    }
    for (const sp of plan.spans) {
      const A = a.arrays.get(sp.name)!, B = b.arrays.get(sp.name)!, dst = geo.getAttribute(sp.name)!, out = dst.array as Float32Array;
      for (let i = sp.lo; i < sp.hi; i++) out[i] = A[i]! + (B[i]! - A[i]!) * t;
      if (sp.dir) for (let i = sp.lo; i < sp.hi; i += 3) { const l = Math.sqrt(out[i]! * out[i]! + out[i + 1]! * out[i + 1]! + out[i + 2]! * out[i + 2]!) || 1; out[i] = out[i]! / l; out[i + 1] = out[i + 1]! / l; out[i + 2] = out[i + 2]! / l; }
      // only the stretch that was written goes to the GPU (three would upload the whole buffer, 7 of them per blended vessel per frame); the first blend after a new pair uploads the whole array once
      if (!this.lerpFull) (dst as BufferAttribute).addUpdateRange(sp.lo, sp.hi - sp.lo);
      dst.needsUpdate = true;
    }
    this.lerpFull = false;
    this.toon.uniforms.len!.value = a.length + (b.length - a.length) * t;
  }

  /** Smooth joins: the lens colour runs through the ramp along the vessel (shaders.ts `lensOf`). */
  /** A branch of a vessel (liver-branches.ts) wears the stretch `a` to `b` of its host's lens ramp, the part it leaves, so the colour is continuous at the branch point. */
  setLensSpan(a: number, b: number): void { (this.toon.uniforms.lensSpan!.value as Vector2).set(a, b); }
  setSmoothColour(on: boolean): void { this.toon.uniforms.lensSmooth!.value = on ? 1 : 0; }
  /** Smooth joins: the vessels this one's start and end carry on into (null: none), as the shader needs them to ease their live widths together (shaders.ts `swellOf`). Off, both are null. */
  /** The trunk each end of a declared branch is buried in, in radius units (0: not buried: a run-on, a crossing, a free end). The ink is held back only on that part. */
  /** A vein divided at surgery (divide.ts): its first `cut` figure units are not drawn, its end is round and it pinches at `tie`; `cut` 0 is the whole vein. */
  setStump(cut: number, tie: number, pinch: number): boolean {
    const v = this.toon.uniforms.stump!.value as Vector3;
    if (v.x === cut && v.y === tie && v.z === pinch) return false;
    v.set(cut, tie, pinch); return true;
  }
  /** The stent in this vessel as the Circuit draws it on the tube: its share shown, where it starts and ends along the course (0..1) and where its graft starts (stent-device.ts). */
  /** The Circuit stent's wire and band colours and strengths: the Anatomy stent's own (stent-look.ts), so both views are one look. */
  setStentLook(wire: Color, wireA: number, gold: Color, goldA: number): void { (this.toon.uniforms.stentWire!.value as Vector4).set(wire.r, wire.g, wire.b, wireA); (this.toon.uniforms.stentGoldC!.value as Vector4).set(gold.r, gold.g, gold.b, goldA); }
  /** `bare`: the stent's bare stretch in lumen half widths (0: none), a real length (stent-look.ts bareHalfWidths), not a share of the course. The bend the map course has turned at the stent's start is read once per start. */
  setStent(k: number, u0: number, u1: number, bare: number): void {
    (this.toon.uniforms.stentU!.value as Vector4).set(k, u0, u1, bare);
    if (u0 !== this.stentAt) { this.stentAt = u0; const g = this.toonMesh.geometry, tu = g.getAttribute('turn'), uv = g.getAttribute('uv'); let best = 2, t0 = 0; if (tu && uv) for (let i = 0; i < uv.count; i++) { const d = Math.abs(uv.getX(i) - u0); if (d < best) { best = d; t0 = tu.getX(i); } } this.toon.uniforms.stentT0!.value = t0; }
  }
  private stentAt = -1;
  /** A surgical shunt's stitches (seams.ts): the seam curve at its start and at its end (null: none there). */
  setSeam(start: SeamCurve | null, end: SeamCurve | null): boolean {
    const A = this.toon.uniforms.seamA!.value as Vector4[], B = this.toon.uniforms.seamB!.value as Vector4[];
    let changed = false;
    [start, end].forEach((s, i) => {
      const a = s ? [s.c[0], s.c[1], s.c[2], s.c[3]] : [0, 0, 0, 0], b = s ? [s.c[4], s.n, s.dash, s.per] : [0, 0, 0, 0];
      if (A[i]!.x !== a[0] || A[i]!.y !== a[1] || A[i]!.z !== a[2] || A[i]!.w !== a[3] || B[i]!.x !== b[0] || B[i]!.y !== b[1] || B[i]!.z !== b[2] || B[i]!.w !== b[3]) {
        A[i]!.set(a[0]!, a[1]!, a[2]!, a[3]!); B[i]!.set(b[0]!, b[1]!, b[2]!, b[3]!); changed = true;
      }
    });
    return changed;
  }
  /** This vessel is one of a fork's two (neighbour.ts): its outline is the union's, so the ink is not also held back by its buried end. */
  setNbrOn(on: boolean): void { this.toon.uniforms.nbrOn!.value = on ? 1 : 0; }
  /** The tube `nbr` is measured against, by its data index, built diameter and width kind: its radius is taken at the width it is drawn at now (shaders.ts vNbr). */
  setNbrMate(index: number, baseD: number, widthKind: number): void { (this.toon.uniforms.nbrMate!.value as Vector3).set(index, baseD, widthKind); }
  /** Junction skins (skin/skin-set.ts): the tube is drawn only from u0 to u1 along its course; the skin, one welded mesh, draws the junction beyond. SKIN_CUT_NONE (the default) is the whole tube. Returns whether it changed. */
  setSkinCut(u0: number, u1: number): boolean {
    const v = this.toon.uniforms.skinCut!.value as Vector2;
    if (v.x === u0 && v.y === u1) return false;
    v.set(u0, u1); return true;
  }
  /** Side-wall junctions (skin/types.ts SkinArm.side, spec 10.1): the stretch of the tube between u0 and u1 is not drawn; the skin draws it. Slot 0 or 1 (a vessel has at most two holes). SKIN_HOLE_NONE is no hole. Returns whether it changed. */
  setSkinHole(slot: 0 | 1, u0: number, u1: number): boolean {
    const v = this.toon.uniforms[slot ? 'skinHole2' : 'skinHole']!.value as Vector2;
    if (v.x === u0 && v.y === u1) return false;
    v.set(u0, u1); return true;
  }
  /** A growing arm's welded skin coming in (skin/skin-set.ts): how much of the tube's cut end at `end` the skin has taken over (0 none, 1 all: the default). Returns whether it changed. */
  setSkinWeld(end: 0 | 1 | 2, w: number): boolean {
    const v = this.toon.uniforms.skinWeld!.value as Vector3, k = end === 0 ? 'x' : end === 1 ? 'y' : 'z';
    if (v[k] === w) return false;
    v[k] = w; return true;
  }
  /** The same weld on the Circuit's map cut (circuit/skins.ts): how much of the tube's map-cut end at `end` the map's skin has taken over (0 none, 1 all: the default). Returns whether it changed. */
  setSkinWeldC(end: 0 | 1, w: number): boolean {
    const v = this.toon.uniforms.skinWeldC!.value as Vector2;
    if ((end ? v.y : v.x) === w) return false;
    if (end) v.y = w; else v.x = w;
    return true;
  }
  skinWeldC(end: 0 | 1): number { const v = this.toon.uniforms.skinWeldC!.value as Vector2; return end ? v.y : v.x; }
  /** end 2 is the weld of the tube's holes (a host with a growing arm on its side wall). */
  skinWeld(end: 0 | 1 | 2): number { const v = this.toon.uniforms.skinWeld!.value as Vector3; return end === 0 ? v.x : end === 1 ? v.y : v.z; }
  skinHole(slot: 0 | 1): readonly [number, number] { const v = this.toon.uniforms[slot ? 'skinHole2' : 'skinHole']!.value as Vector2; return [v.x, v.y]; }
  /** The Circuit's own skin cut (circuit/skins.ts): the tube is not drawn past u0 or u1 on the map once the change has gone far enough (SKIN_CIRC_IN). SKIN_CUT_C_NONE is the whole tube. Returns whether it changed. */
  setSkinCutC(u0: number, u1: number): boolean {
    const v = this.toon.uniforms.skinCutC!.value as Vector2;
    if (v.x === u0 && v.y === u1) return false;
    v.set(u0, u1); return true;
  }
  skinCutC(): readonly [number, number] { const v = this.toon.uniforms.skinCutC!.value as Vector2; return [v.x, v.y]; }
  skinCut(): readonly [number, number] { const v = this.toon.uniforms.skinCut!.value as Vector2; return [v.x, v.y]; }
  setBury(start: number, end: number): void { (this.toon.uniforms.bury!.value as Vector2).set(start, end); }
  /** What each end carries on into on the Circuit's MAP (circuit/mates.ts), and the half length of their taper there (map units): set once, whatever the joins switch or a skin says. */
  setCircuitMates(start: { index: number; baseD: number; widthKind: number } | null, end: { index: number; baseD: number; widthKind: number } | null, ease: readonly [number, number]): void {
    const u = this.toon.uniforms;
    (u.cmate0!.value as Vector3).set(start ? start.index : -1, start ? start.baseD : 1, start ? start.widthKind : 0);
    (u.cmate1!.value as Vector3).set(end ? end.index : -1, end ? end.baseD : 1, end ? end.widthKind : 0);
    (u.cease!.value as Vector2).set(start ? ease[0] : 0, end ? ease[1] : 0);
  }
  setMates(start: { index: number; baseD: number; widthKind: number } | null, end: { index: number; baseD: number; widthKind: number } | null): void {
    const u = this.toon.uniforms;
    (u.mate0!.value as Vector3).set(start ? start.index : -1, start ? start.baseD : 1, start ? start.widthKind : 0);
    (u.mate1!.value as Vector3).set(end ? end.index : -1, end ? end.baseD : 1, end ? end.widthKind : 0);
  }

  /** Quiet depth on a turn (camera/quiet.ts quietOf, 0..1): the back tier eases toward the page; for the vessels behind the organs only (the scene sets it). */
  /** The wedge's amber column as a tint on this vessel (wedge-glsl.ts): `amount` 0..1; its route distance from the balloon's distal edge at u is `d0 + slope u`; `front` is how far the column has come (the same number on every vessel) and `frontSoft` how softly it ends; `behind` how softly the tint ends behind the balloon's edge; `fade` how far it thins toward a branch's tip (u; 0 none). */
  setWedge(amount: number, d0: number, slope: number, front: number, frontSoft: number, behind: number, fade: number, color?: Color): void {
    (this.toon.uniforms.wedge!.value as Vector4).set(amount, behind, fade, fade > 0 ? 1 : 0);
    (this.toon.uniforms.wedgeD!.value as Vector4).set(d0, slope, front, frontSoft);
    if (color) (this.toon.uniforms.wedgeCol!.value as Color).copy(color);
  }
  setQuiet(q: number): void { this.toon.uniforms.quietK!.value = q; }

  private tip: { a0: number; a1: number } | null = null;
  /** The fade at a free end (fades.ts): the one place a vessel is not opaque. Its zone fades by opacity, body and outline together, at FULL width (no taper); the material is blended only because of it. */
  setTipFade(f: { mode: number; from: number; to: number; a0: number; a1: number; keep: boolean; mapFade?: readonly [number, number]; line?: readonly [number, number, number, number] }): void {
    const u = this.toon.uniforms;
    u.fadeMode!.value = f.mode; u.fadeKeep!.value = f.keep ? 1 : 0;
    (u.mapFade!.value as Vector3).set(f.mapFade ? f.mapFade[0] : 0, f.mapFade ? f.mapFade[1] : 1, f.mapFade ? 1 : 0);
    (u.fadeA!.value as Vector4).set(f.from, f.to, f.a0, f.a1);
    if (f.line) (u.fadeLine!.value as Vector4).set(f.line[0], f.line[1], f.line[2], f.line[3]);
    this.tip = { a0: f.a0, a1: f.a1 };
    setBlendState(this.toon, true);
    if (this.veil) setBlendState(this.veil.mat, true);
  }
  /** A fading tip with a collateral attached is solid to its end: its start alpha goes to 1. */
  setTipJoined(joined: boolean): void {
    if (!this.tip) return;
    (this.toon.uniforms.fadeA!.value as Vector4).z = joined ? 1 : this.tip.a0;
  }
  private cavaEndA = 1;
  /** A hepatic vein opens into the faint cava at full strength: its last `span` (a share of its length) eases to alpha `a`, the cava's, so no solid end lies in a faint vessel (fades.ts cavaEndSpan). Eased back up by `whole`. */
  setCavaEnd(span: number, a: number): void {
    (this.toon.uniforms.cavaEnd!.value as Vector2).set(span, a); this.cavaEndA = a;
    setBlendState(this.toon, true);
    if (this.veil) setBlendState(this.veil.mat, true);
  }
  /** A hepatic vein that opens into the cava ends on the cava's axis: the last `share` of it (the cava's radius) lies in its lumen and fades out, whatever the cava's own alpha. */
  /** A vein that opens into the cava (its `nbr` is the cava's): it takes the cava's colour (the lens colour of cava piece `lensIndex`, `u` of the way along it) and alpha as it nears the wall, and is not drawn inside the lumen (shaders.ts cavA). */
  setCavaCut(on: boolean | 'fade', lensIndex = 0, u = 1, cavaAlpha = 1): void {
    this.toon.uniforms.cavaCut!.value = on === 'fade' ? 2 : on ? 1 : 0; (this.toon.uniforms.cavaRef!.value as Vector2).set(lensIndex, u);
    this.cavaJoinA = cavaAlpha; this.toon.uniforms.cavaA!.value = cavaAlpha;
    if (on) { setBlendState(this.toon, true); if (this.veil) setBlendState(this.veil.mat, true); }
  }
  private cavaJoinA = 1;
  /** The cava rises from its faint tone to whole (named or selected): the opacity the vein comes to at its wall rises with it. */
  setCavaJoinWhole(whole: number): void { this.toon.uniforms.cavaA!.value = this.cavaJoinA + (1 - this.cavaJoinA) * whole; }
  setCavaEndWhole(whole: number): void { (this.toon.uniforms.cavaEnd!.value as Vector2).y = this.cavaEndA + (1 - this.cavaEndA) * whole; }
  /** A vein fading into the faint cava (fades.ts ivcJoin): `whole` 0..1 is how far the cava is shown whole, and the fade lets go by as much (its alpha at the wall rises from its own to 1). */
  setIvcWhole(whole: number): void {
    if (!this.tip) return;
    (this.toon.uniforms.fadeA!.value as Vector4).w = this.tip.a1 + (1 - this.tip.a1) * whole;
  }

  private veil: { mesh: Mesh; mat: ShaderMaterial; overLayer: number; faint: boolean; whole: boolean } | null = null;
  /** A vessel the 2D figure draws behind the organs (BACK_EDGES; the cava above all): it is drawn with the organs, so one in front hides it, and again over them (the cava is whole, opaque, two tones: the copy over the
   *  organs is the same one-draw tube as any vessel's). `faint`: the cava (F_VEIL), drawn only as that copy. `overLayer` is the camera layer of what is drawn over the organs. */
  setBehindOrgans(overLayer: number, faint: boolean): void {
    if (this.veil) return;
    const mat = markBlends(new ShaderMaterial({ name: 'vessel veil', vertexShader: this.toon.vertexShader, fragmentShader: this.toon.fragmentShader, uniforms: this.toon.uniforms, precision: 'highp', side: DoubleSide, transparent: false, depthWrite: true, defines: { VEIL: 1, ...vdbgDefines() } }));
    if (this.tip) setBlendState(mat, true);   // (a fade zone blends; nothing else does)
    const mesh = new Mesh(this.toonMesh.geometry, mat);
    mesh.matrixAutoUpdate = true; mesh.renderOrder = 2; mesh.frustumCulled = false;
    mesh.layers.set(overLayer);
    this.group.add(mesh);
    this.veil = { mesh, mat, overLayer, faint, whole: false };
    // drawn with the organs (layer 0), or, the cava, not drawn solid at all (its mesh stays for picking, on a layer no pass draws)
    this.applyBehind();
  }
  /** The cava shown whole (2D's F_WHOLE, selected or named): the organs do not fade it. It eases over from the veil's 0.4 to 1, and once whole it is drawn solid over the organs, in its tier
   *  behind every vessel of the network; back, it is the veil again. */
  setWholeShare(k: number): void {
    const v = this.veil;
    if (!v) return;
    this.whole = k;
    if (this.tip) { const a = this.toon.uniforms.fadeA!.value as Vector4, w0 = cavaWholeAlpha(this.tip.a0), w1 = cavaWholeAlpha(this.tip.a1); a.z = this.tip.a0 + (w0 - this.tip.a0) * k; a.w = this.tip.a1 + (w1 - this.tip.a1) * k; }   // (the faint cava rises to whole: body, outline and chevrons; its fade at a free end stays a fade: cavaWholeAlpha)
    v.mat.uniforms.veilA!.value = Math.min(1, 0.4 + 0.6 * k + this.lift * (1 - k));
    const whole = k >= 1;
    if (whole !== v.whole) { v.whole = whole; this.applyBehind(); }
  }
  private occK = 0;
  /** Settings > Hide vessels behind organs, eased 0..1 by the scene: 0 is the show-through look (the vessel's veil copy over the organs), 1 normal occlusion (its solid copy, drawn with the organs, which an organ in front hides). In between the two copies
   *  trade their opacity, so nothing pops. Naming the vessel (whole) still reveals it over the organs. */
  setOcclusion(k: number): void {
    if (!this.veil || k === this.occK) return;
    this.occK = k;
    this.applyBehind();
  }
  /** How much of each of this vessel's three drawn copies shows (front, solid, veil: spec 10.4), read by a junction skin that has this vessel as an arm so that its own three copies are weighted the same way. Exactly what `applyBehind` sets on the tube:
   *  a plain vessel is its front copy alone, (1, 0, 0). A vessel behind the organs is: whole (named or selected), its front copy over the organs, (1, 0, 0); otherwise its solid copy (drawn with the organs, so one in front hides it) at `solidK`
   *  (the cava, a faint one, only as far as Settings > Hide vessels behind organs has come; any other vessel behind the organs always) and its veil copy (over the organs) at `veilK` = 1 - k, gone at the mesh's own cut-off, k >= 0.999. The veil's
   *  `veilA` is not among them: the shader has no use for it (tests/b3-cava-whole.test.ts), the cava is opaque and its tone is its fade. */
  copyShares(): readonly [number, number, number] {
    const v = this.veil;
    if (!v || v.whole) return COPIES_FRONT;
    const k = this.occK;
    return [0, v.faint ? k : 1, k < 0.999 ? 1 - k : 0];
  }
  /** Whether this vessel is one the figure draws behind the organs (it has a veil copy), so its skin's copies blend. */
  get behindOrgans(): boolean { return !!this.veil; }
  /** A counter that goes up whenever `copyShares` may have changed (the skin's handover compares it, so a vessel that does not move costs nothing). */
  copyVersion = 0;
  private applyBehind(): void {
    const v = this.veil;
    if (!v) return;
    this.copyVersion++;
    const k = v.whole ? 0 : this.occK;
    this.toon.uniforms.veilK!.value = 1 - k;
    this.toon.uniforms.solidK!.value = v.faint && !v.whole ? k : 1;
    v.mesh.visible = !v.whole && k < 0.999;
    this.toonMesh.layers.set(v.whole ? v.overLayer : v.faint && k <= 0.001 ? FAINT_ONLY_LAYER : 0);
  }
  private whole = 0; private lift = 0;
  /** Opaque (cel shaded) organs hide what the 2D wash let through, so a veiled vessel's veil takes `lift` of it back (OrganLayer.veilLift); 0 is the 2D veil exactly. */
  setVeilLift(lift: number): void {
    const v = this.veil;
    if (!v || lift === this.lift) return;
    this.lift = lift;
    v.mat.uniforms.veilA!.value = Math.min(1, 0.4 + 0.6 * this.whole + lift * (1 - this.whole));
  }
  override dispose(): void { this.veil?.mat.dispose(); (this.glowMesh?.material as ShaderMaterial | undefined)?.dispose(); (this.shadowMesh?.material as ShaderMaterial | undefined)?.dispose(); super.dispose(); }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.toon.uniforms.inkOn!.value = on ? 0 : 1; }
  /** Stagnant-blood smoke on or off: OFF by default (no blobs inside a tube); a slide that asks for stasis turns it on. */
  /** A conditional tributary group's width share (2D: `0.5 + 0.5 * live`; 1 for every other vessel). */
  setLiveWidth(k: number): void { this.toon.uniforms.liveW!.value = k; }
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
