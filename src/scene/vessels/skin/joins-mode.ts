// Which junction method the page asks for (spec section 6 and WP7): `?joins=old` is today's overlapping tubes with the shader-painted union outline (the way back, kept so Mohammad can compare and reverse at once),
// `?joins=mesh` the SMV-SV confluence as one welded skin (phase 1), `?joins=mesh2` every junction the spec lists (phase 2). With no flag the default below applies. Skins are only ever built with Smooth vessel joins on:
// they stand on the branch ends smooth joins moved onto their trunks (shape.ts fitEnds).
import { flagValue } from '../../../ui/debug/flags.ts';

export type JoinsMode = 'old' | 'mesh' | 'mesh2';
/** What no flag means: every skin of the spec (WP7, Mohammad 20 Nov: "let's just do it all, and we can reverse if it sucks"). `?joins=old` is the way back; the old junction code (nbr, bury, mates, collars) is all still in place under it. */
export const JOINS_DEFAULT: JoinsMode = 'mesh2';

/** The live answers of the inspector's panel (src/ui/debug/inspect), over the address's: set, a call with no search string (the page's own) answers with them, so the scene, the skins' programs and the lobule's welds all follow one switch. A test or the
 *  address's own string (a search argument) never sees them. `undefined` leaves the address's answer. */
export interface JoinsOverride { mode?: JoinsMode; drop?: boolean; leave?: Leave }
const live: JoinsOverride = {};
/** Changes the live answers (the panel). Returns what changed. */
export function setJoinsOverride(o: JoinsOverride): (keyof JoinsOverride)[] {
  const changed: (keyof JoinsOverride)[] = [];
  for (const k of Object.keys(o) as (keyof JoinsOverride)[]) { if (live[k] !== o[k]) { (live as Record<string, unknown>)[k] = o[k]; changed.push(k); } }
  return changed;
}
/** Takes the live answers away (the address's rule again). */
export function clearJoinsOverride(): void { delete live.mode; delete live.drop; delete live.leave; }

/** The mode from an address search string (no argument: the page's own, or the inspector's live answer). An unknown value is the default. */
export function joinsMode(search?: string): JoinsMode {
  if (search === undefined && live.mode !== undefined) return live.mode;
  const v = flagValue('joins', search ?? undefined);
  return v === 'old' || v === 'mesh' || v === 'mesh2' ? v : JOINS_DEFAULT;   // (`debug` is mesh2 with the skins' dropped pixels painted: skinDebugOn)
}
/** `?joins=debug`: every junction as with mesh2, and a skin pixel its shader would drop is painted instead, in the colour of the reason: red a back face, cyan the presence dither, yellow no alpha, magenta past the ink band. A hole in a weld is then a colour, and a hole that stays brown is not the skin's own drop. */
export const skinDebugOn = (search?: string): boolean => (search === undefined && live.drop !== undefined ? live.drop : flagValue('joins', search ?? undefined) === 'debug');
/** `?joins=nomarks`, `?joins=noheads` and `?joins=noink`: every skin as mesh2, with its flow marks, its chevron heads or its outline ink left out: take one away and see whether a speck goes (a diagnostic, never a look). */
export type Leave = 'marks' | 'ink' | 'heads' | '';
export const skinLeaveOut = (search?: string): Leave => {
  if (search === undefined && live.leave !== undefined) return live.leave;
  const v = flagValue('joins', search ?? undefined);
  return v === 'nomarks' ? 'marks' : v === 'noink' ? 'ink' : v === 'noheads' ? 'heads' : '';
};
/** The skin phase a mode builds (spec 4.1): 0 none. */
export const joinsPhase = (m: JoinsMode): 0 | 1 | 2 => (m === 'mesh' ? 1 : m === 'mesh2' ? 2 : 0);
