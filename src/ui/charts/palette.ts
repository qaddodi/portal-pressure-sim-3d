// The colours a chart draws with, for one look: the 2D app's chart tokens (copied by scripts/copy-chart-tokens.mjs), with the tokens the 3D
// looks table owns taken from it, so a chart and the card it sits on always agree.
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { CHART_TOKENS, TINT_RATIOS } from './tokens.generated.ts';
import { mix, parseColour, withAlpha, type Rgba } from './colour.ts';

export interface Palette {
  look: LookId;
  dark: boolean;
  /** A token of the 2D chart looks by its name without the dashes ('text', 'surface-2', 'tr-wedge'). A name that does not exist throws: never a quiet fallback. */
  tok(name: string): Rgba;
  has(name: string): boolean;
  /** Every token of this look (the 2D chart looks resolve their colours through it, so a chart and the card agree). */
  table(): Readonly<Record<string, Rgba>>;
  mix: typeof mix;
  alpha(c: Rgba, a: number): Rgba;
}

const cache = new Map<LookId, Palette>();

export function paletteOf(id: LookId): Palette {
  const hit = cache.get(id);
  if (hit) return hit;
  const l = LOOKS[id];
  const base = CHART_TOKENS[id];
  const own: Record<string, Rgba> = {
    surface: parseColour(l.card), text: parseColour(l.text), 'text-2': parseColour(l.text2), 'text-3': parseColour(l.text3),
    ok: parseColour(l.ok), caution: parseColour(l.caution), danger: parseColour(l.danger), accent: parseColour(l.accent), 'accent-soft': parseColour(l.accentSoft),
    'vein-portal': parseColour(l.portal), 'vein-systemic': parseColour(l.systemic),
  };
  // the tints beside the surface keep the 2D app's distance from it, measured from the 3D card toward the 3D text
  for (const n of ['surface-2', 'surface-3', 'border', 'border-strong'] as const) {
    const k = TINT_RATIOS[id][n] * 100;
    own[n] = mix('srgb', own.text!, k, own.surface!, 100 - k);
  }
  const table: Record<string, Rgba> = { ...base, ...own };
  const p: Palette = {
    look: id,
    dark: l.scheme === 'dark',
    tok(name) {
      const c = table[name];
      if (!c) throw new Error(`chart token "${name}" is not in the ${id} look`);
      return c;
    },
    has: (name) => name in table,
    table: () => table,
    mix,
    alpha: withAlpha,
  };
  cache.set(id, p);
  return p;
}
