// Warms the label solver's code in the background slot (clock/idle.ts), so the first real solve of a view (the Anatomy's names, the Circuit's captions, the Lobule's) does not run cold.
// The audit of 22 Nov (build 4cd8c60c) had its three worst first-time frames there: a solver run for the first time is interpreted, then compiled while it runs, which cost 2 to 4 times a warm solve.
// Small deterministic problems in the shape of a real one (names with forms, leaders, lines with a width, a card), a few per slice: the hot loops are compiled long before they are needed. Nothing is drawn or kept.
import { solve, type Item, type Line } from './solver.ts';

/** One small problem: `n` names across a 600 by 400 view, a card and a dozen lines with a width; the same input each time. */
function problem(n: number): Parameters<typeof solve>[0] {
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const w = 60 + (i % 4) * 14;
    items.push({ id: `w${i}`, ax: 70 + (i * 97) % 460, ay: 50 + (i * 61) % 300, au: 0.5, forms: [{ text: 'x', w: w + 40, h: 18 }, { text: 'x', w, h: 18 }, { text: 'x', w: 30, h: 18 }], pri: i, must: i % 5 === 0, ...(i % 2 ? { clearLines: true } : {}), ...(i % 3 === 0 ? { vw: 4 } : {}) });
  }
  const lines: Line[] = [];
  for (let i = 0; i < 160; i++) { const x = (i * 37) % 600, y = (i * 53) % 400; lines.push(i % 3 ? [x, y, x + 30, y + 20, 3] : [x, y, x + 30, y + 20]); }
  return { items, view: { x0: 0, y0: 0, x1: 600, y1: 400 }, blockers: [{ x0: 400, y0: 0, x1: 600, y1: 120 }], lines, leaderLineCost: 30 };
}

/** One warm-up step: a small solve. Returns true after `rounds` of them. */
export function solverWarmer(rounds = 14): () => boolean {
  let n = 0;
  return () => { solve(problem(10 + (n % 3) * 4)); return ++n >= rounds; };
}
