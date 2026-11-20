// Which junction method the page asks for (spec section 6 and WP7): `?joins=old` is today's overlapping tubes with the shader-painted union outline (the way back, kept so Mohammad can compare and reverse at once),
// `?joins=mesh` the SMV-SV confluence as one welded skin (phase 1), `?joins=mesh2` every junction the spec lists (phase 2). With no flag the default below applies. Skins are only ever built with Smooth vessel joins on:
// they stand on the branch ends smooth joins moved onto their trunks (shape.ts fitEnds).
import { flagValue } from '../../../ui/debug/flags.ts';

export type JoinsMode = 'old' | 'mesh' | 'mesh2';
/** What no flag means: every skin of the spec (WP7, Mohammad 20 Nov: "let's just do it all, and we can reverse if it sucks"). `?joins=old` is the way back; the old junction code (nbr, bury, mates, collars) is all still in place under it. */
export const JOINS_DEFAULT: JoinsMode = 'mesh2';

/** The mode from an address search string (no argument: the page's own). An unknown value is the default. */
export function joinsMode(search?: string): JoinsMode {
  const v = flagValue('joins', search ?? undefined);
  return v === 'old' || v === 'mesh' || v === 'mesh2' ? v : JOINS_DEFAULT;   // (`debug` is mesh2 with the skins' dropped pixels painted: skinDebugOn)
}
/** `?joins=debug`: every junction as with mesh2, and a skin pixel its shader would drop is painted instead, in the colour of the reason: red a back face, cyan the presence dither, yellow no alpha, magenta past the ink band. A hole in a weld is then a colour, and a hole that stays brown is not the skin's own drop. */
export const skinDebugOn = (search?: string): boolean => flagValue('joins', search ?? undefined) === 'debug';
/** `?joins=nomarks` and `?joins=noink`: every skin as mesh2, with its flow marks (dust, streaks, heads) or its outline ink left out: take one away and see whether a speck goes (a diagnostic, never a look). */
export const skinLeaveOut = (search?: string): 'marks' | 'ink' | '' => { const v = flagValue('joins', search ?? undefined); return v === 'nomarks' ? 'marks' : v === 'noink' ? 'ink' : ''; };
/** The skin phase a mode builds (spec 4.1): 0 none. */
export const joinsPhase = (m: JoinsMode): 0 | 1 | 2 => (m === 'mesh' ? 1 : m === 'mesh2' ? 2 : 0);
