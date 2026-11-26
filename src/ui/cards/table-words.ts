// Words a summary table's rows need (TableCard.tsx), kept pure so a node test can hold them.
/** The length, in characters, of the longest word in the names (a word cannot break, so its width is the name column's floor). */
export const longestWord = (names: string[]): number => names.reduce((m, t) => Math.max(m, ...t.split(/[\s\u2011-]+/).map((w) => w.length)), 0);

/** The width, in characters, that holds a name on two lines at most: the least width, never under its longest word,
 *  at which breaking it between words (greedily) takes two lines or fewer. A name of one word is its own length.
 *  The table's name column asks for the widest of these (capture 36b7deac, Sites and causes 13: "Sinusoidal obstruction
 *  syndrome" stood on three lines, the longest word's room being all the column asked for). */
export function twoLineChars(name: string): number {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const most = Math.max(...words.map((w) => w.length));
  for (let w = most; w < name.length; w++) {
    let lines = 1, used = 0;
    for (const x of words) {
      if (!used) used = x.length;
      else if (used + 1 + x.length <= w) used += 1 + x.length;
      else { lines++; used = x.length; }
    }
    if (lines <= 2) return w;
  }
  return name.length;
}
/** The widest two-line width among the names. */
export const twoLineWidest = (names: readonly string[]): number => names.reduce((m, t) => Math.max(m, twoLineChars(t)), 0);

/** What a cell's "Misses" said, in the row's own grey line: a word in a one-arrow cell (about 20 px on a phone) ran over its neighbours (capture 4fb2f869, Gradients 13 and Where is the resistance? 12). */
export function missWords(cells: { k: string; miss: string }[], cols: { k: string; label: string }[]): string {
  const names = (m: string) => cells.filter((c) => c.miss === m).map((c) => cols.find((x) => x.k === c.k)?.label ?? c.k);
  const all = names('Misses'), part = names('Misses part');
  return [all.length ? `${all.join(' and ')} misses it` : '', part.length ? `${part.join(' and ')} misses part of it` : ''].filter(Boolean).join('; ');
}


/** A value column never narrower than its printed cells (capture f23a4c59, iPhone: Landmark trials 16 ran "0.50" to the table's edge and Precipitants 11 stood "113/72 (86)" on three lines). The grid gave the name column its
 *  fixed least width and every value column an equal share of what was left (`minmax(0, 1fr)`: it may shrink to nothing), so a 4th numeric column, or a blood pressure, had less than its own ink.
 *  The least, in characters: the widest run of one cell's printed text that cannot break ("113/72 (86)" breaks at its space: 6), never under VALUE_CH (two arrows, or a two-digit number). */
export const VALUE_CH = 2.5;
/** What a cell of the table prints, as far as its width goes (TableCard's Td: a number is a `ref` cell's text, "Removed" is a small word, an arrow cell has no text). */
export interface Printed { kind: string; text: string }
export function colChars(cells: ReadonlyArray<Printed | undefined>): number {
  let m = VALUE_CH;
  for (const c of cells) {
    if (!c) continue;
    if (c.kind === 'ref') m = Math.max(m, ...c.text.split(/\s+/).map((w) => w.length));
    else if (c.kind === 'removed') m = Math.max(m, c.text.length * 0.85);   // ('none' is drawn at .85em)
  }
  return m;
}
/** The cell's own padding and a hair of room, in px, on top of the characters (a phone's cells stand .1em apart; a bp cell's are 2 px). */
export const COL_PAD_PX = 4;
/** The Doppler column's least width. It had none (`minmax(0, ...)`) and asked the name for nothing, so on a phone the name took its whole width and the trace was left ~25 px:
 *  the column and "No flow" were cut at the panel's edge (Doppler 13, capture 49141fb9). Now the name gives way for it as it does for a value column.
 *  4.5rem holds "No flow" and a trace worth reading. */
export const WAVE_MIN = '4.5rem';
/** The tallest a Doppler trace is drawn, in px: a table of six rows or more (Doppler 13) takes the shorter trace,
 *  so its rows stand about as tall as their names and the last row is not cut on a laptop. */
export const waveMaxH = (rows: number): number => (rows >= 6 ? 40 : 56);
/** The grid's tracks for a table: the name (its least width is `--dk-name-fit`, deck-ui.css, which gives way when the value columns and the Doppler need the room), a value column from its printed width up, the Doppler a share of the rest from WAVE_MIN.
 *  `cols`: each column's key; `chars`: colChars of its cells (ignored for the Doppler). Returns the template and the least width all the other columns need together (`calc(...)`, for `--dk-cols`). */
export function gridOf(cols: readonly string[], chars: readonly number[]): { grid: string; need: string } {
  const value = cols.map((k, j) => (k === 'wave' ? null : chars[j]));
  const tracks = value.map((n) => (n == null ? `minmax(${WAVE_MIN}, 3.4fr)` : `minmax(calc(${n}ch + ${COL_PAD_PX}px), 1fr)`));
  const ch = value.reduce<number>((a, n) => a + (n ?? 0), 0), k = value.filter((n) => n != null).length;
  const wave = value.some((n) => n == null) ? ` + ${WAVE_MIN}` : '';
  return { grid: `minmax(var(--dk-name-fit), 2fr) ${tracks.join(' ')}`, need: `calc(${+ch.toFixed(2)}ch + ${k * COL_PAD_PX}px${wave})` };
}

/** Whether a table runs past its card: some row's content is wider than the row (a cell pushed out past the table's right edge and cut by the card's: the
 *  PPG column of Where the HVPG is reliable on a phone, review 3531bdfa A-D6).
 *  The name's least width (`--dk-name-fit`) and each value column's least width are honest alone; nothing made them agree when together they were wider than the table, so the last column left it.
 *  Each row is a grid, so a cell that does not fit its track widens the row's scrollable width past its box. A pixel is rounding. */
export const pastEdge = (rows: ReadonlyArray<{ scrollWidth: number; clientWidth: number }>): boolean => rows.some((r) => r.scrollWidth > r.clientWidth + 1);
