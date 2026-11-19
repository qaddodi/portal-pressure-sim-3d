// The shape of a copied 2D deck (written by scripts/copy-decks-ag.mjs). Every slide field of the 2D app is kept, so the words, the model's steps, the data card's
// tiles and tools, the lens and the camera all have one source. The fields this batch reads are typed; the rest stay `unknown` until the batch that owns them reads them.

export interface CopiedSlide {
  id: string;
  kicker: string;
  title: string;
  line: string;
  notes: string;
  ask: [string, string];
  vignette?: string;
  /** the words that point at the figure: { word: target }, or a list of target names */
  terms?: Record<string, string> | string[];
  /** the camera: a region name, 'fit', a box, a list of regions, { on, near } or a lobule camera. Absent: the whole figure ('fit'). */
  cam?: string | number[] | string[] | { on: string[]; near?: string };
  /** 'circuit' on a Circuit-view slide (its `cam` then names a circuit region). */
  view?: string;
  zone?: string;
  // the model (applied to the slide before's, in this order: preset, params, action, days)
  preset?: string;
  presetDays?: number;
  params?: Record<string, unknown>;
  action?: unknown;
  days?: number;
  relax?: number;
  ramp?: Record<string, [number, number]>;
  lapse?: { seconds: number; from?: string; to?: string; cam?: unknown; clock?: string };
  // the data card
  data?: string;
  tiles?: string[];
  key?: string[];
  delta?: string | boolean;
  tool?: { kind: string; [k: string]: unknown };
  visual?: string;
  /** a table visual's columns (tile keys) */
  cols?: string[];
  compare?: Record<string, unknown>[];
  // the figure
  lens?: string;
  cath?: string;
  procedure?: unknown;
  scales?: Record<string, unknown>;
  [field: string]: unknown;
}

export interface CopiedDeck {
  id: string;
  level: string;
  title: string;
  minutes: number;
  summary: string;
  objectives: string[];
  checks: [string, string][];
  sections?: [string, string[]][];
  topic?: string;
  short?: string;
  head?: string;
  keepPinch?: boolean;
  zoomTiles?: boolean;
  slides: CopiedSlide[];
}
