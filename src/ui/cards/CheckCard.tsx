import { useLayoutEffect, useRef, useState } from 'react';
import type { Deck } from '../../decks/schema.ts';
import { CHECK_HINT, CHECK_LINE, CHECK_TITLE } from '../../decks/check.ts';
import { useUi } from '../ui-store.ts';
import { NameTab } from './NameTab.tsx';
import { Line } from './Line.tsx';
import { pageOf } from './pages.ts';
import { GLIDE_MS } from './rail.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';

/** The closing quick check, as the 2D app's: numbered questions; a tap opens the answer under its question (the rows below ease down by transform, the answer fades in),
 *  a second tap shuts it. On a phone on its side one answer is open at a time, so the card never outgrows its short screen. */
export function CheckCard({ deck, page = 0, pages = 1 }: { deck: Deck; page?: number; pages?: number }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef<number[] | null>(null);
  const opened = useRef<number | null>(null);
  const height = useRef(0);
  const readings = useUi((s) => s.readings);
  const read = (k: string, at?: string) => readings[at ? `${k}@${at}` : k];
  const one = useUi((s) => s.vp.h <= 500 && s.vp.w > s.vp.h);

  // the questions of the page on show (whole questions, shared out evenly; one page when the card fits)
  const idx = deck.checks.map((_, i) => i);
  const shownIdx = pageOf(idx.map(String), pages, page).map(Number);
  const first = shownIdx[0] ?? 0, shown = shownIdx.map((i) => deck.checks[i]!);
  const toggle = (k: number) => {
    const li = list.current?.children;
    tops.current = li ? Array.from(li, (e) => e.getBoundingClientRect().top) : null;
    height.current = list.current?.getBoundingClientRect().height ?? 0;
    opened.current = open.has(k) ? null : k;
    setOpen((cur) => { const n = new Set(one ? [] : cur); if (cur.has(k)) n.delete(k); else n.add(k); return n; });
  };
  // the rows under the one that opened or shut ease from where they were to where they are (transform only)
  useLayoutEffect(() => {
    const from = tops.current, li = list.current?.children, fresh = opened.current;
    tops.current = null; opened.current = null;
    if (!from || !li || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // the answer that has just opened is in its place at once, but the card is still growing down to it (it is revealed by the same 420 ms glide (rail.ts GLIDE_MS) the rows ease down by): its words
    // wait for the card's edge to reach them (clear for the first third of the glide), then come in, so the words are never outside the card
    const a = fresh == null ? null : list.current?.querySelector<HTMLElement>(`#pzc-a${fresh}`);
    if (a && typeof a.animate === 'function') a.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: GLIDE_MS, easing: ARRIVE_CSS });
    // a card on the foot (a phone's) grows and shrinks at its TOP, a centred one (this one) at its top and its foot by half each: in this same frame, before it is drawn, the card takes its new height and every row stands g higher (g = what the list gained, times the share of it the card's top takes),
    // so a row's way from where it was to where it will be is its measured way plus g (a row under the answer: no way at all; a row above it: g up)
    const anchor = list.current?.closest('.dk-pos')?.getAttribute('data-anchor');
    const g = (anchor === 'foot' ? 1 : anchor === 'mid' ? 0.5 : 0) * ((list.current?.getBoundingClientRect().height ?? 0) - height.current);
    Array.from(li).forEach((e, i) => {
      const dy = (from[i] ?? 0) - e.getBoundingClientRect().top + g;
      if (Math.abs(dy) > 1 && typeof e.animate === 'function') e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: ARRIVE_CSS });
    });
  }, [open]);

  return (
    <>
      <NameTab deck={deck} air={false} />
      <div className="pz-ph">
        <h1 className="pz-h">{CHECK_TITLE}</h1>
        <p className="pz-line">{CHECK_LINE}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      </div>
      <ol className="pz-check" ref={list} start={first + 1}>
        {shown.map(([q, a], j) => { const k = first + j; return (
          <li key={k} className={open.has(k) ? 'open' : undefined}>
            <button type="button" className="pzc-q" aria-expanded={open.has(k)} aria-controls={`pzc-a${k}`} onClick={() => toggle(k)}>
              <span><Line text={q} read={read} /></span><span className="pzc-hint" aria-hidden="true">{CHECK_HINT}</span>
            </button>
            {open.has(k) && <div className="pzc-a" id={`pzc-a${k}`}><p><Line text={a} read={read} /></p></div>}
          </li>
        ); })}
      </ol>
    </>
  );
}
