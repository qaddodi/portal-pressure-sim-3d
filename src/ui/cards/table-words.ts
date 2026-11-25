// Words a summary table's rows need (TableCard.tsx), kept pure so a node test can hold them.
/** The length, in characters, of the longest word in the names (a word cannot break, so its width is the name column's floor). */
export const longestWord = (names: string[]): number => names.reduce((m, t) => Math.max(m, ...t.split(/[\s\u2011-]+/).map((w) => w.length)), 0);

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
export const COL_PAD_PX = 6;
/** The grid's tracks for a table: the name (its least width is `--dk-name-fit`, deck-ui.css, which gives way when the value columns need the room), a value column from its printed width up, the Doppler a share of the rest.
 *  `cols`: each column's key; `chars`: colChars of its cells (ignored for the Doppler). Returns the template and the least width all the value columns need together (`calc(...)`, for `--dk-cols`). */
export function gridOf(cols: readonly string[], chars: readonly number[]): { grid: string; need: string } {
  const value = cols.map((k, j) => (k === 'wave' ? null : chars[j]));
  const tracks = value.map((n) => (n == null ? 'minmax(0, 3.4fr)' : `minmax(calc(${n}ch + ${COL_PAD_PX}px), 1fr)`));
  const ch = value.reduce<number>((a, n) => a + (n ?? 0), 0), k = value.filter((n) => n != null).length;
  return { grid: `minmax(var(--dk-name-fit), 2fr) ${tracks.join(' ')}`, need: `calc(${+ch.toFixed(2)}ch + ${k * COL_PAD_PX}px)` };
}
