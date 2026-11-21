// What the page's DOM says about itself, as plain numbers (the only place the screen report touches layout). The readers turn these into the report's parts and the
// rules judge the parts, so a Node test drives readers and rules with hand-made raw reads; the collectors below run on the device and are tried there.
// Debug only: a read of layout per call, never per frame (the recorder's sampler reads the same way, only while it is on).

export interface RawText { role: 'kicker' | 'title' | 'body' | 'data' | 'other'; px: number; text: string; left: number; top: number; right: number; bottom: number }
export interface RawCard {
  id: string; phase: string; x: number; y: number; w: number; h: number; opacity: number;
  /** a card or something in it scrolls up and down */ scrollsY: boolean;
  /** something in it scrolls sideways */ scrollsX: boolean;
  /** the card was given an overflow allowance (CardFrame data-overflow) */ overflowFlag: boolean;
  texts: RawText[];
}
export interface RawLabel { name: string; kind: 'label' | 'callout' | 'key'; x: number; y: number; w: number; h: number; opacity: number; on: boolean; tone: string }
export interface RawCue { el: string; tone: string; text: string; named: boolean }
export interface RawA11y { lang: string; live: boolean; figureName: string; figureDescription: string; reduced: boolean; focusable: number; unnamed: string[] }
export interface RawReadout { label: string; value: number | null; sev: string | null }
export interface RawDom { cards: RawCard[]; readouts: RawReadout[]; strip: { x: number; y: number; w: number; h: number; opacity: number } | null; labels: RawLabel[]; cues: RawCue[]; a11y: RawA11y; fontsLoaded: boolean }

const r1 = (v: number) => Math.round(v * 10) / 10;
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) ? v : 0; };

function roleOf(el: Element): RawText['role'] {
  const c = el.classList;
  if (c.contains('dk-kicker')) return 'kicker';
  // (the cards wear the 2D app's pz-* classes: the title is .pz-h (or the title card's .pz-dtitle), the words are the paragraph .pz-line or the case's .pz-case-p; a pill, a chip or a sub/superscript inside the words is smaller by design and is not the words' size)
  if (c.contains('dk-title') || c.contains('pz-h') || c.contains('pz-dtitle')) return 'title';
  if (c.contains('dk-body') || el.closest('.dk-body, .dk-obj, .dk-q-text, .dk-a')) return 'body';
  if (el.closest('.pz-line, .pz-case-p') && !el.closest('[class*="pill"], [class*="chip"], sub, sup, small, .pz-eq')) return 'body';
  if (el.closest('.dk-ladder, .dk-gap, .dk-data, .dk-pill')) return 'data';
  return 'other';
}

/** A card's texts: every visible run of words with its size and the box it stands in. */
function textsOf(win: Window, card: Element): RawText[] {
  const doc = card.ownerDocument;
  const out: RawText[] = [];
  const walker = doc.createTreeWalker(card, 4 /* SHOW_TEXT */);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    const p = n.parentElement;
    if (!text || !p) continue;
    const cs = win.getComputedStyle(p);
    if (cs.visibility === 'hidden' || cs.display === 'none' || p.closest('[aria-hidden="true"], .dk-roll-sizer, .dk-roll-out')) continue;
    range.selectNodeContents(n);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    out.push({
      role: roleOf(p), px: r1(num(cs.fontSize)), text: text.slice(0, 200),
      left: r1(Math.min(...rects.map((r) => r.left))), top: r1(Math.min(...rects.map((r) => r.top))), right: r1(Math.max(...rects.map((r) => r.right))), bottom: r1(Math.max(...rects.map((r) => r.bottom))),
    });
  }
  return out;
}

function scrolls(win: Window, card: Element): { y: boolean; x: boolean } {
  let y = false, x = false;
  const all = [card, ...Array.from(card.querySelectorAll('*'))];
  for (const e of all) {
    const el = e as HTMLElement;
    if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = win.getComputedStyle(el);
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(cs.overflowY)) y = true;
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(cs.overflowX)) x = true;
  }
  return { y, x };
}

export function collectCards(doc: Document, win: Window): RawCard[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('.dk-card')).map((el) => {
    const b = el.getBoundingClientRect(), cs = win.getComputedStyle(el), sc = scrolls(win, el);
    return { id: el.dataset.card ?? 'card', phase: el.dataset.phase ?? '', x: r1(b.left), y: r1(b.top), w: r1(b.width), h: r1(b.height), opacity: r1(num(cs.opacity) * 100) / 100, scrollsY: sc.y, scrollsX: sc.x, overflowFlag: el.dataset.overflow !== undefined, texts: textsOf(win, el) };
  });
}

