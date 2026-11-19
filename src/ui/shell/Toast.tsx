import { useRef } from 'react';
import { useShell } from './store.ts';

/** One line at the foot, faded in and out (opacity and transform). The last text stays in place while it fades so nothing jumps. A toast may carry one button (Send feedback's "Copy the full report"). */
export function Toast() {
  const t = useShell((s) => s.toast);
  const last = useRef<{ text: string; label: string | null }>({ text: '', label: null });
  if (t) last.current = { text: t.text, label: t.action?.label ?? null };
  const label = t ? (t.action?.label ?? null) : last.current.label;
  return (
    <div className="sh-toast" role="status" aria-live="polite" data-on={!!t} data-tone={t?.tone ?? 'info'} data-action={label ? '' : undefined}>
      <span>{t?.text ?? last.current.text}</span>
      {label && <button type="button" className="sh-toast-act" tabIndex={t ? 0 : -1} onClick={() => { const a = useShell.getState().toast?.action; if (a) { a.run(); useShell.setState({ toast: null }); } }}>{label}</button>}
    </div>
  );
}
