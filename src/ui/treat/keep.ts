// What the Treat card remembers of its sections across opens and visits: 2D chart.js `open` (the ids of the sections left open, saved as `pps.chartOpen3`). Changes starts closed so the card does
// not grow with every order; a person who opens it finds it open again the next time the card opens, and after a reload. A damaged saved value (not JSON, or not a list) starts closed.
// Pure on a Storage-like, so a test runs it without a browser.
import { STORAGE_PREFIX } from '../../state/settings.ts';

export const KEPT_KEY = `${STORAGE_PREFIX}chartOpen3`;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const door = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** The ids of the sections left open (2D: the `open` set at the top of createChart). */
export function readOpen(store: Store | null = door()): Set<string> {
  try {
    const v = JSON.parse(store?.getItem(KEPT_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
export function writeOpen(open: ReadonlySet<string>, store: Store | null = door()): void {
  try { store?.setItem(KEPT_KEY, JSON.stringify([...open])); } catch { /* storage unavailable: kept for this visit */ }
}
/** Whether a section starts open (2D `section()`: the Advanced physiology sections start open and the saved set holds the ones closed; the rest start closed and the set holds the ones open). */
export const startsOpen = (id: string, open: ReadonlySet<string>): boolean => open.has(id) !== id.startsWith('adv-');
/** A section was opened or shut by hand: the saved set follows (2D's toggle listener). Returns the same set. */
export function toggled(id: string, isOpen: boolean, open: Set<string>): Set<string> {
  if (isOpen !== id.startsWith('adv-')) open.add(id); else open.delete(id);
  return open;
}

let live: Set<string> | null = null;
/** The one set in this page's memory (read once from storage, kept in step). */
export const openSet = (): Set<string> => (live ??= readOpen());
export function remember(id: string, isOpen: boolean): void { writeOpen(toggled(id, isOpen, openSet())); }
/** For a test: forget the in-memory copy. */
export const forgetOpen = (): void => { live = null; };
