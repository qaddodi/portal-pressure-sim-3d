// The Circuit's turn. A phone (upright or sideways) always opens the map standing; everything else opens it wide. The turn button still changes it for the visit, but
// nothing is remembered across loads, so a Mac never opens upright and a phone never opens wide. Every way in (view switch, talk slide, deep link) asks `entryUpright()`.
import { create } from 'zustand';
import { deviceClass, isPhone } from '../../ui/layout/device.ts';

/** True on an iPhone-sized screen, held either way. */
export function phoneScreen(): boolean {
  try { return isPhone(deviceClass(window.innerWidth, window.innerHeight)); } catch { return false; }
}

export const useCircuitTurn = create<{ upright: boolean; set(on: boolean): void }>((set) => ({
  upright: phoneScreen(),
  set: (on) => set({ upright: on }),
}));

/** The turn to enter the Circuit with: a phone is always upright (this also puts a manual wide turn back); elsewhere what the person last chose, wide to begin with. */
export function entryUpright(): boolean {
  const st = useCircuitTurn.getState();
  if (phoneScreen() && !st.upright) st.set(true);
  return useCircuitTurn.getState().upright;
}
