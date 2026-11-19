// The 2D app's chart looks, run as the 2D app runs them. The look tables (looks2d/chart-looks/*.js: tok, mix, param, em, scale…), their resolver and the pure files the resolver needs
// are copied whole from the 2D app by scripts/copy-chart-tokens.mjs; this file only asks them. A chart never writes a stroke width, an alpha or a type size of its own: it asks
// `look(c, 'trial.bar', …)` and draws what comes back, so a chart can not drift from the 2D look. The colours come from the 3D look's own palette (the card the chart sits on).
import type { ChartCtx } from './Chart.tsx';
import { paletteOf } from './palette.ts';
import type { Rgba } from './colour.ts';
import { clearLookMemo, makeCtx, resolveProps, setTokenSource, withCtx } from './looks2d/chart-looks/resolve.js';
import { LOOKS as TABLE } from './looks2d/chart-looks/index.js';
import { parseCssColor } from './looks2d/css-color.js';
import type { LookId } from '../../looks/looks.ts';

/** Data text is never under 12 px (the bible; owner, 17 Nov 2026). */
export const MIN_WORD = 12;
const css = (c: Rgba) => `color(srgb ${c[0]} ${c[1]} ${c[2]} / ${c[3]})`;
// the 2D resolver asks for the tokens of a context; the context's `theme` carries this app's look id, so its colours are the card's own
const maps = new Map<string, Record<string, string>>();
setTokenSource((ctx: { theme: string }) => {
  let m = maps.get(ctx.theme);
  if (!m) {
    m = {};
    for (const [k, v] of Object.entries(paletteOf(ctx.theme as LookId).table())) m[k] = css(v);
    maps.set(ctx.theme, m);
  }
  return m;
});
/** Forget what was resolved (a look's colours changed). */
export const forgetLooks = () => { maps.clear(); clearLookMemo(); };

/** Every look key a chart has asked for since the page loaded (the parity tests read which of the 2D tables a drawn chart really uses). */
export const LOOKS_ASKED = new Set<string>();

/** What the 2D table says for one piece, in the numbers a frame draws with. A property the entry leaves alone is absent. */
export interface Look {
  fill?: Rgba; stroke?: Rgba;
  /** stroke width, px */
  width?: number;
  size?: number; weight?: number;
  /** letter spacing, em */
  ls?: number;
  dash?: number[];
  opacity?: number; fillOpacity?: number; strokeOpacity?: number;
  cap?: 'butt' | 'round'; join?: 'miter' | 'round';
  anchor?: 'start' | 'middle' | 'end';
  upper?: boolean;
  /** a stroke laid under a word (paint-order: stroke) */
  halo?: { color: Rgba; w: number };
  hidden?: boolean; none?: boolean;
}

/** The sizes the 2D card hands a chart (card-scale.js): the host's base size comes from them (HOSTS in chart-looks/index.js). */
export interface LookCtxIn { host: string; sm?: number; cap?: number; lab?: number; fs12?: number; chCap?: number; in?: string; boxW?: number; px?: number; svk?: number; dark?: boolean; layout?: string; lad?: number }

const colour = (v: unknown): Rgba | undefined => {
  if (typeof v !== 'string' || v === 'none' || v === 'transparent') return undefined;
  const c = parseCssColor(v);
  return c ? ([c[0], c[1], c[2], c[3]] as Rgba) : undefined;
};
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

/** The look of the piece `key` in chart context `c` (host and the card's type sizes in `h`), for the states and params its entry declares (data-rate → { rate }, data-p-tone → params { tone }). */
export function look(c: ChartCtx, h: LookCtxIn, key: string, state: Record<string, unknown> = {}, params: Record<string, string> = {}): Look {
  LOOKS_ASKED.add(key);
  const entry = (TABLE as Record<string, unknown>)[key];
  if (!entry) throw new Error(`no 2D chart look "${key}"`);
  const base = (makeCtx as unknown as (l: object) => object)({ host: h.host, in: h.in ?? '', boxW: h.boxW ?? c.w, px: h.px, svk: h.svk ?? 1, layout: h.layout, lad: h.lad, scale: { sm: h.sm ?? c.type.sm, cap: h.cap, lab: h.lab, fs12: h.fs12, chCap: h.chCap } });
  const ctx = (withCtx as unknown as (c: object, o: object) => object)(base, { theme: c.look, dark: c.pal.dark, palette: '' });
  const P = (resolveProps as unknown as (e: unknown, c: object, s: object, p: object) => unknown)(entry, ctx, state, params) as Record<string, unknown>;
  const o: Look = {};
  const fill = colour(P.fill), stroke = colour(P.stroke);
  if ('fill' in P) o.fill = fill ?? [0, 0, 0, 0];
  if (stroke) o.stroke = stroke;
  if (num(P.width) !== undefined) o.width = P.width as number;
  if (num(P.size) !== undefined) o.size = Math.max(MIN_WORD, P.size as number);   // (the 2D card grows a chart's type until its words are 12 px: chart-ctx.js fittedType; the smaller steps of em() never go under)
  if (num(P.weight) !== undefined) o.weight = P.weight as number;
  // letter spacing is an em string (own(k)) or px (em(k), svk(px)): a frame takes em of the word's own size
  if (typeof P.letterSpacing === 'string') o.ls = parseFloat(P.letterSpacing);
  else if (num(P.letterSpacing) !== undefined) o.ls = (P.letterSpacing as number) / (o.size ?? (num(P.size) as number) ?? 12);
  if (Array.isArray(P.dash)) o.dash = P.dash as number[];
  for (const k of ['opacity', 'fillOpacity', 'strokeOpacity'] as const) if (num(P[k]) !== undefined) o[k] = P[k] as number;
  if (P.cap === 'round' || P.cap === 'butt') o.cap = P.cap;
  if (P.join === 'round' || P.join === 'miter') o.join = P.join;
  if (P.anchor === 'start' || P.anchor === 'middle' || P.anchor === 'end') o.anchor = P.anchor;
  if (P.upper) o.upper = true;
  if (P.paintStroke && stroke && num(P.width) !== undefined) { o.halo = { color: stroke, w: P.width as number }; delete o.stroke; delete o.width; }
  if (P.hidden) o.hidden = true;
  if (P.none) o.none = true;
  return o;
}
