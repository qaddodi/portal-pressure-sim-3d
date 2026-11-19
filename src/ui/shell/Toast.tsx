import { useShell } from './store.ts';

/** One line at the foot, faded in and out (opacity and transform). The last text stays in place while it fades so nothing jumps. */
export function Toast() {
  const t = useShell((s) => s.toast);
  const last = useRef<string>('');
  if (t) last.current = t.text;
  return <div className="sh-toast" role="status" aria-live="polite" data-on={!!t} data-tone={t?.tone ?? 'info'}>{t?.text ?? last.current}</div>;
}
import { useRef } from 'react';
