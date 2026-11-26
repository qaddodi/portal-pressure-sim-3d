// A device part's edge, one rule per part, taken from the 2D app's own (styles/tokens.css and the draw code of each device), never the look's ink by default.
// 2D gives every device its own outline: the endoscope a faint hairline in its own black moved halfway to the body's (eus-scope.js EDGE_MIX 0.55, EDGE_A 0.26), the needle the
// catheter's dark edge at 0.8, the Doppler head a white (on dark looks black) line inside a black (white) rim, the FibroScan body a --text-2 line, the bands and the port none.
// Pure (hex in, hex out), so the table is tested without a GPU.
import type { DeviceTokens } from '../procedures/copied/device-tokens.copied.ts';
import type { LookId } from '../palette.ts';

/** What a rule reads to give its colour: the device tokens of the look, the look, and the look's own ink. */
export interface EdgeCtx { t: DeviceTokens; look: LookId; ink: string }
/** A custom edge: its colour, and its strength (0 to 1, the alpha the outline is drawn at; 1 when left out). */
export interface EdgeFn { colour: (c: EdgeCtx) => string; a?: number }
/** 'ink': the look's ink (the figure's own outline); 'polyEdge', 'latexEdge': the catheter's and the balloon's dark edges; 'none': no outline at all. */
export type EdgeRule = 'ink' | 'polyEdge' | 'latexEdge' | 'none' | EdgeFn;

const h2 = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const rgb = (hex: string): [number, number, number] => { const s = hex.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
/** `a` moved `k` (0 to 1) of the way to `b`, hex colours. */
export function mixHex(a: string, b: string, k: number): string {
  const x = rgb(a), y = rgb(b);
  return '#' + h2(x[0] + (y[0] - x[0]) * k) + h2(x[1] + (y[1] - x[1]) * k) + h2(x[2] + (y[2] - x[2]) * k);
}

/** The outline a rule gives in a look: its colour and its strength (0 draws none). */
export function resolveEdge(rule: EdgeRule, c: EdgeCtx): { hex: string; a: number } {
  if (rule === 'none') return { hex: c.ink, a: 0 };
  if (rule === 'ink') return { hex: c.ink, a: 1 };
  if (rule === 'polyEdge') return { hex: c.t.polyEdge, a: 1 };
  if (rule === 'latexEdge') return { hex: c.t.latexEdge, a: 1 };
  return { hex: rule.colour(c), a: rule.a ?? 1 };
}

/** The endoscope's hairline (eus-scope.js): its edge colour (--dev-scope-edge, light on the dark looks) moved 55 % toward the body's black, drawn at 0.26, so it reads as the scope's own shading and not a drawn outline. */
export const SCOPE_EDGE_MIX = 0.55, SCOPE_EDGE_A = 0.26;
export const scopeSoftHex = (t: DeviceTokens): string => mixHex(t.scopeEdge, t.scope, SCOPE_EDGE_MIX);
/** The scope's hairline at `k` times its strength (the transducer's is 0.8 of it, as 2D's). */
export const scopeEdge = (k = 1): EdgeFn => ({ colour: ({ t }) => scopeSoftHex(t), a: SCOPE_EDGE_A * k });
/** The needle's edge: --dev-poly-edge at 0.8 (eus-scope.js line(…, M.ink, 0.8)). */
export const NEEDLE_EDGE: EdgeFn = { colour: ({ t }) => t.polyEdge, a: 0.8 };

/** The IR catheter's hairline (owner, 20 Nov 2026: "light, subtle ink, never dark-shaded"): the polymer's dark edge moved 62 % toward the shaft's own pale colour and drawn at half strength, so the shaft reads as a pale
 *  line with a soft grey-blue edge, never a black outline. The balloon's rim and the marker bands take the same softness. */
export const CATH_EDGE_MIX = 0.62, CATH_EDGE_A = 0.55;
export const catheterSoftHex = (t: DeviceTokens, mix = CATH_EDGE_MIX): string => mixHex(t.polyEdge, t.poly, mix);
export const CATH_EDGE: EdgeFn = { colour: ({ t }) => catheterSoftHex(t), a: CATH_EDGE_A };
export const BALLOON_EDGE: EdgeFn = { colour: ({ t }) => mixHex(t.polyEdge, t.nylon, 0.55), a: 1 };

/** The Doppler head's inner line (--dop-head-ink: white on the light looks, black on the dark ones), 1.6 px on the body and 1.4 px on the face (app-06-plate.css .dpr-body, .dpr-face). */
export const DOP_INK: EdgeFn = { colour: ({ t }) => t.dopHeadInk };
/** The Doppler head's outer rim (--dop-head-rim: the inverse) is a 4 px stroke under the body: the colour of the part that draws it. */
export const DOP_RIM_PX = 4, DOP_BODY_PX = 1.6, DOP_FACE_PX = 1.4;

/** The FibroScan body's line is --text-2 (1.6 px), its cable --text-3, its tip --text-2 (app-06-plate.css .sp-body, .sp-tip, .sp-cable). */
export const SCAN_BODY_PX = 1.6;
