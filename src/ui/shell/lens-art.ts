// The swatch of each colour lens in the lens menu. It is not drawn by hand: it is the lens's own colour key (scene/lenses/legend.ts legendFor, which reads the same ramps the vessels are
// painted from, per look), so the menu swatch, the header key and the vessels cannot drift apart (Mohammad, 20 Nov: "make sure the lenses reflect their legend; pressure does not").
import { legendFor, type LegendSpec } from '../../scene/lenses/legend.ts';
import type { LensId } from '../../scene/lenses/model.ts';
import type { LookId } from '../../looks/looks.ts';

/** The CSS background of a key: its gradient bar as it is, or its dots as equal bands. */
export function swatchOfLegend(g: LegendSpec): string {
  if (g.bar) return `linear-gradient(90deg, ${g.bar.stops.map(([c, p]) => `${c} ${p}%`).join(', ')})`;
  const dots = (g.dots ?? []).filter((d) => d.colour);
  if (!dots.length) return 'none';
  const n = dots.length;
  return `linear-gradient(90deg, ${dots.map((d, i) => `${d.colour} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(', ')})`;
}

export const lensSwatch = (lens: LensId, look: LookId): string => swatchOfLegend(legendFor(lens, look));
