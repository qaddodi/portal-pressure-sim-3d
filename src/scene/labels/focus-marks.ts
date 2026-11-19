// A procedure's step callouts on the figure (2D proc-anim.js stepMark, drawn as the `.lb.focus` pill: the step's number in bold and its word, in the accent's fill, at the part the step works on, with a ring on the
// vessel and a hairline to the words): "1 Needle in", "2 Stent". Built once in the label layer; each frame writes transform and opacity only. The place of the words is the Doppler callout's rule (probe-labels.ts: the
// nearest of eight places round the point that is clear of the cards and the other labels, the place it had kept while it stays clear).
import { Vector3 } from 'three';
import { EDGE_PATH_2D } from '../vessels/paths.copied.ts';
import { pointOn } from '../devices/probes/copied/eus-scope.copied.js';
import { x3, y3 } from '../frame2d.ts';
import { clock } from '../../clock/frame.ts';
import { useLabels, type FocusMark } from './store.ts';
import { dopCalloutAt, type DopPick } from './probe-labels.ts';
import { probeCards } from '../devices/probes/cards.ts';
import { probeAvoid } from './probe-boxes.ts';
import { useUi } from '../../ui/ui-store.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { sceneApi } from '../api.ts';
import type { Box } from '../devices/probes/screen.ts';

const MAX = 4, Z = 0.4;
type P2 = [number, number];

/** A mark's point on the figure (scene units), or null where it names a vessel the figure does not draw. */
export function markPoint(m: FocusMark, out: Vector3): Vector3 | null {
  const path = (EDGE_PATH_2D as Record<string, P2[]>)[m.edges[0] ?? ''];
  if (!path || path.length < 2) return null;
  const q = pointOn(path, m.f ?? 0.5) as P2;
  return out.set(x3(q[0]), y3(q[1]), Z);
}

export interface FocusMarksDom { paint(dt: number): boolean; destroy(): void }

export function buildFocusMarks(root: HTMLElement): FocusMarksDom {
  const mk = (tag: string, cls: string, parent: HTMLElement): HTMLElement => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  interface Slot { pill: HTMLElement; num: HTMLElement; word: HTMLElement; dot: HTMLElement; lead: HTMLElement; a: number; keep: number; w: number; h: number; tx: string; dtx: string; ltx: string; op: string; text: string; on: boolean }
  const slots: Slot[] = [];
  const ro = new ResizeObserver((es) => { for (const e of es) { const s = slots.find((q) => q.pill === e.target); if (s) { s.w = (e.target as HTMLElement).offsetWidth; s.h = (e.target as HTMLElement).offsetHeight; } } clock.invalidate('focus-marks'); });
  for (let i = 0; i < MAX; i++) {
    const pill = mk('div', 'pl pl-mark', root), num = mk('span', 'pl-mark-num', pill), word = mk('span', 'pl-mark-word', pill);
    const dot = mk('i', 'pl pl-mark-dot', root), lead = mk('i', 'pl pl-mark-lead', root);
    slots.push({ pill, num, word, dot, lead, a: 0, keep: -1, w: 0, h: 0, tx: '', dtx: '', ltx: '', op: '', text: '', on: false });
    ro.observe(pill);
  }
  const P = new Vector3(), pt = { x: 0, y: 0 }, pick: DopPick = { x: 0, y: 0, slot: 0, clear: true };
  const view: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }, none: Box = { x0: -9, y0: -9, x1: -9, y1: -9 };
  const px = (n: number): number => Math.round(n * 100) / 100;
  const flag = (e: HTMLElement, on: boolean): void => { if (on) e.setAttribute('data-on', ''); else e.removeAttribute('data-on'); };

  return {
    /** Writes the marks; true while any is still fading. */
    paint(dt: number): boolean {
      const marks = useLabels.getState().marks, k = 1 - Math.exp(-dt / 120);
      const u = useUi.getState().vp;
      view.x0 = u.safe.left + 4; view.y0 = u.safe.top + BAR + 4; view.x1 = u.w - u.safe.right - 4; view.y1 = u.h - u.safe.bottom - 4;
      let busy = false;
      const cards = probeCards(), avoid = probeAvoid();
      slots.forEach((s, i) => {
        const m = marks[i], at = m && markPoint(m, P);
        const want = at ? 1 : 0;
        if (m && at) {
          const text = `${m.num ?? ''}|${m.word ?? m.label}`;
          if (text !== s.text) { s.text = text; s.num.textContent = m.num ?? ''; s.word.textContent = m.word ?? m.label; s.num.style.display = m.num ? '' : 'none'; }
        }
        s.a += (want - s.a) * k;
        if (Math.abs(want - s.a) < 0.01) s.a = want; else busy = true;
        const show = s.a > 0.002;
        flag(s.pill, show); flag(s.dot, show); flag(s.lead, show);
        const op = String(px(s.a));
        if (op !== s.op) { s.op = op; s.pill.style.opacity = op; s.dot.style.opacity = op; s.lead.style.opacity = op; }
        if (!show || !at || !s.w) return;
        sceneApi.project(P, pt);
        dopCalloutAt({ x: pt.x, y: pt.y }, -40, s.w, s.h, view, cards, none, avoid, s.keep, pick);
        s.keep = pick.clear ? pick.slot : -1;
        const tx = `translate3d(${px(pick.x)}px,${px(pick.y)}px,0)`;
        if (tx !== s.tx) { s.tx = tx; s.pill.style.transform = tx; }
        const dtx = `translate3d(${px(pt.x)}px,${px(pt.y)}px,0)`;
        if (dtx !== s.dtx) { s.dtx = dtx; s.dot.style.transform = dtx; }
        // the hairline from the ring to the nearest point of the words' box
        const nx = Math.min(pick.x + s.w, Math.max(pick.x, pt.x)), ny = Math.min(pick.y + s.h, Math.max(pick.y, pt.y)), len = Math.hypot(nx - pt.x, ny - pt.y);
        const ltx = len > 6 ? `translate3d(${px(pt.x)}px,${px(pt.y)}px,0) rotate(${Math.atan2(ny - pt.y, nx - pt.x).toFixed(4)}rad) scaleX(${px(len)})` : 'translate3d(0,0,0) scaleX(0)';
        if (ltx !== s.ltx) { s.ltx = ltx; s.lead.style.transform = ltx; }
      });
      return busy;
    },
    destroy(): void { ro.disconnect(); for (const s of slots) { s.pill.remove(); s.dot.remove(); s.lead.remove(); } },
  };
}
