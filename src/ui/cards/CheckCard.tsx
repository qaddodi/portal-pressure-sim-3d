import { useLayoutEffect, useRef, useState } from 'react';
import type { Deck } from '../../decks/schema.ts';
import { CHECK_HINT, CHECK_LINE, CHECK_TITLE } from '../../decks/check.ts';
import { useUi } from '../ui-store.ts';
import { NameTab } from './NameTab.tsx';
import { Line } from './Line.tsx';

/** The closing quick check, as the 2D app's: numbered questions; a tap opens the answer under its question (the rows below ease down by transform, the answer fades in),
 *  a second tap shuts it. On a phone on its side one answer is open at a time, so the card never outgrows its short screen. */
export function CheckCard({ deck }: { deck: Deck }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef<number[] | null>(null);
  const readings = useUi((s) => s.readings);
  const read = (k: string, at?: string) => readings[at ? `${k}@${at}` : k];
  const one = useUi((s) => s.vp.h <= 500 && s.vp.w > s.vp.h);

  const toggle = (k: number) => {
    const li = list.current?.children;
    tops.current = li ? Array.from(li, (e) => e.getBoundingClientRect().top) : null;
    setOpen((cur) => { const n = new Set(one ? [] : cur); if (cur.has(k)) n.delete(k); else n.add(k); return n; });
  };
  // the rows under the one that opened or shut ease from where they were to where they are (transform only)
  useLayoutEffect(() => {
    const from = tops.current, li = list.current?.children;
    tops.current = null;
    if (!from || !li || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    Array.from(li).forEach((e, i) => {
      const dy = (from[i] ?? 0) - e.getBoundingClientRect().top;
      if (Math.abs(dy) > 1 && typeof e.animate === 'function') e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    });
  }, [open]);

  return (
    <>
      <NameTab deck={deck} />
      <h2 className="dk-title" style={{ margin: '10px 0 2px' }}>{CHECK_TITLE}</h2>
      <p className="dk-body" style={{ marginTop: 10 }}>{CHECK_LINE}</p>
      <ol className="dk-check" ref={list} style={{ marginTop: 12 }}>
        {deck.checks.map(([q, a], k) => (
          <li key={k} data-open={open.has(k) || undefined}>
            <button type="button" className="dk-chk-q" aria-expanded={open.has(k)} aria-controls={`dk-chk-a${k}`} onClick={() => toggle(k)}>
              <span className="dk-chk-t"><Line text={q} read={read} /></span><span className="dk-chk-hint" aria-hidden="true">{CHECK_HINT}</span>
            </button>
            {open.has(k) && <div className="dk-chk-a" id={`dk-chk-a${k}`}><p>{a}</p></div>}
          </li>
        ))}
      </ol>
    </>
  );
}
