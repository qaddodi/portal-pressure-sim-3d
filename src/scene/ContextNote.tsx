import { useGlLoss } from './gl-loss.ts';
import { useFileLoss } from './file-loss.ts';
import { reloadKeepingState } from '../boot/reload.ts';
import { FILE_LOSS, GL_LOSS } from './../ui/shell/words.ts';
import '../ui/shell/shell.css';

/** The note over the figure, in the one place a note of its kind lives: "Redrawing the figure…" while the graphics context is gone, and Reload when it does not come back in time; and, when a data file the figure draws from
 *  did not load even after the one more try (file-loss.ts), what is missing in plain words with Reload (the organs used to go missing with nothing said). Always mounted, so it fades in and out on opacity (never pops). */
export function ContextNote() {
  const state = useGlLoss((s) => s.state);
  const lost = useFileLoss((s) => s.lost);
  const filesOn = state === 'ok' && lost.length > 0;
  const on = state !== 'ok' || filesOn;
  const reload = state === 'stuck' || filesOn;
  const words = state === 'stuck' ? GL_LOSS.stuck : state === 'lost' ? GL_LOSS.redrawing : lost.includes('organs') || !lost.length ? FILE_LOSS.organs : FILE_LOSS.art;
  return (
    <div className="sh-glnote" role="status" aria-live="polite" aria-hidden={!on} inert={!on} style={{ opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none' }}>
      <span>{words}</span>
      {reload && <button type="button" onClick={() => { void reloadKeepingState(); }}>{GL_LOSS.reload}</button>}
    </div>
  );
}
