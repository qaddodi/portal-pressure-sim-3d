import { CIRC_ARTERY, CIRC_BED, MIN_PX } from '../circuit/width.ts';
import { HI_NONE } from '../materials/shaders.ts';
import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, LinearSRGBColorSpace, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS, VESSEL_VS } from './shaders.ts';
import type { BloodShared } from '../blood/field.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import type { LookId } from '../palette.ts';
import { CIRCUIT_ATTRIBUTES, withCircuitAttributes } from '../circuit/geometry.ts';
import { CASING, RIM_A, RIM_INK } from './cel-ink.ts';
import type { SeamCurve } from './seams.ts';
import { CEL_STYLE } from '../cel-style.ts';
import type { CircuitShared } from '../circuit/uniforms.ts';

/** Uniforms every vessel shares: the two lens textures held for the crossfade, their stream colours, and the cross-fade itself. */
export interface LensShared {
  lensGradA: { value: Texture }; lensLaneA: { value: Texture }; lensModeA: { value: number };
  lensGradB: { value: Texture }; lensLaneB: { value: Texture }; lensModeB: { value: number };
  laneColA: { value: Vector3[] }; laneColB: { value: Vector3[] };
  lensMix: { value: number }; lensTail: { value: number };
}

export function createLensShared(): LensShared {
  const blank = (): Texture => { const t = new DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  const lanes = () => Array.from({ length: 5 }, () => new Vector3());
  return {
    lensGradA: { value: blank() }, lensLaneA: { value: blank() }, lensModeA: { value: 0 },
    lensGradB: { value: blank() }, lensLaneB: { value: blank() }, lensModeB: { value: 0 },
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
}

/** 2D stage-tubes.js widthAt at the Circuit (t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) and the boost, an artery 3 (finer shunts less), a liver bed 8 and the boost. */
export const circuitWidth = (widthKind: 0 | 1 | 2, fine = 1): readonly [number, number, number, number] => (widthKind === 1 ? [CIRC_ARTERY * fine, 0, 0, MIN_PX.artery] : widthKind === 2 ? [CIRC_BED, 1, 0, MIN_PX.bed] : [-1, 1, 0, MIN_PX.vein]);

/** The tube's geometry with the attributes the vessel shader reads (a missing `rk`, the tube's radius share, is 1). One copy: the outline is part of the tube (vessels/shaders.ts), not a second mesh. */
export function withRk(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'tang', 'rk', 'rkc', 'nbr', ...CIRCUIT_ATTRIBUTES]) {
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

/** The camera layer nothing is drawn from: the cava's solid mesh, kept only to be picked. */
export const FAINT_ONLY_LAYER = 2;

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
    const toon = new ShaderMaterial({
      vertexShader: VESSEL_VS,
      fragmentShader: VESSEL_FS,
      precision: 'highp',   // the ink's lateral distance is a device-pixel difference of two large clip-space numbers: never mediump (a phone's default for a missing statement)
      side: DoubleSide,
      uniforms: {
        ...u,
        inkColor: { value: new Color() }, shadeK: { value: 0.62 }, dotted: { value: 0 }, inkOn: { value: 1 },
        liveW: { value: 1 }, lensSmooth: { value: 0 }, lensSpan: { value: new Vector2(0, 1) }, mate0: { value: new Vector3(-1, 1, 0) }, mate1: { value: new Vector3(-1, 1, 0) }, bury: { value: new Vector2(0, 0) }, nbrOn: { value: 0 }, nbrMate: { value: new Vector3(-1, 1, 0) }, stump: { value: new Vector3(0, 0, 0) }, stentU: { value: new Vector4(0, 0, 1, 0) }, seamA: { value: [new Vector4(), new Vector4()] }, seamB: { value: [new Vector4(), new Vector4()] }, px: { value: opts.px }, res: shared.res, hiColor: { value: new Color() }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiEnds: { value: new Vector2(HI_NONE, HI_NONE) }, hiFade: { value: 1 }, hiPx: { value: 1.6 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        circT: circuit.circT, circRot: circuit.circRot, circM: circuit.circM, circTrack: circuit.circTrack, circTrackSize: circuit.circTrackSize, circRow: { value: -1 }, circFlat: { value: 0 }, circAnchA: { value: new Vector3() }, circAnchC: { value: new Vector3() }, circBoost: circuit.circBoost, circPerPx: circuit.circPerPx, circW: { value: new Vector4(...(opts.circW ?? circuitWidth(opts.widthKind))) }, circCap: { value: new Vector2(opts.circCap?.[0] ?? 0, opts.circCap?.[1] ?? 0) },
        veilA: { value: 0.4 }, fadeMode: { value: 0 }, fadeA: { value: new Vector4(0, 1, 1, 1) }, fadeLine: { value: new Vector4(0, 0, 0, 1) }, fadeKeep: { value: 0 }, cavaEnd: { value: new Vector2(0, 1) }, cavaCut: { value: 0 }, cavaA: { value: 1 }, solidK: { value: 1 }, veilK: { value: 1 }, cavaRef: { value: new Vector2(0, 1) },
        lensUse: { value: this.artery ? 0 : 1 }, streamTex: blood.streamTex, streakAmt: blood.streakAmt, dustP: blood.dustP, chainTex: blood.chainTex, projY: blood.projY, dpr: blood.dpr, casingA: { value: 0.64 }, quietK: { value: 0 }, wedge: { value: new Vector4(0, 2, 0.6, 0) }, wedgeCol: { value: new Color() }, wallLine: { value: this.artery ? 1 : 0 }, pageCol: { value: new Color() }, casingCircA: { value: 0.64 }, inkColorCirc: { value: new Color() }, rimInk: { value: new Vector4(0, 0, 0, 0) }, widthKind: { value: opts.widthKind }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 0 },
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensModeA: lens.lensModeA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, lensModeB: lens.lensModeB,
        laneColA: lens.laneColA, laneColB: lens.laneColB, lensMix: lens.lensMix, lensTail: lens.lensTail,
      },
    });
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
  }

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
  }

  /** A liver branch drawing on with the change (circuit/grow.ts): the points its two courses start from, and how squeezed toward them it is now (0 whole). */
  setStretchAnchors(body: Vector3, map: Vector3): void { (this.toon.uniforms.circAnchA!.value as Vector3).copy(body); (this.toon.uniforms.circAnchC!.value as Vector3).copy(map); }
  setFlat(flat: number): void { this.toon.uniforms.circFlat!.value = flat; }

  /** The Circuit rounds this vessel's start and/or end (1 each): the ends no drawn vessel meets. */
  setCircCap(start: number, end: number): void { (this.toon.uniforms.circCap!.value as Vector2).set(start, end); }

  /** Swaps in a new shape of the same vertex count (a collateral coiling, a fan changing width): the positions are written in place, so nothing is rebuilt. */
  reshape(g: BufferGeometry, len: number): void {
    const geo = this.toonMesh.geometry;
    for (const name of ['position', 'normal', 'uv', 'tang', 'rk', 'rkc', 'nbr']) {
      const src = g.getAttribute(name), dst = geo.getAttribute(name);
      if (!src || !dst) continue;
      const a = src.array as Float32Array, b = dst.array as Float32Array;
      if (a.length !== b.length) throw new Error(`reshape: ${name} has ${a.length} values, the vessel was built with ${b.length}`);
      b.set(a, 0);
      dst.needsUpdate = true;
    }
    geo.computeBoundingSphere();
    this.toon.uniforms.len!.value = len;
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
  setStent(k: number, u0: number, u1: number, ub: number): void { (this.toon.uniforms.stentU!.value as Vector4).set(k, u0, u1, ub); }
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
  setBury(start: number, end: number): void { (this.toon.uniforms.bury!.value as Vector2).set(start, end); }
  setMates(start: { index: number; baseD: number; widthKind: number } | null, end: { index: number; baseD: number; widthKind: number } | null): void {
    const u = this.toon.uniforms;
    (u.mate0!.value as Vector3).set(start ? start.index : -1, start ? start.baseD : 1, start ? start.widthKind : 0);
    (u.mate1!.value as Vector3).set(end ? end.index : -1, end ? end.baseD : 1, end ? end.widthKind : 0);
  }

  /** Quiet depth on a turn (camera/quiet.ts quietOf, 0..1): the back tier eases toward the page; for the vessels behind the organs only (the scene sets it). */
  /** The wedge's amber column as a tint on this vessel: `amount` 0..1, `cut` the share of its course (from the outer end, 0) it reaches up to (2: all of it), `fade` the stretch from the outer end over which it comes to full (0: none). */
  setWedge(amount: number, cut: number, fade: number, color?: Color): void {
    const w = this.toon.uniforms.wedge!.value as Vector4;
    w.set(amount, cut, fade, fade > 0 ? 1 : 0);
    if (color) (this.toon.uniforms.wedgeCol!.value as Color).copy(color);
  }
  setQuiet(q: number): void { this.toon.uniforms.quietK!.value = q; }

  private tip: { a0: number; a1: number } | null = null;
  /** The fade at a free end (fades.ts): the one place a vessel is not opaque. Its zone fades by opacity, body and outline together, at FULL width (no taper); the material is blended only because of it. */
  setTipFade(f: { mode: number; from: number; to: number; a0: number; a1: number; keep: boolean; line?: readonly [number, number, number, number] }): void {
    const u = this.toon.uniforms;
    u.fadeMode!.value = f.mode; u.fadeKeep!.value = f.keep ? 1 : 0;
    (u.fadeA!.value as Vector4).set(f.from, f.to, f.a0, f.a1);
    if (f.line) (u.fadeLine!.value as Vector4).set(f.line[0], f.line[1], f.line[2], f.line[3]);
    this.tip = { a0: f.a0, a1: f.a1 };
    this.toon.transparent = true;
    if (this.veil) this.veil.mat.transparent = true;
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
    this.toon.transparent = true;
    if (this.veil) this.veil.mat.transparent = true;
  }
  /** A hepatic vein that opens into the cava ends on the cava's axis: the last `share` of it (the cava's radius) lies in its lumen and fades out, whatever the cava's own alpha. */
  /** A vein that opens into the cava (its `nbr` is the cava's): it takes the cava's colour (the lens colour of cava piece `lensIndex`, `u` of the way along it) and alpha as it nears the wall, and is not drawn inside the lumen (shaders.ts cavA). */
  setCavaCut(on: boolean, lensIndex = 0, u = 1, cavaAlpha = 1): void {
    this.toon.uniforms.cavaCut!.value = on ? 1 : 0; (this.toon.uniforms.cavaRef!.value as Vector2).set(lensIndex, u);
    this.cavaJoinA = cavaAlpha; this.toon.uniforms.cavaA!.value = cavaAlpha;
    if (on) { this.toon.transparent = true; if (this.veil) this.veil.mat.transparent = true; }
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
    const mat = new ShaderMaterial({ vertexShader: this.toon.vertexShader, fragmentShader: this.toon.fragmentShader, uniforms: this.toon.uniforms, precision: 'highp', side: DoubleSide, transparent: false, depthWrite: true, defines: { VEIL: 1 } });
    if (this.tip) mat.transparent = true;   // (a fade zone blends; nothing else does)
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
    if (this.tip) { const a = this.toon.uniforms.fadeA!.value as Vector4; a.z = this.tip.a0 + (1 - this.tip.a0) * k; a.w = this.tip.a1 + (1 - this.tip.a1) * k; }   // (the faint cava rises to whole: body, outline and chevrons)
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
  private applyBehind(): void {
    const v = this.veil;
    if (!v) return;
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
  override dispose(): void { this.veil?.mat.dispose(); super.dispose(); }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.toon.uniforms.inkOn!.value = on ? 0 : 1; }
  /** Stagnant-blood smoke on or off: OFF by default (no blobs inside a tube); a slide that asks for stasis turns it on. */
  /** A conditional tributary group's width share (2D: `0.5 + 0.5 * live`; 1 for every other vessel). */
  setLiveWidth(k: number): void { this.toon.uniforms.liveW!.value = k; }
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
