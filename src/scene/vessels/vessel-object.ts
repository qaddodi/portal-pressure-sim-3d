import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, NearestFilter, RGBAFormat, ShaderMaterial, Vector3, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS, VESSEL_VS } from './shaders.ts';
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
  /** how the width follows the engine's diameter (network.ts widthKind) */
  widthKind: 0 | 1 | 2;
  /** arteries keep their own colour under every lens (the 2D figure's rule) */
  artery?: boolean;
}

/** The tube twice in one geometry: copy 0 is the body (`hull` 0), copy 1 the ink's hull (`hull` 1). One mesh then draws both, so a vessel is one draw call. */
export function withHull(g: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'tang']) {
    const a = g.getAttribute(name);
    if (!a) continue;
    const arr = a.array as Float32Array, copy = new Float32Array(arr.length * 2);
    copy.set(arr); copy.set(arr, arr.length);
    out.setAttribute(name, new BufferAttribute(copy, a.itemSize));
  }
  const n = g.getAttribute('position').count;
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

const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

/** One vessel: the scene's CelObject (highlight, flow-mark fade) with the toon and ink passes merged into one lens- and blood-aware draw. `ink`
 *  stays as the highlight's handle on the uniforms (colour, hiOn, hiDir, ...) but is never drawn. */
export class VesselObject extends CelObject {
  readonly artery: boolean;

  constructor(geometry: BufferGeometry, opts: VesselOptions, shared: CelShared, lens: LensShared) {
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
        px: { value: opts.px }, res: shared.res, hiColor: { value: new Color() }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiPx: { value: 1.6 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        lensUse: { value: this.artery ? 0 : 1 }, widthKind: { value: opts.widthKind }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 1 },
        lensGradA: lens.lensGradA, lensLaneA: lens.lensLaneA, lensModeA: lens.lensModeA, lensGradB: lens.lensGradB, lensLaneB: lens.lensLaneB, lensModeB: lens.lensModeB,
        laneColA: lens.laneColA, laneColB: lens.laneColB, lensMix: lens.lensMix, lensTail: lens.lensTail,
      },
    });
    old.dispose();
    this.toonMesh.material = toon;
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
    rawColor(p.ink, u.inkColor!.value as Color);
    u.shadeK!.value = p.shade;
    rawColor(LENS_TOKENS[look].flowReversed, u.markRev!.value as Color);
  }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.toon.uniforms.hullOn!.value = on ? 0 : 1; }
  /** Stagnant-blood smoke on or off (the Blood menu's chevrons are the mark of moving blood; smoke stays with the lumen). */
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
