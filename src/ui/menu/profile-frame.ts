// The patient preview's pressure curve (2D menu.js paintProfile): a patient's settled pressure from the splanchnic bed to the right atrium, 0 to 30 mmHg, as a frame for the GPU chart
// (Chart.tsx). Blood runs downhill, so the steepest fall, where the resistance sits, is the thicker segment with a faint red wash behind it when it is over 5 mmHg. Same numbers, same
// geometry, same colours (the look's pressure ramp) as 2D; only the drawing target differs (shapes for the GPU instead of canvas calls).
import { withAlpha } from '../charts/colour.ts';
import type { ChartCtx } from '../charts/Chart.tsx';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import { pressureColour } from '../charts/profile/pressure-colour.ts';

export const PROF_H = 56;   // 2D .hp-prof height
const PROF_DASH = [2, 3], PROF_GRID = [10, 20], PROF_PAD = 3, PROF_MAX = 30;
const profX = (i: number, W: number, n: number) => PROF_PAD + (i * (W - 2 * PROF_PAD)) / (n - 1);
const profY = (p: number, H: number) => H - PROF_PAD - (Math.max(0, Math.min(PROF_MAX, p)) / PROF_MAX) * (H - 2 * PROF_PAD - 4);

/** The steepest fall along the path: how far (mmHg) and where it ends (index). */
export function steepest(P: readonly number[]): { drop: number; at: number } {
  let drop = 0, at = 0;
  for (let i = 1; i < P.length; i++) { const d = P[i - 1]! - P[i]!; if (d > drop) { drop = d; at = i; } }
  return { drop, at };
}

export function profileScene(P: readonly number[], c: ChartCtx, label = 'Pressure, splanchnic bed to right atrium'): Frame {
  const W = c.w, H = PROF_H, n = P.length, shapes: Shape[] = [];
  const frame = (): Frame => ({ w: W, h: H, shapes, label });
  if (W < 10 || n < 2) return frame();
  const pad = PROF_PAD, grid = c.pal.tok('grid'), accent = c.pal.tok('accent'), danger = c.pal.tok('danger'), surface = c.pal.tok('surface');
  for (const t of PROF_GRID) shapes.push({ k: 'line', x1: pad, y1: profY(t, H), x2: W - pad, y2: profY(t, H), pen: pen(grid, 1, { dash: PROF_DASH, cap: 'butt' }) });
  const { drop, at } = steepest(P);
  const area: number[] = [profX(0, W, n), H - pad];
  for (let i = 0; i < n; i++) area.push(profX(i, W, n), profY(P[i]!, H));
  area.push(profX(n - 1, W, n), H - pad);
  shapes.push({ k: 'path', pts: area, closed: true, fill: withAlpha(accent, 0.06) });
  if (drop > 5) shapes.push({ k: 'rect', x: profX(at - 1, W, n), y: pad - 2, w: profX(at, W, n) - profX(at - 1, W, n), h: H - 2 * pad + 2, r: 3, fill: withAlpha(danger, 0.08) });
  for (let i = 1; i < n; i++) {
    const w = i === at && drop > 5 ? 3.2 : 2.4;
    shapes.push({ k: 'line', x1: profX(i - 1, W, n), y1: profY(P[i - 1]!, H), x2: profX(i, W, n), y2: profY(P[i]!, H), pen: pen(pressureColour(c.look, (P[i - 1]! + P[i]!) / 2), w, { cap: 'round' }) });
  }
  // (a surface-coloured ring under each dot keeps it clear of the line)
  for (let i = 0; i < n; i++) {
    shapes.push({ k: 'circle', cx: profX(i, W, n), cy: profY(P[i]!, H), r: 3.1, fill: surface });
    shapes.push({ k: 'circle', cx: profX(i, W, n), cy: profY(P[i]!, H), r: 2.1, fill: pressureColour(c.look, P[i]!) });
  }
  return frame();
}
