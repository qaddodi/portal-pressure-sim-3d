// The scope's picture (Tests › Endoscopy): the field itself, a lumen seen down its axis with the four varix columns and the band knuckles, is shaded per pixel by the 2D app's own shader under these shapes
// (endo-under.ts, on the shared chart drawer's context). What is drawn here goes over it, all inside the circle of the lumen: the esophageal balloon, the bleed (bleed.ts) and the bezel. Pure:
// (state, size, palette) → Frame.
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import type { Palette } from '../../charts/palette.ts';
import type { Frame, Shape } from '../../charts/scene.ts';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import { parseColour } from '../../charts/colour.ts';
import { scopeTear } from '../copied/endo-motion.copied.js';
import { bleedShapes } from './bleed.ts';
import type { FieldState } from './field.ts';

const tk = (n: string): Rgba => parseColour((SCOPE_TOKENS as Record<string, string>)[n]!);

/** What goes over the field. */
export interface OverlayState { balloon: number; jet: number; pool: number; rate?: number; hr?: number; seconds: number; tearGrow: number }
export interface ScopeView { field: FieldState; over: OverlayState }

/** The frame, `size` px a side. R, the lumen's radius, is the 2D app's: half the box less 4 px for the bezel's outer edge. */
export function scopeFrame(v: ScopeView, size: number, pal: Palette): Frame {
  const cx = size / 2, cy = size / 2, R = size / 2 - 4;
  const shapes: Shape[] = [];
  const out = (s: Shape) => shapes.push(s);
  shapes.push({ k: 'clip', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, r: R });
  // ── the esophageal balloon fills the view (the gastric one lies below it, in the stomach, and shows only as the jet easing out) ──
  const o = v.over;
  if (o.balloon > 0) {
    const hi = tk('scope-balloon-hi'), lo = tk('scope-balloon-lo');
    out({ k: 'circle', cx, cy, r: R * 0.82, fill: withAlpha(lo, o.balloon) });
    out({ k: 'radial', cx: cx - R * 0.2, cy: cy - R * 0.2, stops: [{ r: 0, c: withAlpha(hi, o.balloon * 0.8) }, { r: R * 0.26, c: withAlpha(hi, o.balloon * 0.6) }, { r: R * 0.62, c: withAlpha(hi, 0) }] });
    out({ k: 'circle', cx, cy, r: R * 0.82, pen: { color: [1, 1, 1, 0.5 * o.balloon], w: 2 } });
  }
  // ── the bleed ──
  if (o.jet > 0) {
    const tear = scopeTear(o.tearGrow) as { x: number; y: number };
    for (const s of bleedShapes({ cx, cy, R, jx: cx + tear.x * R, jy: cy + tear.y * R, t: o.seconds, a: o.jet, rate: o.rate, fill: o.pool, hr: o.hr })) out(s);
  }
  out({ k: 'unclip' });
  // ── the bezel: --scope-rim is one near-black on every look, which is gone on a dark one; there the ring gives 1 px of its 7 to a hairline on its outer edge ──
  const dark = pal.dark;
  out({ k: 'circle', cx, cy, r: R, pen: { color: tk('scope-rim'), w: dark ? 6 : 7 } });
  if (dark) out({ k: 'circle', cx, cy, r: R + 3.5, pen: { color: pal.tok('border'), w: 1 } });
  return { w: size, h: size, shapes, label: 'Endoscopic view' };
}
