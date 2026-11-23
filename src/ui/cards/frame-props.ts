// What a card is drawn from while it moves (Plan 43 Part D). A card is fitted for the slide it was let in for: its ladder step (--pz-tk, --pz-dk, --pz-fit), its visual (the grid's `fill`, the `tabbed` name tab) and the
// signature that measures it again. The CardLayer used to hand every entry of a stack the NEW slide's values, so a card on its way out was re-spaced (its title changed size, its panel its padding, its height
// jumped) while it left, and the card coming in was fitted after it showed. Each entry now draws from its own snapshot, taken while it is the current card; only the current card takes the live values.
import type { CSSProperties } from 'react';

export interface FrameLive {
  /** the pair's steps, written on the card's box (--pz-tk on the words, --pz-dk and --pz-fit on the data card) */
  vars: CSSProperties | undefined;
  /** the visual panel's 2D visual (table, plane, ladders...) */
  visual: string | undefined;
  /** the signature that makes the card measure again */
  sig: string;
  /** a phone on its side whose table card still stood past its room after every step: its rows sit closer (`pz-tight`) */
  tight?: boolean;
}

/** The values a card draws with: the live ones while it is the current card, its own snapshot (the last it was current with) once it is leaving. A card with no snapshot yet takes the live ones. */
export function frameProps(current: boolean, live: FrameLive, snap: FrameLive | undefined): FrameLive {
  return current || !snap ? live : snap;
}

/** The classes of a words card (the panel's name tab, the six ladders' fill), from the visual it was let in with. */
export function wordsClasses(id: string, visual: string | undefined, tabbed: boolean, tight = false): string | undefined {
  return [(id === 'check' || id === 'visual') && tabbed ? 'tabbed' : '', id === 'visual' && visual === 'ladders' ? 'fill' : '', id === 'visual' && tight ? 'pz-tight' : ''].filter(Boolean).join(' ') || undefined;
}
