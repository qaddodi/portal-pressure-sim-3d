// Whether the address asks for the device frame page (kept apart from frame.ts so main.tsx loads only these few lines on every start). The address is read through flags.ts only.
import { debugPage } from '../flags.ts';

/** Whether the address asks for the outer frame page (?debug=frame, or the old ?gallery=frame). */
export const isFrameRequest = (search: string): boolean => debugPage(search) === 'frame';
