import { useEffect, useRef } from 'react';
import { useShell } from './store.ts';
import { setFootNote } from './foot-note.ts';

/** One line at the foot, faded in and out (opacity and transform). The last text stays in place while it fades so nothing jumps. A toast may carry one button (Send feedback's "Copy the full report"). */
export function Toast() {
  const t = useShell((s) => s.toast);
  const last = useRef<{ text: string; label: string | null }>({ text: '', label: null });
  if (t) last.current = { text: t.text, label: t.action?.label ?? null };
  const label = t ? (t.action?.label ?? null) : last.current.label;
  const el = useRef<HTMLDivElement>(null);
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
  }, [t, t?.text, label]);
  return (
    <div ref={el} className="sh-toast" role="status" aria-live="polite" data-on={!!t} data-tone={t?.tone ?? 'info'} data-action={label ? '' : undefined}>
      <span>{t?.text ?? last.current.text}</span>
      {label && <button type="button" className="sh-toast-act" tabIndex={t ? 0 : -1} onClick={() => { const a = useShell.getState().toast?.action; if (a) { a.run(); useShell.setState({ toast: null }); } }}>{label}</button>}
    </div>
  );
}
