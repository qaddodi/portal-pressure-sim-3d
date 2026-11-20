import {
  BackSide, type BufferGeometry, Color, DataTexture, FloatType, Group, KeepStencilOp, LinearSRGBColorSpace, Mesh, NearestFilter, NotEqualStencilFunc, ReplaceStencilOp, RGBAFormat, ShaderMaterial, type Texture, Vector2, Vector3,
} from 'three';
import { HI_NONE, INK_FS, INK_VS, TOON_FS, TOON_VS } from './shaders.ts';
import { CEL_LIGHT_UNIT } from '../cel-glsl.ts';
import { type Palette, type ToneKey, flowMarkColours, highlightColour } from '../palette.ts';

/** A colour whose numbers are the hex's own sRGB values, not converted to linear: the cel shaders do their banding in sRGB space, as the
 *  spec's factors (shade × 0.62, rim +0.10, specular +0.32) are written, and their output is written to the canvas as is. The body plate
 *  and the clear colour go through three's own colour management and land on the same hex. */
export function rawColor(hex: string, out = new Color()): Color {
  return out.setHex(parseInt(hex.slice(1), 16), LinearSRGBColorSpace);
}

/** Uniforms shared by every cel object: one clock value, one light, one screen size, one data texture. */
export interface CelShared {
  res: { value: Vector2 };
  time: { value: number };
  light: { value: Vector3 };
  vdata: { value: Texture };
  vdataSize: { value: Vector2 };
}

export function createShared(): CelShared {
  const blank = new DataTexture(new Float32Array([0, 0, 1, 0]), 1, 1, RGBAFormat, FloatType);
  blank.minFilter = blank.magFilter = NearestFilter;
  blank.needsUpdate = true;
  return {
    res: { value: new Vector2(1, 1) },
    time: { value: 0 },
    // the one fixed WORLD light, upper left front (cel-style.ts LIGHT; look-and-feel.md section 2)
    light: { value: new Vector3(...CEL_LIGHT_UNIT) },
    vdata: { value: blank },
    vdataSize: { value: new Vector2(1, 1) },
  };
}

export interface CelOptions {
  tone: ToneKey;
  /** 3 on organs, 2 on vessels and small parts (section 2). */
  bands: 2 | 3;
  /** 1 for the wet vessel highlight dot, 0 for matte organs. */
  spec: 0 | 1;
  /** Ink width in CSS pixels (section 3). */
  px: number;
  /** A tube of the vessels' own look (plexus strands, varices): the three screen-lit tones and no rim, not the world-lit bands (materials/shaders.ts TUBE_TONES). */
  tubeTones?: boolean;
  /** Vessels only: the texel of this vessel in the data texture, its curve length, tube radius, healthy diameter (mm) and the flow speed used until data arrives. */
  vessel?: { index: number; len: number; stubSpeed: number; radius: number; baseD: number };
}

/** How wide the ink is on a phone: section 3 trims organs and the heart/gut by 0.2 px. */
export const PHONE_INK_TRIM = 0.2;

export class CelObject {
  readonly group = new Group();
  readonly toon: ShaderMaterial;
  /** The mesh the toon pass draws; the raycaster hits this one. */
  readonly toonMesh: Mesh;
  readonly ink: ShaderMaterial;
  readonly tone: ToneKey;
  basePx: number;
  readonly isVessel: boolean;
  /** The engine edge this object draws (its topology ID and end nodes); unset for organs and small parts. */
  edge?: { id: string; from: string; to: string; length: number };
  /** Reveal fraction along uv.x: parts beyond it are cut (the catheter feeding in). 1 shows all. */
  setReveal(r: number): void { this.toon.uniforms.reveal.value = r; this.ink.uniforms.reveal.value = r; }

  /** How much of the object is drawn, 1 all (the default) to 0 none: it dissolves in a fixed pixel pattern, so it never pops (the dive into the liver dissolves the body). */
  setFade(f: number): void { this.toon.uniforms.fade!.value = f; }
  get fade(): number { return this.toon.uniforms.fade!.value as number; }

  readonly opts: CelOptions;

