// Where the Tests card stands, published for the shell's camera: free play frames the figure in the room the bars leave, less this card (shell/Shell.tsx and
// shell/view-actions.ts take `cutRoom`). Set by TestsLayer when the card is up and measured; null when it is closed.
import { create } from 'zustand';
import type { Rect } from '../layout/device.ts';
import { roomWith, type TestsPlace } from './place.ts';

export const useTestsRoom = create<{ place: TestsPlace | null }>(() => ({ place: null }));
/** The room the figure has with the Tests card up (the room itself when it is closed). */
export const cutRoom = (room: Rect): Rect => roomWith(room, useTestsRoom.getState().place);
