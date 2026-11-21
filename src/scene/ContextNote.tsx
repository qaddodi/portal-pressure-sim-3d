import { useGlLoss } from './gl-loss.ts';
import { reloadKeepingState } from '../boot/reload.ts';
import { GL_LOSS } from './../ui/shell/words.ts';
import '../ui/shell/shell.css';

/** "Redrawing the figure…" while the graphics context is gone, and Reload when it does not come back in time. Always mounted, so it fades in and out on opacity (never pops). */
export function ContextNote() {
  const state = useGlLoss((s) => s.state);
  const on = state !== 'ok';
  return (
    <div className="sh-glnote" role="status" aria-live="polite" aria-hidden={!on} inert={!on} style={{ opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none' }}>
      <span>{state === 'stuck' ? GL_LOSS.stuck : GL_LOSS.redrawing}</span>
      {state === 'stuck' && <button type="button" onClick={() => { void reloadKeepingState(); }}>{GL_LOSS.reload}</button>}
    </div>
  );
}
