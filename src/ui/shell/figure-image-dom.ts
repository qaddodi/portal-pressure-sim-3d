// The impure half of "Copy figure" / "Save figure": the stage drawn once at 2x (scene/figure-shot.ts), the label layers read off the screen element by element (names, leaders, the colour key, the
// catheter's and slides' cards, the probes' screens: everything in `.lb-layer`), laid over it on one 2D canvas (once, on a click; never per frame), and the PNG handed over. The pure half
// (what is kept, in what order, the scale, the gradient's parse) is figure-image.ts.
import { figureShot } from '../../scene/figure-shot.ts';
import { clock } from '../../clock/frame.ts';
import { useShell } from './store.ts';
import { useEngine } from '../../engine/index.ts';
import { figureItems, figureFileName, parseGradient, type Item, type Paint, type Clip } from './figure-image.ts';
import { FIGURE_IMAGE } from './words.ts';
import { strokeWidthIn } from '../capture/capture-model.ts';

/** The picture is made at this many times the CSS size whatever the device's own pixel ratio (the device's limits cap it: figure-image.ts pictureScale). */
export const PICTURE_SCALE = 2;

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const SKIP = '.lb-ghost, .lb-old, .lb-walk, .lb-sr, .lb-key-twin, .lb-key-probe, .lb-key-out';
const clipOf = (cs: CSSStyleDeclaration, r: DOMRect): Clip | undefined => { const m = cs.clipPath.match(/^path\(\s*["']?([\s\S]*?)["']?\s*\)$/); return m ? { d: m[1]!, x: r.left, y: r.top } : undefined; };
const clear = (c: string) => !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /^rgb\(.*\/\s*0\)$/.test(c);
const spin = (m: DOMMatrix) => Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3;
/** The turn of an element's own transform or its nearest ancestor's (the FibroScan's screen turns with its body), in radians. */
const turnOf = (el: Element): number => { for (let e: Element | null = el; e && !e.classList?.contains('lb-layer'); e = e.parentElement) { const t = getComputedStyle(e).transform; if (t && t !== 'none') { const m = new DOMMatrix(t); if (spin(m)) return Math.atan2(m.b, m.a); } } return 0; };

function paintOf(cs: CSSStyleDeclaration): Paint | null {
  const g = cs.backgroundImage !== 'none' ? parseGradient(cs.backgroundImage) : null;
  if (g) return g;
  return clear(cs.backgroundColor) ? null : cs.backgroundColor;
}

function visit(el: Element, out: Item[], above: number, clip: Clip | undefined): void {
  if (el.matches(SKIP)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return;
  const alpha = above * num(cs.opacity === '' ? '1' : cs.opacity);
  if (alpha < 0.02) return;
  const shown = cs.visibility !== 'hidden';   // (a hidden card's child may be shown again: `.cl-sum[data-on] > .cl-row`)
  const r = el.getBoundingClientRect();
  if (el instanceof SVGElement) {
    if (shown && (el instanceof SVGPathElement || el instanceof SVGCircleElement || el instanceof SVGLineElement)) {
      const m = (el as SVGGraphicsElement).getScreenCTM();
      const fill = cs.fill === 'none' || clear(cs.fill) ? null : cs.fill, stroke = cs.stroke === 'none' || clear(cs.stroke) ? null : cs.stroke;
      if (m && (fill || stroke)) {
        let d = el.getAttribute('d') ?? '';
        if (el instanceof SVGCircleElement) { const cx = num(el.getAttribute('cx') ?? '0'), cy = num(el.getAttribute('cy') ?? '0'), rr = num(el.getAttribute('r') ?? '0'); d = `M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0`; }
        if (el instanceof SVGLineElement) d = `M${el.getAttribute('x1') ?? 0} ${el.getAttribute('y1') ?? 0}L${el.getAttribute('x2') ?? 0} ${el.getAttribute('y2') ?? 0}`;
        if (d) out.push({ k: 'path', d, m: [m.a, m.b, m.c, m.d, m.e, m.f], fill, stroke, sw: strokeWidthIn(num(cs.strokeWidth), cs.vectorEffect, m), join: cs.strokeLinejoin, cap: cs.strokeLinecap, alpha, clip });
      }
    }
    for (const c of el.children) visit(c, out, alpha, clip);
    return;
  }
  const own = clipOf(cs, r) ?? clip;
  if (shown && r.width > 0 && r.height > 0) {
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const fill = paintOf(cs), bw = num(cs.borderTopWidth), bc = clear(cs.borderTopColor) ? '' : cs.borderTopColor;
    if (spin(m)) {
      // a thin bar turned about its end (a leader, a bracket's line): its bounding box holds both ends on one diagonal, the way the bar leans says which
      if (num(cs.width) <= 2 && typeof fill === 'string') {
        const w = Math.max(1, num(cs.height)), right = m.a < 0, up = m.b < 0;
        out.push({ k: 'line', x1: right ? r.right : r.left, y1: up ? r.bottom : r.top, x2: right ? r.left : r.right, y2: up ? r.top : r.bottom, w, color: fill, alpha, clip });
      }
    } else if (fill || (bw > 0 && bc)) {
      const rad = cs.borderTopLeftRadius, rr = rad.endsWith('%') ? (num(rad) / 100) * Math.min(r.width, r.height) : num(rad);
      out.push({ k: 'box', x: r.left, y: r.top, w: r.width, h: r.height, r: Math.min(rr, Math.min(r.width, r.height) / 2), fill, bw: bc ? bw : 0, bc, alpha, clip: own });
    }
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const tr = range.getClientRects()[0];
      if (!tr || tr.width <= 0) continue;
      const sw = num(cs.getPropertyValue('-webkit-text-stroke-width')), sc = cs.getPropertyValue('-webkit-text-stroke-color');
      const turn = turnOf(el);
      out.push({ k: 'text', text: n.textContent.replace(/\s+/g, ' ').trim(), x: tr.left, y: tr.top + tr.height / 2, w: tr.width, font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, fill: cs.color, halo: sw > 0 ? sc : '', haloW: sw, spacing: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing), rot: turn, alpha, clip });
    }
  }
  for (const c of el.children) visit(c, out, alpha, own);
}

/** Everything the label layers show now, in paint order (the layers' own order: names, probes' screens, the key). */
export function readItems(): Item[] {
  const out: Item[] = [];
  for (const layer of document.querySelectorAll('.lb-layer')) for (const c of layer.children) visit(c, out, 1, undefined);
  return out;
}

const gradient = (g: CanvasRenderingContext2D, p: Exclude<Paint, string>, x: number, y: number, w: number, h: number): CanvasGradient => {
  const a = (p.angle * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a), len = Math.abs(w * dx) + Math.abs(h * dy), cx = x + w / 2, cy = y + h / 2;
  const grad = g.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  for (const [at, c] of p.stops) { try { grad.addColorStop(Math.max(0, Math.min(1, at)), c); } catch { /* a colour the canvas will not read */ } }
  return grad;
};
const rounded = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); if (r > 0 && g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

/** Draws the items on `g`, whose transform already maps CSS px (the stage's corner is the origin) onto the picture. */
export function paintItems(g: CanvasRenderingContext2D, items: Item[]): void {
  g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round';
  for (const i of items) {
    g.save();
    g.globalAlpha = i.alpha;
    if (i.clip) { g.translate(i.clip.x, i.clip.y); g.clip(new Path2D(i.clip.d)); g.translate(-i.clip.x, -i.clip.y); }
    if (i.k === 'box') {
      rounded(g, i.x, i.y, i.w, i.h, i.r);
      if (i.fill) { g.fillStyle = typeof i.fill === 'string' ? i.fill : gradient(g, i.fill, i.x, i.y, i.w, i.h); g.fill(); }
      if (i.bw > 0) { rounded(g, i.x + i.bw / 2, i.y + i.bw / 2, i.w - i.bw, i.h - i.bw, Math.max(0, i.r - i.bw / 2)); g.strokeStyle = i.bc; g.lineWidth = i.bw; g.stroke(); }
    } else if (i.k === 'path') {
      g.transform(...i.m);
      const p = new Path2D(i.d);
      if (i.fill) { g.fillStyle = i.fill; g.fill(p); }
      if (i.stroke && i.sw > 0) { g.strokeStyle = i.stroke; g.lineWidth = i.sw; g.lineJoin = i.join as CanvasLineJoin; g.lineCap = i.cap as CanvasLineCap; g.stroke(p); }
    } else if (i.k === 'line') {
      g.strokeStyle = i.color; g.lineWidth = i.w; g.beginPath(); g.moveTo(i.x1, i.y1); g.lineTo(i.x2, i.y2); g.stroke();
    } else {
      g.font = i.font;
      if (i.spacing) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${i.spacing}px`;
      if (i.rot) { const cx = i.x + i.w / 2; g.translate(cx, i.y); g.rotate(i.rot); g.translate(-cx, -i.y); }
      if (i.haloW > 0 && i.halo) { g.strokeStyle = i.halo; g.lineWidth = i.haloW * 2; g.strokeText(i.text, i.x, i.y); }
      g.fillStyle = i.fill; g.fillText(i.text, i.x, i.y);
    }
    g.restore();
  }
}

/** One picture of the figure now, with its labels, cards and key, drawn at 2x its CSS size. Resolves null when the stage cannot be drawn. */
export function figurePicture(): Promise<Blob | null> {
  return new Promise((done) => {
    try {
      const taken = figureShot.take(PICTURE_SCALE);
      if (!taken) { done(null); return; }
      const shot = taken.canvas, rect = { left: taken.css.x, top: taken.css.y, width: taken.css.w, height: taken.css.h };
      const scale = shot.width / rect.width;
      const out = document.createElement('canvas'); out.width = shot.width; out.height = shot.height;
      const g = out.getContext('2d');
      if (!g) { done(null); return; }
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';   // (the look's ground under the figure)
      g.fillRect(0, 0, out.width, out.height);
      g.drawImage(shot, 0, 0);
      g.setTransform(scale, 0, 0, scale, -rect.left * scale, -rect.top * scale);
      paintItems(g, figureItems(readItems(), { x: rect.left, y: rect.top, w: rect.width, h: rect.height }));
      clock.invalidate('figure-image');
      out.toBlob((b) => done(b), 'image/png');
    } catch { done(null); }
  });
}

const say = (text: string, tone?: 'info' | 'bad') => useShell.getState().say(text, tone);

/** Save figure: the PNG as a download (on a phone the browser offers Save to Photos / Files). */
export async function saveFigure(): Promise<void> {
  const blob = await figurePicture();
  if (!blob) { say(FIGURE_IMAGE.failed, 'bad'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = figureFileName(useShell.getState().view, useEngine.getState().presetId);
  document.body.appendChild(a); a.click(); a.remove();
  clock.after(() => URL.revokeObjectURL(a.href), 10000);
  say(FIGURE_IMAGE.saved);
}

/** Copy figure: the PNG on the clipboard. The ClipboardItem is made at once, holding a promise for the picture (Safari only allows a write that begins inside the click); a browser that cannot write an image saves it instead. */
export async function copyFigure(): Promise<void> {
  const CI = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!CI || !navigator.clipboard?.write) { await saveFigure(); return; }
  const picture = figurePicture().then((b) => { if (!b) throw new Error('no picture'); return b; });
  try { await navigator.clipboard.write([new CI({ 'image/png': picture })]); say(FIGURE_IMAGE.copied); }
  catch { say(FIGURE_IMAGE.failed, 'bad'); }
}
