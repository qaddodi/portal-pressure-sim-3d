// A device part (catheter shaft, balloon, needle, stent wire…): the scene's cel object in a device material from the 2D app's --dev-* tokens (the look's own, per look),
// drawn in front of the anatomy it sits in (the 2D rule "devices over the vessels"): no depth test, drawn after everything else, so a catheter in a vein reads at the vein's own place
// and keeps it as the figure turns. It can fade (alpha), for the catheter's leave and a balloon's latex.
import { Color, type BufferGeometry } from 'three';
import { CelObject, type CelShared, rawColor } from '../materials/cel.ts';
import { INK_FS, TOON_FS } from '../materials/shaders.ts';
import { PALETTES, type LookId, type Palette } from '../palette.ts';
import { DEVICE_TOKENS, type DeviceTokens } from '../procedures/copied/device-tokens.copied.ts';

export type DeviceTone = 'poly' | 'steel' | 'platinum' | 'latex' | 'nylon' | 'graft' | 'gold' | 'stentWire' | 'stentGlint' | 'glue' | 'ptfe' | 'thread' | 'marker'
  | 'trWedge' | 'trPv' | 'trIvc' | 'trScler' | 'monFree' | 'monWedge' | 'monAlarm';
const TOKEN_OF: Record<DeviceTone, keyof DeviceTokens> = {
  poly: 'poly', steel: 'steel', platinum: 'platinum', latex: 'latex', nylon: 'nylon', graft: 'graft', gold: 'stentGold', stentWire: 'stentWire', stentGlint: 'stentGlint',
  glue: 'glue', ptfe: 'ptfe', thread: 'sutureThread', marker: 'stentMarker', trWedge: 'trWedge', trPv: 'trPv', trIvc: 'trIvc', trScler: 'trScler', monFree: 'monFree', monWedge: 'monWedge', monAlarm: 'monAlarm',
};
const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

/** Where devices draw: after the anatomy, in the order of their `order`. */
export const DEVICE_RENDER_ORDER = 1000;

export interface DeviceOptions { bands?: 2 | 3; spec?: 0 | 1; px?: number; order?: number }

export class DeviceObject extends CelObject {
  deviceTone: DeviceTone;
  private palette: Palette | null = null;
  /** The ink colour the device wears (its own hairline in the 2D app: --dev-poly-edge on the catheter; the look's ink elsewhere). */
  private edgeInk: 'ink' | 'polyEdge' | 'latexEdge';

  constructor(geometry: BufferGeometry, deviceTone: DeviceTone, shared: CelShared, o: DeviceOptions = {}, edge: 'ink' | 'polyEdge' | 'latexEdge' = 'ink') {
    super(geometry, { tone: 'cath', bands: o.bands ?? 2, spec: o.spec ?? 1, px: o.px ?? 0.9 }, shared);
    this.deviceTone = deviceTone;
    this.edgeInk = edge;
    this.toon.uniforms.alpha = { value: 1 };
    this.ink.uniforms.alpha = { value: 1 };
    this.toon.fragmentShader = 'uniform float alpha;\n' + TOON_FS.replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(c, alpha);');
    this.ink.fragmentShader = 'uniform float alpha;\n' + INK_FS.replace('clamp(vHi, 0.0, 1.0)), 1.0)', 'clamp(vHi, 0.0, 1.0)), alpha)');
    for (const m of [this.toon, this.ink]) { m.depthTest = false; m.depthWrite = false; m.needsUpdate = true; }
    this.group.traverse((c) => { c.renderOrder = DEVICE_RENDER_ORDER + (o.order ?? 0); c.frustumCulled = false; });
  }

  /** Changes the material (a ring's colour, a column's) and paints it in the look it is in. */
  setTone(t: DeviceTone): void { if (t === this.deviceTone) return; this.deviceTone = t; if (this.palette) this.applyPalette(this.palette); }

  override applyPalette(p: Palette): void {
    this.palette = p;
    const look = lookOf(p), t = DEVICE_TOKENS[look];
    const base = rawColor(t[TOKEN_OF[this.deviceTone]]);
    const ink = rawColor(this.edgeInk === 'polyEdge' ? t.polyEdge : this.edgeInk === 'latexEdge' ? t.latexEdge : p.ink);
    (this.toon.uniforms.color!.value as Color).copy(base);
    (this.toon.uniforms.shade!.value as Color).copy(base).multiplyScalar(p.shade).lerp(ink, 0.08);
    (this.ink.uniforms.color!.value as Color).copy(ink);
  }

  /** 0 (gone) to 1 (whole). Under 1 the pass blends and writes no depth. */
  setAlpha(a: number): void {
    const v = Math.min(1, Math.max(0, a));
    this.toon.uniforms.alpha!.value = v; this.ink.uniforms.alpha!.value = v;
    const t = v < 0.999;
    if (this.toon.transparent !== t) { this.toon.transparent = this.ink.transparent = t; this.toon.needsUpdate = this.ink.needsUpdate = true; }
    this.group.visible = v > 0.002;
  }
}
