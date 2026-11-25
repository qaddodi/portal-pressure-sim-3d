// The stent editor (StentPanel: the TIPS, DIPS and custom shunt cards' panel, with the stent chart's code) is a chunk of its own: nothing on the first screen draws it. Until 25 Nov 2026 boot.ts
// imported it, which kept about 270 kB of source in the boot entry. A card that has this panel is let in only once the chunk is in (ActionCard asks `stentCardReady`), so the card lands at its
// final size and never grows; the preload ladder reads the chunk in when idle (module:stent), and a selection of such a card asks for it at once.
import { create } from 'zustand';
import { retryImport } from '../../../boot/lazy-retry.ts';

const useReady = create<{ ready: boolean }>(() => ({ ready: false }));
let pending: Promise<void> | null = null;

/** Reads the stent editor's code in (one read however often it is asked; a failed read is tried again on the next ask). Never rejects. */
export function loadStentPanel(read: () => Promise<unknown> = () => retryImport(() => import('./StentPanel.tsx'))): Promise<void> {
  if (useReady.getState().ready) return Promise.resolve();
  pending ??= read().then(() => { useReady.setState({ ready: true }); }, (err) => { console.warn('The stent editor did not load.', err); }).then(() => { pending = null; });
  return pending;
}
export const stentPanelReady = (): boolean => useReady.getState().ready;
/** React: whether the stent editor's code is in (asks for it when it is not). */
export function useStentPanelReady(wanted: boolean): boolean {
  const ready = useReady((s) => s.ready);
  if (wanted && !ready) void loadStentPanel();
  return ready;
}
/** For a test: forget what was read. */
export function resetStentPanel(): void { pending = null; useReady.setState({ ready: false }); }
