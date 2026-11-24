// Words a summary table's rows need (TableCard.tsx), kept pure so a node test can hold them.
/** The length, in characters, of the longest word in the names (a word cannot break, so its width is the name column's floor). */
export const longestWord = (names: string[]): number => names.reduce((m, t) => Math.max(m, ...t.split(/[\s\u2011-]+/).map((w) => w.length)), 0);

/** What a cell's "Misses" said, in the row's own grey line: a word in a one-arrow cell (about 20 px on a phone) ran over its neighbours (capture 4fb2f869, Gradients 13 and Where is the resistance? 12). */
export function missWords(cells: { k: string; miss: string }[], cols: { k: string; label: string }[]): string {
  const names = (m: string) => cells.filter((c) => c.miss === m).map((c) => cols.find((x) => x.k === c.k)?.label ?? c.k);
  const all = names('Misses'), part = names('Misses part');
  return [all.length ? `${all.join(' and ')} misses it` : '', part.length ? `${part.join(' and ')} misses part of it` : ''].filter(Boolean).join('; ');
}

