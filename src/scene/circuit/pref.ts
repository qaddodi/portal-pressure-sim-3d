// The Circuit's turn, remembered across visits (the 2D app's `circ-turn` preference). With nothing stored, a phone held upright opens it standing (the 2D app's rule:
// a tall screen wants the tall map); everything else opens wide.
import { create } from 'zustand';
import { STORAGE_PREFIX } from '../../state/settings.ts';

const KEY = `${STORAGE_PREFIX}circuitRot`;

function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* no storage: the default */ }
  try { return matchMedia('(max-width: 1100px) and (orientation: portrait)').matches; } catch { return false; }
}

export const useCircuitTurn = create<{ upright: boolean; set(on: boolean): void }>((set) => ({
  upright: read(),
  set: (on) => { set({ upright: on }); try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not remembered */ } },
}));
