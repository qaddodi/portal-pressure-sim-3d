// The catheter's readings as DOM, as the 2D app builds them (stage-cath.js cathPill/cathBuild, callout.js): a card is its glass (one shape: the card and its
// pointer, clipped from one path, its 1 px hairline that same path stroked inside it), then the name, the number and the unit. The result is a stack: the two
// readings as cards of their own, the bracket joining them, the HVPG beside it and a thin leader from each reading to its point.
//
// The layer builds this once; each frame `paint` writes only transform and opacity (the glass, the path, the sizes and the words are written when a card takes
// a new shape or its words change, which is while it is invisible). Opacity goes on a card's children and never on the card: a faded ancestor would stop
// its glass seeing the figure behind it (2D: "the fades run on the label's children, not the label"). The words and numbers come from cath-show.ts.
import type { PillDraw, SumDraw, CathFrame } from './cath-show.ts';
import { pillGlass, type Glass, type Reading } from './cath.ts';
import { LS } from './type.ts';

const NS = 'http://www.w3.org/2000/svg';
const px = (n: number) => Math.round(n * 100) / 100;
const opacity = (n: number) => String(Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000);

export interface Card {
  root: HTMLElement; glass: HTMLElement; svg: SVGSVGElement; path: SVGPathElement; k: HTMLElement; n: HTMLElement; u: HTMLElement;
  shape: string; tone: string; text: string; op: string; tx: string; size: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls; parent?.appendChild(e); return e;
}
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag); parent.appendChild(e); return e;
}

/** A reading card: glass first (behind the words), then name, number and unit. */
export function makeCard(parent: Element, cls: string): Card {
  const root = el('div', cls, parent);
  const glass = el('i', 'cl-glass cl-hair', root); glass.setAttribute('aria-hidden', 'true'); 
  const svg = svgEl('svg', glass); svg.setAttribute('preserveAspectRatio', 'none');
  const path = svgEl('path', svg);
  const k = el('small', 'cl-k', root), n = el('b', 'cl-n', root), u = el('span', 'cl-u', root);
  return { root, glass, svg, path, k, n, u, shape: '', tone: '', text: '', op: '', tx: '', size: '' };
}

/** The words of a card (written when they change). */
export function words(c: Card, r: Reading): void {
  const t = `${r.kicker}|${r.value}|${r.unit}`;
  if (c.text !== t) { c.text = t; c.k.textContent = r.kicker; c.n.textContent = r.value; c.u.textContent = r.unit; }
  if (c.tone !== r.tone) { c.tone = r.tone; c.root.dataset.tone = r.tone; }
}

/** The glass: its place in the card's padding box, its clip and its hairline path. */
export function shape(c: Card, g: Glass, key: string): void {
  if (c.shape === key) return;
  c.shape = key;
  const s = c.glass.style;
  s.left = 'calc(-1 * var(--cl-border))'; s.top = `calc(${px(g.top)}px - var(--cl-border))`;
  s.width = `${px(g.w)}px`; s.height = `${px(g.h)}px`; s.clipPath = `path('${g.d}')`;
  c.svg.setAttribute('viewBox', `0 0 ${px(g.w)} ${px(g.h)}`); c.svg.setAttribute('width', String(px(g.w))); c.svg.setAttribute('height', String(px(g.h)));
  c.path.setAttribute('d', g.d);
}

/** Opacity on the card's children (never the card). */
export function fade(c: Card, a: number): void {
  const o = opacity(a);
  if (o === c.op) return;
  c.op = o;
  c.glass.style.opacity = o; c.k.style.opacity = o; c.n.style.opacity = o; c.u.style.opacity = o;
}
export function place(c: Card, x: number, y: number): void {
  const t = `translate3d(${px(x)}px,${px(y)}px,0)`;
  if (t !== c.tx) { c.tx = t; c.root.style.transform = t; }
}
export function size(c: Card, w: number, h: number): void {
  const t = `${px(w)}x${px(h)}`;
  if (t !== c.size) { c.size = t; c.root.style.width = `${px(w)}px`; c.root.style.height = `${px(h)}px`; }
}
export function show(c: Card, on: boolean): void {
  if (on) c.root.setAttribute('data-on', ''); else { c.root.removeAttribute('data-on'); }
}

export interface CathDom { paint(f: CathFrame): void; destroy(): void }

