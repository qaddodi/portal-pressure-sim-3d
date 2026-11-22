// Slide procedures that play a Treat order on the figure (22 Nov 2026, the review round's R4): EVL, balloon tamponade, DIPS, DSRS and paracentesis. The 2D procedure table (copied/proc-anim.js) has
// catheters, the scope's measurements and the graft; these five have no catheter on a route, so each is a graft-style timeline (a clock, numbered steps, a callout on the part it works on) whose
// model change is the Treat order's own, and the figure draws what the model says with the devices Treat already uses: the ligator scope and the bands (devices/bands.ts), the tamponade tube
// (devices/balloons), the DIPS stent and the surgical shunt's vessel, the ascites and the abdomen card's IAP dial.
//
// Two ways to make the change, both the order's own:
//  - params (balloon, DIPS, DSRS): `apply` / `undo` / `had` edit the params as Treat's button does (ui/treat/orders.ts), so a patient who has the result has it taken back first and put back;
//  - morph (EVL, paracentesis): the order is an engine action (a band, a tap), which the engine cannot take back, so the run goes from the state before the slide (the slide before it in the
//    deck's own chain) to the slide's own state, as the talk's time-lapse does (decks/hp/lapse.ts): ui/deck/procs-link.ts sends the engine a morph to each snapshot. `morph` marks them.
// `scope` puts the endoscope on the figure for the run ('band': the ligator's cap). The specs are registered into the table the layer, the card and the readiness checks read (GRAFTS), once, on import.
import { GRAFTS } from './copied/proc-anim.js';

type Step = readonly [id: string, word: string, caption: string, short: string, shot: string, vessel: string, stations: readonly string[], f: number];
export interface InstrumentSpec {
  name: string; label: string; graft: true;
  T: { apply: number; back: number; end: number; [k: string]: number }; stops: number[]; steps: Step[];
  morph?: true; scope?: 'band';
  /** a catheter route the procedure runs a device on (route.ts), with the stretch its balloon lies along */
  route?: string; balloonSpan?: string;
  /** the step whose words describe the result the model takes at `T.apply`: the result must come in during that step, never before it (tests/instrument-procedures.test.ts) */
  resultStep: number;
  can(p: unknown, m?: unknown): string; offered(p?: unknown): boolean; apply(p: any): any; had(p: any): boolean; undo(p: any): any; before?: Record<string, unknown>;
}

const step = (id: string, word: string, caption: string, short: string, vessel: string, f = 0.5, shot = ''): Step => [id, word, caption, short, shot, vessel, [], f];
const nothing = (): string => '';

