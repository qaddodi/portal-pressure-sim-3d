// What the labels need from the talk and the viewer, in one small store the label layer subscribes to. The deck link (deck-link.ts) and the
// scene's pick write it; nothing here knows a deck.
import { create } from 'zustand';
import type { Vector3 } from 'three';
import type { CathState } from '../../decks/schema.ts';
import type { FigCard, FigCaliper, FigSpan } from './figure-cards.ts';
import type { CathText, CalloutKind } from './cath-show.ts';
import type { Tone } from './cath.ts';

/** A procedure's own reading cards on the figure (2D proc-anim.js `labels`: the EUS-PPG's PV at the portal target, HV at the hepatic one, then the summary): the layer places them as the catheter's. `text` is written in place as a reading settles. */
export interface ProcCards {
  kinds: readonly CalloutKind[];
  /** changes when the cards' kinds, names or tones do: the layer solves their places again then */
  sig: string;
  kickers: { f: string; w: string; h: string };
  tones: { f: Tone; w: Tone };
  /** the result stack stands midway between the points (2D `mid`, the EUS-PPG's) */
  mid?: boolean;
  text: CathText;
  /** the two points the cards point to, in the figure's own space: `tip` the one 'f' stands at, `ahead` the one 'w' does; false while the scene has none */
  points(tip: Vector3, ahead: Vector3): boolean;
}

export interface LabelsState {
  /** Stations the slide's words light (a colour each: `tones`); every other label steps back while any is lit. */
  named: ReadonlySet<string>;
  /** Stations the slide asks to have shown (its `labels`), whether or not its words light them: they join the figure's own names and dim nothing. */
  shown: ReadonlySet<string>;
  /** The colour token (2D: 'pv', '--tour-sys', 'accent') each lit station's words take. */
  tones: Readonly<Record<string, string>>;
  cath: CathState | null;
  /** The lens whose key the slide shows (null: none). */
  key: string | null;
  /** A procedure that wants the figure's names out of its way while it works (2D proc-anim.js `quiet`: the EUS-PPG's and the IR pressures' needles). */
  quiet: boolean;
  /** A centred panel (the outline, a table, a chart, the quick check) stands over the figure: its names stand aside, as they do for the catheter (they ease out, and back). */
  panel: boolean;
  proc: ProcCards | null;
  /** A talk is on: the figure names exactly what the slide names (2D `presenting` + `presentLabels`), never its free-play set. */
  presenting: boolean;
  /** Blood menu option: organ names on the figure (off until the Blood menu lands in batch B1/B3). */
  organNames: boolean;
  set(p: Partial<Omit<LabelsState, 'set'>>): void;
}

export const useLabels = create<LabelsState>((set) => ({
  named: new Set(), shown: new Set(), tones: {}, cath: null, key: null, organNames: false, quiet: false, panel: false, proc: null, presenting: false,
  set: (p) => set(p),
}));

/** The cards and calipers a slide stands on the figure (marks, sites, steps, calipers). The figure link (ui/deck/figure-link.ts) writes it; the layer draws it (figure-cards.ts). */
export interface FigureState {
  cards: readonly FigCard[];
  calipers: readonly FigCaliper[];
  /** The Circuit's brackets between two stations (a slide's `span`). */
  spans: readonly FigSpan[];
  /** The lobule's stations the slide's words name, each of which stands first with its pressure (figure-calls.ts `reads`). */
  reads: readonly string[];
  /** the colour they take with the callout beside them (a station colour token), or null */
  readsTone: string | null;
  /** the stations of `reads` that take it */
  lit: readonly string[];
  /** when the slide landed (performance.now), for the numbered steps */
  t0: number;
  set(p: Partial<Omit<FigureState, 'set'>>): void;
}
export const useFigure = create<FigureState>((set) => ({ cards: [], calipers: [], spans: [], reads: [], readsTone: null, lit: [], t0: 0, set: (p) => set(p) }));
