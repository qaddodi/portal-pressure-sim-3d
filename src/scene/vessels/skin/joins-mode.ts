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
  return v === 'old' || v === 'mesh' || v === 'mesh2' ? v : JOINS_DEFAULT;
}
/** The skin phase a mode builds (spec 4.1): 0 none. */
export const joinsPhase = (m: JoinsMode): 0 | 1 | 2 => (m === 'mesh' ? 1 : m === 'mesh2' ? 2 : 0);
