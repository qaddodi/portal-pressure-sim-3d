// The lobule's tissue, cel shaded (owner, 20 Nov 2026: "everything cel shaded in the figures, it should look beautiful"). 2D's painter paints the plate with soft gradients; here the same painted
// colours go through the figure's one cel style (src/scene/cel-style.ts CEL_STYLE, no number of its own): three flat tones, shade / base / lit, the shade taking SHADE off the base and the lit
// lifting LIT toward white, the edge between them a hard line one anti-aliased pixel wide, and a clean ink line (2D's casing colour at casing alpha, LINE_MIN CSS px) on every strong edge.
//
// The base of a pixel is its OWN local lightness (the painted colour blurred a few mip levels): a flat cell is exactly 2D's colour; only what the painter shades round it (the membranes' halo,
// the vignette, the nutmeg, the collagen's soft edge) steps into the shade or lit tone, so no stripes on a near-flat area and no new palette. A pixel keeps its own hue and chroma (a nucleus stays
// the nucleus's colour); only its lightness is set to the tone's. A pixel much darker or lighter than the tones (a membrane line, a nucleolus) is detail and is left as the painter drew it.
// The vessels on top keep their three screen-space tones and 2D's line (shading.ts, vessels/cel-ink.ts), from the same CEL_STYLE.
import { CEL_QUANT_GLSL } from '../materials/cel-quant.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { lookColours } from './lz-colours.ts';
import type { LookId } from '../../looks/looks.ts';

/** The radial Zones' hard boundaries (share of R): the middle of 2D's 0.18 → 0.5 and 0.5 → 0.85 ramps. */
export const ZONE_EDGES = [0.34, 0.675] as const;
/** How strong a lightness jump per device pixel must be to count as an edge worth an ink line (the painted lines' own contrast, CEL_STYLE.TISSUE, not a share of the tone strength: a membrane is, a soft gradient is not). */
export const EDGE_LO = CEL_STYLE.TISSUE.EDGE_LO, EDGE_HI = CEL_STYLE.TISSUE.EDGE_HI;
/** A neighbour tile's softness: the figure's edge width grows with the blur (mip bias) the field is drawn at. */
export const FIELD_EDGE_PER_MIP = 0.04;

const n = (v: number) => v.toFixed(5);

/** GLSL: the shared cel step plus the tissue's: `celTissue(c, base lightness, edge width)`. Fragment shaders only (fwidth, dFdx). */
export const CEL_TISSUE_GLSL = /* glsl */ `
${CEL_QUANT_GLSL}
const float CEL_SHADE_AT = ${n(CEL_STYLE.TISSUE.SHADE_AT)};
const float CEL_LIT_AT = ${n(CEL_STYLE.TISSUE.LIT_AT)};
const float CEL_LINE_MIN = ${n(CEL_STYLE.LINE_MIN)};   // CSS px: the plate's edge multiplies by the pixel ratio, so the clean line is one weight on every screen
const float CEL_DETAIL = ${n(CEL_STYLE.TISSUE.DETAIL)};
const float CEL_EDGE_LO = ${n(EDGE_LO)};
const float CEL_EDGE_HI = ${n(EDGE_HI)};
// c: the painted colour; lb: its local (blurred) lightness; w: the soft edge between two tones, in the units of the relative lightness (one pixel)
vec3 celTissue(vec3 c, float lb, float w) {
  float l = max(celLight(c), 1e-4), dev = (l - lb) / max(lb, 0.08);
  float sh = 1.0 - smoothstep(CEL_SHADE_AT - w, CEL_SHADE_AT + w, dev);
  float lt = smoothstep(CEL_LIT_AT - w, CEL_LIT_AT + w, dev);
  // the tone's lightness: the base's own, the shade's share lower, the lit's share toward white
  float lq = mix(mix(lb, lb * (1.0 - CEL_SHADE), sh), lb + (1.0 - lb) * CEL_LIT, lt);
  vec3 t = c * clamp(lq / l, 0.5, 1.5);
  // detail (further from the base than CEL_DETAIL: a membrane line, a nucleolus) stays as painted
  float keep = (1.0 - smoothstep(-CEL_DETAIL - w, -CEL_DETAIL + w, dev)) + smoothstep(CEL_DETAIL - w, CEL_DETAIL + w, dev);
  return mix(t, c, clamp(keep, 0.0, 1.0));
}
`;

/** The look's cell colour (2D's --og-liver-1; on a dark look the cell as the plate shows it: the painter's gap toward the cell by .28) and 2D's casing laid over it: the ink of the lobule's lines. */
export function tissueInk(look: LookId): [number, number, number] {
  const L = lookColours(look);
  const cellRaw = L.rgb01('--og-liver-1'), gap = L.rgb01('--og-liver-2');
  const base: [number, number, number] = L.dark ? [gap[0] + (cellRaw[0] - gap[0]) * 0.28, gap[1] + (cellRaw[1] - gap[1]) * 0.28, gap[2] + (cellRaw[2] - gap[2]) * 0.28] : [cellRaw[0], cellRaw[1], cellRaw[2]];
  const cas = L.rgb01('--vessel-casing'), a = L.alpha('--vessel-casing');
  return [base[0] + (cas[0] - base[0]) * a, base[1] + (cas[1] - base[1]) * a, base[2] + (cas[2] - base[2]) * a];
}

const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
/** The JS twin of `celTissue` with a hard edge (w = 0), for the tests and for reading what a pixel becomes: c the painted colour, lb its local lightness. */
export function celTissueJS(c: readonly [number, number, number], lb: number): [number, number, number] {
  const l = Math.max(luma(c), 1e-4), dev = (l - lb) / Math.max(lb, 0.08);
  if (dev < -CEL_STYLE.TISSUE.DETAIL || dev > CEL_STYLE.TISSUE.DETAIL) return [c[0], c[1], c[2]];
  const lq = dev < CEL_STYLE.TISSUE.SHADE_AT ? lb * (1 - CEL_STYLE.SHADE) : dev > CEL_STYLE.TISSUE.LIT_AT ? lb + (1 - lb) * CEL_STYLE.LIT : lb;
  const g = Math.min(1.5, Math.max(0.5, lq / l));
  return [c[0] * g, c[1] * g, c[2] * g];
}
/** The tone a pixel falls in against its local lightness: 0 shade, 1 base, 2 lit (cel-style.ts celBand on the relative lightness). */
export const tissueTone = (l: number, lb: number): 0 | 1 | 2 => { const d = (l - lb) / Math.max(lb, 0.08); return d < CEL_STYLE.TISSUE.SHADE_AT ? 0 : d >= CEL_STYLE.TISSUE.LIT_AT ? 2 : 1; };
