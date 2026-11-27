// A slide that shows two or more pressures shows them on the pressure ladder, not as tiles (owner, 27 Nov, Presinusoidal portal hypertension 3, "show the ladder of pressure
// instead of the tiles"; widened the same day: "a slide that shows two or more pressures, at any site, gets the ladder"). The copy stays the 2D deck character for character; this
// is laid on when a deck loads (decks/overlay.ts withOverlay), for EVERY deck, by one rule and no list of slides.
//
// The rule: a slide whose data card is tiles alone, and whose tiles hold two or more pressures, at any site (prehepatic to cardiac, or a slide that names none). A pressure is a
// station's reading (portal vein, sinusoid, wedged and free hepatic vein, cava, right atrium: the ladder's stations, charts/profile/layout.generated.js AT_FP, plus the sinusoid's
// own pressure, which stands at the Intra-sinusoidal one) or a gradient the ladder draws as a bracket (the HVPG, the PPG, the EUS-PPG). Pressures from one patient, side by side,
// are a fall along the circuit, and the ladder (the profile chart, Gut to heart) draws where it happens and follows the slide's what-if slider and compare buttons like every
// other number (ui/talk/shown-state.ts). The ladder prints every station's number and its brackets' itself, so a tile for one of them repeats it and is dropped; a tile for
// anything else (the sinusoid's own pressure, which the ladder does not print: its Intra-sinusoidal station is the wedged one; the flow, the platelets, the ascites) stays, in
// the card's header, so a number the words cite is still on screen (tests/numbers-shown.test.ts). An EUS-PPG tile asks the ladder for its bracket as well.
//
// Not the rule: two readings that are one station's (WHVP and the sinusoidal pressure both stand at the Intra-sinusoidal station: that slide's point is the two numbers side by
// side, so it keeps its tiles), and a slide with its own instrument, chart, table, procedure, scope, beta-blocker response or time-lapse.
import { AT_FP } from '../../ui/charts/profile/layout.generated.js';
import type { CopiedDeck, CopiedSlide } from '../hp/types.ts';

/** The station each reading stands at on the ladder (its stations' own readings, plus the sinusoid's pressure, which stands at the Intra-sinusoidal one). */
const STATION_OF: Readonly<Record<string, string>> = { ...Object.fromEntries(Object.entries(AT_FP as Record<string, string>).map(([station, key]) => [key, station])), sin: 'SIN_R' };
/** The gradients the ladder draws as brackets. */
const BRACKETS: readonly string[] = ['hvpg', 'ppg', 'eus'];
/** The readings the ladder prints as numbers: every station's, and the brackets'. */
export const PRINTED: ReadonlySet<string> = new Set([...Object.values(AT_FP as Record<string, string>), ...BRACKETS]);

/** Is this tile a pressure (a station's reading or a bracket)? */
export const isPressure = (k: string): boolean => k in STATION_OF || BRACKETS.includes(k);

/** Does this slide's tiles card become the ladder? */
export function showsLadder(s: CopiedSlide): boolean {
  if (s.data !== 'tiles' || !Array.isArray(s.tiles)) return false;
  if (s.tool || s.visual || s.table || s.lapse || s.procedure || s.scopeTile || s.hvpgResp) return false;
  const tiles = s.tiles as string[];
  if (tiles.filter(isPressure).length < 2) return false;
  // (two station readings at one station are the slide's point side by side; a bracket stands at no one station)
  const at = tiles.map((k) => STATION_OF[k]).filter(Boolean);
  return new Set(at).size === at.length;
}

/** The deck with each qualifying slide's tiles card replaced by the ladder (a copy; the loaded module is never changed). Laid on twice it changes nothing: a slide with a tool no longer qualifies. */
export function amendLadder(deck: CopiedDeck): CopiedDeck {
  if (!deck.slides.some(showsLadder)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s): CopiedSlide => {
      if (!showsLadder(s)) return s;
      const tiles = s.tiles as string[], keep = tiles.filter((k) => !PRINTED.has(k));
      const tool = tiles.includes('eus') ? { kind: 'profile', spans: ['hvpg', 'eus', 'ppg'] } : { kind: 'profile' };
      const { tiles: _tiles, data: _data, ...rest } = s;
      return { ...rest, tool, ...(keep.length ? { data: 'tiles', tiles: keep } : {}) } as CopiedSlide;
    }),
  };
}
