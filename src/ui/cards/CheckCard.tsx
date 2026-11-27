import { useLayoutEffect, useRef, useState } from 'react';
import type { Deck } from '../../decks/schema.ts';
import { CHECK_HINT, CHECK_LINE, CHECK_TITLE } from '../../decks/check.ts';
import { useUi } from '../ui-store.ts';
import { NameTab } from './NameTab.tsx';
import { Line } from './Line.tsx';
import { pageOf } from './pages.ts';
import { GLIDE_MS } from './rail.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';
import { tellCardResized, flipOffsets, ANSWER_IN_AT, ANSWER_OUT_BY } from './content-resized.ts';

/** The closing quick check, as the 2D app's: numbered questions; a tap opens the answer under its question, a second tap shuts it. On a phone on its side one answer is open at a time, so the card never outgrows its short screen.
 *  One change, one frame (content-resized.ts): the layout effect tells the card first, so the frame is at its new height and place before anything is read;
 *  the rows under the question then ease from where they stood to where they stand, the frame glides (CardFrame reveal / sink), and the answer's words
 *  wait for the frame's edge (opening) or are gone before it sinks (shutting): all on the one 420 ms glide (rail.ts GLIDE_MS). */
export function CheckCard({ deck, page = 0, pages = 1 }: { deck: Deck; page?: number; pages?: number }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  // answers that have just shut: their words stay a moment, out of the layout (the rows below already ease up), fading, so nothing pops out
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef<number[] | null>(null);
  const opened = useRef<number | null>(null);
  const readings = useUi((s) => s.readings);
  const read = (k: string, at?: string) => readings[at ? `${k}@${at}` : k];
  const one = useUi((s) => s.vp.h <= 500 && s.vp.w > s.vp.h);

  // the questions of the page on show (whole questions, shared out evenly; one page when the card fits)
  const idx = deck.checks.map((_, i) => i);
  const shownIdx = pageOf(idx.map(String), pages, page).map(Number);
  const first = shownIdx[0] ?? 0, shown = shownIdx.map((i) => deck.checks[i]!);
  const shut = (k: number) => leaving.has(k) && !open.has(k);
  const toggle = (k: number) => {
    const li = list.current?.children;
    tops.current = li ? Array.from(li, (e) => e.getBoundingClientRect().top) : null;
    opened.current = open.has(k) ? null : k;
    const next = new Set(one ? [] : open);
    if (open.has(k)) next.delete(k); else next.add(k);
    // (what shut keeps its words for the fade; what opened again is no longer leaving)
    const gone = [...open].filter((i) => !next.has(i));
    setLeaving((cur) => { const n = new Set(cur); gone.forEach((i) => n.add(i)); next.forEach((i) => n.delete(i)); return n; });
    setOpen(next);
  };
  useLayoutEffect(() => {
    const from = tops.current, root = list.current, li = root?.children, fresh = opened.current;
    tops.current = null; opened.current = null;
    if (!from || !root || !li) return;
    // the card first: it measures and takes its new height and place here, before the frame is painted (so the answer is never outside it, and the rows' final places are already read true below)
    tellCardResized(root);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setLeaving(new Set()); return; }
    // the answer that has just opened is in its place at once, but the card is still growing down to it: its words wait for the card's edge to reach them, then come in
    const a = fresh == null ? null : root.querySelector<HTMLElement>(`#pzc-a${fresh}`);
    if (a && typeof a.animate === 'function') {
      a.getAnimations?.().forEach((x) => x.cancel());
      a.animate([{ opacity: 0 }, { opacity: 0, offset: ANSWER_IN_AT }, { opacity: 1 }], { duration: GLIDE_MS, easing: ARRIVE_CSS });
    }
    // the answers that have shut fade out in the first part of the glide, while the rows below ease up over the room they leave
    root.querySelectorAll<HTMLElement>('.pzc-a.leaving').forEach((g) => {
      if (g.getAnimations?.().length) return;   // (one already going keeps its fade)
      const f = g.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: GLIDE_MS * ANSWER_OUT_BY, easing: 'linear', fill: 'forwards' });
      const k = Number(g.id.slice('pzc-a'.length));
      if (f) f.onfinish = () => setLeaving((cur) => { if (!cur.has(k)) return cur; const n = new Set(cur); n.delete(k); return n; });
      else setLeaving((cur) => { const n = new Set(cur); n.delete(k); return n; });
    });
    // the rows ease from where they stood to where they stand (transform only)
    const dys = flipOffsets(from, Array.from(li, (e) => e.getBoundingClientRect().top));
    Array.from(li).forEach((e, i) => {
      const dy = dys[i] ?? 0;
      if (dy && typeof e.animate === 'function') e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: ARRIVE_CSS });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <NameTab deck={deck} air={false} />
      <div className="pz-ph">
        <h1 className="pz-h">{CHECK_TITLE}</h1>
        <p className="pz-line">{CHECK_LINE}{pages > 1 ? <span className="dk-pageno"> · {page + 1} of {pages}</span> : null}</p>
      </div>
      <ol className={leaving.size ? 'pz-check shedding' : 'pz-check'} ref={list} start={first + 1}>
        {shown.map(([q, a], j) => { const k = first + j; return (
          <li key={k} className={open.has(k) ? 'open' : shut(k) ? 'leaving' : undefined}>
            <button type="button" className="pzc-q" data-audit-select="" aria-expanded={open.has(k)} aria-controls={`pzc-a${k}`} onClick={() => toggle(k)}>
              <span><Line text={q} read={read} /></span><span className="pzc-hint" aria-hidden="true">{CHECK_HINT}</span>
            </button>
            {(open.has(k) || leaving.has(k)) && (
              <div className={shut(k) ? 'pzc-a leaving' : 'pzc-a'} id={`pzc-a${k}`} aria-hidden={shut(k) ? true : undefined}><p><Line text={a} read={read} /></p></div>
            )}
          </li>
        ); })}
      </ol>
    </>
  );
}
