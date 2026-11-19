// What the recorder reads each frame: where the camera is, every label, every card. DOM reads (getBoundingClientRect, computed opacity) on the debug path only; the app itself
// never runs this (the live site does not load it), and it reads once per clock frame, in the tags phase, after everything else has moved.
import { cel } from '../../../scene/api.ts';
import { sceneApi } from '../../../scene/api.ts';
import type { Sources } from './recorder.ts';

const r1 = (v: number) => Math.round(v * 10) / 10;
const alpha = (win: Window, el: Element) => { const v = parseFloat(win.getComputedStyle(el).opacity); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 1; };

export function domSources(doc: Document = document, win: Window = window): Sources {
  const out = { x: 0, y: 0 };
  return {
    camera() {
      if (!cel.rig.placed) return null;
      const p = sceneApi.project(sceneApi.anchor('pv'), out);
      return [Math.round(cel.rig.handView.k * 1e5) / 1e5, r1(p.x), r1(p.y)];
    },
    labels() {
      const rows: (string | number)[][] = [];
      doc.querySelectorAll<HTMLElement>('.lb').forEach((el) => {
        const b = el.getBoundingClientRect();
        rows.push([(el.querySelector('.lb-name')?.textContent ?? '').trim(), r1(b.left), r1(b.top), r1(b.width), r1(b.height), el.hasAttribute('data-on') ? alpha(win, el) : 0]);
      });
      return rows;
    },
    cards() {
      const K: (string | number)[][] = [], W: number[] = [];
      doc.querySelectorAll<HTMLElement>('.dk-card').forEach((el) => {
        const b = el.getBoundingClientRect();
        K.push([el.dataset.card ?? 'card', r1(b.left), r1(b.top), r1(b.width), r1(b.height), alpha(win, el)]);
        W.push((el.querySelector('.dk-title, .dk-body')?.textContent ?? '').trim() ? 1 : 0);
      });
      return { K, W };
    },
  };
}
