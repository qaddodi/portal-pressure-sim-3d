// A slide whose data card was tiles alone gets an instrument the app already draws (owner, 27 Nov, after reports/instrument-card-opportunities.md: "fix the stuff that needs fixing").
// The copy stays the 2D deck character for character; this is laid on when a deck loads (decks/overlay.ts withOverlay), after the ladder rule (overlay/ladder.ts), by "deck/slide".
//
// Each entry reuses, option for option, the `tool` another slide already gives the same claim (named in its comment), so nothing new is drawn: the card is one every other slide
// with that kind already fits on a phone, a tablet and a Mac. A tile for a reading the instrument prints itself is dropped (the ladder prints every station and its brackets, as
// overlay/ladder.ts); every other tile stays in the card's header, so a number the slide's words cite is still on screen (tests/numbers-shown.test.ts). A slide that already has
// a tool (a re-copy that gave it one, or a rule laid on before this one) keeps its own.
//
// Rule R5 (tests/instrument-cards.test.ts): every slide whose card is still tiles alone is either on KEEP_TILES (the facts are the point) or on PENDING (why not yet).
import { PRINTED as LADDER_PRINTS } from './ladder.ts';
import type { CopiedDeck, CopiedSlide } from '../hp/types.ts';

type Tool = NonNullable<CopiedSlide['tool']>;

/** The readings an instrument prints as numbers of its own, so a header tile for one would repeat it: the ladder's stations and brackets (as overlay/ladder.ts). */
const PRINTS: Readonly<Record<string, ReadonlySet<string>>> = { profile: LADDER_PRINTS };
export const printedBy = (tool: { kind?: unknown } | null | undefined): ReadonlySet<string> => PRINTS[String(tool?.kind ?? '')] ?? new Set<string>();

// The tools reused below, as the slides that own them write them.
const LADDER: Tool = { kind: 'profile' };
const FLUID: Tool = { kind: 'fluid', window: true, forces: true };
const FLOWS: Tool = { kind: 'flows' };
const STENT_CURVE: Tool = { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] };
const PREGNANCY_CURVE: Tool = { kind: 'curve', param: 'gestation', from: 0, to: 40, step: 2, lines: ['varix', 'hvpg'] };
const VARIX_CURVE: Tool = {
  kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'],
  dots: [{ slide: 'collat', name: 'CSPH' }],
};

/** The instrument each tiles-only slide takes, by "deck/slide". */
export const INSTRUMENT_CARDS: Readonly<Record<string, Tool>> = {
  // Kidney 6, "Carvedilol lowers the MAP, and the APP with it": the monitor with the Baveno VIII 4.6 hold rail (carvedilol/mapbleed), so the MAP is seen against the 65 line that
  // slides 7 and 8 are about; the None and Carvedilol buttons drive it as they drive the terlipressin monitor (kidney/terli). The APP stays a header tile.
  'kidney/carv': { kind: 'vitals', show: ['map', 'hr'], hold: true },
  // Ascites 5, "When the lymphatics are overrun": the fluid balance its slides 2, 3 and 6 show (ascites/start, lymph, balance); this is the slide where filtration beats the lymph.
  'ascites/overrun': FLUID,
  // Sites 2, "named for the site of resistance": the healthy patient's ladder (sites/healthy), its stations the ones the words number 1 to 5, before the next slides use it.
  'sites/overview': LADDER,
  // HVPG 12, "In Budd–Chiari the catheter often cannot enter the hepatic veins": the ladder with the gradients' brackets and no HVPG to measure (gradients/bc, sites/post).
  'hvpg/bc': { kind: 'profile', spans: ['hvpg', 'eus', 'ppg'] },
  // Who should get a TIPS 7 and TIPS complete 10, "how much sinusoidal flow a stent leaves depends on how fibrotic the liver is": the stent-width curve (shunts/wide,
  // tips-complete/diameter) drawn on this liver; the Less and More buttons move the case off it, above and below.
  'tips-candidacy/reserve': STENT_CURVE,
  'tips-complete/liver': STENT_CURVE,
  // Who should get a TIPS 10, "a stent sends more blood to a full atrium": the ladder with the state before the stent drawn faint (shunts/heart, the same claim).
  'tips-candidacy/heart-stent': { kind: 'profile', from: 'heart', fromLabel: 'Before' },
  // TIPS complete 11, the same heart: the ladder; its Before and Stent buttons lift the whole floor (shunts/heart).
  'tips-complete/heart': LADDER,
  // Pregnancy 2 and 8: the varix-and-HVPG curve over the weeks that slide 3 drives with its slider (pregnancy/weeks), standing still before it and back at week 0 after.
  'pregnancy/before': PREGNANCY_CURVE,
  'pregnancy/after': PREGNANCY_CURVE,
  // Circuit 2, "pressure falls in proportion to flow and resistance": the deck's own pressure-against-flow curve (circuit/relation) as one line of constant resistance, the healthy
  // liver's; its second line ("Healthy liver" against "Cirrhosis") is left off, because this patient is the healthy liver.
  'circuit/ohm': { kind: 'curve', x: 'pvFlow', param: 'splanchnicTone', from: 0.6, to: 1.6, step: 0.1, lines: ['ppg'] },
  // Carvedilol 12, "after a TIPS that brings the PPG to <12 mmHg": the ladder with the stent, the state before it drawn faint (variceal-bleed/rescue, "Before TIPS").
  'carvedilol/tips': { kind: 'profile', from: 'restart', fromLabel: 'Before TIPS' },
  // Portal vein thrombosis 13, "Carvedilol, then anticoagulation without delay" (owner, 27 Nov): the ladder with the partial clot before carvedilol drawn faint (shunts/heart),
  // so the fall in the portal pressure is drawn; the heart rate stays a header tile, the beta-blockade.
  'prehepatic/carv': { kind: 'profile', from: 'gradients', fromLabel: 'Before' },
  // Children with PVT 7, "a vein graft carries mesenteric blood past the thrombus": where the portal blood goes (meso-rex/flows, the next slide); the graft is not a shunt, so the
  // liver keeps it all. The Rex procedure plays as before (a flows card beside a procedure: tips-complete/dips).
  'meso-rex/bypass': FLOWS,
  // Gastric varices 11, "Splenectomy or splenic embolization treats the cause": where the portal blood goes (gastric-varices/shunt), so the gastrorenal share falls with each button.
  'gastric-varices/splenectomy': FLOWS,
  // Same gradient 6, "the shunt cuts hepatic portal perfusion": where the portal blood goes (same-gradient/shunt, the slide before).
  'same-gradient/cost': FLOWS,
  // Two lesions 4, "The varices grow while the HVPG falls": the HVPG–PPG plane (masld/still) with the trail from plain cirrhosis (as cause-treated/year2-plane), so the case moves
  // left and up at once, off the HVPG = PPG line.
  'two-lesions/varices': { kind: 'plane', plane: { base: 'hvpg-ppg', diag: { label: 'HVPG = PPG' } }, trail: [{ slide: 'base', name: 'Cirrhosis alone' }] },
  // Collaterals and varices 2, "Collaterals open where portal and systemic veins meet": where the portal blood goes (varices/umbilical).
  'varices/collat': FLOWS,
  // Collaterals and varices 5, gastric varices by class: the Sarin card (gastric-varices/classes), without that case's "Her varix" row.
  'varices/gastric': {
    kind: 'criteria', title: 'Sarin classes', ticks: false, lead: 'Classified by location.', rule: 'Baveno VIII 5.38',
    rows: ['**GOV1**, along the lesser curvature', '**GOV2**, toward the fundus', '**IGV1**, isolated in the fundus', '**IGV2**, elsewhere in the stomach'],
  },
  // Collaterals and varices 7, "Size, red wale marks and liver function predict a first bleed": the scope (endoscopy/red), size and red signs as this patient has them; the
  // No red signs / Red signs buttons are left off, because whether this patient's model varix shows red signs is the model's, not a claim the slide makes.
  'varices/redwale': { kind: 'scope', open: true },
  // Collaterals and varices 8 and 9, first and second prophylaxis: the deck's own varix-and-wall-stress curve (varices/relation) with the CSPH dot.
  'varices/primary': VARIX_CURVE,
  'varices/secondary': VARIX_CURVE,
};

