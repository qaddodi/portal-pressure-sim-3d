// The Compare view's table as data (2D ir-compare.js update): for the stent `which`, each row's Then (the pinned moment's metrics), Now (the live frame's) and the change, in the words the compare
// table prints. The rows and changeOf are the 2D file's own (copied/compare-parts.copied.js); a test reads this without a browser.
import { ROWS, DASH, num, changeOf, NOTHING_PINNED } from './copied/compare-parts.copied.js';
import { fmt } from '../../charts/fmt.ts';

export { NOTHING_PINNED, DASH };
type M = Record<string, unknown>;
export interface CmpRow { k: string; name: string; unit: string; a: string; b: string; cls: string; tri: string; txt: string }
export interface CmpIn { then: M | null; now: M | null; which: 'TIPS' | 'DIPS' }

/** The table's rows for the pinned moment (null: nothing pinned, every Then and Change a dash) and the live one. */
export function compareRows({ then, now, which }: CmpIn): CmpRow[] {
  const k = which === 'DIPS' ? 'dips' : 'tips';
  return (ROWS as { k: string; n: string; u: string; d: number; v(m: M | undefined, st: M | undefined): unknown }[]).map((r) => {
    const a = then ? num(r.v(then, then[k] as M | undefined)) as number | null : null, b = now ? num(r.v(now, now[k] as M | undefined)) as number | null : null;
    const ch = changeOf(a, b, r.d) as { cls: string; tri: string; txt: string };
    return { k: r.k, name: r.k === 'flow' && which === 'DIPS' ? 'DIPS flow' : r.n, unit: r.u, a: a == null ? DASH : fmt(a, r.d), b: b == null ? DASH : fmt(b, r.d), cls: ch.cls, tri: ch.tri, txt: ch.txt };
  });
}
/** The sentence over the table: how the moment was pinned, or how to pin one. */
export const compareNote = (snap: { when?: string } | null): string => (snap ? `Compared with ${snap.when}. A stent that was not there then shows a dash.` : (NOTHING_PINNED as string));
/** The two heads of the Then and Now columns (a talk may name the ends). */
export const compareHeads = (snap: { names?: readonly string[] } | null): [string, string] => (snap ? [snap.names?.[0] || 'Then', snap.names?.[1] || 'Now'] : ['Then', 'Now']);
