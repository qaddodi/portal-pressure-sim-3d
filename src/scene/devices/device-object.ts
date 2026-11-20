// A device part (catheter shaft, balloon, needle, stent wire…): the scene's cel object in a device material from the 2D app's --dev-* tokens (the look's own, per look),
// drawn in front of the anatomy it sits in (the 2D rule "devices over the vessels"): no depth test, drawn after everything else, so a catheter in a vein reads at the vein's own place
// and keeps it as the figure turns. It can fade (alpha), for the catheter's leave and a balloon's latex.
import { Color, type BufferGeometry } from 'three';
import { CelObject, type CelShared, rawColor } from '../materials/cel.ts';
import { INK_FS, TOON_FS } from '../materials/shaders.ts';
import { PALETTES, type LookId, type Palette } from '../palette.ts';
import { LOOKS } from '../../looks/looks.ts';
import { DEVICE_TOKENS, type DeviceTokens } from '../procedures/copied/device-tokens.copied.ts';

export type DeviceTone = 'poly' | 'steel' | 'platinum' | 'latex' | 'nylon' | 'graft' | 'gold' | 'stentWire' | 'stentGlint' | 'glue' | 'ptfe' | 'thread' | 'marker'
  | 'trWedge' | 'trPv' | 'trIvc' | 'trScler' | 'monFree' | 'monWedge' | 'monAlarm'
  /** the look's accent (the 2D app's --accent: the tamponade's traction arrow) */ | 'accent';
const TOKEN_OF: Record<Exclude<DeviceTone, 'accent'>, keyof DeviceTokens> = {
  poly: 'poly', steel: 'steel', platinum: 'platinum', latex: 'latex', nylon: 'nylon', graft: 'graft', gold: 'stentGold', stentWire: 'stentWire', stentGlint: 'stentGlint',
  glue: 'glue', ptfe: 'ptfe', thread: 'sutureThread', marker: 'stentMarker', trWedge: 'trWedge', trPv: 'trPv', trIvc: 'trIvc', trScler: 'trScler', monFree: 'monFree', monWedge: 'monWedge', monAlarm: 'monAlarm',
};
const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

/** The device pixels every device grows by on each side, so its fill never thins to nothing under its outline (a catheter a pixel or two wide still shows its colour). */
export const FAT_PX = 1.0;
/** How much of a device's free end fades out as a gradient, figure units (the scope's top, the catheter's lead-in above the figure: never a cut). */
export const TAIL_UNITS = 110;
const TAIL_GLSL = 'uniform float tailFade;\nfloat tailK(float u) { return tailFade > 0.0 ? smoothstep(0.0, tailFade, u) : 1.0; }\n';
const FAT_TOON = `vec4 gp = projectionMatrix * mv;
  vec2 fatN = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
  float fatL = length(fatN);
  fatN = fatL > 1e-5 ? fatN / fatL : vec2(0.0);
  gp.xy += fatN * fatPx * 2.0 / res * gp.w;
  gl_Position = gp;`;
/** Where devices draw: after the anatomy, in the order of their `order`. */
export const DEVICE_RENDER_ORDER = 1000;

/** `tubeTones`: the vessels' own three screen-lit tones (shadow, base, lift; no rim, no glint) on a tube; by default on a tube built by `allocTube` / `mergeTubes` (a shaft, a wire, a balloon, a column), off on the spheres, cylinders and discs, which keep the world-lit bands. */
/** A shader with its alpha swapped for the device's fade. A shader that changed under it fails here, loudly: a silent miss left a faded catheter's outline whole. */
export function withAlpha(src: string, from: string, to: string): string {
  if (!src.includes(from)) throw new Error(`device alpha: "${from}" is not in the shader`);
  return src.replace(from, to);
}

export interface DeviceOptions { bands?: 2 | 3; spec?: 0 | 1; px?: number; order?: number; tubeTones?: boolean }

export class DeviceObject extends CelObject {
  deviceTone: DeviceTone;
  private palette: Palette | null = null;
  /** The ink colour the device wears (its own hairline in the 2D app: --dev-poly-edge on the catheter; the look's ink elsewhere). */
  private edgeInk: 'ink' | 'polyEdge' | 'latexEdge';

