// Whether the figure's graphics context is gone (context-loss.ts), as the clock's render phase and the note read it.
import { create } from 'zustand';

export type GlLoss = 'ok' | 'lost' | 'stuck';
export const useGlLoss = create<{ state: GlLoss }>(() => ({ state: 'ok' }));
export const setGlLoss = (state: GlLoss): void => useGlLoss.setState({ state });
/** True while no draw can reach the screen: the render phase skips its work. */
export const glLost = (): boolean => useGlLoss.getState().state !== 'ok';
