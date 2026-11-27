// The 3D app's changes to slide CONTROLS (owner, 26 Nov, after the controls audit: reports/slide-controls-audit.md). The copy stays the 2D deck character for character; these are laid on
// when a deck loads (decks/overlay.ts withOverlay), by "deck/slide", and tests/controls-amend.test.ts fails if a re-copy moves what they anchor on.
//   1. The beta-blocker response buttons stand for HVPG falls of about 5%, 15% and 25% (Mohammad: "sure"). A slide's patient answers a gain in its own way (propranolol only scales
//      the splanchnic part, carvedilol the sinusoidal part too), so each slide carries the three gains solved on its own patient (RESPONSE_FALLS; tests/controls-amend.test.ts re-solves
//      them on the engine), and the slide's own state is the usual responder's.
//   2. Each responder button brings its own line (Mohammad: "sure"); the usual responder keeps the slide's.
//   3. Partial splenic embolization is shown at 4 weeks: the infarct takes weeks in the model (engine SPLEEN_INFARCT, tau 14 days), and pressed on the slide's own day it showed nothing.
//   4. "Fenestrae open" (Lobule 4) is taken off: it redrew the pores and moved no number (Mohammad: "remove it unless it adds something").
import type { CopiedDeck } from '../hp/types.ts';

type Loose = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any

/** The HVPG falls the None, Usual and Strong buttons stand for (percent, from the slide `hvpgResp` names). */
export const RESPONSE_FALLS = [5, 15, 25] as const;

/** Each response slide's three gains (engine `nsbbGain`) for RESPONSE_FALLS, and the lines its None and Strong buttons bring. */
export const RESPONSE: Readonly<Record<string, { gains: readonly [number, number, number]; lines: readonly [string, null, string] }>> = {
  'landmark-trials/predesci-test': {
    // (propranolol's fall with no portal effect at all, gain 0, is already 4.5% here: its heart-rate part)
    gains: [0, 1.55, 4.75],
    lines: [
      'As a non-responder, propranolol lowers his HVPG only from {hvpg@predesci} to {hvpg}, less than 10%. In PREDESCI he would have been given carvedilol.',
      null,
      'As a strong responder, propranolol lowers his HVPG from {hvpg@predesci} to {hvpg}, about a quarter. A fall of ≥10% on IV propranolol meant propranolol in the trial.',
    ],
  },
  'carvedilol/start': {
    gains: [0.3, 0.83, 1.43],
    lines: [
      'As a non-responder, carvedilol lowers her HVPG only from {hvpg@rise} to {hvpg}, short of the ≥10% fall Baveno VIII counts as a response. It is started without an HVPG, so she stays on it.',
      null,
      'As a strong responder, carvedilol lowers her HVPG from {hvpg@rise} to {hvpg}, about a quarter. Baveno VIII counts a fall of ≥10% as a response before any bleed.',
    ],
  },
};

/** Which use of the drug each HVPG response tile judges (owner, 27 Nov, C2): a fall of ≥10% in primary prophylaxis and in the acute IV propranolol test, ≥20% (or an HVPG ≤12 mmHg) after a bleed.
 *  Every slide with a response tile (`hvpgResp`) is here, and its words name the use (tests/response-rule.test.ts).
 *  The treatment talk's patient is decompensated, so its response is the secondary one. */
export const RESPONSE_RULE: Readonly<Record<string, 'primary' | 'acute' | 'secondary'>> = {
  'next-bleed/nsbb': 'secondary',
  'landmark-trials/predesci-test': 'acute',
  'carvedilol/start': 'primary',
  'varices/predesci': 'primary',
  'treatment/prop': 'secondary',
  'treatment/carv': 'secondary',
  'treatment/carv-sin': 'secondary',
  'ten-years/carv': 'primary',
};

/** Compare buttons that need days to show what they do: `deck/slide/label` → the days and the label it then carries. */
export const BUTTON_DAYS: Readonly<Record<string, { days: number; label: string }>> = {
  'gastric-varices/splenectomy/Partial embolization': { days: 28, label: 'Partial embolization, 4 weeks on' },
};

/** Slides whose compare row is taken off. */
export const NO_COMPARE: readonly string[] = ['lobule/cirr'];

/** The speaker notes' old responder percentages, replaced by what the buttons now give. */
const NOTES: Readonly<Record<string, { from: string; to: string }>> = {
  'carvedilol/start': {
    from: 'with a non-responder the HVPG falls about 7%, with a usual responder about 19% and with a strong responder about 27% (model values on a decompensated patient)',
    to: 'with a non-responder the HVPG falls about 5%, with a usual responder about 15% and with a strong responder about 25% (model values)',
  },
};

/** The deck with the control changes laid on a copy (the loaded module is never changed). A slide or a button that is not there is left alone. */
export function amendControls(deck: CopiedDeck): CopiedDeck {
  const mine = (k: string) => k.startsWith(`${deck.id}/`);
  if (![...Object.keys(RESPONSE), ...Object.keys(RESPONSE_RULE), ...Object.keys(BUTTON_DAYS), ...NO_COMPARE, ...Object.keys(NOTES)].some(mine)) return deck;
  const d = JSON.parse(JSON.stringify(deck)) as CopiedDeck, slides = d.slides as Loose[];
  const by = (key: string): Loose | undefined => (mine(key) ? slides.find((s) => s.id === key.slice(deck.id.length + 1).split('/')[0]) : undefined);
  for (const [k, r] of Object.entries(RESPONSE)) {
    const s = by(k);
    if (!s || s.response !== true) continue;
    s.params = { ...(s.params ?? {}), nsbbGain: r.gains[1] };
    s.responseGains = [...r.gains];
    s.responseLines = [...r.lines];
  }
  for (const [k, rule] of Object.entries(RESPONSE_RULE)) { const s = by(k); if (s) s.hvpgRule = rule; }
  for (const [k, b] of Object.entries(BUTTON_DAYS)) {
    const s = by(k), label = k.split('/')[2];
    const o = Array.isArray(s?.compare) ? (s!.compare as Loose[]).find((x) => x.label === label) : undefined;
    if (o) { o.days = b.days; o.label = b.label; }
  }
  for (const k of NO_COMPARE) { const s = by(k); if (s) delete s.compare; }
  for (const [k, n] of Object.entries(NOTES)) { const s = by(k); if (s && typeof s.notes === 'string') s.notes = s.notes.replace(n.from, n.to); }
  return d;
}