export function buildCath(parent: HTMLElement): CathDom {
  const C = LS.CATH;
  const pills = { f: makeCard(parent, 'cl cl-pill'), w: makeCard(parent, 'cl cl-pill') };
  pills.f.root.dataset.k = 'f'; pills.w.root.dataset.k = 'w';

  // the stack
  const sum = el('div', 'cl-sum', parent); sum.dataset.k = 's';
  const rows = [makeCard(sum, 'cl cl-row'), makeCard(sum, 'cl cl-row')] as const;
  const calc = makeCard(sum, 'cl cl-row cl-calc');
  const brace = svgEl('svg', sum); brace.setAttribute('class', 'cl-brace');
  const bpath = svgEl('path', brace);
  const leads = svgEl('svg', sum); leads.setAttribute('class', 'cl-leads'); leads.setAttribute('width', '1'); leads.setAttribute('height', '1');
  const lead = [svgEl('path', leads), svgEl('path', leads)] as const, dot = [svgEl('circle', leads), svgEl('circle', leads)] as const;
  lead.forEach((l, j) => { l.setAttribute('class', 'lead'); dot[j].setAttribute('class', 'lead-dot'); dot[j].setAttribute('r', String(C.LEAD.dotR)); });
  let sumKey = '', sumOn = false, sumTx = '', braceOp = '', leadsOp = '';
  rows[0].root.dataset.k = 'w'; rows[1].root.dataset.k = 'f'; calc.root.dataset.k = 'h';

  const paintPill = (c: Card, d: PillDraw | undefined) => {
    if (!d) { if (c.root.hasAttribute('data-on')) { show(c, false); fade(c, 0); } return; }
    show(c, true);
    size(c, d.w, d.h);
    words(c, d.reading);
    shape(c, d.glass, d.key);
    place(c, d.x, d.y + d.rise);
    fade(c, d.alpha);
  };

  return {
    paint(f: CathFrame): void {
      paintPill(pills.f, f.pills.find((p) => p.id === 'f'));
      paintPill(pills.w, f.pills.find((p) => p.id === 'w'));
      const s: SumDraw | null = f.sum;
      if (!s) { if (sumOn) { sumOn = false; sum.removeAttribute('data-on'); for (const c of [...rows, calc]) { show(c, false); fade(c, 0); } } return; }
      if (!sumOn) { sumOn = true; sum.setAttribute('data-on', ''); for (const c of [...rows, calc]) show(c, true); }
      const g = s.geom;
      const at = `translate3d(${px(s.x)}px,${px(s.y)}px,0)`;
      if (at !== sumTx) { sumTx = at; sum.style.transform = at; }
      if (sumKey !== s.key) {
        sumKey = s.key;
        sum.style.width = `${px(g.w)}px`; sum.style.height = `${px(g.h)}px`;
        if (g.tight) sum.setAttribute('data-tight', ''); else sum.removeAttribute('data-tight');
        brace.style.left = `${px(g.brace.x)}px`; brace.style.top = '0px';
        brace.setAttribute('width', String(g.brace.w)); brace.setAttribute('height', String(px(g.brace.h))); bpath.setAttribute('d', g.brace.d);
        for (let j = 0; j < 2; j++) {
          lead[j].setAttribute('d', s.leaders.d[j]); lead[j].setAttribute('data-tone', j === 0 ? 'wedge' : 'free'); dot[j].setAttribute('data-tone', j === 0 ? 'wedge' : 'free');
          dot[j].setAttribute('cx', String(px(s.leaders.dots[j][0]))); dot[j].setAttribute('cy', String(px(s.leaders.dots[j][1])));
        }
      }
      for (let j = 0; j < 2; j++) {
        const c = rows[j], R = g.rows[j], r = s.row[j];
        size(c, R.w, R.h); words(c, s.rows[j]);
        shape(c, pillGlass(R.w, R.h, s.radius, 'none', 0), `${R.w}|${R.h}|${g.tight ? 1 : 0}`);
        place(c, R.x + r.dx, R.y + r.dy + r.rise); fade(c, r.alpha * s.alpha);
      }
      const K = g.calc;
      size(calc, K.w, K.h); words(calc, s.calc);
      shape(calc, pillGlass(K.w, K.h, s.radius, 'none', 0), `${K.w}|${K.h}|${g.tight ? 1 : 0}`);
      place(calc, K.x, K.y + s.calcRise); fade(calc, s.calcAlpha * s.alpha);
      const b = opacity(s.lead * s.alpha);
      if (b !== braceOp) { braceOp = b; brace.style.opacity = b; }
      if (b !== leadsOp) { leadsOp = b; leads.style.opacity = b; }
    },
    destroy(): void { pills.f.root.remove(); pills.w.root.remove(); sum.remove(); },
  };
}
