// Where the Tests card stands, published for the shell's camera: free play frames the figure in the room the bars leave, less this card (shell/Shell.tsx and
// shell/view-actions.ts take `cutRoom`). Set by TestsLayer when the card is up and measured; null when it is closed.
import { create } from 'zustand';
import type { Rect } from '../layout/device.ts';
import { panRoom, type TestsPlace } from './place.ts';

export const useTestsRoom = create<{ place: TestsPlace | null }>(() => ({ place: null }));
/** The room the figure is framed in with the Tests card up (the room itself when it is closed): the same size as the room, centred in what the card leaves (place.ts panRoom).
 *  Root cause of the zoom-out on opening a test (owner, 20 Nov): this was the squeezed room (roomWith), so every camera move an instrument makes (its shots, its way home, a view
 *  change with the card up) fitted the figure into the smaller room and zoomed it out. The size is never squeezed now; only the centre moves. */
export const cutRoom = (room: Rect): Rect => panRoom(room, useTestsRoom.getState().place);
