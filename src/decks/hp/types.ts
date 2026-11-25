// The shapes the copied 2D decks have (src/decks/hp/data/*.copied.ts). A slide's fields are the 2D deck's own, documented at the top of the 2D app's
// src/ui/decks.js; they are kept as written, so the type only names the ones the 3D layer reads and leaves the rest open.

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Table = { [k: string]: Json };

export interface CopiedSlide {
  id: string;
  kicker: string;
  title: string;
  line: string;
  notes: string;
  ask: [string, string];
  site?: string | null;
  vignette?: string | null;
  caseQ?: string | null;
  caveat?: string | null;
  cite?: string | null;
  /** Words of the line that point at a figure part (word → part), or just the parts the slide lights (a list). */
  terms?: Record<string, string> | string[] | null;
  eq?: [string, ...string[]] | null;
  // the model: applied to the slide before's, in this order
  preset?: string | null;
  presetDays?: number | null;
  params?: Table | null;
  action?: Table | Table[] | null;
  days?: number | null;
  relax?: number | null;
  /** the id of an earlier slide whose settled state this slide shows (the engine's restoreStep) */
  sameAs?: string | null;
  ramp?: Table | null;
  lapse?: Table | null;
  // the figure
  cam?: string | number[] | Table | null;
  view?: string | null;
  lens?: string | null;
  labels?: string[] | null;
  cath?: string | null;
  mark?: Table | Table[] | null;
  callout?: Json;
  scales?: Json;
  wash?: boolean | null;
  procedure?: string | Table | null;
  // the cards
  data?: string | null;
  tiles?: string[] | null;
  key?: string[] | null;
  delta?: boolean | string | null;
  tool?: Table | null;
  visual?: string | null;
  compare?: Table[] | null;
  whatIf?: Table | null;
  [k: string]: Json | undefined;
}

export interface CopiedDeck {
  id: string;
  title: string;
  short: string;
  head: string;
  topic: string;
  level: string;
  minutes: number;
  summary: string;
  objectives: string[];
  checks: [string, string][];
  sections?: [string, string[]][] | null;
  slides: CopiedSlide[];
  [k: string]: Json | CopiedSlide[] | undefined;
}
