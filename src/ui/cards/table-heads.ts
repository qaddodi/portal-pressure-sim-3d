// Whether a table's column heads stand upright is written on the table the moment it is judged, not at the next render. The card that holds the table measures its height in its own layout effect, which runs
// right after the table's in the same commit; the table's judgement used to reach the page only through `setUp` (the render after that effect), so the card measured the heads still lying (a table 49 to 64 px
// short) and the heads turned a frame later. When the card had already landed, its box was locked at the short height and the last rows were cut off (capture 84496815, iPad: Shunts 15 and Ten years 21).
// Pure on the two elements it is handed (classList only); tests/table-heads-written-at-once.test.ts.
export interface ClassHost { classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean } }

/** Puts the table's heads upright (or lying) on the page at once; returns whether that changed anything. */
export function turnHeads(row: ClassHost, box: ClassHost, up: boolean): boolean {
  const was = row.classList.contains('th-up');
  if (up) { row.classList.add('th-up'); box.classList.add('dk-up'); } else { row.classList.remove('th-up'); box.classList.remove('dk-up'); }
  return was !== up;
}

// ── The three ways a head can stand (Mohammad, 26 Nov, slide 13 of Sites and causes: "B") ──
// flat: each head over its own column.
// staggered: where a flat head would not fit its column, the heads stand flat all the same, on two levels (every other head a line higher,
//   a tick down to its column) under the group's name ("Pressures", "Ascites"), each head with two columns of room.
// turned: where even that is too tight (a head of many letters over a narrow column) the head lies on its side as before.
// The first that fits wins; the judgement and its pure rule are here, the measuring is TableCard's.
export type HeadMode = 'flat' | 'stagger' | 'turned';
/** The first way that fits: flat when no head overflows its column, else staggered when every head fits two columns, else turned. */
export const chooseHeads = (flatOver: boolean, staggerOver: boolean): HeadMode => (!flatOver ? 'flat' : !staggerOver ? 'stagger' : 'turned');
/** Whether a head of `w` px fits when staggered: two columns of `col` px less a gap (the first and last heads keep to the table's edge and take their two columns inward, CSS). */
export const fitsStaggered = (w: number, col: number): boolean => w <= 2 * col - 6;
/** Writes the way the heads stand on the page at once (classes only, as turnHeads); returns whether that changed anything.
 *  `th-up` is the turned row, `th-st` the staggered one; the table has `dk-up` for both (the name column's formula, deck-ui.css:
 *  the columns need only their arrows) and `dk-st` for the staggered one (the group row shows). */
export function setHeads(row: ClassHost, box: ClassHost, mode: HeadMode): boolean {
  const was: HeadMode = row.classList.contains('th-up') ? 'turned' : row.classList.contains('th-st') ? 'stagger' : 'flat';
  for (const c of ['th-up', 'th-st']) row.classList.remove(c);
  for (const c of ['dk-up', 'dk-st']) box.classList.remove(c);
  if (mode === 'turned') { row.classList.add('th-up'); box.classList.add('dk-up'); }
  if (mode === 'stagger') { row.classList.add('th-st'); box.classList.add('dk-up'); box.classList.add('dk-st'); }
  return was !== mode;
}

/** The runs of a table's columns by group: [{ label, span }] in order ("Pressures" over the pressure columns, "Ascites" over SAAG and protein, '' over the rest). */
export function groupRuns(groups: readonly string[]): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  for (const g of groups) { const last = out.at(-1); if (last && last.label === g) last.span++; else out.push({ label: g, span: 1 }); }
  return out;
}
/** Whether the group row is worth drawing: some group names at least two columns. */
export const showGroups = (runs: readonly { label: string; span: number }[]): boolean => runs.some((r) => r.label && r.span > 1);
