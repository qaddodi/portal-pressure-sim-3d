// The procedure's one-row step rail on the teaching card (Mohammad, 22 Nov: the steps' paragraph and the Play button's own row "wasting so much space"; he picked mock A,
// /mnt/project-files/visual-mocks/steps/, "do it for all"). One row: a round play button, a track of one dot per step and the step on show by name. This file is the rail's
// whole meaning as data, so every procedure of every deck gets the same row from ui/cards/ProcRow.tsx, and tests/proc-rail.test.ts pins it.
import type { ProcState } from '../deck/procs-state.ts';

export type DotState = 'todo' | 'done' | 'on';
export interface Rail {
  /** one per step: played (done), the one the figure is on (on), or still to come */
  dots: DotState[];
  /** where the fill and the ring stand on the track, 0 (first dot) to 1 (last): the CSS moves them by transform, so they glide */
  fill: number; ring: number; ringOn: boolean;
  /** the words after the track: before Play the procedure and its step count; then "2/4" and the step's name */
  count: string; name: string; sub: string;
  /** the button: what it does (its accessible name and tooltip), its icon, and whether it can be pressed */
  action: string; icon: 'play' | 'replay'; disabled: boolean; why: string;
}

export function railOf(st: Pick<ProcState, 'steps' | 'at' | 'ring' | 'phase' | 'why' | 'name'>): Rail {
  const n = st.steps.length, last = Math.max(1, n - 1);
  const raw = st.ring >= 0 ? st.ring : st.at, mark = Math.min(raw, n - 1);   // (after the last step the ring stands past it: the next Next moves on; the rail holds the last dot)
  const started = n > 0 && (raw >= 0 || st.at >= 0) && st.phase !== 'idle';
  const dots: DotState[] = st.steps.map((_, k) => (k === st.at ? (st.phase === 'done' ? 'done' : 'on') : k < st.at ? 'done' : 'todo'));
  const fill = started ? Math.min(1, Math.max(0, st.at) / last) : 0;
  const ring = started ? Math.max(0, mark) / last : 0;
  const step = started ? st.steps[Math.max(0, mark)] : undefined;
  return {
    dots, fill, ring, ringOn: started,
    count: started ? `${Math.max(0, mark) + 1}/${n}` : '',
    name: started ? (step?.[1] ?? '') : st.name,
    sub: started ? '' : `${n} step${n === 1 ? '' : 's'}`,
    action: st.phase === 'done' ? `Replay ${st.name}` : st.phase === 'play' ? 'Next step' : `Play ${st.name}`,
    icon: st.phase === 'done' ? 'replay' : 'play',
    disabled: !!st.why || (st.phase === 'play' && raw >= n - 1),
    why: st.why,
  };
}
