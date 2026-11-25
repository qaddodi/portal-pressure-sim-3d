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
