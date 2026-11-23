// The catheter's readings as DOM: each is a tag (tag-dom.ts: the name, the number and the unit on one line, each letter in the labels' halo; no glass, no rim, no pointer), and a thin
// leader with a dot on its point. The result is a stack: the two readings as tags of their own, the bracket joining them, the HVPG beside it and a thin leader from each reading to its point.
//
// The layer builds this once; each frame `paint` writes only transform and opacity (the sizes and the words are written when a tag takes a new size or its words change, which is while it
// is invisible). Opacity goes on a tag's children and never on the tag. The words and numbers come from cath-show.ts.
import type { PillDraw, SumDraw, CathFrame } from './cath-show.ts';
import { LS } from './type.ts';
import { restyle } from './roll.ts';
import { makeTag, words, fade, place, size, show, opacity, TagLead, type Tag } from './tag-dom.ts';
import { boxLeader } from './tag-lead.ts';

const NS = 'http://www.w3.org/2000/svg';
const px = (n: number) => Math.round(n * 100) / 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls; parent?.appendChild(e); return e;
}
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag); parent.appendChild(e); return e;
}

/** A leader that is drawn at once at its target (a tag's own fade, 0 to 1, carries it in and out: it never shows without its words). */
const snap = (_k: number, on: boolean): number => (on ? 1 : 0);

export interface CathDom { paint(f: CathFrame): void; destroy(): void }

export function buildCath(parent: HTMLElement): CathDom {
  const C = LS.CATH;
  const pills = { f: makeTag(parent, 'cl cl-pill'), w: makeTag(parent, 'cl cl-pill') };
  pills.f.root.dataset.k = 'f'; pills.w.root.dataset.k = 'w';
  const leads = { f: new TagLead(parent), w: new TagLead(parent) };

  // the stack
  const sum = el('div', 'cl-sum', parent); sum.dataset.k = 's';
  const rows = [makeTag(sum, 'cl cl-row'), makeTag(sum, 'cl cl-row')] as const;
  const calc = makeTag(sum, 'cl cl-row cl-calc');
  const brace = svgEl('svg', sum); brace.setAttribute('class', 'cl-brace');
  const bpath = svgEl('path', brace);
  const sleads = svgEl('svg', sum); sleads.setAttribute('class', 'cl-leads'); sleads.setAttribute('width', '1'); sleads.setAttribute('height', '1');
  const lead = [svgEl('path', sleads), svgEl('path', sleads)] as const, dot = [svgEl('circle', sleads), svgEl('circle', sleads)] as const;
  lead.forEach((l, j) => { l.setAttribute('class', 'lead'); dot[j].setAttribute('class', 'lead-dot'); dot[j].setAttribute('r', String(C.LEAD.dotR)); });
  let sumKey = '', sumOn = false, sumTx = '', braceOp = '', leadsOp = '';
  rows[0].root.dataset.k = 'w'; rows[1].root.dataset.k = 'f'; calc.root.dataset.k = 'h';

  const paintPill = (c: Tag, l: TagLead, d: PillDraw | undefined) => {
    if (!d) { if (c.root.hasAttribute('data-on')) { show(c, false); fade(c, 0); } l.hide(); return; }
    show(c, true);
    words(c, d.reading, d.alpha);   // (before the size: a crossing starts from the tag as it stood)
    size(c, d.w, d.h);
    place(c, d.x, d.y + d.rise);
    fade(c, d.alpha);
    // the leader runs from the words' nearest edge to the point the reading was taken at, a dot on the point; it rises and fades with the tag
    const seg = boxLeader({ x: d.x, y: d.y + d.rise, w: d.w, h: d.h }, { x: d.to[0], y: d.to[1] });
    l.paint(seg, seg ? { x: d.to[0], y: d.to[1] } : null, d.alpha, d.reading.tone, snap);
  };

  return {
    paint(f: CathFrame): void {
      paintPill(pills.f, leads.f, f.pills.find((p) => p.id === 'f'));
      paintPill(pills.w, leads.w, f.pills.find((p) => p.id === 'w'));
      const s: SumDraw | null = f.sum;
      if (!s) { if (sumOn) { sumOn = false; sum.removeAttribute('data-on'); for (const c of [...rows, calc]) { show(c, false); fade(c, 0); } } return; }
      if (!sumOn) { sumOn = true; sum.setAttribute('data-on', ''); for (const c of [...rows, calc]) show(c, true); }
      const g = s.geom;
      const at = `translate3d(${px(s.x)}px,${px(s.y)}px,0)`;
      if (at !== sumTx) { sumTx = at; sum.style.transform = at; }
      if (sumKey !== s.key) {
        sumKey = s.key;
        sum.style.width = `${px(g.w)}px`; sum.style.height = `${px(g.h)}px`;
        brace.style.left = `${px(g.brace.x)}px`; brace.style.top = '0px';
        brace.setAttribute('width', String(g.brace.w)); brace.setAttribute('height', String(px(g.brace.h))); bpath.setAttribute('d', g.brace.d);
        for (let j = 0; j < 2; j++) {
          lead[j].setAttribute('d', s.leaders.d[j]);
          dot[j].setAttribute('cx', String(px(s.leaders.dots[j][0]))); dot[j].setAttribute('cy', String(px(s.leaders.dots[j][1])));
        }
      }
      // (a leader takes its row's colour: when that changes while they show, they cross over to it)
      if ([0, 1].some((j) => lead[j]!.getAttribute('data-tone') !== s.rows[j]!.tone)) {
        restyle(sleads, () => { for (let j = 0; j < 2; j++) { lead[j]!.setAttribute('data-tone', s.rows[j]!.tone); dot[j]!.setAttribute('data-tone', s.rows[j]!.tone); } }, s.lead * s.alpha);
      }
      for (let j = 0; j < 2; j++) {
        const c = rows[j], R = g.rows[j], r = s.row[j];
        words(c, s.rows[j], r.alpha * s.alpha); size(c, R.w, R.h);
        place(c, R.x + r.dx, R.y + r.dy + r.rise); fade(c, r.alpha * s.alpha);
      }
      const K = g.calc;
      words(calc, s.calc, s.calcAlpha * s.alpha); size(calc, K.w, K.h);
      place(calc, K.x, K.y + s.calcRise); fade(calc, s.calcAlpha * s.alpha);
      const b = opacity(s.lead * s.alpha);
      if (b !== braceOp) { braceOp = b; brace.style.opacity = b; }
      if (b !== leadsOp) { leadsOp = b; sleads.style.opacity = b; }
    },
    destroy(): void { pills.f.root.remove(); pills.w.root.remove(); leads.f.destroy(); leads.w.destroy(); sum.remove(); },
  };
}
