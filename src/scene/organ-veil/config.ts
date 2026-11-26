// ORGAN VEIL (Mohammad, 25 Nov 2026): "organs cover, or change the fade, or show their texture (both), of vessels going inside them; if we zoom in toward a blood vessel the effect decreases and is gone at a moderate zoom"
// and "the same for organs: zoom into an organ with another organ in front of it and the one in front shows through, elegantly". Sheet: docs/approved/organ-veil.md.
//
// THE ONE SWITCH. `ORGAN_VEIL.on = false` turns the whole effect off: no map is drawn, every shader reads strength 0, no organ is put on the map's layers. One small commit changes it
// (the sheet names the commit that switched it on). Everything else of the effect is in this folder; the only other files that mention it are the places that read its uniforms
// (vessels/shaders.ts, vessels/skin/shaders.ts, blood/cells/shader.ts, organs/organ-shader.ts), each through the chunks in glsl.ts.
//
// Pure numbers here, no GPU: tests/organ-veil.test.ts holds them.

export interface OrganVeilConfig {
  on: boolean; vesselMax: number; gapFrom: number; gapTo: number; vesselFull: number; vesselGone: number; seeMax: number; seeFrom: number; seeTo: number;
  behind: readonly string[]; inFront: readonly string[];
}
export const ORGAN_VEIL: OrganVeilConfig = {
  /** The switch. */
  on: true,
  /** How much of a vessel is taken by the organ at the deepest, at the whole-figure framing: 0.55 leaves the vessel 45% (Mohammad, 25 Nov: recommendation 1). */
  vesselMax: 0.55,
  /** How deep behind the organ's front surface (scene units, along the view) the veil starts and is whole: about 1.5 to 10 vein radii of a 0.02 vein. */
  gapFrom: 0.03,
  gapTo: 0.20,
  /** The vessel veil's zoom: whole up to this much closer than the whole-figure framing, gone at `vesselGone` (Mohammad: gone at 2x). */
  vesselFull: 1.2,
  vesselGone: 2.0,
  /** The organ in front lets the one behind show: its fill opacity is taken down by up to this share (0.55: 45% of its own is left). */
  seeMax: 0.55,
  /** Its zoom: starts at `seeFrom` times the whole-figure framing, whole at `seeTo`. */
  seeFrom: 1.5,
  seeTo: 3.0,
  /** The organs the others let show through: the organs behind (drawn before the ones in front: layer.ts ORGAN_ORDER). The first pass of the effect (Mohammad: kidney, spleen and caudate first). */
  behind: ['kidney-l', 'spleen', 'caudate'],
  /** The organs that let those show through: every organ drawn after them (the heart and its atrium are drawn before, and nothing lies behind them in the front view). */
  inFront: ['liver', 'stomach', 'duodenum', 'bowel', 'colon'],
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** GLSL's smoothstep. */
export const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The vessel veil's share of its maximum at zoom `z` (1 = the whole figure framed, 2 = twice as close, the viewer's own zoom included): 1 up to `vesselFull`, 0 from `vesselGone`, smooth on the log of the distance (the app's habit: camera/dive.ts cutOpen). */
export function vesselZoomK(z: number, c: OrganVeilConfig = ORGAN_VEIL): number {
  if (!c.on) return 0;
  const l = Math.log(Math.max(z, 1e-6));
  return 1 - smooth(Math.log(c.vesselFull), Math.log(c.vesselGone), l);
}
/** The organ show-through's share of its maximum at zoom `z`: 0 up to `seeFrom`, 1 from `seeTo`. */
export function seeZoomK(z: number, c: OrganVeilConfig = ORGAN_VEIL): number {
  if (!c.on) return 0;
  const l = Math.log(Math.max(z, 1e-6));
  return smooth(Math.log(c.seeFrom), Math.log(c.seeTo), l);
}
/** What the body's dive and the Circuit take off both: they are not on the anatomy figure. `away` is 0 on the figure, 1 gone. */
export const figureShare = (away: number): number => clamp01(1 - away);
/** The veil's share of its strength: the organs' own fade, `body` the dive's dissolve of the body and `leaving` the Circuit's taking of the organs (1 drawn, 0 gone). The veil goes
 *  with the organs on the same curve, so no view change switches it: in the dive it eases out as the camera closes in and the body dissolves, and back on the way out (Mohammad
 *  26 Nov: the dive's flicker). */
export const veilShare = (body: number, leaving: number): number => figureShare(1 - Math.min(body, leaving));
/** The share of a vessel the organ covers: the veil's maximum at depth `gap` behind the organ's front surface (the JS twin of glsl.ts veilAmount). */
export function veilOf(gap: number, strength: number, c: OrganVeilConfig = ORGAN_VEIL): number { return strength * smooth(c.gapFrom, c.gapTo, gap); }
