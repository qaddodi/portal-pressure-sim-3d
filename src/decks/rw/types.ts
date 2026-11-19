// What the R-to-W deck port is made of. The words and every slide field are the 2D app's (copied/*.ts, written by scripts/port-decks-rw.mjs); the
// 3D fields are derived from them by plan.ts. Slides are described in the 2D app's src/ui/decks.js header, field by field.

/** A 2D slide: plain data, every field the 2D deck file has. Only `id` is named here; plan.ts reads the others by name and checks their shapes. */
export interface CopiedSlide { id: string; [field: string]: unknown }

/** A 2D deck, verbatim (src/ui/decks/*.js, plus the menu's topic, short and head names). */
export interface CopiedDeck {
  id: string; level: string; title: string; minutes: number; summary: string;
  objectives: string[]; checks: [string, string][]; slides: CopiedSlide[];
  sections?: [string, string[]][]; topic?: string; short?: string; head?: string;
  [field: string]: unknown;
}
