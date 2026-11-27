// The main menu's search and its words, as the 2D menu.js has them (fold, matches, filter, GROUP_WHERE). Plain functions, so a node test reaches them.
// @ts-ignore the pinned engine copy is plain JS
import { NOT_MEASURABLE } from '../../engine/hv-flag.ts';
import * as cuts from '../../engine/hales/portal/pressure-cuts.js';
import { fmt } from '../tests/copied/num.copied.js';

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

// ── The patient preview's chips (menu.js patientPreview) ──
/** What a settled snapshot of a patient holds (snapshots.copied.js). */
export interface Snap { P: number[]; hvpg: number; pv: number; pvFlow: number; ascites: number; fp?: { ppg?: number | null } }
export interface Chip { cls: string; title: string; word: string; value: string }

/** menu.js shownOf: a value as it prints, as a number, so the colour answers the figure on the chip. */
export const shownOf = (v: number, d = 1): number => (Number.isFinite(v) ? +v.toFixed(d) + 0 : v);
type Cuts = { sevOfCuts(c: unknown, v: number): 'ok' | 'caution' | 'danger'; HVPG_CUTS: unknown; PPG_CUTS: unknown };
/** menu.js sev: the standing cut-offs (HVPG amber 5, red 10; PPG amber 6, red 12, from the engine's one table) as the chip classes ok, low, high. */
const sev = (c: unknown, v: number): 'ok' | 'low' | 'high' => ({ ok: 'ok', caution: 'low', danger: 'high' } as const)[(cuts as Cuts).sevOfCuts(c, v)];
const one = (v: number) => fmt(v, 1) as string;   // (one decimal, as the tiles and the bar print the same gradients: "17.2", never "17")

/** The chips under a patient's curve: HVPG, PPG (when the snapshot has one), PV, and Hepatofugal when the portal flow runs away from the liver. */
export function chipsOf(s: Snap, hvBlocked = false): Chip[] {
  // (a patient whose hepatic vein is blocked has no HVPG to take: the chip says so, in no band; engine/hv-flag.ts)
  const title = 'Hepatic venous pressure gradient';
  const hv: Chip = hvBlocked ? { cls: 'hp-chip', title, word: 'HVPG ', value: NOT_MEASURABLE.toLowerCase() }
    : { cls: 'hp-chip ' + sev((cuts as Cuts).HVPG_CUTS, shownOf(s.hvpg)), title, word: 'HVPG ', value: one(s.hvpg) };
  const out: Chip[] = [hv];
  const ppg = s.fp?.ppg;
  if (ppg != null) out.push({ cls: 'hp-chip ' + sev((cuts as Cuts).PPG_CUTS, shownOf(ppg)), title: 'Portal pressure gradient (portal vein − IVC)', word: 'PPG ', value: one(ppg) });
  out.push({ cls: 'hp-chip', title: 'Portal vein pressure', word: 'PV ', value: fmt(s.pv, 1) as string });
  if (s.pvFlow < -0.05) out.push({ cls: 'hp-chip rev', title: 'Portal flow is reversed, away from the liver', word: 'Hepatofugal', value: '' });
  return out;
}

// ── The three lists: Present, Patients and Histories ──
export const MENU_TABS = ['present', 'patients', 'histories'] as const;
export type MenuTabId = (typeof MENU_TABS)[number];
/** The tab a step to the left or right lands on, going round (the arrow keys on a tab or a row). */
export const stepTab = (tab: MenuTabId, dir: 1 | -1): MenuTabId => MENU_TABS[(MENU_TABS.indexOf(tab) + dir + MENU_TABS.length) % MENU_TABS.length]!;

const NONE_HERE: Record<MenuTabId, string> = { present: 'No presentation matches.', patients: 'No patient matches.', histories: 'No history matches.' };
const MATCH_WORD: Record<MenuTabId, [string, string]> = { present: ['presentation matches', 'presentations match'], patients: ['patient matches', 'patients match'], histories: ['history matches', 'histories match'] };
/** The "nothing here" note for three lists: which other list has the most matches (the first of them when equal) and how many (menu.js filter, as emptyNote words it for two). */
export function emptyNoteOf(tab: MenuTabId, counts: Record<MenuTabId, number>, query: string): { show: boolean; text: string; other: string; otherTab: MenuTabId | null } {
  let best: MenuTabId | null = null;
  for (const t of MENU_TABS) if (t !== tab && counts[t] > 0 && (best == null || counts[t] > counts[best])) best = t;
  const n = best ? counts[best] : 0;
  return { show: !!wordsOf(query).length && counts[tab] === 0, text: NONE_HERE[tab], other: best ? `${n} ${MATCH_WORD[best][n === 1 ? 0 : 1]} ›` : '', otherTab: best };
}
