import { CIRC_ARTERY, CIRC_BED } from '../circuit/width.ts';
import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, KeepStencilOp, LinearSRGBColorSpace, Mesh, NearestFilter, NotEqualStencilFunc, ReplaceStencilOp, RGBAFormat, ShaderMaterial, Vector3, Vector4, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS, VESSEL_VS } from './shaders.ts';
import type { BloodShared } from '../blood/field.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import type { LookId } from '../palette.ts';
import { CIRCUIT_ATTRIBUTES } from '../circuit/geometry.ts';
import { CASING, RIM_A, RIM_INK } from './cel-ink.ts';
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
  circW?: readonly [number, number, number];
}

/** 2D stage-tubes.js widthAt at the Circuit (t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) and the boost, an artery 3 (finer shunts less), a liver bed 8 and the boost. */
export const circuitWidth = (widthKind: 0 | 1 | 2, fine = 1): readonly [number, number, number] => (widthKind === 1 ? [CIRC_ARTERY * fine, 0, 0] : widthKind === 2 ? [CIRC_BED, 1, 0] : [-1, 1, 0]);

/** The tube twice in one geometry: copy 0 is the body (`hull` 0), copy 1 the ink's hull (`hull` 1). One mesh then draws both, so a vessel is one draw call. */
export function withHull(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'tang', 'rk', ...CIRCUIT_ATTRIBUTES]) {
    const a = g.getAttribute(name);
    if (!a) continue;
    const arr = a.array as Float32Array, copy = new Float32Array(arr.length * 2);
    copy.set(arr); copy.set(arr, arr.length);
    out.setAttribute(name, new BufferAttribute(copy, a.itemSize));
  }
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('rk')) out.setAttribute('rk', new BufferAttribute(new Float32Array(n * 2).fill(1), 1));
  const hull = new Float32Array(n * 2).fill(0, 0, n).fill(1, n);
  out.setAttribute('hull', new BufferAttribute(hull, 1));
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array, m = a.length, ix = new Uint32Array(m * 2);
    for (let i = 0; i < m; i++) { ix[i] = a[i]!; ix[m + i] = a[i]! + n; }
    out.setIndex(new BufferAttribute(ix, 1));
  } else {
    const ix = new Uint32Array(n * 2);
    for (let i = 0; i < ix.length; i++) ix[i] = i;
    out.setIndex(new BufferAttribute(ix, 1));
  }
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
  /** the ink's material (the hull's draw): blended, no depth write */
  private hullMat!: ShaderMaterial;

  constructor(geometry: BufferGeometry, opts: VesselOptions, shared: CelShared, lens: LensShared, blood: BloodShared, circuit: CircuitShared) {
    super(withHull(geometry), { ...opts, tone: opts.tone === 'artery' ? 'portal' : opts.tone }, shared);
    this.artery = !!opts.artery;
    const old = this.toon;
    const u = old.uniforms;
    const toon = new ShaderMaterial({
      vertexShader: VESSEL_VS,
      fragmentShader: VESSEL_FS,
      side: DoubleSide,
      uniforms: {
        ...u,
        inkColor: { value: new Color() }, shadeK: { value: 0.62 }, dotted: { value: 0 }, hullOn: { value: 1 },
        lensSmooth: { value: 0 }, mate0: { value: new Vector3(-1, 1, 0) }, mate1: { value: new Vector3(-1, 1, 0) }, px: { value: opts.px }, res: shared.res, hiColor: { value: new Color() }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiPx: { value: 1.6 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        circT: circuit.circT, circRot: circuit.circRot, circM: circuit.circM, circTrack: circuit.circTrack, circTrackSize: circuit.circTrackSize, circRow: { value: -1 }, circBoost: circuit.circBoost, circW: { value: new Vector3(...(opts.circW ?? circuitWidth(opts.widthKind))) },
        veilA: { value: 0.4 }, fadeMode: { value: 0 }, fadeA: { value: new Vector4(0, 1, 1, 1) }, fadeLine: { value: new Vector4(0, 0, 0, 1) }, fadeKeep: { value: 0 },
        lensUse: { value: this.artery ? 0 : 1 }, streamTex: blood.streamTex, chainTex: blood.chainTex, projY: blood.projY, dpr: blood.dpr, casingA: { value: 0.64 }, quietK: { value: 0 }, wallLine: { value: this.artery ? 1 : 0 }, pageCol: { value: new Color() }, casingCircA: { value: 0.64 }, inkColorCirc: { value: new Color() }, rimInk: { value: new Vector4(0, 0, 0, 0) }, widthKind: { value: opts.widthKind }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 0 },
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensModeA: lens.lensModeA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, lensModeB: lens.lensModeB,
        laneColA: lens.laneColA, laneColB: lens.laneColB, lensMix: lens.lensMix, lensTail: lens.lensTail,
      },
    });
    old.dispose();
    // The ink is its own draw: the hull (the index range after the body's, withHull) is blended at the look's casing alpha (2D --casing-a), after every opaque body and tested against them,
    // so a joined vessel's outline never lands on its neighbour's body and an outline never hides a vessel in front. The body stays opaque. Both share one set of uniforms.
    const geo = this.toonMesh.geometry, half = geo.getIndex()!.count / 2;
    geo.clearGroups(); geo.addGroup(0, half, 0); geo.addGroup(half, half, 1);
    this.hullMat = new ShaderMaterial({ vertexShader: VESSEL_VS, fragmentShader: VESSEL_FS, side: DoubleSide, uniforms: toon.uniforms, transparent: true, depthWrite: false,
      // one outline round the union (2D's tube-joint.js), not one per tube: each pixel takes the ink once, so where two outlines overlap (a fork's crotch, a run-on, a free end's cap and its tube,
      // the inside of a tight bend) the alpha is not applied twice (.64 would be .87). The first hull fragment to pass the depth test marks the pixel; the stencil is cleared with the depth between the passes.
      stencilWrite: true, stencilRef: 1, stencilFunc: NotEqualStencilFunc, stencilFail: KeepStencilOp, stencilZFail: KeepStencilOp, stencilZPass: ReplaceStencilOp });
    this.toonMesh.material = [toon, this.hullMat];
    (this as unknown as { toon: ShaderMaterial }).toon = toon;
    // the ink is part of this draw now: its mesh goes, and `ink.uniforms` becomes the handle on the merged material's own uniforms
    this.group.remove(this.group.children[0]!);
    const iu = this.ink.uniforms, tu = toon.uniforms;
    iu.color = tu.inkColor!; iu.hiColor = tu.hiColor!; iu.inflate = tu.inflate!; iu.px = tu.px!; iu.res = tu.res!; iu.len = tu.len!; iu.reveal = tu.reveal!;
    for (const k of ['hiOn', 'hiDir', 'hiOffset', 'hiAhead', 'hiBehind', 'hiPx']) iu[k] = tu[k]!;
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

  /** Swaps in a new shape of the same vertex count (a collateral coiling, a fan changing width): the positions are written in place, so nothing is rebuilt. */
  reshape(g: BufferGeometry, len: number): void {
    const geo = this.toonMesh.geometry;
    for (const name of ['position', 'normal', 'uv', 'tang', 'rk']) {
      const src = g.getAttribute(name), dst = geo.getAttribute(name);
      if (!src || !dst) continue;
      const a = src.array as Float32Array, b = dst.array as Float32Array;
      if (a.length * 2 !== b.length) throw new Error(`reshape: ${name} has ${a.length} values, the vessel was built with ${b.length / 2}`);
      b.set(a, 0); b.set(a, a.length);
      dst.needsUpdate = true;
    }
    geo.computeBoundingSphere();
    this.toon.uniforms.len!.value = len;
  }

  /** Smooth joins: the lens colour runs through the ramp along the vessel (shaders.ts `lensOf`). */
  setSmoothColour(on: boolean): void { this.toon.uniforms.lensSmooth!.value = on ? 1 : 0; }
  /** Smooth joins: the vessels this one's start and end carry on into (null: none), as the shader needs them to ease their live widths together (shaders.ts `swellOf`). Off, both are null. */
  setMates(start: { index: number; baseD: number; widthKind: number } | null, end: { index: number; baseD: number; widthKind: number } | null): void {
    const u = this.toon.uniforms;
    (u.mate0!.value as Vector3).set(start ? start.index : -1, start ? start.baseD : 1, start ? start.widthKind : 0);
    (u.mate1!.value as Vector3).set(end ? end.index : -1, end ? end.baseD : 1, end ? end.widthKind : 0);
  }

  /** Quiet depth on a turn (camera/quiet.ts quietOf, 0..1): the back tier eases toward the page; for the vessels behind the organs only (the scene sets it). */
  setQuiet(q: number): void { this.toon.uniforms.quietK!.value = q; }

  private tip: { a0: number; a1: number } | null = null;
  /** The fade at a free end (fades.ts). A faded vessel is blended, so it is transparent. */
  setTipFade(f: { mode: number; from: number; to: number; a0: number; a1: number; keep: boolean; line?: readonly [number, number, number, number] }): void {
    const u = this.toon.uniforms;
    u.fadeMode!.value = f.mode; u.fadeKeep!.value = f.keep ? 1 : 0;
    (u.fadeA!.value as Vector4).set(f.from, f.to, f.a0, f.a1);
    if (f.line) (u.fadeLine!.value as Vector4).set(f.line[0], f.line[1], f.line[2], f.line[3]);
    this.tip = { a0: f.a0, a1: f.a1 };
    this.toon.transparent = true;
  }
  /** A fading tip with a collateral attached is solid to its end: its start alpha goes to 1. */
  setTipJoined(joined: boolean): void {
    if (!this.tip) return;
    (this.toon.uniforms.fadeA!.value as Vector4).z = joined ? 1 : this.tip.a0;
  }
  /** A vein fading into the faint cava (fades.ts ivcJoin): `whole` 0..1 is how far the cava is shown whole, and the fade lets go by as much (its alpha at the wall rises from its own to 1). */
  setIvcWhole(whole: number): void {
    if (!this.tip) return;
    (this.toon.uniforms.fadeA!.value as Vector4).w = this.tip.a1 + (1 - this.tip.a1) * whole;
  }

  private veil: { mesh: Mesh; depth: Mesh; mat: ShaderMaterial; pre: ShaderMaterial; overLayer: number; faint: boolean; whole: boolean } | null = null;
  /** A vessel the 2D figure draws behind the organs (BACK_EDGES; the cava above all): it is drawn with the organs, so one in front hides it, and again over them at 0.4, the organ's veil, so
   *  it shows through faintly (stage.js VEIL_K). `faint`: faded along its whole course as well (the cava, F_VEIL), not only where an organ is over it. `overLayer` is the camera layer of what is drawn over the organs. */
  setBehindOrgans(overLayer: number, faint: boolean): void {
    if (this.veil) return;
    const mat = new ShaderMaterial({ vertexShader: this.toon.vertexShader, fragmentShader: this.toon.fragmentShader, uniforms: this.toon.uniforms, side: DoubleSide, transparent: true, depthWrite: false, defines: { VEIL: 1 } });
    // The veil is one layer, not several: a depth-only pass (same shader, so the same silhouette, pushed a hair farther) comes first for every veiled vessel, and the colour pass then draws only
    // where it is the nearest. Without it the tube's own back faces, its ink and the round caps of the next piece blend over each other and show as dark ball joints and a dark core (Mohammad's
    // iPhone, 19 Nov 2026: "the cava ghost shows dark ball joints").
    const pre = new ShaderMaterial({ vertexShader: this.toon.vertexShader, fragmentShader: this.toon.fragmentShader, uniforms: this.toon.uniforms, side: DoubleSide, transparent: true, colorWrite: false, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, defines: { VEIL: 1 } });
    const depth = new Mesh(this.toonMesh.geometry, pre);
    depth.matrixAutoUpdate = true; depth.renderOrder = 1;
    depth.layers.set(overLayer);
    this.group.add(depth);
    const mesh = new Mesh(this.toonMesh.geometry, mat);
    mesh.matrixAutoUpdate = true; mesh.renderOrder = 2;
    mesh.layers.set(overLayer);
    this.group.add(mesh);
    this.veil = { mesh, depth, mat, pre, overLayer, faint, whole: false };
    // drawn with the organs (layer 0), or, faint all along, not drawn solid at all (its mesh stays for picking, on a layer no pass draws)
    this.toonMesh.layers.set(faint ? FAINT_ONLY_LAYER : 0);
  }
  /** The cava shown whole (2D's F_WHOLE, selected or named): the organs do not fade it. It eases over from the veil's 0.4 to 1, and once whole it is drawn solid over the organs, in its tier
   *  behind every vessel of the network; back, it is the veil again. */
  setWholeShare(k: number): void {
    const v = this.veil;
    if (!v) return;
    this.whole = k;
    v.mat.uniforms.veilA!.value = Math.min(1, 0.4 + 0.6 * k + this.lift * (1 - k));
    const whole = k >= 1;
    v.mesh.visible = v.depth.visible = !whole;
    if (whole !== v.whole) {
      v.whole = whole;
      this.toonMesh.layers.set(whole ? v.overLayer : v.faint ? FAINT_ONLY_LAYER : 0);
    }
  }
  private whole = 0; private lift = 0;
  /** Opaque (cel shaded) organs hide what the 2D wash let through, so a veiled vessel's veil takes `lift` of it back (OrganLayer.veilLift); 0 is the 2D veil exactly. */
  setVeilLift(lift: number): void {
    const v = this.veil;
    if (!v || lift === this.lift) return;
    this.lift = lift;
    v.mat.uniforms.veilA!.value = Math.min(1, 0.4 + 0.6 * this.whole + lift * (1 - this.whole));
  }
  override dispose(): void { this.hullMat?.dispose(); this.veil?.mat.dispose(); this.veil?.pre.dispose(); super.dispose(); }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.toon.uniforms.hullOn!.value = on ? 0 : 1; }
  /** Stagnant-blood smoke on or off: OFF by default (no blobs inside a tube); a slide that asks for stasis turns it on. */
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
