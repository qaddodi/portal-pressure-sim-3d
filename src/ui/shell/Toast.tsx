import { useEffect, useRef, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { useShell } from './store.ts';
import { setFootNote } from './foot-note.ts';
import { useActionRoom } from '../action/action-room.ts';
import { D_SMALL, EASE_ARRIVE } from '../motion.ts';

/** How long the old words take to fade before the new ones fade in; the box then eases to the new words' width (transform only: its width is read from the ResizeObserver, never from layout). */
export const TOAST_SWAP_MS = 120;
/** The clock line held where it stands (a read held by a finger): a one-keyframe-pair animation needs a duration above nothing, and nothing moves in it. */
const HOLD_FRAME_MS = 1;
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
  const swapped = useRef(false);
  // the rule under the words is the note's clock (store.ts toastRun): it shortens to nothing as the read time runs out, holds while a finger or pointer is on the note, and a new note grows it back (never a jump)
  const run = useShell((s) => s.toastRun);
  const rule = useRef<HTMLElement>(null), anim = useRef<Animation | null>(null), at = useRef({ from: 1, to: 0 });
  useEffect(() => {
    const r = rule.current;
    if (!r || typeof r.animate !== 'function') return;
    const a = anim.current, p = a?.effect?.getComputedTiming().progress;
    const now = a ? at.current.from + (at.current.to - at.current.from) * (typeof p === 'number' ? p : 1) : 1;
    a?.cancel();
    if (!run) { const k = { transform: `scaleX(${now})` }; anim.current = r.animate([k, { transform: 'scaleX(1)' }], { duration: D_SMALL, easing: EASE_ARRIVE, fill: 'forwards' }); at.current = { from: now, to: 1 }; return; }
    if (run.paused) { const k = { transform: `scaleX(${now})` }; anim.current = r.animate([k, k], { duration: HOLD_FRAME_MS, fill: 'forwards' }); at.current = { from: now, to: now }; return; }
    const grow = run.from > now + 0.02 ? Math.min(0.3, D_SMALL / Math.max(1, run.ms)) : 0;
    const keys: Keyframe[] = grow ? [{ transform: `scaleX(${now})` }, { transform: `scaleX(${run.from})`, offset: grow }, { transform: 'scaleX(0)' }] : [{ transform: `scaleX(${run.from})` }, { transform: 'scaleX(0)' }];
    anim.current = r.animate(keys, { duration: run.ms, easing: 'linear', fill: 'forwards' });
    at.current = { from: grow ? now : run.from, to: 0 };
  }, [run?.seq, run === null]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Esc lets the note go (only when no sheet or dialog is open, which Esc closes first)
  useEffect(() => {
    if (!t) return;
    const key = (e: KeyboardEvent) => { const s = useShell.getState(); if (e.key === 'Escape' && !s.sheet && !s.dialog) s.dismissToast(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [!!t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const down = useRef<{ x: number; y: number } | null>(null);
  const cardH = useActionRoom((s) => s.h);   // (the note's rect is measured again when a docked card comes or goes: it stands above it)
  // the note's rect, measured when it shows or changes size (the layout's own place, not the transition's: the note slides 10 px up as it comes in), for the figure's names to keep out of
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    const put = () => {
      if (!t) { setFootNote(null); return; }
      const p = n.offsetParent?.getBoundingClientRect(), w = n.offsetWidth, h = n.offsetHeight;
      if (!p || !w || !h) return;
      const x0 = Math.round(p.left + n.offsetLeft - w / 2), y0 = Math.round(p.top + n.offsetTop - useActionRoom.getState().h);   // (the note stands above a docked action card by `translate`, which the layout's offsetTop leaves out)
      setFootNote({ x0, y0, x1: x0 + w, y1: y0 + h });
    };
    put();
    if (!t || typeof ResizeObserver === 'undefined') return () => setFootNote(null);
    const ro = new ResizeObserver(put);
    ro.observe(n);
    addEventListener('resize', put);
    return () => { ro.disconnect(); removeEventListener('resize', put); };
  }, [t, view.text, label, cardH]);
  const m = /^(.+?[.!?:])\s+(.+)$/.exec(view.text);   // the first sentence carries the weight, the rest is said quieter (B1)
  return (
    <div ref={el} className="sh-toast" role="status" aria-live="polite" data-on={!!t} data-tone={view.tone} data-action={label ? '' : undefined} data-swap={swap ? '' : undefined}
      onPointerEnter={() => useShell.getState().holdToast(true)} onPointerLeave={() => useShell.getState().holdToast(false)}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => { const d = down.current; down.current = null; if (d && (e.clientY - d.y > 18 || Math.abs(e.clientX - d.x) > 40)) useShell.getState().dismissToast(); }}
      onClick={(e) => { if (!(e.target as Element).closest?.('.sh-toast-act')) useShell.getState().dismissToast(); }}>
      <span>{m ? <><b>{m[1]}</b> <span className="sh-toast-more">{m[2]}</span></> : <b>{view.text}</b>}</span>
      {label && <button type="button" className="sh-toast-act" tabIndex={t ? 0 : -1} onClick={() => { const a = useShell.getState().toast?.action; if (a) { a.run(); useShell.getState().dismissToast(); } }}>{label}</button>}
      <i ref={rule} className="sh-toast-time" aria-hidden="true" />
    </div>
  );
}