/** How visible a label or callout is. A label that is not on (no data-on) is gone, whatever its element's opacity says; a callout's own element is never faded (cath-dom.ts fades the pieces inside it), so its alpha is the strongest of those pieces'. */
export function labelAlpha(on: boolean, own: number, inner: number[]): number {
  if (!on) return 0;
  return inner.length ? Math.max(...inner) : own;
}

export function collectLabels(doc: Document, win: Window): RawLabel[] {
  const out: RawLabel[] = [];
  const read = (el: HTMLElement, kind: RawLabel['kind'], name: string) => {
    const b = el.getBoundingClientRect(), own = num(win.getComputedStyle(el).opacity);
    const inner = kind === 'callout' ? Array.from(el.querySelectorAll<HTMLElement>('[style*="opacity"]')).map((c) => num(win.getComputedStyle(c).opacity)) : [];
    const op = kind === 'key' ? own : labelAlpha(el.hasAttribute('data-on'), own, inner);
    out.push({ name, kind, x: r1(b.left), y: r1(b.top), w: r1(b.width), h: r1(b.height), opacity: Math.round(op * 100) / 100, on: el.hasAttribute('data-on'), tone: el.dataset.tone ?? '' });
  };
  doc.querySelectorAll<HTMLElement>('.lb').forEach((el) => read(el, 'label', (el.querySelector('.lb-name')?.textContent ?? '').trim()));
  doc.querySelectorAll<HTMLElement>('.cl-pill, .cl-sum').forEach((el) => read(el, 'callout', `callout ${el.dataset.k ?? ''}`.trim()));
  const key = doc.querySelector<HTMLElement>('.lb-key');
  if (key) read(key, 'key', 'colour key');
  return out;
}

/** Every element that wears a colour meaning (data-tone, data-sev) and what else says the same thing: words or a number, a name for a reader, or a mark with a shape. */
export function collectCues(doc: Document): RawCue[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[data-tone], [data-sev]')).filter((el) => !el.closest('[aria-hidden="true"]') && !el.matches('.sh-toast')).map((el) => ({
    el: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`,
    tone: el.dataset.tone || el.dataset.sev || '',
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    named: !!(el.getAttribute('aria-label') || el.getAttribute('aria-description') || el.hasAttribute('data-cue')),
  }));
}

/** The two headline readouts of the play bar (HVPG, PPG): the number printed and the severity its colour wears. */
export function collectReadouts(doc: Document): RawReadout[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('.sh-read')).map((el) => {
    const t = (el.querySelector('span')?.textContent ?? '').replace('−', '-').trim();
    const v = parseFloat(t);
    return { label: (el.querySelector('b')?.textContent ?? '').trim(), value: Number.isFinite(v) ? v : null, sev: el.dataset.sev ?? null };
  });
}

export function collectA11y(doc: Document, win: Window): RawA11y {
  const canvas = doc.querySelector('canvas');
  const unnamed: string[] = [];
  doc.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input, select, textarea').forEach((el) => {
    if (el.closest('[aria-hidden="true"], [hidden]')) return;
    const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('title') || '').trim();
    if (!name) unnamed.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`);
  });
  return {
    lang: doc.documentElement.lang || '', live: !!doc.getElementById('live'), figureName: canvas?.getAttribute('aria-label') ?? '', figureDescription: canvas?.getAttribute('aria-description') ?? '',
    reduced: typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    focusable: doc.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [tabindex]').length, unnamed,
  };
}

export function collectDom(doc: Document = document, win: Window = window): RawDom {
  const strip = doc.querySelector<HTMLElement>('.dk-strip');
  const sb = strip?.getBoundingClientRect();
  return {
    cards: collectCards(doc, win), readouts: collectReadouts(doc), labels: collectLabels(doc, win), cues: collectCues(doc), a11y: collectA11y(doc, win), fontsLoaded: !doc.fonts || doc.fonts.status === 'loaded',
    strip: strip && sb ? { x: r1(sb.left), y: r1(sb.top), w: r1(sb.width), h: r1(sb.height), opacity: num(win.getComputedStyle(strip).opacity) } : null,
  };
}
