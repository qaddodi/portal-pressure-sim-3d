// Which of the figure's data files did not load, after the one more try (boot/fetch-bin.ts), as the note over the figure reads it (ContextNote.tsx).
// A file the figure cannot draw without is never left to fail quietly (independent review, F11): the organs were missing with nothing said.
import { create } from 'zustand';

export type LostFile = 'organs' | 'organ-art';
export const useFileLoss = create<{ lost: readonly LostFile[] }>(() => ({ lost: [] }));
/** Says that `file` did not load (once; asking again changes nothing). */
export const reportFileLoss = (file: LostFile): void => useFileLoss.setState((s) => (s.lost.includes(file) ? s : { lost: [...s.lost, file] }));
