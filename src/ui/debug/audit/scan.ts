// ?audit, the generic sweep: every visible text, picture, chart and button on the page, read as plain numbers (scan-judge.ts judges them: clipped, overlapping, covered, small, low contrast,
// zero size, broken). Not per case: it asks the whole document, so a thing nobody thought of is read the same as one somebody did. Debug only; one read per step, never a frame.
import type { Box } from './judge.ts';
import { lineBoxes } from './scan-judge.ts';

export interface ScanItem {
  kind: 'text' | 'svg' | 'canvas' | 'img' | 'control';
  what: string;
  box: Box;
  /** the box the clipping ancestors leave visible (overflow hidden or clip, paint containment), or null */
  clip: Box | null;
  /** inside something that scrolls: out of view is normal there */
  scrolls: boolean;
  opacity: number;
  /** inside an open sheet, menu or the cover: it stands over the page on purpose */
  modal?: boolean;
  /** text only: the element it is in (tag, id, two classes), so a bare number in a finding can be found */
  by?: string;
  /** text only */ px?: number; bold?: boolean; fg?: string; bg?: string | null;
}
export interface RawScan {
  vw: number; vh: number; items: ScanItem[];
  zero: { what: string; why: string }[];
  broken: { what: string }[];
  covered: { what: string; by: string; points: number }[];
  /** how many of each were read, so the report can show what ran */
  counts: { texts: number; media: number; hit: number; capped: boolean };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const MAX_ITEMS = 2600, MAX_HIT = 900;
/** A layer that covers the page on purpose (a sheet, a menu, the cover): what it hides is not a bug. */
const MODAL = '[role="dialog"], [aria-modal="true"], .sh-pop, .pz-cover, #preview-badge';

/** A computed colour as 'rgba(r, g, b, a)' (0-255), or null for a form this cannot read (color-mix and friends come back as color(srgb r g b / a)). */
export function normColour(c: string): string | null {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(c.trim());
  if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]; return `rgba(${+m[1]!}, ${+m[2]!}, ${+m[3]!}, ${a})`; }
  const s = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(c.trim());
  if (s) { const a = s[4] === undefined ? 1 : s[4].endsWith('%') ? parseFloat(s[4]) / 100 : +s[4]; return `rgba(${Math.round(+s[1]! * 255)}, ${Math.round(+s[2]! * 255)}, ${Math.round(+s[3]! * 255)}, ${a})`; }
  return null;
}
const alphaOf = (c: string): number => { const m = /,\s*([\d.]+)\)$/.exec(c); return m ? +m[1]! : 1; };

/** `clip`: where a hidden or clipping ancestor cuts it (scrolling lists do not cut text off: you scroll to it). `view`: the same, plus scrolling ancestors: the only part of it a pointer can reach. */
interface Vis { ok: boolean; opacity: number; clip: Box | null; view: Box | null; scrolls: boolean }
const HIDDEN: Vis = { ok: false, opacity: 0, clip: null, view: null, scrolls: false };

