// The 3D app's amendments to the copied ascites deck (the copy stays the 2D deck character for character; these are applied when it loads, by slide id, and tests/ascites-deck-agree.test.ts
// holds each one and fails if a re-copy moves the words it anchors on). Each makes a slide agree with itself: a card and its chart measure the same thing, a colour means what it says.
import type { CopiedDeck } from './types.ts';
import { lvpAlbuminText } from '../lvp-albumin.ts';

type Loose = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** What each amendment says, kept apart so the test can read them. */
export const AMEND = {
  /** "No treatment, two weeks on" is compared with the paracentesis it follows, not with the tense baseline: against the baseline the refilled belly (3.3 L, under 6 L) showed a green fall. */
  tableVs: { slide: 'summary', row: 'back', vs: 'lvp' },
  /** The TIPS slide's words say the PPG (8.8) while its chart and tile plotted the portal vein pressure (15.9 to 13.7): the chart and the tile read the PPG too. */
  tipsReads: { slide: 'tips', from: 'pv', to: 'ppg' },
  /** The diuretics line said the ascites "stabilizes" while the day card (the model's own net, +190 mL/day) said it is still accumulating: the line says what the card says. */
  diureticsLine: { slide: 'diuretics', from: 'and the ascites stabilizes at {asc}.', to: 'and the ascites falls to {asc}, with only a slow creep left.' },
  /** The refractory slide had the same claim. */
  refractoryLine: { slide: 'refractory', from: 'Here it stabilizes at {asc}: not refractory.', to: 'Here it falls to {asc} and creeps up only slowly: not refractory.' },
  /** Slide 13 said the tap drains "the whole 6 L" while its own counter reads what the model took off (7.0 to 7.2 L, capture 4fb2f869): the line prints the model's own litres of the slide before it (tense), the very ones the tap takes off. */
  lvpLine: { slide: 'lvp', from: 'LVP drains the whole 6 L, and', to: 'LVP drains the whole {asc@tense}, and' },
  /** Slide 13's notes gave "about 35 to 45 g" for the 5.9 L the model takes off; the dose rule (decks/lvp-albumin.ts) gives 35 to 47 g for it
   *  (tests/lvp-albumin.test.ts holds every deck's doses to the rule). */
  lvpNotes: {
    slide: 'lvp',
    from: 'give about 35 to 45 g of 20% albumin',
    to: `give about ${lvpAlbuminText(5.9)} of 20% albumin`,
  },
} as const;

/** The deck with the amendments laid on a copy (the copied module is never changed). A slide or an anchor that is not there is left alone. */
export function amendAscites(deck: CopiedDeck): CopiedDeck {
  const d = clone(deck) as unknown as { slides: Loose[] };
  const by = (id: string) => d.slides.find((s) => s.id === id);

  const a = AMEND.tableVs, row = by(a.slide)?.of?.find((r: Loose) => r.id === a.row);
  if (row) row.vs = a.vs;

  const t = AMEND.tipsReads, tips = by(t.slide);
  if (tips) {
    if (Array.isArray(tips.tool?.lines)) tips.tool.lines = tips.tool.lines.map((k: string) => (k === t.from ? t.to : k));
    if (Array.isArray(tips.tiles)) tips.tiles = tips.tiles.map((k: string) => (k === t.from ? t.to : k));
  }

  for (const w of [AMEND.diureticsLine, AMEND.refractoryLine, AMEND.lvpLine]) {
    const s = by(w.slide);
    if (s && typeof s.line === 'string' && s.line.includes(w.from)) s.line = s.line.replace(w.from, w.to);
  }
  const n = AMEND.lvpNotes, ns = by(n.slide);
  if (ns && typeof ns.notes === 'string' && ns.notes.includes(n.from)) ns.notes = ns.notes.replace(n.from, n.to);
  return d as unknown as CopiedDeck;
}
