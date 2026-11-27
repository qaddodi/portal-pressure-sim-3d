// Where the Tests card stands, for what needs more than its box: the probes' cards and bias (scene/devices/probes), the names' view (scene/labels), .app's dock-side class
// and the shell's probe shift (Shell.tsx probeShift). Set by TestsLayer when the card is up and measured; null when it is closed. Its box also goes to the one room channel
// (surface/room.ts), which is what the figure's room is taken from.
import { create } from 'zustand';
import type { Rect } from '../layout/device.ts';
import type { TestsPlace } from './place.ts';
import { liveFigureRoom } from '../surface/room.ts';

export const useTestsRoom = create<{ place: TestsPlace | null }>(() => ({ place: null }));
/** The room the figure is framed in with the panels up (the room itself when none is): the same size as the room, centred in what every open panel and the case's cards leave
 *  (surface/room.ts figureRoom). Root cause of the zoom-out on opening a test (owner, 20 Nov): this was the squeezed room (roomWith), so every camera move an instrument makes (its
 *  shots, its way home, a view change with the card up) fitted the figure into the smaller room and zoomed it out. The size is never squeezed now; only the centre moves. */
export const cutRoom = (room: Rect): Rect => liveFigureRoom(room);
