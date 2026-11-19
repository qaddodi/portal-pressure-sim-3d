// Shared by the chart tests: a context for any look and width, and the checks every chart frame must pass.
import assert from 'node:assert/strict';
import { LOOK_IDS, type LookId } from '../src/looks/looks.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { chartType } from '../src/ui/charts/type.ts';
import { tessellate, meshBounds } from '../src/ui/charts/geometry.ts';
import { contrast } from '../src/ui/charts/colour.ts';
import type { ChartCtx } from '../src/ui/charts/Chart.tsx';
import type { Frame, TextShape } from '../src/ui/charts/scene.ts';

export const ctxOf = (look: LookId, w = 330, device: 'desktop' | 'phone-portrait' | 'phone-landscape' | 'tablet-portrait' = 'desktop'): ChartCtx => ({ w, pal: paletteOf(look), type: chartType(device), look });
export const eachLook = (fn: (look: LookId) => void) => { for (const l of LOOK_IDS) fn(l); };

/** Every frame: words at least 12 px, nothing drawn outside the box (beyond a pen's half width), every colour finite, and words that read on the card (4.5:1) unless they sit on a tint. */
export function judge(f: Frame, look: LookId, opts: { onCard?: boolean; slack?: number } = {}) {
  const words = f.shapes.filter((s): s is TextShape => s.k === 'text');
  for (const t of words) {
    assert.ok(t.size >= 12, `${look}: "${t.s}" is ${t.size} px, under the 12 px floor`);
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y), `${look}: "${t.s}" has no place`);
    if (opts.onCard !== false) {
      const c = contrast(t.color, paletteOf(look).tok('surface'));
      assert.ok(c >= 4.5, `${look}: "${t.s}" reads ${c.toFixed(2)}:1 on the card, under 4.5`);
    }
  }
  const m = tessellate(f);
  const b = meshBounds(m);
  if (b) {
    const s = opts.slack ?? 2;
    assert.ok(b.x0 >= -s && b.y0 >= -s && b.x1 <= f.w + s && b.y1 <= f.h + s, `${look}: drawn outside the box ${JSON.stringify(b)} vs ${f.w}×${f.h}`);
  }
  for (const v of m.verts) assert.ok(Number.isFinite(v), `${look}: a vertex is not a number`);
  return { words, mesh: m };
}
