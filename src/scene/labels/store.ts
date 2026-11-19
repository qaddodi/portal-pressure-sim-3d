// What the labels need from the talk and the viewer, in one small store the label layer subscribes to. The deck link (deck-link.ts) and the
// scene's pick write it; nothing here knows a deck.
import { create } from 'zustand';
import type { Vector3 } from 'three';
import type { CathState } from '../../decks/schema.ts';
import type { CathText, CalloutKind } from './cath-show.ts';
import type { Tone } from './cath.ts';

/** One callout a procedure's step puts on the figure (2D proc-anim.js stepMark: its word and number on the vessel it works on; the HVPG-style cards are `ProcCards`). */
export interface FocusMark { edges: readonly string[]; label: string; num?: string; word?: string; kind?: string; f?: number }

/** A procedure's own reading cards on the figure (2D proc-anim.js `labels`: the EUS-PPG's PV at the portal target, HV at the hepatic one, then the summary): the layer places them as the catheter's. `text` is written in place as a reading settles. */
export interface ProcCards {
  kinds: readonly CalloutKind[];
  /** changes when the cards' kinds, names or tones do: the layer solves their places again then */
  sig: string;
  kickers: { f: string; w: string; h: string };
  tones: { f: Tone; w: Tone };
  text: CathText;
  /** the two points the cards point to, in the figure's own space: `tip` the one 'f' stands at, `ahead` the one 'w' does; false while the scene has none */
  points(tip: Vector3, ahead: Vector3): boolean;
}

export interface LabelsState {
  /** Stations the slide's words point at. */
  named: ReadonlySet<string>;
  cath: CathState | null;
  /** The lens whose key the slide shows (null: none). */
  key: string | null;
  /** A procedure that wants the figure's names out of its way while it works (2D proc-anim.js `quiet`: the EUS-PPG's and the IR pressure's needles). */
  quiet: boolean;
  proc: ProcCards | null;
  /** the step callouts standing on the figure now (2D `store.focus.marks`) */
  marks: readonly FocusMark[];
  /** Blood menu option: organ names on the figure (off until the Blood menu lands in batch B1/B3). */
  organNames: boolean;
  set(p: Partial<Omit<LabelsState, 'set'>>): void;
}

export const useLabels = create<LabelsState>((set) => ({
  named: new Set(), cath: null, key: null, organNames: false, quiet: false, proc: null, marks: [],
  set: (p) => set(p),
}));
