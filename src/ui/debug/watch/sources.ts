// What the recorder reads each frame: where the camera is, every label, every card. DOM reads (getBoundingClientRect, computed opacity) on the debug path only; the app itself
// never runs this (the live site does not load it), and it reads once per clock frame, in the tags phase, after everything else has moved.
import { cel } from '../../../scene/api.ts';
import { sceneApi } from '../../../scene/api.ts';
import type { Sources } from './recorder.ts';
import { cardSeries } from './motion-rules.ts';

const r1 = (v: number) => Math.round(v * 10) / 10;
const alpha = (win: Window, el: Element) => { const v = parseFloat(win.getComputedStyle(el).opacity); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 1; };

/** One label element as the page has it: a label has two (the picture it stands in, and the one it is leaving while it crosses to a new spot or new words, `lb-ghost`: scene/labels/fade.ts). */
export interface LabelEl { name: string; x: number; y: number; w: number; h: number; alpha: number; ghost: boolean }
/** One row per label NAME: [name, x, y, w, h, alpha, crossing]. The two pictures of a crossing are one label cross-fading, so the row is the picture it is going to (its place), seen as much as the two together
 *  are (1 - (1 - a)(1 - b): the old one fading out as the new fades in never reads as a label that vanished, flashed or slid; the later of the two overwrote the first, so the audit saw the old one fall away and
 *  then the new one at another place, as a flash, a vanish and a jump), and `crossing` is 1 while the old picture is still drawn, so the motion rules know its place is changing by a fade. */
export function labelRows(els: readonly LabelEl[]): (string | number)[][] {
  const by = new Map<string, { main?: LabelEl; ghost?: LabelEl }>();
  for (const e of els) { const g = by.get(e.name) ?? {}; if (e.ghost) { if (!g.ghost || e.alpha > g.ghost.alpha) g.ghost = e; } else if (!g.main || e.alpha > g.main.alpha) g.main = e; by.set(e.name, g); }
  const rows: (string | number)[][] = [];
  for (const [name, g] of by) {
    const m = g.main ?? g.ghost!, ga = g.main && g.ghost ? g.ghost.alpha : 0;
    const crossing = ga > 0.001 ? 1 : 0;
    rows.push([name, m.x, m.y, m.w, m.h, Math.round((1 - (1 - m.alpha) * (1 - ga)) * 100) / 100, crossing]);
  }
  return rows;
}
/** Does a card hold anything: any words, or a picture (svg, canvas, image, table, math)? (The cards use the 2D app's pz-* classes, so asking for .dk-title or .dk-body, as this once did, called every ladder, visual and words card empty.) */
export const hasContent = (el: Element): boolean => !!(el.textContent ?? '').trim() || !!el.querySelector('svg, canvas, img, video, table, math');

export function domSources(doc: Document = document, win: Window = window): Sources {
  const out = { x: 0, y: 0 };
  return {
    camera() {
      if (!cel.rig.placed) return null;
      const p = sceneApi.project(sceneApi.anchor('pv'), out);
      return [Math.round(cel.rig.handView.k * 1e5) / 1e5, r1(p.x), r1(p.y)];
    },
    labels() {
      const els: LabelEl[] = [];
      doc.querySelectorAll<HTMLElement>('.lb').forEach((el) => {
        const b = el.getBoundingClientRect();
        els.push({ name: (el.querySelector('.lb-name')?.textContent ?? '').trim(), x: r1(b.left), y: r1(b.top), w: r1(b.width), h: r1(b.height), alpha: el.hasAttribute('data-on') ? alpha(win, el) : 0, ghost: el.classList.contains('lb-ghost') });
      });
      return labelRows(els);
    },
    cards() {
      const K: (string | number)[][] = [], W: number[] = [];
      doc.querySelectorAll<HTMLElement>('.dk-card').forEach((el) => {
        const b = el.getBoundingClientRect();
        K.push([cardSeries(el.dataset.card ?? 'card', el.dataset.phase), r1(b.left), r1(b.top), r1(b.width), r1(b.height), alpha(win, el)]);
        W.push(hasContent(el) ? 1 : 0);
      });
      return { K, W };
    },
  };
}
