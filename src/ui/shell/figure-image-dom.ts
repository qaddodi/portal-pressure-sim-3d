// The impure half of "Copy figure" / "Save figure": read the canvas in the task that draws it, read where the labels stand, lay them over it on one 2D canvas (once, on a click; never per frame),
// and hand the PNG over. The pure half (what is drawn, where, at which scale) is figure-image.ts.
import { lookCapture } from '../../debug/look-hook.ts';
import { clock } from '../../clock/frame.ts';
import { useShell } from './store.ts';
import { useEngine } from '../../engine/index.ts';
import { figureCmds, figureFileName, type Cmd, type Seen } from './figure-image.ts';
import { FIGURE_IMAGE } from './words.ts';

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
/** An element's own opacity times the layer's (the clock writes opacity on each label). */
const alphaOf = (el: Element): number => { let a = 1; for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); a *= num(cs.opacity === '' ? '1' : cs.opacity); if (cs.visibility === 'hidden') return 0; } return a; };

/** Where the label layer's names, readings, leaders and rings stand now. The key, the catheter's cards and the probes' screens are not drawn (they are cards, not labels: a known gap, docs/decisions.md). */
export function readSeen(): Seen {
  const seen: Seen = { texts: [], lines: [], rings: [] };
  for (const lb of document.querySelectorAll<HTMLElement>('.lb-layer:not(.lb-key-layer):not(.lb-probe-layer) > .lb:not(.lb-ghost)')) {
    const a = alphaOf(lb);
    if (a <= 0) continue;
    for (const sp of lb.querySelectorAll<HTMLElement>(':scope > .lb-name, :scope > .lb-val .lb-cur, :scope > .lb-unit, :scope > .lb-delta, :scope > .lb-alert')) {
      const cs = getComputedStyle(sp);
      if (cs.display === 'none' || !sp.textContent) continue;
      const r = sp.getBoundingClientRect();
      if (r.width <= 0) continue;
      const halo = getComputedStyle(lb).getPropertyValue('--lb-halo').trim() || 'transparent';
      seen.texts.push({ text: sp.textContent, x: r.left, y: r.top + r.height / 2, font: { size: num(cs.fontSize), weight: cs.fontWeight, family: cs.fontFamily }, fill: cs.color, halo, haloW: num(getComputedStyle(lb).getPropertyValue('--lb-halo-w')) || 0, alpha: a });
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>('.lb-layer > .lb-lead')) {
    const a = alphaOf(el);
    if (a <= 0) continue;
    const cs = getComputedStyle(el), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    if (m.a === 1 && m.b === 0 && m.e === 0 && m.f === 0) continue;   // (a leader nobody has placed)
    const h = num(cs.height);
    seen.lines.push({ x1: m.e, y1: m.f + h / 2, x2: m.e + m.a, y2: m.f + m.b + h / 2, w: Math.max(1, h), color: cs.backgroundColor, alpha: a });
  }
  for (const el of document.querySelectorAll<HTMLElement>('.lb-layer > .lb-anchor')) {
    const a = alphaOf(el);
    if (a <= 0) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    seen.rings.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 - num(cs.borderTopWidth) / 2, w: num(cs.borderTopWidth), stroke: cs.borderTopColor, fill: cs.backgroundColor, alpha: a });
  }
  return seen;
}

function paint(g: CanvasRenderingContext2D, cmds: Cmd[]): void {
  g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round';
  for (const c of cmds) {
    g.globalAlpha = c.alpha;
    if (c.op === 'line') { g.strokeStyle = c.color; g.lineWidth = c.w; g.beginPath(); g.moveTo(c.x1, c.y1); g.lineTo(c.x2, c.y2); g.stroke(); }
    else if (c.op === 'ring') { g.beginPath(); g.arc(c.x, c.y, Math.max(0, c.r), 0, Math.PI * 2); g.fillStyle = c.fill; g.fill(); if (c.w > 0) { g.strokeStyle = c.stroke; g.lineWidth = c.w; g.stroke(); } }
    else { g.font = c.font; if (c.haloW > 0) { g.strokeStyle = c.halo; g.lineWidth = c.haloW * 2; g.strokeText(c.text, c.x, c.y); } g.fillStyle = c.fill; g.fillText(c.text, c.x, c.y); }
  }
  g.globalAlpha = 1;
}

/** One picture of the figure now, with its labels, at the canvas's own resolution (the device's pixel ratio: 2x on a phone, an iPad and a Retina Mac). Resolves null when no frame could be read. */
export function figurePicture(): Promise<Blob | null> {
  return new Promise((done) => {
    const give = clock.after(() => done(null), 8000);
    lookCapture.ask((canvas) => {
      try {
        const rect = canvas.getBoundingClientRect(), scale = rect.width > 0 ? canvas.width / rect.width : 1;
        const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
        const g = out.getContext('2d');
        if (!g) { clock.cancel(give); done(null); return; }
        g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';   // (the look's ground under the figure: the canvas itself is clear where nothing is drawn)
        g.fillRect(0, 0, out.width, out.height);
        g.drawImage(canvas, 0, 0);
        paint(g, figureCmds(readSeen(), { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, scale));
        out.toBlob((b) => { clock.cancel(give); done(b); }, 'image/png');
      } catch { clock.cancel(give); done(null); }
    });
    clock.invalidate('figure-image');
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
