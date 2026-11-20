import { useLayoutEffect, useRef } from 'react';
import { caseOf, type Slide } from '../../decks/schema.ts';
import { useUi } from '../ui-store.ts';
import { centredBox } from '../layout/plan.ts';
import { sentences, pageOf } from './pages.ts';

/** The patient the slide starts with, on a card of its own before the slide's words (the 2D deck's "Case"). */
export function CaseCard({ slide, page, pages }: { slide: Slide; page: number; pages: number }) {
  const c = caseOf(slide) ?? { kicker: 'Case', text: '' };
  const text = pageOf(sentences(c.text), pages, page).join(' ');
  const mark = useRef<HTMLSpanElement>(null);
  const vp = useUi((s) => s.vp);
  // 2D (presenter-case.js cardUp): the words run 2.5x the teaching card's (2x on a phone) and ease down, a tenth at a time, only as far as the card's room needs, never under 1.2x
  useLayoutEffect(() => {
    const inner = mark.current?.parentElement, card = inner?.parentElement;
    if (!inner || !card) return;
    card.style.removeProperty('--case-k');
    const cs = getComputedStyle(card), pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), room = centredBox(vp, 'case').maxH;
    for (let k = parseFloat(cs.getPropertyValue('--case-max')) || 2.5; k > 1.2 && inner.getBoundingClientRect().height + pad + 2 > room; k -= 0.1) card.style.setProperty('--case-k', k.toFixed(1));
  }, [slide.id, text, vp.w, vp.h]);
  return (
    <>
      <span ref={mark} className="pz-site pz-case-tag">{c.kicker}</span>
      <p className="pz-case-p">{text}</p>
      {slide.caseQ && page >= pages - 1 ? <p className="pz-case-p pz-case-q">{slide.caseQ}</p> : null}
    </>
  );
}
