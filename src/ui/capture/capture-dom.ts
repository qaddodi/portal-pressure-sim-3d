// The impure half of Capture: the page read once, element by element, into a drawing list (what the person sees: boxes, borders, shadows, words, the icons' shapes, the charts' canvases),
// and that list painted on one 2D canvas at the device's pixel ratio. The figure itself is the stage drawn once at that ratio (scene/figure-shot.ts), laid in where its canvas stands, so
// the cards, tags, legends, bars and sheets come out over it in the order the page paints them. Runs on a tap, never in a frame. (figure-image-dom.ts does the same for the label layers only;
// the two share the painter for boxes, words, shapes and lines.) What a picture cannot carry: a frosted glass's blur and a CSS mask; the glass's colour and its shadow come out.
import { readBox, readStyle, readTextRects } from '../layout-snap.ts';
import { parseGradient, type Item, type Paint, type Clip } from '../shell/figure-image.ts';
import { paintItems } from '../shell/figure-image-dom.ts';
import { zoomOf, parseShadows, transformed, contentString, counterCall, counterText, counterStep, SYMBOLS, symbolPath, maskUrl, maskPlacement, backdropBlur, blurHalvings, type ClipRect, type Shadow, type ScreenItem } from './capture-model.ts';

type Rect = { x: number; y: number; w: number; h: number };
interface Ctx { out: ScreenItem[]; stage: Rect | null; stageImg: CanvasImageSource | null; stageDrawn: boolean }
type Paintable = Item & { clips?: ClipRect[]; ts?: Shadow[] };

