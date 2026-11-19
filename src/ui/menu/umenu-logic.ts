// The main menu's search and its words, as the 2D menu.js has them (fold, matches, filter, GROUP_WHERE). Plain functions, so a node test reaches them.

/** menu.js GROUP_WHERE: the words beside a patient group's name. */
export const GROUP_WHERE: Record<string, string> = {
  Yours: 'Made from your readings', Normal: 'No added resistance', 'Pre-hepatic': 'Before the liver', Presinusoidal: 'In the portal tracts',
  Sinusoidal: 'In the sinusoids', Postsinusoidal: 'At the central veins', 'Post-hepatic': 'Hepatic veins and IVC', Cardiac: 'The right heart',
};

/** menu.js fold: lower case, no accents, letters and digits only, so "Pre-hepatic" and "prehepatic" match each other. */
export const fold = (s: string | null | undefined): string => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const matches = (hay: string, words: string[]) => words.every((w) => hay.includes(w));
export const wordsOf = (query: string): string[] => query.trim().split(/\s+/).map(fold).filter(Boolean);

export interface Findable { find: string; more: string }
/** Names and titles first; only when none match does the search reach into the summaries (menu.js filter). */
export function filterRows<T extends Findable>(rows: T[], query: string): Set<T> {
  const words = wordsOf(query);
  if (!words.length) return new Set(rows);
  const deep = !rows.some((r) => matches(r.find, words));
  return new Set(rows.filter((r) => matches(r.find + (deep ? ' ' + r.more : ''), words)));
}

/** The words of the "nothing here" note: how many rows match on the other tab (menu.js filter). */
export function emptyNote(tab: 'present' | 'patients', here: number, there: number, query: string): { show: boolean; text: string; other: string } {
  const other = tab === 'present' ? 'patients' : 'present';
  const word = other === 'patients' ? (there === 1 ? 'patient matches' : 'patients match') : (there === 1 ? 'presentation matches' : 'presentations match');
  return { show: !!wordsOf(query).length && here === 0, text: tab === 'present' ? 'No presentation matches.' : 'No patient matches.', other: there ? `${there} ${word} ›` : '' };
}

/** menu.js stepping with the arrow keys over the visible rows: the next index, or -1 for "back to the search field". */
export const stepRow = (i: number, dir: 1 | -1, n: number): number => (dir === -1 && i === 0 ? -1 : Math.max(0, Math.min(n - 1, i + dir)));