  constructor(geometry: BufferGeometry, opts: CelOptions, shared: CelShared) {
    this.opts = opts;
    this.tone = opts.tone;
    this.basePx = opts.px;
    this.isVessel = !!opts.vessel;
    const v = opts.vessel;
    this.toon = new ShaderMaterial({
      vertexShader: TOON_VS,
      fragmentShader: TOON_FS,
      // a geometry with an `ink` attribute carries its own colour at each vertex (setInk): the shader reads it in place of the tone
      ...(geometry.getAttribute('ink') || opts.tubeTones ? { defines: { ...(geometry.getAttribute('ink') ? { VERTEX_INK: '' } : {}), ...(opts.tubeTones ? { TUBE_TONES: '' } : {}) } } : {}),
      uniforms: {
        color: { value: new Color() }, shade: { value: new Color() }, light: shared.light,
        bands: { value: opts.bands }, spec: { value: opts.spec }, inflate: { value: 0 },
        len: { value: v?.len ?? 1 }, time: shared.time, radius: { value: v?.radius ?? 0 }, baseD: { value: v?.baseD ?? 1 },
        vdata: shared.vdata, vdataSize: shared.vdataSize, vindex: { value: v?.index ?? 0 }, useData: { value: 0 },
        stubSpeed: { value: v?.stubSpeed ?? 0 }, reveal: { value: 1 }, fade: { value: 1 }, inkShade: { value: 0.62 }, inkAmount: { value: 0 }, flowAmount: { value: 0 }, flowBands: { value: 0 },
        markColor: { value: new Color() }, markReversed: { value: new Color() }, tubeDark: { value: 0 },
      },
    });
    this.ink = new ShaderMaterial({
      vertexShader: INK_VS,
      fragmentShader: INK_FS,
      side: BackSide,
      uniforms: {
        color: { value: new Color() }, hiColor: { value: new Color() }, inflate: this.toon.uniforms.inflate, fade: this.toon.uniforms.fade,
        px: { value: opts.px }, res: shared.res, len: this.toon.uniforms.len, reveal: this.toon.uniforms.reveal,
        hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiEnds: { value: new Vector2(HI_NONE, HI_NONE) }, hiFade: { value: 1 }, hiPx: { value: 1.6 }, inkA: { value: 1 },
      },
    });
    const inkMesh = new Mesh(geometry, this.ink);
    const toonMesh = (this.toonMesh = new Mesh(geometry, this.toon));
    // the ink is drawn first and sits behind the toon pass; neither needs sorting
    inkMesh.matrixAutoUpdate = toonMesh.matrixAutoUpdate = true;
    this.group.add(inkMesh, toonMesh);
  }

  /** Colours for a look: tone, shadow tone (base × shade, 8% toward the ink) and ink. */
  applyPalette(p: Palette): void {
    const base = rawColor(p.tones[this.tone]);
    const ink = rawColor(p.ink);
    this.toon.uniforms.inkShade!.value = p.shade;
    this.toon.uniforms.tubeDark!.value = p.highlight === 'white' ? 1 : 0;   // the dark looks: brighter vessel caps (cel-style TUBE.LCAP_DARK)
    (this.toon.uniforms.color.value as Color).copy(base);
    (this.toon.uniforms.shade.value as Color).copy(base).multiplyScalar(p.shade).lerp(ink, 0.08);
    if (!this.soft) (this.ink.uniforms.color.value as Color).copy(ink);
    rawColor(highlightColour(p, this.tone), this.ink.uniforms.hiColor.value as Color);
    const marks = flowMarkColours(p, this.tone);
    rawColor(marks.forward, this.toon.uniforms.markColor.value as Color);
    rawColor(marks.reversed, this.toon.uniforms.markReversed.value as Color);
  }

  /** Ink width for a device: phones trim the organs and the stomach, gut and heart by 0.2 px; vessels and small parts keep theirs. */
  setPhone(phone: boolean): void {
    const trim = phone && !this.soft && this.basePx >= 1.4 ? PHONE_INK_TRIM : 0;
    this.ink.uniforms.px.value = this.basePx - trim;
  }

  /** The 2D figure's line for a thin tube (a strand of a plexus, a varix): the look's casing ink at its casing alpha, blended after the opaque bodies and tested against them (the same rule as the vessels' own, vessels/cel-ink.ts),
   *  held to `cssPx` CSS pixels (the figure's line, cel-style.ts LINE_MIN: the same weight on every screen; the ink pass converts with the renderer's ratio itself), and no specular glint. Organs and parts keep their solid ink. */
  setSoftInk(rgb: readonly [number, number, number], alpha: number, cssPx: number): void {
    (this.ink.uniforms.color.value as Color).setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, LinearSRGBColorSpace);
    this.ink.uniforms.inkA!.value = alpha;
    this.ink.transparent = false;   // (a vessel is opaque: its line is solid ink, never blended)
    this.ink.depthWrite = false;
    // one outline round the union, as the vessels' (vessels/vessel-object.ts hullMat): a pixel takes the ink once, strands crossing each other and their vein included
    this.ink.stencilWrite = true; this.ink.stencilRef = 1; this.ink.stencilFunc = NotEqualStencilFunc; this.ink.stencilFail = KeepStencilOp; this.ink.stencilZFail = KeepStencilOp; this.ink.stencilZPass = ReplaceStencilOp;
    this.basePx = cssPx;
    this.ink.uniforms.px.value = this.basePx;
    this.toon.uniforms.spec.value = 0;
    this.soft = true;
  }
  /** True once `setSoftInk` has set it: a look change then leaves the ink colour to the caller. */
  soft = false;

  /** Flow marks: 0 hides them, 1 shows them fully. `bands` picks soft bands (option C) over chevrons. */
  setFlow(amount: number, bands: boolean): void {
    this.toon.uniforms.flowAmount.value = amount;
    this.toon.uniforms.flowBands.value = bands ? 1 : 0;
  }

  /** How much of the vertex colour (the geometry's `ink` attribute) shows in place of the tone: 1 all, 0 none. Only objects built with the attribute. */
  setInkAmount(a: number): void { this.toon.uniforms.inkAmount!.value = a; }

  setUseData(on: boolean): void { this.toon.uniforms.useData.value = on ? 1 : 0; }

  dispose(): void { this.toon.dispose(); this.ink.dispose(); }
}