const num = (v: string | null | undefined) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0; };
const clear = (c: string) => !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /^rgb\(.*\/\s*0(\.0+)?\)$/.test(c) || /^color\(.*\/\s*0(\.0+)?\)$/.test(c);
const spin = (m: DOMMatrix) => Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3;
/** A turn the browser has already worked into the box (spin: a quarter or an eighth) or a half turn (a, d both negative: b and c are 0, so `spin` does not see it: the table's down arrows are the up arrow turned half round). */
const turned = (m: DOMMatrix) => spin(m) || (m.a < -1e-3 && m.d < -1e-3);
const SKIP = '.sh-toast, .lb-ghost, .lb-old, .lb-walk, .lb-sr, .lb-key-twin, .lb-key-probe, .lb-key-out, script, style, template, noscript, [data-capture-skip]';
const SVG_SKIP = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'style', 'title', 'desc', 'metadata', 'use', 'image', 'foreignobject']);
/** Text kept for a screen reader (`clip: rect(0 0 0 0)`, `clip-path: inset(50%)`, the `.sr-only` rule): on the page but never seen, so never drawn. */
const visuallyHidden = (cs: CSSStyleDeclaration): boolean => /^rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)$/.test(cs.clip) || /^inset\(\s*50%/.test(cs.clipPath);
const clipPathOf = (cs: CSSStyleDeclaration, r: DOMRect, el?: Element): Clip | undefined => { const m = cs.clipPath.match(/^path\(\s*["']?([\s\S]*?)["']?\s*\)$/); return m ? { d: m[1]!, x: r.left, y: r.top } : polygonClip(cs, r, el); };

/** A `clip-path: polygon(...)` (the table's purpose-drawn arrows): its points as path data, turned with the element's own or its ancestor's rotation (a "down" arrow is the up arrow's box turned half round). */
function polygonClip(cs: CSSStyleDeclaration, r: DOMRect, el?: Element): Clip | undefined {
  const m = cs.clipPath.match(/^polygon\(\s*(?:(?:nonzero|evenodd)\s*,\s*)?([\s\S]*)\)$/);
  if (!m || !el) return undefined;
  const pts = m[1]!.split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p.length === 2);
  if (pts.length < 3) return undefined;
  const at = (v: string, whole: number) => (v.endsWith('%') ? (num(v) / 100) * whole : num(v));
  const turn = turnOf(el), cx = r.width / 2, cy = r.height / 2, cos = Math.cos(turn), sin = Math.sin(turn);
  const d = pts.map((p, i) => {
    const x = at(p[0]!, r.width) - cx, y = at(p[1]!, r.height) - cy;
    return `${i ? 'L' : 'M'}${(cx + x * cos - y * sin).toFixed(2)} ${(cy + x * sin + y * cos).toFixed(2)}`;
  }).join('') + 'Z';
  return { d, x: r.left, y: r.top };
}
/** The turn of an element's own transform or its nearest ancestor's (a FibroScan screen turns with its body), in radians. */
function turnOf(el: Element): number {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) { const t = readStyle(e).transform; if (t && t !== 'none') { const m = new DOMMatrix(t); if (turned(m)) return Math.atan2(m.b, m.a); } }
  return 0;
}
/** A text run's box as the renderer wants it: where it would stand unturned, centred on the same point. The browser's rect of a run turned a quarter is as tall as the run is long, and the renderer
 *  turns a run about the middle of its `x`..`x + w` (a head lying on its side, a table's upright heads: the letters were set in the rect's narrow width and fell on each other, "VARIX", "ASCITES"). */
export function unturned(r: { left: number; width: number; height: number }, turn: number): { x: number; w: number } {
  return Math.abs(Math.sin(turn)) > 0.7 ? { x: r.left + r.width / 2 - r.height / 2, w: r.height } : { x: r.left, w: r.width };
}
/** An SVG paint: a colour, or the middle stop of the gradient it names (a canvas path takes one colour here), or null for none. */
function svgPaint(v: string): string | null {
  if (!v || v === 'none' || clear(v)) return null;
  const m = v.match(/^url\(["']?#([^"')]+)["']?\)/);
  if (!m) return v;
  const g = document.getElementById(m[1]!), stops = g ? [...g.querySelectorAll('stop')] : [];
  const s = stops[Math.floor(stops.length / 2)];
  return s ? readStyle(s).stopColor || null : null;
}
const paintOf = (cs: CSSStyleDeclaration): Paint | null => {
  const g = cs.backgroundImage !== 'none' ? parseGradient(cs.backgroundImage) : null;
  return g ?? (clear(cs.backgroundColor) ? null : cs.backgroundColor);
};
const radiusOf = (cs: CSSStyleDeclaration, r: { width: number; height: number }, k: number): number => {
  const rad = cs.borderTopLeftRadius, v = rad.endsWith('%') ? (num(rad) / 100) * Math.min(r.width, r.height) : num(rad) * k;
  return Math.max(0, Math.min(v, Math.min(r.width, r.height) / 2));
};

function svgShape(el: Element, c: Ctx, cs: CSSStyleDeclaration, alpha: number, clips: ClipRect[], pclip: Clip | undefined): void {
  const m = (el as SVGGraphicsElement).getScreenCTM?.();
  if (!m) return;
  const tag = el.tagName.toLowerCase(), a = (n: string) => num(el.getAttribute(n));
  let d = '';
  if (tag === 'path') d = el.getAttribute('d') ?? '';
  else if (tag === 'circle') { const cx = a('cx'), cy = a('cy'), r = a('r'); d = `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`; }
  else if (tag === 'ellipse') { const cx = a('cx'), cy = a('cy'), rx = a('rx'), ry = a('ry'); d = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`; }
  else if (tag === 'line') d = `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
  else if (tag === 'rect') { const x = a('x'), y = a('y'), w = a('width'), h = a('height'), rx = Math.min(a('rx') || a('ry'), w / 2), ry = Math.min(a('ry') || a('rx'), h / 2); d = rx > 0 || ry > 0 ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z`; }
  else if (tag === 'polyline' || tag === 'polygon') { const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(parseFloat).filter(Number.isFinite); for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`; if (d && tag === 'polygon') d += 'Z'; }
  if (!d) return;
  const fill = svgPaint(cs.fill), stroke = svgPaint(cs.stroke);
  if (!fill && !stroke) return;
  const op = num(fill ? cs.fillOpacity : cs.strokeOpacity);
  const it: Paintable = { k: 'path', d, m: [m.a, m.b, m.c, m.d, m.e, m.f], fill, stroke, sw: num(cs.strokeWidth), join: cs.strokeLinejoin, cap: cs.strokeLinecap, alpha: alpha * (cs.fillOpacity === '' ? 1 : op), clip: pclip, clips };
  c.out.push(it);
}

function visitSvg(el: Element, c: Ctx, above: number, clips: ClipRect[], pclip: Clip | undefined): void {
  const tag = el.tagName.toLowerCase();
  if (SVG_SKIP.has(tag)) return;
  const cs = readStyle(el);
  if (cs.display === 'none') return;
  const alpha = above * (cs.opacity === '' ? 1 : num(cs.opacity));
  if (alpha < 0.02) return;
  if (cs.visibility !== 'hidden') {
    if (tag === 'text') {
      const r = readBox(el), text = (el.textContent ?? '').replace(/\s+/g, ' ').trim(), fill = svgPaint(cs.fill);
      if (text && fill && r.width > 0) {
        const sw = num(cs.strokeWidth), stroke = svgPaint(cs.stroke);
        c.out.push({ k: 'text', text: transformed(text, cs.textTransform), x: r.left, y: r.top + r.height / 2, w: r.width, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, fill, halo: stroke && sw > 0 ? stroke : '', haloW: stroke ? sw : 0, spacing: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing), rot: 0, alpha, clip: pclip, clips } as Paintable);
      }
      return;
    }
    svgShape(el, c, cs, alpha, clips, pclip);
  }
  for (const ch of el.children) visitSvg(ch, c, alpha, clips, pclip);
}

/** A native slider as a rail and a thumb (the page's own controls are drawn by the browser, which a picture cannot read). */
function rangeItems(el: HTMLInputElement, r: DOMRect, cs: CSSStyleDeclaration, alpha: number, clips: ClipRect[], out: ScreenItem[]): void {
  const min = num(el.min) || 0, max = el.max === '' ? 100 : num(el.max), at = max > min ? Math.max(0, Math.min(1, (num(el.value) - min) / (max - min))) : 0;
  const accent = cs.accentColor && cs.accentColor !== 'auto' ? cs.accentColor : readStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6fed';
  const cy = r.top + r.height / 2, x0 = r.left + 8, x1 = r.right - 8, tx = x0 + (x1 - x0) * at;
  out.push({ k: 'box', x: x0, y: cy - 2, w: Math.max(0, x1 - x0), h: 4, r: 2, fill: 'rgba(128,128,128,0.35)', bw: 0, bc: '', alpha, clips } as Paintable);
  out.push({ k: 'box', x: x0, y: cy - 2, w: Math.max(0, tx - x0), h: 4, r: 2, fill: accent, bw: 0, bc: '', alpha, clips } as Paintable);
  out.push({ k: 'box', x: tx - 8, y: cy - 8, w: 16, h: 16, r: 8, fill: '#fff', bw: 1, bc: 'rgba(0,0,0,0.25)', alpha, clips } as Paintable);
}

/** The box of an element (or of a pseudo-element: `r` is where it stands): its shadow, the frosted blur behind it, its colour or gradient or masked picture, its borders. */
interface R4 { left: number; top: number; width: number; height: number; right: number; bottom: number }
function boxOf(c: Ctx, cs: CSSStyleDeclaration, r: R4, alpha: number, clips: ClipRect[], own: Clip | undefined, kk: number): void {
  const fill = paintOf(cs);
  const bT = num(cs.borderTopWidth) * kk, bR = num(cs.borderRightWidth) * kk, bB = num(cs.borderBottomWidth) * kk, bL = num(cs.borderLeftWidth) * kk;
  const colT = clear(cs.borderTopColor) ? '' : cs.borderTopColor, colR = clear(cs.borderRightColor) ? '' : cs.borderRightColor, colB = clear(cs.borderBottomColor) ? '' : cs.borderBottomColor, colL = clear(cs.borderLeftColor) ? '' : cs.borderLeftColor;
  const same = bT === bR && bR === bB && bB === bL && colT === colR && colR === colB && colB === colL;
  const rad = radiusOf(cs, r, kk);
  const shadows = parseShadows(cs.boxShadow).map((s) => ({ ...s, ox: s.ox * kk, oy: s.oy * kk, blur: s.blur * kk, spread: s.spread * kk }));
  if (shadows.length) c.out.push({ k: 'shadow', x: r.left, y: r.top, w: r.width, h: r.height, r: rad, shadows, alpha, clips });
  const blur = backdropBlur(cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter')) * kk;
  if (blur > 0) c.out.push({ k: 'blur', x: r.left, y: r.top, w: r.width, h: r.height, r: rad, radius: blur, alpha: 1, clips, ...(own ? { clip: own } : {}) });   // (the frosted glass: what is under the box, blurred, before the box's own tint goes over it)
  const mask = maskUrl(cs.getPropertyValue('-webkit-mask-image') || cs.getPropertyValue('mask-image'));
  if (mask && typeof fill === 'string') {   // (an icon of the atlas: its colour seen through one cell of a picture)
    c.out.push({ k: 'mask', x: r.left, y: r.top, w: r.width, h: r.height, url: mask, size: cs.getPropertyValue('-webkit-mask-size') || cs.getPropertyValue('mask-size'), pos: cs.getPropertyValue('-webkit-mask-position') || cs.getPropertyValue('mask-position'), color: fill, alpha, clips });
  } else if (fill || (same && bT > 0 && colT)) c.out.push({ k: 'box', x: r.left, y: r.top, w: r.width, h: r.height, r: rad, fill, bw: same && colT ? bT : 0, bc: same ? colT : '', alpha, clip: own, clips } as Paintable);
  if (!same) {   // (one rule on one side: a card's header line, a tab's underline)
    const side = (x: number, y: number, w: number, h: number, col: string) => { if (col && w > 0 && h > 0) c.out.push({ k: 'box', x, y, w, h, r: 0, fill: col, bw: 0, bc: '', alpha, clip: own, clips } as Paintable); };
    side(r.left, r.top, r.width, bT, colT); side(r.left, r.bottom - bB, r.width, bB, colB); side(r.left, r.top, bL, r.height, colL); side(r.right - bR, r.top, bR, r.height, colR);
  }
}

/** A `::before` or `::after` that is laid over its element (position absolute or fixed: the pill's frosted face, a card's rule): found from its computed offsets and size, since a pseudo-element has no box to measure. */
function pseudoBox(c: Ctx, el: Element, which: '::before' | '::after', cs: CSSStyleDeclaration, r: R4, alpha: number, clips: ClipRect[], own: Clip | undefined, kk: number): void {
  const ps = readStyle(el, which);
  if (!ps || ps.display === 'none' || ps.content === 'none' || ps.content === 'normal' || ps.visibility === 'hidden') return;
  const a = alpha * (ps.opacity === '' ? 1 : num(ps.opacity));
  if (a < 0.02) return;
  if (ps.position !== 'absolute' && ps.position !== 'fixed') { pseudoFlow(c, el, which, cs, ps, r, a, clips, own, kk); return; }
  const fixed = ps.position === 'fixed', bl = fixed ? 0 : num(cs.borderLeftWidth), bt = fixed ? 0 : num(cs.borderTopWidth), br = fixed ? 0 : num(cs.borderRightWidth), bb = fixed ? 0 : num(cs.borderBottomWidth);
  const ox = fixed ? 0 : r.left + bl, oy = fixed ? 0 : r.top + bt, cw = fixed ? innerWidth : r.width - bl - br, ch = fixed ? innerHeight : r.height - bb - bt;
  const px = (v: string) => (/px$/.test(v) ? num(v) : null);
  const left = px(ps.left) ?? 0, top = px(ps.top) ?? 0;
  const w = px(ps.width) ?? cw - left - (px(ps.right) ?? 0), h = px(ps.height) ?? ch - top - (px(ps.bottom) ?? 0);
  if (!(w > 0 && h > 0)) return;
  const x = ox + left, y = oy + top;
  const box = { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
  boxOf(c, ps, box, a, clips, own, kk);
  pseudoWords(c, el, ps, box, a, clips, own, kk, null);
}

let measuring: CanvasRenderingContext2D | null = null;
/** The width a canvas gives a run of text in a font (-1 when no canvas). */
function measureWidth(font: string, text: string): number {
  measuring ??= document.createElement('canvas').getContext('2d');
  if (!measuring) return -1;
  measuring.font = font;
  return measuring.measureText(text).width;
}
/** A counter's number now (the browsers differ: Chrome gives `content` with counters worked out, Safari the call itself): the steps of `counter-increment` from the list's `counter-reset` to this element. */
function counterValue(el: Element, name: string): number {
  let top: Element | null = el.parentElement, n = 0;
  for (; top; top = top.parentElement) { const st = counterStep(readStyle(top).counterReset, name); if (st !== null) { n = st; break; } }
  for (const e of (top ?? document.body).querySelectorAll('*')) {
    // (an element steps a counter itself or through its `::before` / `::after`: the criteria list's numbers step on the `::before` that prints them, so the walk read 0 for every row)
    for (const pseudo of [undefined, '::before', ...(e === el ? [] : ['::after'])]) {
      const st = counterStep(readStyle(e, pseudo).counterIncrement, name);
      if (st !== null) n += st;
    }
    if (e === el) break;
  }
  return n;
}
/** The first (or last) word's first (or last) letter inside an element, where it stands, and the size of its font. */
function edgeText(el: Element, last: boolean, kk: number): { rect: DOMRect; fs: number } | null {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pick: Text | null = null;
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!(n.textContent ?? '').trim()) continue; pick = n as Text; if (!last) break; }
  if (!pick) return null;
  const t = pick.textContent ?? '', i = last ? t.trimEnd().length - 1 : t.length - t.trimStart().length;
  const rect = readTextRects(pick, i, i + 1)[0];
  return rect && rect.width > 0 ? { rect, fs: num(readStyle(pick.parentElement ?? el).fontSize) * kk } : null;
}
/** The words a `::before` or `::after` holds (a list's number, a tick, a unit), drawn in the box it stands in: `box` when it is laid out (absolute), else at the element's start or end (`at`: where its middle line and left edge are). */
function pseudoWords(c: Ctx, el: Element, ps: CSSStyleDeclaration, box: R4 | null, a: number, clips: ClipRect[], own: Clip | undefined, kk: number, at: { x: number; midY: number } | null): void {
  let text = contentString(ps.content);
  if (!text) return;
  const cc = counterCall(text);
  if (cc) text = counterText(counterValue(el, cc.name), cc.style);
  else if (/^(counter|counters|attr|open-quote|close-quote)/.test(text)) return;
  text = transformed(text, ps.textTransform);
  const fpx = num(ps.fontSize) * kk, font = `${ps.fontStyle} ${ps.fontWeight} ${fpx}px ${ps.fontFamily}`;
  const ls = ps.letterSpacing === 'normal' ? 0 : num(ps.letterSpacing) * kk;
  const mw = Math.max(0, measureWidth(font, text)) + ls * text.length;
  let x: number, midY: number;
  if (box) {
    const mid = ps.textAlign === 'center' || ps.display === 'grid' || ps.display === 'flex';
    x = mid ? box.left + (box.width - mw) / 2 : box.left + num(ps.paddingLeft) * kk;
    midY = box.height > 2.2 * fpx && !mid ? box.top + (num(ps.lineHeight) || fpx * 1.2) * kk / 2 : box.top + box.height / 2;
  } else if (at) { x = at.x; midY = at.midY; } else return;
  if (text.length === 1 && SYMBOLS.test(text)) {
    c.out.push({ k: 'path', d: symbolPath(text, x, midY - fpx / 2, mw || fpx, fpx), m: [1, 0, 0, 1, 0, 0], fill: null, stroke: ps.color, sw: Math.max(1, fpx * 0.1), join: 'round', cap: 'round', alpha: a, clip: own, clips } as Paintable);
    return;
  }
  c.out.push({ k: 'text', text, x, y: midY, w: mw, font, fill: ps.color, halo: '', haloW: 0, spacing: ls, rot: 0, alpha: a, clip: own, clips } as Paintable);
}
/** A `::before` or `::after` that sits in the flow (a list's number in its first column, a unit after a value, a tick in its round chip): its own size when it has one, its words at the element's start or after its last word. */
function pseudoFlow(c: Ctx, el: Element, which: '::before' | '::after', cs: CSSStyleDeclaration, ps: CSSStyleDeclaration, r: R4, a: number, clips: ClipRect[], own: Clip | undefined, kk: number): void {
  const text = contentString(ps.content);
  const w = /px$/.test(ps.width) ? num(ps.width) * kk : 0, h = /px$/.test(ps.height) ? num(ps.height) * kk : 0;
  if (!text) return;   // (a box with no words has no place to be read from: it is left out, as before)
  const edge = edgeText(el, which === '::after', kk), fpx = num(ps.fontSize) * kk;
  const padL = (num(cs.borderLeftWidth) + num(cs.paddingLeft)) * kk, padR = (num(cs.borderRightWidth) + num(cs.paddingRight)) * kk;
  const midY = edge ? edge.rect.top + edge.rect.height / 2 + 0.3 * (edge.fs - fpx) : r.top + r.height / 2;
  const mw = text ? Math.max(0, measureWidth(`${ps.fontStyle} ${ps.fontWeight} ${fpx}px ${ps.fontFamily}`, text)) : 0;
  const bw = w || mw;
  const x = which === '::before' ? r.left + padL : edge ? edge.rect.right : r.right - padR - bw;
  if (w > 0 && h > 0) {
    const box = { left: x, top: (edge ? edge.rect.top + edge.rect.height / 2 : r.top + r.height / 2) - h / 2, width: w, height: h, right: x + w, bottom: 0 };
    box.bottom = box.top + h;
    boxOf(c, ps, box, a, clips, own, kk);
    pseudoWords(c, el, ps, box, a, clips, own, kk, null);
  } else pseudoWords(c, el, ps, null, a, clips, own, kk, { x, midY });
}

function visit(el: Element, c: Ctx, above: number, clips: ClipRect[], k: number, pclip: Clip | undefined): void {
  if (el.matches(SKIP)) return;
  if (el instanceof SVGElement) { if (el.tagName.toLowerCase() === 'svg' || el.ownerSVGElement) visitSvg(el, c, above, clips, pclip); return; }
  const cs = readStyle(el);
  if (cs.display === 'none' || visuallyHidden(cs)) return;
  const alpha = above * (cs.opacity === '' ? 1 : num(cs.opacity));
  if (alpha < 0.02) return;
  const tm = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : null;
  let kk = k * (tm ? Math.hypot(tm.a, tm.b) || 1 : 1);
  kk *= zoomOf(cs.zoom);   // (the card's fit is a CSS `zoom`: it is in no transform, and the computed sizes below it are the unzoomed ones)
  if (cs.scale && cs.scale !== 'none') kk *= num(cs.scale) || 1;   // (the `scale` property: the first number, the one that grows the words)
  const shown = cs.visibility !== 'hidden';   // (a hidden card's child may be shown again)
  const r = readBox(el);
  const own = clipPathOf(cs, r, el) ?? pclip;
  const isRoot = el === document.body || el === document.documentElement || el.id === 'root';
  const cuts = !isRoot && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible');
  const inner: ClipRect[] = cuts ? [...clips, { x: r.left, y: r.top, w: r.width, h: r.height, r: radiusOf(cs, r, kk) }] : clips;
  if (shown && r.width > 0 && r.height > 0) {
    if (el instanceof HTMLCanvasElement) {
      const s = c.stage;
      if (s && !c.stageDrawn && c.stageImg && Math.abs(r.left - s.x) < 2 && Math.abs(r.top - s.y) < 2 && Math.abs(r.width - s.w) < 2) { c.out.push({ k: 'img', x: s.x, y: s.y, w: s.w, h: s.h, src: c.stageImg, alpha, clips }); c.stageDrawn = true; }
      else if (!s || Math.abs(r.width - s.w) >= 2) c.out.push({ k: 'img', x: r.left, y: r.top, w: r.width, h: r.height, src: el, alpha, clips });
      return;
    }
    if (el instanceof HTMLImageElement) { if (el.complete && el.naturalWidth > 0) c.out.push({ k: 'img', x: r.left, y: r.top, w: r.width, h: r.height, src: el, alpha, clips }); return; }
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const fill = paintOf(cs);
    if (spin(m)) {
      // a thin bar turned about its end (a leader, a bracket's line): its bounding box holds both ends on one diagonal, the way the bar leans says which
      if (num(cs.width) <= 2 && typeof fill === 'string') {
        const w = Math.max(1, num(cs.height)), right = m.a < 0, up = m.b < 0;
        c.out.push({ k: 'line', x1: right ? r.right : r.left, y1: up ? r.bottom : r.top, x2: right ? r.left : r.right, y2: up ? r.top : r.bottom, w, color: fill, alpha, clip: own, clips } as Paintable);
      }
    } else boxOf(c, cs, r, alpha, clips, own, kk);
    pseudoBox(c, el, '::before', cs, r, alpha, clips, own, kk);
    if (el instanceof HTMLInputElement && el.type === 'range') rangeItems(el, r, cs, alpha, clips, c.out);
    else if (el instanceof HTMLInputElement && /^(text|search|number|email|tel|url|password)$/.test(el.type) && el.value) {
      const font = `${cs.fontStyle} ${cs.fontWeight} ${num(cs.fontSize) * kk}px ${cs.fontFamily}`;
      c.out.push({ k: 'text', text: el.type === 'password' ? '•'.repeat(el.value.length) : el.value, x: r.left + num(cs.paddingLeft) * kk + num(cs.borderLeftWidth) * kk, y: r.top + r.height / 2, w: r.width, font, fill: cs.color, halo: '', haloW: 0, spacing: 0, rot: 0, alpha, clip: own, clips: inner } as Paintable);
    }
    // the element's own words, one word at a time, each where the browser put it (a card's wrapped lines, a tag's text), in the element's own font
    const ts = cs.textShadow !== 'none' ? parseShadows(cs.textShadow).map((s) => ({ ...s, ox: s.ox * kk, oy: s.oy * kk, blur: s.blur * kk })) : [];
    const sw = num(cs.getPropertyValue('-webkit-text-stroke-width')) * kk, sc = cs.getPropertyValue('-webkit-text-stroke-color');
    const spaced = cs.letterSpacing !== 'normal' && Math.abs(num(cs.letterSpacing)) > 0.01;
    let font = '', turn = -1;
    // a word's halo goes under the whole run's letters (the page's `paint-order: stroke fill`): every halo first, then every letter, or each letter's dark outline covers the one before it
    const halos: ScreenItem[] = [], fills: ScreenItem[] = [];
    const emit = (it: Paintable): void => { if (it.k === 'text' && it.halo && it.haloW > 0) { halos.push({ ...it, fill: 'rgba(0,0,0,0)', ts: undefined } as Paintable); fills.push({ ...it, halo: '', haloW: 0 }); } else fills.push(it); };
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const text = n.textContent ?? '';
      if (!text.trim()) continue;
      if (!font) font = `${cs.fontStyle} ${cs.fontWeight} ${num(cs.fontSize) * kk}px ${cs.fontFamily}`;
      if (turn < 0) turn = turnOf(el);
      const word = /\S+/g, fpx = num(cs.fontSize) * kk, ls = cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing) * kk;
      for (let w = word.exec(text); w; w = word.exec(text)) {
        const tr = readTextRects(n as Text, w.index, w.index + w[0].length)[0];
        if (!tr || tr.width <= 0) continue;
        const shown = transformed(w[0], cs.textTransform);
        // a word the canvas would set at another width than the browser did (a font feature the canvas does not take: tabular figures, a wider comma), a symbol a web font may not hold, and letter-spaced words
        // (the tracked capitals, a tight serif title: the browser sets no ligatures between spaced letters, a canvas draws them) go one letter at a time, each where the browser put it
        const mw = spaced || turn !== 0 ? 0 : measureWidth(font, shown) + ls * shown.length;
        const apart = spaced || SYMBOLS.test(w[0]) || (turn === 0 && mw > 0 && Math.abs(mw - tr.width) > Math.max(0.9, fpx * 0.035));
        if (apart) {
          let at = w.index;
          for (const ch of w[0]) {
            const cr = readTextRects(n as Text, at, at + ch.length)[0];
            at += ch.length;
            if (!cr || cr.width <= 0) continue;
            if (SYMBOLS.test(ch)) { c.out.push({ k: 'path', d: symbolPath(ch, cr.left, cr.top + cr.height / 2 - fpx / 2, cr.width, fpx), m: [1, 0, 0, 1, 0, 0], fill: null, stroke: cs.color, sw: Math.max(1, fpx * 0.1), join: 'round', cap: 'round', alpha, clip: own, clips: inner } as Paintable); continue; }
            emit({ k: 'text', text: transformed(ch, cs.textTransform), x: unturned(cr, turn).x, y: cr.top + cr.height / 2, w: unturned(cr, turn).w, font, fill: cs.color, halo: sw > 0 ? sc : '', haloW: sw, spacing: 0, rot: turn, alpha, clip: own, clips: inner, ...(ts.length ? { ts } : {}) } as Paintable);
          }
          continue;
        }
        emit({ k: 'text', text: shown, x: unturned(tr, turn).x, y: tr.top + tr.height / 2, w: unturned(tr, turn).w, font, fill: cs.color, halo: sw > 0 ? sc : '', haloW: sw, spacing: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing) * kk, rot: turn, alpha, clip: own, clips: inner, ...(ts.length ? { ts } : {}) } as Paintable);
      }
    }
    c.out.push(...halos, ...fills);
  }
  for (const ch of el.children) visit(ch, c, alpha, inner, kk, own);
  if (shown && r.width > 0 && r.height > 0 && !(el instanceof HTMLInputElement)) pseudoBox(c, el, '::after', cs, r, alpha, clips, own, kk);
}

