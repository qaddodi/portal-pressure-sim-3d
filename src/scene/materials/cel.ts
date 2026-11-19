import {
  BackSide, type BufferGeometry, Color, DataTexture, FloatType, Group, LinearSRGBColorSpace, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, type Texture, Vector2, Vector3,
} from 'three';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from './shaders.ts';
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
    // one fixed light from the upper left front (look-and-feel.md section 2)
    light: { value: new Vector3(-0.45, 0.75, 0.55).normalize() },
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
  readonly basePx: number;
  readonly isVessel: boolean;
  /** The engine edge this object draws (its topology ID and end nodes); unset for organs and small parts. */
  edge?: { id: string; from: string; to: string; length: number };
  /** Reveal fraction along uv.x: parts beyond it are cut (the catheter feeding in). 1 shows all. */
  setReveal(r: number): void { this.toon.uniforms.reveal.value = r; this.ink.uniforms.reveal.value = r; }

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
      uniforms: {
        color: { value: new Color() }, shade: { value: new Color() }, light: shared.light,
        bands: { value: opts.bands }, spec: { value: opts.spec }, inflate: { value: 0 },
        len: { value: v?.len ?? 1 }, time: shared.time, radius: { value: v?.radius ?? 0 }, baseD: { value: v?.baseD ?? 1 },
        vdata: shared.vdata, vdataSize: shared.vdataSize, vindex: { value: v?.index ?? 0 }, useData: { value: 0 },
        stubSpeed: { value: v?.stubSpeed ?? 0 }, reveal: { value: 1 }, fade: { value: 1 }, flowAmount: { value: 0 }, flowBands: { value: 0 },
        markColor: { value: new Color() }, markReversed: { value: new Color() },
      },
    });
    this.ink = new ShaderMaterial({
      vertexShader: INK_VS,
      fragmentShader: INK_FS,
      side: BackSide,
      uniforms: {
        color: { value: new Color() }, hiColor: { value: new Color() }, inflate: this.toon.uniforms.inflate,
        px: { value: opts.px }, res: shared.res, len: this.toon.uniforms.len, reveal: this.toon.uniforms.reveal, fade: this.toon.uniforms.fade,
        hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiPx: { value: 1.6 },
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
    (this.toon.uniforms.color.value as Color).copy(base);
    (this.toon.uniforms.shade.value as Color).copy(base).multiplyScalar(p.shade).lerp(ink, 0.08);
    (this.ink.uniforms.color.value as Color).copy(ink);
    rawColor(highlightColour(p, this.tone), this.ink.uniforms.hiColor.value as Color);
    const marks = flowMarkColours(p, this.tone);
    rawColor(marks.forward, this.toon.uniforms.markColor.value as Color);
    rawColor(marks.reversed, this.toon.uniforms.markReversed.value as Color);
  }

  /** Ink width for a device: phones trim the organs and the stomach, gut and heart by 0.2 px; vessels and small parts keep theirs. */
  setPhone(phone: boolean): void {
    const trim = phone && this.basePx >= 1.4 ? PHONE_INK_TRIM : 0;
    this.ink.uniforms.px.value = this.basePx - trim;
  }

  /** Flow marks: 0 hides them, 1 shows them fully. `bands` picks soft bands (option C) over chevrons. */
  setFlow(amount: number, bands: boolean): void {
    this.toon.uniforms.flowAmount.value = amount;
    this.toon.uniforms.flowBands.value = bands ? 1 : 0;
  }

  /** How much of the object shows, 0 to 1 (the organs leave as the figure turns into the Circuit). Under 1 it blends; at 0 nothing is drawn. */
  setFade(a: number): void {
    this.toon.uniforms.fade.value = a;
    const blend = a < 1;
    for (const m of [this.toon, this.ink]) { m.transparent = blend; m.depthWrite = !blend; }
    this.group.visible = a > 0.001;
  }

  setUseData(on: boolean): void { this.toon.uniforms.useData.value = on ? 1 : 0; }

  dispose(): void { this.toon.dispose(); this.ink.dispose(); }
}