export const INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  evl: {
    name: 'Band (EVL)', label: 'Band (EVL)', graft: true, morph: true, scope: 'band',
    T: { apply: 2500, back: 6200, end: 7800 }, stops: [2200, 5200, 7800], resultStep: 1,
    steps: [
      step('scope', 'Scope in', 'The endoscope, with the ligator cap and a band loaded on its tip, is passed through the esophagus to the varices.', 'Scope', 'C1b'),
      step('band', 'Bands placed', 'Each varix is suctioned into the cap and a band is released around its base, starting at the gastroesophageal junction and working upward.', 'Bands', 'C1b'),
      step('done', 'Varices banded', 'The banded varices thrombose and slough over the following days. Banding is repeated until the varices are gone.', 'Banded', 'C1b'),
    ],
    can: nothing, offered: () => true, apply: (p) => p, had: () => false, undo: (p) => p,
  },
  tamponade: {
    name: 'Balloon tamponade', label: 'Balloon tamponade', graft: true,
    T: { apply: 3400, back: 6400, end: 7200 }, stops: [1800, 4600, 7200], resultStep: 1,
    steps: [
      step('tube', 'Tube in', 'The airway is secured first. The tube is then passed through the mouth into the stomach.', 'Tube', 'C2'),
      step('gastric', 'Gastric balloon', 'The gastric balloon is inflated in the stomach and the tube is put under traction, so the balloon compresses the cardia and the varices there.', 'Balloon', 'C2'),
      step('done', 'Bridge', 'Tamponade holds the bleeding for 24 hours at most. It is a bridge to a TIPS or a transplant, not a treatment.', 'Bridge', 'C2'),
    ],
    can: (p: any) => (p?.balloonGas ? 'The gastric balloon is already inflated.' : ''), offered: () => true,
    apply: (p) => { p.balloonGas = true; return p; }, had: (p) => !!p?.balloonGas, undo: (p) => { p.balloonGas = false; return p; }, before: { balloonGas: false },
  },
  dips: {
    name: 'DIPS', label: 'DIPS', graft: true, route: 'dips', balloonSpan: 'tract',
    // (the stent opens in the third step, "Stent in": at 4100 it came in during "Needle across", before the stent had been placed)
    // (the TIPS's timeline in the DIPS's steps: the needle's hit (flash0 to flash1) makes the tract, the balloon dilates it (inflate0 to inflate1, down by deflate1), and only then does the model take the shunt (apply): tract.ts)
    T: { flash0: 3500, flash1: 4300, inflate0: 5000, inflate1: 5800, deflate0: 5900, deflate1: 6300, apply: 6400, back: 7600, end: 8500 }, stops: [1800, 4300, 8500], resultStep: 2,
    steps: [
      step('enter', 'Catheter in', 'A catheter passes through a vein of the neck or groin into the inferior vena cava.', 'In', 'DIPS', 0.5, 'way'),
      step('needle', 'Needle across', 'A needle passes from the vena cava straight through the liver into the portal vein, so no hepatic vein is needed.', 'Needle', 'DIPS', 0.5, 'tip'),
      step('done', 'Stent in', 'A covered stent joins the portal vein to the vena cava: portal blood reaches the heart without crossing the sinusoids.', 'Stent', 'DIPS', 0.5, 'tip'),
    ],
    can: (p: any) => (p?.dips?.on ? 'A DIPS is already in place.' : ''), offered: () => true,
    apply: (p) => { p.dips = { ...p.dips, on: true, d: p.dips?.d || 8 }; return p; }, had: (p) => !!p?.dips?.on, undo: (p) => { p.dips = { ...p.dips, on: false }; return p; }, before: { dips: { on: false } },
  },
  dsrs: {
    name: 'Distal splenorenal shunt (DSRS)', label: 'DSRS', graft: true,
    T: { apply: 3600, back: 6600, end: 7800 }, stops: [2000, 4200, 7800], resultStep: 1,
    steps: [
      step('expose', 'Splenic vein freed', 'At open surgery the splenic vein is freed from the pancreas and divided near its junction with the portal vein.', 'Freed', 'S_DSR'),
      step('sew', 'Joined to the renal vein', 'The splenic end is sewn to the left renal vein. The portal end is tied off.', 'Sewn', 'S_DSR'),
      step('done', 'Selective decompression', 'The spleen and the varices now drain through the shunt into the renal vein, while the mesenteric blood still reaches the liver.', 'Drains', 'S_DSR'),
    ],
    can: (p: any) => (p?.dsrs ? 'A distal splenorenal shunt is already in place.' : ''), offered: () => true,
    apply: (p) => { p.dsrs = true; return p; }, had: (p) => !!p?.dsrs, undo: (p) => { p.dsrs = false; return p; }, before: { dsrs: false },
  },
  paracentesis: {
    name: 'Paracentesis', label: 'Paracentesis', graft: true, morph: true,
    T: { apply: 2400, back: 6200, end: 7200 }, stops: [1600, 5000, 7200], resultStep: 1,
    steps: [
      step('needle', 'Needle in', 'A needle or catheter passes through the abdominal wall into the ascites, under ultrasound.', 'Needle', ''),
      step('drain', 'Fluid drains', 'The ascites drains. As the fluid leaves, the intra-abdominal pressure falls and the abdomen softens.', 'Drains', ''),
      step('done', 'Needle out', 'The needle is withdrawn. With a large-volume tap, albumin is given to protect the circulation.', 'Out', ''),
    ],
    can: nothing, offered: () => true, apply: (p) => p, had: () => false, undo: (p) => p,
  },
};

/** The kinds a slide's `procedure` may name that this file adds. */
export const INSTRUMENT_KINDS = Object.keys(INSTRUMENT_SPECS);

let done = false;
/** Put the specs in the table the layer, the card and the readiness checks read (the graft table; nothing in it is replaced). Idempotent. */
export function registerInstrumentSpecs(): void {
  if (done) return;
  done = true;
  const table = GRAFTS as Record<string, unknown>;
  for (const [k, s] of Object.entries(INSTRUMENT_SPECS)) { if (table[k]) throw new Error(`procedure "${k}" is already in the table`); table[k] = s; }
}
registerInstrumentSpecs();