/** Slides that keep tiles alone because the facts are the point (rule R5): each with its reason. */
export const KEEP_TILES: Readonly<Record<string, string>> = {
  'ncph/patient': 'the case opens: varix, spleen and platelets are unrelated findings, and the next slides bring the instruments',
  'meso-rex/child': 'the case opens: the spleen and the platelets are the findings that bring the child in',
  'ncph/psvd': 'another patient opens: the diagnosis is a biopsy, not a pressure; the two numbers set the scene',
  'outflow/sos': 'the case opens (SOS after conditioning) with its list of causes; the next slides bring the pressures',
  'hvpg/wedge-sinusoid': 'the WHVP and the sinusoidal pressure are one station: the two numbers side by side are the point (the ladder rule\'s same-station exception)',
  'stiffness/spleen': 'the figure is the instrument: the spleen\'s calipers and the normal outline measure it; the tiles are its two numbers',
  'masld/alcohol': 'advice (abstinence over cutting down): the numbers are context, not the claim',
  'masld/regress-lobule': 'the thinner septa in the lobule are the picture; the plane follows on the next slide',
  'cause-treated/year2-lobule': 'the thinner septa in the lobule are the picture; the plane follows on the next slide',
  'varices/eso': 'the route is anatomy (left gastric vein to the azygos), labelled on the figure; the flows card names no left gastric or azygos route',
};

/** Slides still on tiles alone that someone has to convert or keep (rule R5): each with why it is not converted yet. */
export const PENDING: Readonly<Record<string, string>> = {
  'day/strain': 'trace: the beat card prints the slide\'s settled state, so while the Valsalva is held its numbers would stand at rest; needs the beat card to follow the strain',
  'stiffness/fibrosis-lobule': 'fibroscan holds its probe on the body\'s liver, and this slide dives into the lobule; slide 3 just before carries the FibroScan on the same slider',
  'tipping/stable': 'R4: the HVPG-over-time chart of the next slide, standing at today; not in this batch',
  'tips-complete/gastric': 'unreviewed: where the portal blood goes (flows, as gastric-varices/shunt) under TIPS and BRTO is a candidate',
};

/** The deck with each listed slide's tiles card given its instrument (a copy; the loaded module is never changed). Laid on twice it changes nothing: a slide with a tool keeps it. */
export function amendInstruments(deck: CopiedDeck): CopiedDeck {
  const of = (s: CopiedSlide): Tool | undefined => (s.tool ? undefined : INSTRUMENT_CARDS[`${deck.id}/${s.id}`]);
  if (!deck.slides.some(of)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s): CopiedSlide => {
      const tool = of(s);
      if (!tool) return s;
      const printed = printedBy(tool), keep = ((s.tiles as string[] | null | undefined) ?? []).filter((k) => !printed.has(k));
      const { tiles: _tiles, data: _data, ...rest } = s;
      return { ...rest, tool, ...(keep.length ? { data: 'tiles', tiles: keep } : {}) } as CopiedSlide;
    }),
  };
}
