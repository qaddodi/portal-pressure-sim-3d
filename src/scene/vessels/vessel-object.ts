import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat, ShaderMaterial, Vector3, type BufferGeometry, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { TOON_VS } from '../materials/shaders.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS } from './shaders.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import type { LookId } from '../palette.ts';

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
  /** arteries keep their own colour under every lens (the 2D figure's rule) */
  artery?: boolean;
}

const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

/** One vessel: the scene's CelObject (ink pass, highlight, flow-mark fade) with the toon pass swapped for the lens- and blood-aware one. */
export class VesselObject extends CelObject {
  readonly artery: boolean;
  private readonly inkMesh: { visible: boolean };

  constructor(geometry: BufferGeometry, opts: VesselOptions, shared: CelShared, lens: LensShared) {
    super(geometry, { ...opts, tone: opts.tone === 'artery' ? 'portal' : opts.tone }, shared);
    this.artery = !!opts.artery;
    const old = this.toon;
    const u = old.uniforms;
    const toon = new ShaderMaterial({
      vertexShader: TOON_VS,
      fragmentShader: VESSEL_FS,
      uniforms: {
        ...u,
        inkColor: { value: new Color() }, shadeK: { value: 0.62 }, dotted: { value: 0 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        lensUse: { value: this.artery ? 0 : 1 }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 1 },
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensModeA: lens.lensModeA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, lensModeB: lens.lensModeB,
        laneColA: lens.laneColA, laneColB: lens.laneColB, lensMix: lens.lensMix, lensTail: lens.lensTail,
      },
    });
    old.dispose();
    this.toonMesh.material = toon;
    (this as unknown as { toon: ShaderMaterial }).toon = toon;
    // the ink shares the toon's inflate, length and reveal: point it at the new material's
    this.ink.uniforms.inflate = toon.uniforms.inflate!;
    this.ink.uniforms.len = toon.uniforms.len!;
    this.ink.uniforms.reveal = toon.uniforms.reveal!;
    this.inkMesh = this.group.children[0] as unknown as { visible: boolean };
  }

  /** Colours for a look. An artery wears the look's artery red; a vein its portal or systemic tone; a lens covers veins on top of it. The scene
   *  calls this through CelObject.applyPalette, with the look's palette. */
  override applyPalette(p: Palette): void {
    super.applyPalette(p);
    const look = lookOf(p);
    const u = this.toon.uniforms;
    if (this.artery) rawColor(LENS_TOKENS[look].artery, u.color!.value as Color);
    (u.inkColor!.value as Color).copy(this.ink.uniforms.color!.value as Color);
    u.shadeK!.value = p.shade;
    rawColor(LENS_TOKENS[look].flowReversed, u.markRev!.value as Color);
  }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.inkMesh.visible = !on; }
  /** Stagnant-blood smoke on or off (the Blood menu's chevrons are the mark of moving blood; smoke stays with the lumen). */
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
