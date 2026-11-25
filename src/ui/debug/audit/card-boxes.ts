// What each card on screen stands at, written into a capture's JSON beside its picture, so a capture from a device this build cannot be run on (an iPhone's WebKit) says WHY a card is clipped:
// the box the card has, the height its content asks for, the fit zoom and the instrument's room the layer gave it, and how far its lowest drawn child reaches past the box (Stiffness 12 and Doppler 2, 25 Nov).
import { readBox } from '../../layout-snap.ts';

export interface CardBox { card: string; box: number; content: number; past: number; /** the lowest drawn child (tag.class) */ lowest: string; fit: string; room: string; tk: string; dk: string }

const round = (n: number): number => Math.round(n * 10) / 10;

export function cardBoxes(doc: Document): CardBox[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('.dk-card')).map((el) => {
    const inner = el.querySelector<HTMLElement>('.dk-in'), r = readBox(el), st = el.style;
    let low = r.top, lowest: Element | null = null;
    for (const c of Array.from(el.querySelectorAll<HTMLElement>('.dk-in *:not(.sr-only):not(.sr-only *)'))) { const b = readBox(c); if (b.height > 0 && b.width > 0 && b.bottom > low) { low = b.bottom; lowest = c; } }
    return {
      card: Array.from(el.classList).filter((c) => c !== 'dk-card').join(' '),
      box: round(r.height), content: round(inner?.scrollHeight ?? 0), past: Math.max(0, round(low - r.bottom)), lowest: lowest ? `${(lowest as Element).tagName.toLowerCase()}.${Array.from((lowest as Element).classList).join('.')}` : '',
      fit: st.getPropertyValue('--pz-fit'), room: st.getPropertyValue('--pz-room'), tk: st.getPropertyValue('--pz-tk'), dk: st.getPropertyValue('--pz-dk'),
    };
  });
}