  constructor(geometry: BufferGeometry, deviceTone: DeviceTone, shared: CelShared, o: DeviceOptions = {}, edge: 'ink' | 'polyEdge' | 'latexEdge' = 'ink') {
    super(geometry, { tone: 'cath', bands: o.bands ?? 2, spec: o.spec ?? 1, px: o.px ?? 0.9, tubeTones: o.tubeTones ?? geometry.userData.ringTube === true }, shared);
    this.deviceTone = deviceTone;
    this.edgeInk = edge;
    this.toon.uniforms.alpha = { value: 1 };
    this.ink.uniforms.alpha = { value: 1 };
    this.toon.fragmentShader = 'uniform float alpha;\n' + withAlpha(TOON_FS, 'gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, alpha);');
    // (the ink's alpha is the soft ink's own `inkA` (1 for a hard ink) and the pick's solid ring: a device's fade multiplies the first)
    this.ink.fragmentShader = 'uniform float alpha;\n' + withAlpha(INK_FS, 'mix(inkA, 1.0, clamp(vHi, 0.0, 1.0))', 'mix(inkA, 1.0, clamp(vHi, 0.0, 1.0)) * alpha');
    // a thin device (a catheter, a wire) is always a few pixels of fill: both passes grow by FAT_PX device px each way, the fill first and the outline outside it (a hairline catheter was only its outline)
    // a free end (the top of a scope, the start of a catheter's lead-in above the figure) fades out along the first `tailFade` share of its length (uv.x), a gradient, never a cut
    this.toon.uniforms.tailFade = this.ink.uniforms.tailFade = { value: 0 };
    this.toon.fragmentShader = TAIL_GLSL + withAlpha(this.toon.fragmentShader, 'gl_FragColor = vec4(c, alpha);', 'gl_FragColor = vec4(c, alpha * tailK(vUv.x));');
    this.ink.fragmentShader = TAIL_GLSL + withAlpha(this.ink.fragmentShader, ' * alpha', ' * alpha * tailK(vU)');
    this.toon.uniforms.res = shared.res; this.toon.uniforms.fatPx = { value: FAT_PX }; this.ink.uniforms.fatPx = { value: FAT_PX };
    this.toon.vertexShader = 'uniform vec2 res;\nuniform float fatPx;\n' + withAlpha(this.toon.vertexShader, 'gl_Position = projectionMatrix * mv;', FAT_TOON);
    this.ink.vertexShader = 'uniform float fatPx;\n' + withAlpha(this.ink.vertexShader, '(px + hiPx * vHi)', '(px + fatPx + hiPx * vHi)');
    // A device is always in the blended list (alpha 1 until it fades), which three draws after the whole opaque list, by render order: the organs' see-through wash and any vessel that blends (a fading end)
    // were drawn over the devices, which has no depth test to stand in front of them, so a catheter looked washed out or behind the vein it runs in.
    this.toon.transparent = this.ink.transparent = true;
    for (const m of [this.toon, this.ink]) { m.depthTest = false; m.depthWrite = false; m.needsUpdate = true; }
    // (A device draws with no depth test, so its draw order IS its picture: the ink (the back faces, grown a hairline) first and the fill over it. Left at one shared order, three sorts equal ones by material, the fill's
    //  made first, so the ink hull was drawn last and covered the whole device in its dark outline colour: a near-black catheter, probe and scope on a dark ground. Two orders a device: ink 2n, fill 2n + 1.)
    this.group.traverse((c) => { c.renderOrder = DEVICE_RENDER_ORDER + 2 * (o.order ?? 0) + (c === this.toonMesh ? 1 : 0); c.frustumCulled = false; });
  }

  /** The first `share` (0..1) of the device's length, from its start, fades in from nothing as a gradient: a free end that has no tip to end on. 0 for none. */
  setTailFade(share: number): void { const v = Math.min(1, Math.max(0, share)); this.toon.uniforms.tailFade!.value = v; this.ink.uniforms.tailFade!.value = v; }

  /** Changes the material (a ring's colour, a column's) and paints it in the look it is in. */
  setTone(t: DeviceTone): void { if (t === this.deviceTone) return; this.deviceTone = t; if (this.palette) this.applyPalette(this.palette); }

  override applyPalette(p: Palette): void {
    this.palette = p;
    const look = lookOf(p), t = DEVICE_TOKENS[look];
    const base = rawColor(this.deviceTone === 'accent' ? LOOKS[look].accent : t[TOKEN_OF[this.deviceTone]]);
    const ink = rawColor(this.edgeInk === 'polyEdge' ? t.polyEdge : this.edgeInk === 'latexEdge' ? t.latexEdge : p.ink);
    (this.toon.uniforms.color!.value as Color).copy(base);
    (this.toon.uniforms.shade!.value as Color).copy(base).multiplyScalar(p.shade).lerp(ink, 0.08);
    (this.ink.uniforms.color!.value as Color).copy(ink);
  }

  /** 0 (gone) to 1 (whole). The passes always blend (see the constructor) and write no depth. */
  setAlpha(a: number): void {
    const v = Math.min(1, Math.max(0, a));
    this.toon.uniforms.alpha!.value = v; this.ink.uniforms.alpha!.value = v;
    this.group.visible = v > 0.002;
  }
}
