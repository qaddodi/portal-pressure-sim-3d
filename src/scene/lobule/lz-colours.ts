// The 2D app's colour tokens, as the lobule's painter reads them (lobule-zoom.js tk, util.js cssRGB01), for one look: the per-look table the 2D
// stylesheet is printed from (theme-tokens.js, copied) plus the lobule's colours that are the same in every look (lz-tokens.generated.js), var()
// worked out here. Pure: no page and no styles read, so the painting is the same in node (the tests) as on a device, and a look change is one lookup.
import { tokensOfLook } from '../../ui/charts/looks2d/theme-tokens.js';
import { parseCssColor } from '../../ui/charts/looks2d/css-color.js';
import { LZ_TOKENS } from './from2d/lz-tokens.generated.js';
import type { LookId } from '../../looks/looks.ts';

export type RGB = [number, number, number];

export interface LookColours {
  readonly dark: boolean;
  /** A token's text with every var() worked out ('' when the look has no such token). */
  text(name: string): string;
  /** The 2D tk: the token's colour as CSS text, or with alpha a as rgba(). */
  tk(name: string, a?: number | string): string;
  /** A token's colour as [r, g, b] in 0 … 1 (black when it is not a colour). */
  rgb01(name: string): RGB;
  /** A token's alpha (1 when it has none). */
  alpha(name: string): number;
}

const bare = (n: string) => (n.startsWith('--') ? n.slice(2) : n);
const cache = new Map<LookId, LookColours>();

/** The colours of a look (made once per look). */
export function lookColours(look: LookId): LookColours {
  let c = cache.get(look);
  if (c) return c;
  const T = tokensOfLook(look) as Record<string, string>;
  const raw = (n: string): string => T[n] ?? (LZ_TOKENS as Record<string, string>)[n] ?? '';
  const text = (name: string): string => {
    let s = raw(bare(name)).trim();
    for (let i = 0; i < 8 && s.includes('var('); i++) s = s.replace(/var\(--([\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_m, n: string, fb?: string) => raw(n).trim() || (fb ?? '').trim());
    return s;
  };
  const parse = (name: string) => parseCssColor(text(name)) as [number, number, number, number] | null;
  c = {
    dark: T['color-scheme'] === 'dark' || look === 'dark' || look === 'navy' || look === 'black',
    text,
    tk(name, a) {
      if (a === undefined) return text(name);
      const p = parse(name) ?? [0, 0, 0, 1];
      return `rgba(${Math.round(p[0] * 255)},${Math.round(p[1] * 255)},${Math.round(p[2] * 255)},${a})`;
    },
    rgb01(name) { const p = parse(name); return p ? [p[0], p[1], p[2]] : [0, 0, 0]; },
    alpha(name) { const p = parse(name); return p ? p[3] : 1; },
  };
  cache.set(look, c);
  return c;
}

/** #rrggbb for [r, g, b] in 0 … 1. */
export const hexOf = (c: readonly number[]): string => '#' + c.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
