// How a summary table's column heads stand. Mohammad, 27 Nov 2026: "even on iPhone we should try our best not to have vertical text and use 45 degree text if possible, otherwise give the headers
// space or stagger the horizontal text"; then "it doesn't have to be angled if we can have a nice compact table otherwise, but angled is ok".
// ONE rule for every table in every deck at every width, in the order of what reads best:
//   flat:    each head on one line over its own column.
//   room:    still flat, but each value column is made as wide as its head asks and the name column gives way, provided no name then takes another line and nothing runs past the card
//            (TableCard's fit; table-words.ts gridOf `heads`).
//   wrap:    where a head does not fit one line, its words break onto two (never a word cut, never a third line), still flat and still over its column (plain columns, then with room for the widest word).
//   slant:   where two lines will not do either, every head lies at 45 degrees (ending over its column, rising to the left over the name's empty head), on one line, so a long head costs
//            height and almost no width.
//   stagger: only where the columns are too close even for a slant (a column under SLANT_PITCH), the heads stand flat on two levels, each with two columns of room, a tick down to its column.
// No head is ever turned to stand upright (vertical text): there is no such mode. The group names ("Pressures", "Ascites") stand over their columns in EVERY mode, as a band above the heads.
// The first that fits wins; the rule is pure here, the measuring is TableCard's. The way the heads stand is written on the page at once (classes only), because the card that holds the table
// measures its height in the layout effect that runs right after the table's (capture 84496815: a table judged a render late was measured short and its last rows were cut off).
export interface ClassHost { classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean } }

export type HeadMode = 'flat' | 'wrap' | 'slant' | 'stagger';
/** The classes each way writes: on the head row, and on the table (`dk-slant` / `dk-st`: heads that ask the name column for the room they give back, deck-ui.css). */
const ROW_CLASS: Record<HeadMode, string> = { flat: '', wrap: 'th-wr', slant: 'th-sl', stagger: 'th-st' };
const BOX_CLASS: Record<HeadMode, string> = { flat: '', wrap: '', slant: 'dk-slant', stagger: 'dk-st' };

/** The first way that fits: flat when no head overflows its column, else wrapped when every head fits two lines, else slanted when the columns are a slant apart, else staggered. Never upright. */
export const chooseHeads = (flatOver: boolean, wrapOver: boolean, pitchOk: boolean): HeadMode => (!flatOver ? 'flat' : !wrapOver ? 'wrap' : pitchOk ? 'slant' : 'stagger');
/** The most lines a wrapped head may take. */
export const WRAP_LINES = 2;
/** A head's room: its width (or its widest word's) and a few px of air either side. */
export const HEAD_AIR_PX = 6;
/** Whether giving the heads room is allowed: no name stands on more lines than it did with the plain columns (a name never takes a third line for a head), and no row runs past the table. */
export const roomFits = (namesNow: number, namesBefore: number, runsPast: boolean): boolean => !runsPast && namesNow <= Math.max(namesBefore, WRAP_LINES);
/** A wrapped head fits when its widest word is inside its cell and it stands on no more than WRAP_LINES lines of `lineH` px. */
export const wrapFits = (wordOver: boolean, headH: number, lineH: number): boolean => !wordOver && headH <= WRAP_LINES * lineH + 1;
/** Whether a head of `w` px fits when staggered: two columns of `col` px less a gap (the first and last heads keep to the table's edge and take their two columns inward, CSS). */
export const fitsStaggered = (w: number, col: number): boolean => w <= 2 * col - 6;

// ── The slant (45 degrees) ──
const SIN45 = Math.SQRT1_2;
/** The line height of a slanted head, in em (1: the lines of two neighbours are a column apart, and a column is the line's height over sin 45). */
export const SLANT_LINE_EM = 1;
/**
 * The least a column may be for its neighbour's slanted head not to touch it: the head's line height over sin 45 (12 px type: 17 px). Every value column is wider than this
 * (table-words.ts VALUE_CH).
 */
export const slantPitch = (fontPx: number): number => (SLANT_LINE_EM * fontPx) / SIN45;
/** The height a row of slanted heads takes: the widest head's width and its line height, both along 45 degrees, plus a little room under (above the cell's foot) and over. */
export const slantHeight = (widest: number, fontPx: number): number => Math.ceil(SIN45 * (widest + fontPx * SLANT_LINE_EM)) + 8;
/**
 * Where a slanted head's far end stands, from the table's left edge: the head ENDS over its column's middle (its body's own half height to the right of the corner it turns on)
 * and rises to the left, so the heads lean over the name column's empty head, never past the table's right edge.
 */
export const slantReach = (cellLeft: number, cellW: number, headW: number, fontPx: number): number => cellLeft + cellW / 2 - SIN45 * (fontPx / 2) - SIN45 * headW;
/** How far a slanted head leans past the table's left edge (negative reach): the room the name column keeps for it (`--dk-hl`), so the card's clip never cuts one. 0 where every head stays inside. */
export const slantLeftover = (reaches: readonly number[]): number => Math.max(0, Math.ceil(-Math.min(Infinity, ...reaches)) + 1);

/** Writes the way the heads stand on the page at once (classes only); returns whether that changed anything. */
export function setHeads(row: ClassHost, box: ClassHost, mode: HeadMode): boolean {
  const was = headModeOf(row);
  for (const c of Object.values(ROW_CLASS)) if (c) row.classList.remove(c);
  for (const c of Object.values(BOX_CLASS)) if (c) box.classList.remove(c);
  if (ROW_CLASS[mode]) row.classList.add(ROW_CLASS[mode]);
  if (BOX_CLASS[mode]) box.classList.add(BOX_CLASS[mode]);
  return was !== mode;
}
/** The way the head row stands now, read from its classes. */
export function headModeOf(row: ClassHost): HeadMode {
  return (Object.keys(ROW_CLASS) as HeadMode[]).find((m) => ROW_CLASS[m] && row.classList.contains(ROW_CLASS[m])) ?? 'flat';
}

/** The runs of a table's columns by group: [{ label, span }] in order ("Pressures" over the pressure columns, "Ascites" over SAAG and protein, '' over the rest). */
export function groupRuns(groups: readonly string[]): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  for (const g of groups) { const last = out.at(-1); if (last && last.label === g) last.span++; else out.push({ label: g, span: 1 }); }
  return out;
}
/** Whether the group row is worth drawing: some group names at least two columns. */
export const showGroups = (runs: readonly { label: string; span: number }[]): boolean => runs.some((r) => r.label && r.span > 1);
