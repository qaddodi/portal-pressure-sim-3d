import { useEffect, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { useShell } from './store.ts';
import { setFootNote } from './foot-note.ts';
import { D_SMALL, EASE_ARRIVE } from '../motion.ts';

/** How long the old words take to fade before the new ones fade in; the box then eases to the new words' width (transform only: its width is read from the ResizeObserver, never from layout). */
export const TOAST_SWAP_MS = 120;
interface Shown { id: number; text: string; label: string | null; tone: 'info' | 'bad' }
const ofToast = (t: NonNullable<ReturnType<typeof useShell.getState>['toast']>): Shown => ({ id: t.id, text: t.text, label: t.action?.label ?? null, tone: t.tone });

/** One line at the foot, faded in and out (opacity and transform). A second note while one is showing crossfades its words in place (the old fade out over TOAST_SWAP_MS, the new fade in), so the words never pop.
 *  The last text stays in place while the note fades out so nothing jumps. A finger or the pointer on the note holds it (the store times it). A toast may carry one button (Send feedback's "Copy full report"). */
export function Toast() {
  const t = useShell((s) => s.toast);
  const [shown, setShown] = useState<Shown>({ id: 0, text: '', label: null, tone: 'info' });
  const [swap, setSwap] = useState(false);
  const live = useRef(false);   // a note was showing at the last render: a new one then crossfades, otherwise it simply fades in with the box
  const view: Shown = t && !live.current ? ofToast(t) : shown;
  useEffect(() => {
    if (!t) { live.current = false; setSwap(false); return; }
    const next = ofToast(t);
    if (!live.current) { live.current = true; setSwap(false); setShown(next); return; }
    if (next.id === shown.id) return;
    setSwap(true);
    const h = clock.after(() => { swapped.current = true; setShown(next); setSwap(false); clock.after(() => { swapped.current = false; }, 100); }, TOAST_SWAP_MS);
    return () => clock.cancel(h);
  }, [t?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const label = view.label;
  const el = useRef<HTMLDivElement>(null);
  // the width easing: the box's last width, and whether a swap of words has just been committed; when the new words make the box another width it scales from the old width to 1 over D_SMALL
  // (scaleX on the box, the inverse on its words, button and dot so they are never stretched), instead of snapping.
  const lastW = useRef(0), swapped = useRef(false);
  useEffect(() => {
    const n = el.current;
    if (!n || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1]!, w = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width, from = lastW.current;
      lastW.current = w;
      if (!swapped.current) return;
      swapped.current = false;
      const r = w > 0 ? from / w : 1;
      if (!from || !(Math.abs(r - 1) > 0.02) || typeof n.animate !== 'function' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      const o = { duration: D_SMALL, easing: EASE_ARRIVE };
      n.animate([{ transform: `translate(-50%, 0) scaleX(${r})` }, { transform: 'translate(-50%, 0) scaleX(1)' }], o);
      for (const c of Array.from(n.children)) c.animate([{ transform: `scaleX(${1 / r})` }, { transform: 'scaleX(1)' }], o);
      try { n.animate([{ transform: `scaleX(${1 / r})` }, { transform: 'scaleX(1)' }], { ...o, pseudoElement: '::before' }); } catch { /* a browser without pseudo-element animation: the dot squeezes for the glide */ }   // (the dot is the box's ::before)
    });
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  // the note's rect, measured when it shows or changes size (the layout's own place, not the transition's: the note slides 10 px up as it comes in), for the figure's names to keep out of
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    const put = () => {
      if (!t) { setFootNote(null); return; }
      const p = n.offsetParent?.getBoundingClientRect(), w = n.offsetWidth, h = n.offsetHeight;
      if (!p || !w || !h) return;
      const x0 = Math.round(p.left + n.offsetLeft - w / 2), y0 = Math.round(p.top + n.offsetTop);
      setFootNote({ x0, y0, x1: x0 + w, y1: y0 + h });
    };
    put();
    if (!t || typeof ResizeObserver === 'undefined') return () => setFootNote(null);
    const ro = new ResizeObserver(put);
    ro.observe(n);
    addEventListener('resize', put);
    return () => { ro.disconnect(); removeEventListener('resize', put); };
  }, [t, view.text, label]);
  return (
    <div ref={el} className="sh-toast" role="status" aria-live="polite" data-on={!!t} data-tone={view.tone} data-action={label ? '' : undefined} data-swap={swap ? '' : undefined}
      onPointerEnter={() => useShell.getState().holdToast(true)} onPointerLeave={() => useShell.getState().holdToast(false)}>
      <span>{view.text}</span>
      {label && <button type="button" className="sh-toast-act" tabIndex={t ? 0 : -1} onClick={() => { const a = useShell.getState().toast?.action; if (a) { a.run(); useShell.setState({ toast: null }); } }}>{label}</button>}
    </div>
  );
}
