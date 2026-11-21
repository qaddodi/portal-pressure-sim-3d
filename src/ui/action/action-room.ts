// The room an open action card takes from the figure (Mohammad, 21 Nov, iPhone: the DIPS card covered the stent it describes). On a device whose card is a sheet over the bottom of the figure, the card's own
// height (measured by the card, never read from the layout) is taken off the room the camera frames the figure in, so the figure pans up into what is left and never zooms; closing the card gives it back.
import { create } from 'zustand';

export const useActionRoom = create<{ h: number; over: boolean; set(h: number, over?: boolean): void }>((set) => ({ h: 0, over: false, set: (h, over = h > 0) => set((s) => (Math.abs(s.h - h) < 1 && s.over === over ? s : { h, over })) }));

export { roomAbove, takenBy } from './action-room-math.ts';
