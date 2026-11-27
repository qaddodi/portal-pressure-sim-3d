// A slide that sets pressures side by side shows them on the pressure ladder, not as tiles (owner, 27 Nov, Presinusoidal portal hypertension 3, "show the ladder of pressure instead of the
// tiles"). The copy stays the 2D deck character for character; this is laid on when a deck loads (decks/overlay.ts withOverlay), for EVERY deck, by one rule and no list of slides.
//
// The rule: a slide about an intrahepatic site of resistance (presinusoidal, sinusoidal, postsinusoidal) whose data card is tiles alone, and whose tiles are two or more pressures
// at DIFFERENT stations of the circuit (portal vein, sinusoid, hepatic vein, cava, right atrium). Two numbers at two stations is a fall in pressure, and the ladder (the profile chart,
// Gut to heart) draws it where it happens, from the same patient, and follows the slide's what-if slider and compare buttons like every other number (ui/talk/shown-state.ts).
// The ladder prints every station's number itself, so a tile for one of them repeats it; a tile for a reading the ladder does not print (the sinusoid's own pressure: its Intra-
// sinusoidal station is the wedged one) stays, in the card's header, so a number the words cite is still on screen (tests/numbers-shown.test.ts).
//
// Not the rule: two readings that are one station's (WHVP and the sinusoidal pressure both stand at the Intra-sinusoidal station: that slide's point is the two numbers side by
// side, so it keeps its tiles), a slide with its own instrument, chart, table or time-lapse, and a slide about no site.
import { AT_FP } from '../../ui/charts/profile/layout.generated.js';
import type { CopiedDeck, CopiedSlide } from '../hp/types.ts';

/** The sites the rule reads (the slide's `site`): the three intrahepatic levels. */
export const LADDER_SITES: readonly string[] = ['presin', 'sin', 'postsin'];

/** The station each reading stands at on the ladder (its stations' own readings, plus the sinusoid's pressure, which stands at the Intra-sinusoidal one). */
const STATION_OF: Readonly<Record<string, string>> = { ...Object.fromEntries(Object.entries(AT_FP as Record<string, string>).map(([station, key]) => [key, station])), sin: 'SIN_R' };
/** The readings the ladder prints as numbers: every station's, and the brackets' (the HVPG, the PPG and the EUS-PPG). */
const PRINTED: ReadonlySet<string> = new Set([...Object.values(AT_FP as Record<string, string>), 'hvpg', 'ppg', 'eus']);

/** Does this slide's tiles card become the ladder? */
export function showsLadder(s: CopiedSlide): boolean {
  if (s.data !== 'tiles' || !Array.isArray(s.tiles) || s.tiles.length < 2) return false;
  if (s.tool || s.visual || s.table || s.lapse || s.procedure || s.scopeTile || s.hvpgResp) return false;
  if (!LADDER_SITES.includes(String(s.site ?? ''))) return false;
  const at = s.tiles.map((k) => STATION_OF[k]);
  return at.every(Boolean) && new Set(at).size === at.length;
}

/** The deck with each qualifying slide's tiles card replaced by the ladder (a copy; the loaded module is never changed). Laid on twice it changes nothing: a slide with a tool no longer qualifies. */
export function amendLadder(deck: CopiedDeck): CopiedDeck {
  if (!deck.slides.some(showsLadder)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s): CopiedSlide => {
      if (!showsLadder(s)) return s;
      const keep = (s.tiles as string[]).filter((k) => !PRINTED.has(k));
      const { tiles: _tiles, data: _data, ...rest } = s;
      return { ...rest, tool: { kind: 'profile' }, ...(keep.length ? { data: 'tiles', tiles: keep } : {}) } as CopiedSlide;
    }),
  };
}