/** Short name of an element for a finding: tag, id, first two classes. */
export function nameOf(el: Element, text = ''): string {
  const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  const t = text || (el.getAttribute('aria-label') ?? '');
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${c ? `.${c}` : ''}${t ? ` "${t.replace(/\s+/g, ' ').trim().slice(0, 40)}"` : ''}`;
}

/** Enough to find an element in the code: its selector, its own words, its parents (three up) and the card it is in. `span.val "2.3 mmHg" in div.metric < div.pz-data < section.dk-card [card teach]`. */
export function describeEl(el: Element): string {
  const own = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const up: string[] = [];
  for (let p = el.parentElement, i = 0; p && i < 3 && p.tagName !== 'BODY' && p.tagName !== 'HTML'; p = p.parentElement, i++) up.push(nameOf(p));
  const card = el.closest?.('[data-card]')?.getAttribute('data-card');
  return `${nameOf(el)}${own ? ` "${own}"` : ' (no words)'}${up.length ? ` in ${up.join(' < ')}` : ''}${card ? ` [card ${card}]` : ''}`;
}

export function scanPage(doc: Document = document, win: Window = window): RawScan {
  const vw = win.innerWidth, vh = win.innerHeight;
  const memo = new Map<Element, Vis>();
  const box = (b: DOMRect): Box => [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)];
  const meet = (a: Box | null, b: Box): Box => (a ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : b);

  /** Whether an element is drawn at all, how opaque it is with its ancestors, the box its clipping ancestors leave it. Memoised up the tree. */
  const vis = (el: Element | null): Vis => {
    if (!el || el === doc.documentElement) return { ok: true, opacity: 1, clip: null, view: null, scrolls: false };
    const hit = memo.get(el); if (hit) return hit;
    const up = vis(el.parentElement);
    let v: Vis = HIDDEN;
    if (up.ok) {
      const cs = win.getComputedStyle(el);
      const srOnly = cs.position === 'absolute' && /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)|inset\(50%\)/.test(cs.clip + cs.clipPath) || (cs.overflow === 'hidden' && parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1);
      const off = cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden') || el.hasAttribute('inert') || el.hasAttribute('data-debug') || el.id === 'boot' || srOnly;
      if (!off) {
        const clips = (x: string) => x === 'hidden' || x === 'clip';
        const scrolling = /auto|scroll|overlay/.test(cs.overflowX + cs.overflowY);
        const cuts = clips(cs.overflowX) || clips(cs.overflowY) || /paint|strict|content/.test(cs.contain) || el.tagName.toLowerCase() === 'svg';
        v = { ok: true, opacity: up.opacity * (parseFloat(cs.opacity) || 0), clip: cuts ? meet(up.clip, box(el.getBoundingClientRect())) : up.clip, view: cuts || scrolling ? meet(up.view, box(el.getBoundingClientRect())) : up.view, scrolls: up.scrolls || scrolling };
      }
    }
    memo.set(el, v);
    return v;
  };

  /** The opaque colour an element's text stands on: the first ancestors' backgrounds laid over each other until one is opaque; null when an image, a gradient or the picture itself is behind it (the figure) or nothing is opaque. */
  const bgOf = (el: Element): string | null => {
    const layers: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement) {
      const cs = win.getComputedStyle(p);
      if (cs.backgroundImage !== 'none') return null;
      const c = normColour(cs.backgroundColor);
      if (c === null) return null;
      const a = alphaOf(c);
      if (a > 0) layers.push(c);
      if (a >= 0.98) break;
      if (p === doc.documentElement) return null;
    }
    if (!layers.length || alphaOf(layers[layers.length - 1]!) < 0.98) return null;
    let rgb = layers[layers.length - 1]!.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    for (let i = layers.length - 2; i >= 0; i--) { const m = layers[i]!.match(/[\d.]+/g)!.map(Number); const a = m[3] ?? 1; rgb = rgb.map((v, k) => m[k]! * a + v * (1 - a)); }
    return `rgba(${rgb.map((v) => Math.round(v)).join(', ')}, 1)`;
  };

  /** How much the page draws this element's lettering bigger or smaller than its CSS size: the transforms and zoom of it and its ancestors multiplied (memoised). Not a width ratio: offsetWidth is rounded and that read 12 px lettering as 11.6. */
  const scales = new Map<Element, number>();
  const scaleOf = (el: Element | null): number => {
    if (!el || el === doc.documentElement) return 1;
    const hit = scales.get(el); if (hit !== undefined) return hit;
    const cs = win.getComputedStyle(el);
    let k = 1;
    if (cs.transform && cs.transform !== 'none') { try { const m = new DOMMatrixReadOnly(cs.transform); k = Math.hypot(m.a, m.b) || 1; } catch { k = 1; } }
    const z = parseFloat((cs as unknown as { zoom?: string }).zoom ?? '1'); if (z > 0 && Number.isFinite(z)) k *= z;
    const out = k * scaleOf(el.parentElement); scales.set(el, out); return out;
  };

  const items: ScanItem[] = [], zero: RawScan['zero'] = [], broken: RawScan['broken'] = [];
  let capped = false, texts = 0, media = 0;
  const holders: { el: Element; item: ScanItem }[] = [];

  // ── text: every non-blank run of words ──
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    const p = n.parentElement;
    if (!s || !p || /^(script|style|noscript|title)$/i.test(p.tagName)) continue;
    const v = vis(p);
    if (!v.ok || v.opacity < 0.05) continue;
    if (items.length >= MAX_ITEMS) { capped = true; break; }
    range.selectNodeContents(n);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) {
      // words with no box are collapsed on purpose (a long and a short name, one of them shut): only a NaN box is a fault
      if (Array.from(range.getClientRects()).some((r) => !Number.isFinite(r.left + r.top + r.width + r.height))) zero.push({ what: nameOf(p, s), why: 'its box is NaN' });
      continue;
    }
    const cs = win.getComputedStyle(p);
    let scale = 1;
    if (p instanceof SVGElement) { const m = (p as unknown as SVGGraphicsElement).getScreenCTM?.(); if (m && m.a > 0) scale = Math.hypot(m.a, m.b) || m.a; }
    else scale = scaleOf(p);
    const fg = normColour(cs.color), bg = fg ? bgOf(p) : null;
    const px = r1(parseFloat(cs.fontSize) * scale), bold = parseInt(cs.fontWeight, 10) >= 700;
    // one item per line: a paragraph's one box is the union of its lines, and a number standing in the next line's gap is not over the words
    for (const r of rects) {
      if (items.length >= MAX_ITEMS) { capped = true; break; }
      const b = lineBoxes([r])[0]; if (!b) continue;
      const item: ScanItem = { kind: 'text', what: s.slice(0, 48), box: b, clip: v.clip, scrolls: v.scrolls, opacity: v.opacity, modal: !!p.closest(MODAL) || undefined, by: nameOf(p), px, bold, fg: fg ?? undefined, bg };
      items.push(item); holders.push({ el: p, item });
    }
    texts++;
  }

  // ── pictures, charts and controls ──
  for (const el of Array.from(doc.querySelectorAll('svg, canvas, img, video, button, input, select, textarea, [role="img"]'))) {
    const v = vis(el);
    if (!v.ok || v.opacity < 0.05) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg' && el.parentElement?.closest('svg')) continue;   // (an inner svg is part of its outer picture)
    if (items.length >= MAX_ITEMS) { capped = true; break; }
    const r = el.getBoundingClientRect(), b = box(r);
    if (b.some((x) => !Number.isFinite(x))) { zero.push({ what: nameOf(el), why: 'its box is NaN' }); continue; }
    const big = r.width >= 24 && r.height >= 24;
    if ((tag === 'img' || tag === 'canvas' || tag === 'svg' || tag === 'video') && (r.width === 0 || r.height === 0) && el.parentElement && el.parentElement.getBoundingClientRect().width > 0) { zero.push({ what: nameOf(el), why: 'a picture with zero width or height inside a box that has size' }); continue; }
    if (tag === 'img') { const im = el as HTMLImageElement; if (im.complete && im.naturalWidth === 0 && (im.currentSrc || im.src)) broken.push({ what: nameOf(el, im.alt || (im.currentSrc || im.src).split('/').pop() || '') }); }
    if ((tag === 'svg' || tag === 'canvas') && !big) continue;   // (icons)
    if (tag === 'canvas' && r.width >= vw * 0.9 && r.height >= vh * 0.9) continue;   // (the figure's own full-screen picture)
    if (r.width < 4 || r.height < 4) continue;
    const kind: ScanItem['kind'] = tag === 'svg' ? 'svg' : tag === 'canvas' ? 'canvas' : tag === 'img' || tag === 'video' ? 'img' : 'control';
    const item: ScanItem = { kind, what: nameOf(el), box: b, clip: tag === 'svg' ? (el.parentElement ? vis(el.parentElement).clip : null) : v.clip, scrolls: v.scrolls, opacity: v.opacity };
    items.push(item); holders.push({ el, item }); media++;
  }

  // ── covered: the thing standing on top of an item at its own points ──
  const covered: RawScan['covered'] = [];
  const paints = (top: Element): boolean => {
    if (/^(svg|canvas|img|video|button|input)$/i.test(top.tagName)) return true;
    if (Array.from(top.childNodes).some((c) => c.nodeType === 3 && (c.nodeValue ?? '').trim())) return true;
    const cs = win.getComputedStyle(top);
    const bg = normColour(cs.backgroundColor);
    return cs.backgroundImage !== 'none' || (bg !== null && alphaOf(bg) > 0.1);
  };
  let hit = 0;
  for (const { el, item } of holders) {
    if (hit >= MAX_HIT) break;
    if (item.opacity < 0.5) continue;
    if (win.getComputedStyle(el).pointerEvents === 'none' || el.closest('#preview-badge')) continue;   // (elementFromPoint cannot see through it: not asked)
    let [l, t, r, b] = item.box;
    const view = vis(el).view;   // (a row of a scrolling menu below its fold is not there to be covered: the canvas under the menu is what the point finds)
    if (view) { l = Math.max(l, view[0]); t = Math.max(t, view[1]); r = Math.min(r, view[2]); b = Math.min(b, view[3]); }
    l = Math.max(l, 0); t = Math.max(t, 0); r = Math.min(r, vw - 1); b = Math.min(b, vh - 1);
    if ((r - l) * (b - t) < 24 || r - l < 3 || b - t < 3) continue;
    hit++;
    const pts: [number, number][] = [[(l + r) / 2, (t + b) / 2], [l + (r - l) * 0.2, t + (b - t) * 0.5], [l + (r - l) * 0.8, t + (b - t) * 0.5], [(l + r) / 2, t + (b - t) * 0.25], [(l + r) / 2, t + (b - t) * 0.75]];
    let n = 0, by = '';
    for (const [x, y] of pts) {
      const top = doc.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top) || top.contains(el) || top.closest('[data-debug]')) continue;
      const layer = top.closest(MODAL); if (layer && !layer.contains(el)) continue;   // (an open sheet, a menu or the cover over the page is the point of them)
      if (!paints(top)) continue;
      n++; by = by || nameOf(top);
    }
    if (n >= 3) covered.push({ what: item.what || nameOf(el), by, points: n });
  }
  return { vw, vh, items, zero, broken, covered, counts: { texts, media, hit, capped } };
}
