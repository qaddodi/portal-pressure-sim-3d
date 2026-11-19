// The cards that are on screen in one place (a slot): the one that is in, and any that are still leaving. A new card entering marks the
// one before it as leaving (it drops and fades while the new one rises), so nothing pops out and nothing pops in. Pure, so a test can walk it.

import type { CardId } from '../layout/plan.ts';

export interface Entry { key: string; id: CardId; phase: 'in' | 'out' }
export interface Wanted { key: string; id: CardId }

export const EXIT_MS = 220;

export function reconcile(entries: Entry[], wanted: Wanted | null): Entry[] {
  const cur = entries.find((e) => e.phase === 'in') ?? null;
  if (cur && wanted && cur.key === wanted.key) return entries;
  if (!cur && !wanted) return entries;
  const out: Entry[] = entries.map((e) => (e.phase === 'in' ? { ...e, phase: 'out' as const } : e));
  // a card that was leaving and is wanted again comes back in (a quick Back after Next): reuse it, do not mount a second copy
  if (wanted) {
    const back = out.findIndex((e) => e.key === wanted.key);
    if (back >= 0) out[back] = { ...out[back], phase: 'in' };
    else out.push({ key: wanted.key, id: wanted.id, phase: 'in' });
  }
  return out;
}

export const drop = (entries: Entry[], key: string): Entry[] => {
  const e = entries.find((x) => x.key === key);
  return e && e.phase === 'out' ? entries.filter((x) => x.key !== key) : entries;
};
