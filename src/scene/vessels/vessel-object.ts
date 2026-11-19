import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, Vector3, Vector4, type Texture } from 'three';
import { CelObject, type CelOptions, type CelShared, rawColor } from '../materials/cel.ts';
import { PALETTES, type Palette } from '../palette.ts';
import { VESSEL_FS, VESSEL_VS } from './shaders.ts';
import type { BloodShared } from '../blood/field.ts';
import { LENS_SHARED, LENS_TOKENS } from '../lenses/tokens.copied.ts';
import type { LookId } from '../palette.ts';
import { CIRCUIT_ATTRIBUTES } from '../circuit/geometry.ts';
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
}

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
        px: { value: opts.px }, res: shared.res, hiColor: { value: new Color() }, hiOn: { value: 0 }, hiDir: { value: 0 }, hiOffset: { value: 0 }, hiAhead: { value: 1 }, hiBehind: { value: 1 }, hiPx: { value: 1.6 },
        markDark: { value: rawColor(LENS_SHARED.chevron) }, markLight: { value: rawColor(LENS_SHARED.chevronLight) }, markRev: { value: rawColor(LENS_TOKENS.light.flowReversed) },
        circT: circuit.circT, circRot: circuit.circRot, circM: circuit.circM, circTrack: circuit.circTrack, circTrackSize: circuit.circTrackSize, circRow: { value: -1 },
        fadeMode: { value: 0 }, fadeA: { value: new Vector4(0, 1, 1, 1) }, fadeKeep: { value: 0 },
        lensUse: { value: this.artery ? 0 : 1 }, streamTex: blood.streamTex, projY: blood.projY, widthKind: { value: opts.widthKind }, lensIndex: { value: opts.lensIndex }, smokeOn: { value: 1 },
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

  private tip: { a0: number; a1: number } | null = null;
  /** The fade at a free end (fades.ts). A faded vessel is blended, so it is transparent. */
  setTipFade(f: { mode: number; from: number; to: number; a0: number; a1: number; keep: boolean }): void {
    const u = this.toon.uniforms;
    u.fadeMode!.value = f.mode; u.fadeKeep!.value = f.keep ? 1 : 0;
    (u.fadeA!.value as Vector4).set(f.from, f.to, f.a0, f.a1);
    this.tip = { a0: f.a0, a1: f.a1 };
    this.toon.transparent = true;
  }
  /** A fading tip with a collateral attached is solid to its end: its start alpha goes to 1. */
  setTipJoined(joined: boolean): void {
    if (!this.tip) return;
    (this.toon.uniforms.fadeA!.value as Vector4).z = joined ? 1 : this.tip.a0;
  }

  private veil: { mesh: Mesh; mat: ShaderMaterial; wholeLayer: number } | null = null;
  /** A vessel the 2D figure draws behind the organs (BACK_EDGES; the cava above all): it is drawn with the organs, so one in front hides it, and again over them at 0.4, the organ's veil, so
   *  it shows through faintly (stage.js VEIL_K). `faint`: faded along its whole course as well (the cava, F_VEIL), not only where an organ is over it. `overLayer` is the camera layer of what is drawn over the organs. */
  setBehindOrgans(overLayer: number, faint: boolean): void {
    if (this.veil) return;
    const mat = new ShaderMaterial({ vertexShader: this.toon.vertexShader, fragmentShader: this.toon.fragmentShader, uniforms: this.toon.uniforms, side: DoubleSide, transparent: true, depthWrite: false, defines: { VEIL: 1 } });
    const mesh = new Mesh(this.toonMesh.geometry, mat);
    mesh.matrixAutoUpdate = true; mesh.renderOrder = 1;
    mesh.layers.set(overLayer);
    this.group.add(mesh);
    this.veil = { mesh, mat, wholeLayer: 0 };
    // drawn with the organs (layer 0), or, faint all along, not drawn solid at all (its mesh stays for picking, on a layer no pass draws)
    this.toonMesh.layers.set(faint ? FAINT_ONLY_LAYER : 0);
  }
  override dispose(): void { this.veil?.mat.dispose(); super.dispose(); }

  /** A closed potential collateral: a dotted thread with no ink. */
  setDotted(on: boolean): void { this.toon.uniforms.dotted!.value = on ? 1 : 0; this.toon.uniforms.hullOn!.value = on ? 0 : 1; }
  /** Stagnant-blood smoke on or off (the Blood menu's chevrons are the mark of moving blood; smoke stays with the lumen). */
  setSmoke(on: boolean): void { this.toon.uniforms.smokeOn!.value = on ? 1 : 0; }
}
