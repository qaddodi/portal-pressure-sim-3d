// What each card on screen stands at, written into a capture's JSON beside its picture, so a capture from a device this build cannot be run on (an iPhone's WebKit) says WHY a card is clipped:
// the box the card has, the height its DRAWN content asks for, the fit zoom and the instrument's room the layer gave it,
// and how far its lowest drawn child reaches past the box (Stiffness 12 and Doppler 2, 25 Nov).
//
// "Drawn" is what an eye can see (26 Nov, capture 2274649a: 17 cards reported content 146 against a box of 250,
// and the Albumin belly 43 px past its foot, and every one of them stood whole in its picture).
// Two things the first reading counted that nobody sees: the instrument's hidden chart table (`table.sr-only`: a table does not shrink to the 1 px its CSS asks for, so it stands 118 px tall under the
// chart and `scrollHeight` counts it), and a child that an ancestor clips away (the belly's fluid waits
// `translate: 0 100%` under the belly's own `overflow: hidden`). One rule now, for every card of every
// deck at every size: the content's foot is the lowest part that is not for a screen reader alone and is not clipped away, measured inside the clips that stand between it and the card.
import { readBox, readStyle } from '../../layout-snap.ts';
import { srOnlyMemo } from '../sr-only.ts';

export interface CardBox { card: string; box: number; content: number; past: number; /** the lowest drawn child (tag.class) */ lowest: string; fit: string; room: string; tk: string; dk: string }

const round = (n: number): number => Math.round(n * 10) / 10;

/** A part of a card as the reader sees it: its box, and the box of the nearest clip around it that stands inside the card (null: nothing clips it before the card does). */
export interface Part { top: number; bottom: number; left: number; right: number; clip: { top: number; bottom: number; left: number; right: number } | null }

/** The foot of what is drawn: the lowest bottom among the parts that are left once each is cut to its clip, or `null` when nothing is drawn. `at` is the index of that part. Pure. */
export function drawnFoot(parts: readonly Part[]): { foot: number; at: number } | null {
  let foot = -Infinity, at = -1;
  parts.forEach((p, i) => {
    const top = p.clip ? Math.max(p.top, p.clip.top) : p.top, bottom = p.clip ? Math.min(p.bottom, p.clip.bottom) : p.bottom;
    const left = p.clip ? Math.max(p.left, p.clip.left) : p.left, right = p.clip ? Math.min(p.right, p.clip.right) : p.right;
    if (bottom - top <= 0 || right - left <= 0) return;   // (clipped away whole: nothing of it is drawn)
    if (bottom > foot) { foot = bottom; at = i; }
  });
  return at < 0 ? null : { foot, at };
}

/** The nearest box between `el` and `card` (the card itself excluded: its own clip is what is being judged) that clips what is inside it. An svg clips its own drawing. */
function clipInside(el: Element, card: Element, styleOf: (e: Element) => CSSStyleDeclaration): Part['clip'] {
  let c: Part['clip'] = null;
  for (let p: Element | null = el.tagName.toLowerCase() === 'svg' ? el : el.parentElement; p && p !== card; p = p.parentElement) {
    const cs = styleOf(p);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible' && !/paint|strict|content/.test(cs.contain)) continue;
    const b = readBox(p), q = { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    c = c ? { top: Math.max(c.top, q.top), bottom: Math.min(c.bottom, q.bottom), left: Math.max(c.left, q.left), right: Math.min(c.right, q.right) } : q;
  }
  return c;
}

export function cardBoxes(doc: Document, styleOf: (el: Element) => CSSStyleDeclaration = readStyle): CardBox[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('.dk-card')).map((el) => {
    const inner = el.querySelector<HTMLElement>('.dk-in'), r = readBox(el), st = el.style;
    const forReader = srOnlyMemo(styleOf, el);
    const kids: Element[] = [], parts: Part[] = [];
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('.dk-in *')).slice(0, 800)) {
      if (forReader(c) || c.closest('.dk-roll-sizer, .dk-roll-out')) continue;
      const cs = styleOf(c);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = readBox(c);
      if (b.height <= 0 || b.width <= 0) continue;
      kids.push(c); parts.push({ top: b.top, bottom: b.bottom, left: b.left, right: b.right, clip: clipInside(c, el, styleOf) });
    }
    const low = drawnFoot(parts), lowest = low ? kids[low.at] : null;
    const padB = inner ? parseFloat(styleOf(inner).paddingBottom) || 0 : 0;
    return {
      card: Array.from(el.classList).filter((c) => c !== 'dk-card').join(' '),
      box: round(r.height), content: low ? round(Math.max(0, low.foot - r.top) + padB) : 0, past: low ? Math.max(0, round(low.foot - r.bottom)) : 0,
      lowest: lowest ? `${lowest.tagName.toLowerCase()}.${Array.from(lowest.classList).join('.')}` : '',
      fit: st.getPropertyValue('--pz-fit'), room: st.getPropertyValue('--pz-room'), tk: st.getPropertyValue('--pz-tk'), dk: st.getPropertyValue('--pz-dk'),
    };
  });
}