/** Everything on the page now, in paint order. `stage`: where the figure's canvas stands (CSS px) and `stageImg` its picture, which takes the canvas's place in the order. */
export function readScreen(stage: Rect | null, stageImg: CanvasImageSource | null): ScreenItem[] {
  const c: Ctx = { out: [], stage, stageImg, stageDrawn: false };
  for (const ch of document.body.children) visit(ch, c, 1, [], 1, undefined);
  if (stage && stageImg && !c.stageDrawn) c.out.unshift({ k: 'img', ...stage, src: stageImg, alpha: 1 });   // (the page's canvas was not found where the stage reported: the figure goes under everything)
  return c.out;
}

const roundedPath = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); if (r > 0 && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); };

/** The drawing list painted on `g`, whose transform maps CSS px onto the picture; `s` is the picture's pixels per CSS px (a canvas shadow is measured in picture pixels, not in the transform's). */
export function paintScreen(g: CanvasRenderingContext2D, items: ScreenItem[], s: number): void {
  for (const i of items) {
    g.save();
    for (const cl of i.clips ?? []) { roundedPath(g, cl.x, cl.y, cl.w, cl.h, cl.r); g.clip(); }
    if (i.k === 'img') {
      g.globalAlpha = i.alpha;
      try { g.drawImage(i.src, i.x, i.y, i.w, i.h); } catch { /* a canvas that will not be read (lost context, tainted): left out */ }
    } else if (i.k === 'mask') {
      if (i.img) {
        const nat = i.img as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
        const p = maskPlacement(i.size, i.pos, { w: i.w, h: i.h }, { w: nat.naturalWidth || nat.width, h: nat.naturalHeight || nat.height });
        const off = document.createElement('canvas'); off.width = Math.max(1, Math.ceil(i.w * s)); off.height = Math.max(1, Math.ceil(i.h * s));
        const og = off.getContext('2d');
        if (og) {
          og.scale(s, s);
          try { og.drawImage(i.img, p.x, p.y, p.w, p.h); } catch { /* a picture that will not be read: the icon is left out */ }
          og.globalCompositeOperation = 'source-in'; og.fillStyle = i.color; og.fillRect(0, 0, i.w, i.h);
          g.globalAlpha = i.alpha; g.drawImage(off, i.x, i.y, i.w, i.h);
        }
      }
    } else if (i.k === 'blur') {
      g.beginPath();
      if (i.clip) { g.translate(i.clip.x, i.clip.y); g.clip(new Path2D(i.clip.d)); g.translate(-i.clip.x, -i.clip.y); } else { roundedPath(g, i.x, i.y, i.w, i.h, i.r); g.clip(); }
      blurBehind(g, i.x, i.y, i.w, i.h, i.radius * s);
    } else if (i.k === 'shadow') {
      for (const sh of i.shadows) {
        g.save();
        g.globalAlpha = i.alpha;
        g.beginPath(); g.rect(-1e5, -1e5, 2e5, 2e5);   // (a shadow falls outside the box only: everything but the box is kept)
        if (i.r > 0 && g.roundRect) g.roundRect(i.x, i.y, i.w, i.h, Math.min(i.r, i.w / 2, i.h / 2)); else g.rect(i.x, i.y, i.w, i.h);
        g.clip('evenodd');
        g.shadowColor = sh.color; g.shadowBlur = sh.blur * s; g.shadowOffsetX = sh.ox * s; g.shadowOffsetY = sh.oy * s;
        roundedPath(g, i.x - sh.spread, i.y - sh.spread, i.w + 2 * sh.spread, i.h + 2 * sh.spread, i.r + sh.spread);
        g.fillStyle = '#000'; g.fill();
        g.restore();
      }
    } else {
      const it = i as Paintable;
      if (it.k === 'text' && it.ts?.length) {   // (a glow behind the words: the words drawn once with the shadow, then the words as they are)
        for (const sh of it.ts) {
          g.save();
          g.globalAlpha = it.alpha; g.textBaseline = 'middle'; g.font = it.font;
          g.shadowColor = sh.color; g.shadowBlur = sh.blur * s; g.shadowOffsetX = sh.ox * s; g.shadowOffsetY = sh.oy * s;
          g.fillStyle = it.fill; g.fillText(it.text, it.x, it.y);
          g.restore();
        }
      }
      paintItems(g, [it]);
    }
    g.restore();
  }
}

/** Loads the pictures the masks use (once each; they are the page's own, already fetched), so the painter has them in hand. A picture that will not load leaves its icon out. */
export async function loadMasks(items: ScreenItem[], wait: (ms: number) => Promise<void>): Promise<void> {
  const urls = new Set<string>();
  for (const i of items) if (i.k === 'mask') urls.add(i.url);
  const got = new Map<string, HTMLImageElement | null>();
  await Promise.all([...urls].map(async (u) => {
    const img = new Image(); img.src = u;
    const ok = await Promise.race([img.decode().then(() => true, () => false), wait(4000).then(() => false)]);
    got.set(u, ok ? img : null);
  }));
  for (const i of items) if (i.k === 'mask') i.img = got.get(i.url) ?? null;
}

/** The frosted glass: the pixels already painted under the box, blurred, put back (inside the clip the caller set). Safari has no filter on a canvas, so the blur is made by halving the region (each halving
 *  averages 2 x 2) and growing it back with smooth scaling, which is a Gaussian's look at the width asked for. `sigma` in picture pixels. */
function blurBehind(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sigma: number): void {
  const m = g.getTransform(), W = g.canvas.width, H = g.canvas.height;
  const cx = Math.max(0, Math.floor(m.a * x + m.e)), cy = Math.max(0, Math.floor(m.d * y + m.f));
  const cw = Math.min(W, Math.ceil(m.a * (x + w) + m.e)) - cx, ch = Math.min(H, Math.ceil(m.d * (y + h) + m.f)) - cy;
  if (cw < 4 || ch < 4) return;
  const n = blurHalvings(sigma, cw, ch);
  if (n < 1) return;
  const stages: HTMLCanvasElement[] = [];
  let src: CanvasImageSource = g.canvas, sx = cx, sy = cy, sw = cw, sh = ch, tw = cw, th = ch;
  for (let k = 0; k < n; k++) {
    tw = Math.max(1, Math.round(tw / 2)); th = Math.max(1, Math.round(th / 2));
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    const tg = t.getContext('2d');
    if (!tg) return;
    tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
    tg.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
    stages.push(t); src = t; sx = 0; sy = 0; sw = tw; sh = th;
  }
  for (let k = stages.length - 1; k >= 1; k--) {   // (grown back one doubling at a time, each smooth)
    const big = stages[k - 1]!, bg = big.getContext('2d');
    if (!bg) return;
    bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.clearRect(0, 0, big.width, big.height); bg.drawImage(stages[k]!, 0, 0, big.width, big.height);
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);   // (the region is in picture pixels; the clip stays where the caller put it)
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(stages[0]!, 0, 0, stages[0]!.width, stages[0]!.height, cx, cy, cw, ch);
  g.restore();
}
