// Search (Ctrl or Cmd K, or /): the 2D app's matching, ported from palette.js. Type what you want; a number in the query is the argument ("tips 8", "+6 months", "albumin 2.5").
// Pure: commands in, ranked rows out. The sheet that shows them is src/ui/search/Search.tsx.

export interface Command {
  group: string; title: string;
  /** lower-cased, accent-free words the query is matched against (title plus keywords) */
  kw: string;
  /** the unit a number in the query is given in ("mm", "%") */
  num: string | null;
  hint: string;
  run(n: number | null): void;
}

export const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ');

export interface Hit { c: Command; num: number | null; score?: number }

/** What an empty field offers: a few of each thing its placeholder names (treatments, structures, patients, time, talks), in that order. */
export const EMPTY_QUOTA: Readonly<Record<string, number>> = { Treat: 3, 'Go to': 2, Patient: 2, Time: 2, Present: 1 };

export function search(cmds: readonly Command[], q: string, emptyOrder: readonly string[], max = 12): Hit[] {
  const numM = q.match(/-?\d+(\.\d+)?/);
  const num = numM ? parseFloat(numM[0]) : null;
  const words = norm(q.replace(/-?\d+(\.\d+)?/g, ' ')).split(/\s+/).filter(Boolean);
  if (!words.length && num == null) {
    const left: Record<string, number> = { ...EMPTY_QUOTA }, out: Hit[] = [];
    for (const c of cmds) if ((left[c.group] ?? 0) > 0) { left[c.group]--; out.push({ c, num: null }); }
    return out.sort((a, b) => emptyOrder.indexOf(a.c.group) - emptyOrder.indexOf(b.c.group));
  }
  const scored: Hit[] = [];
  for (const c of cmds) {
    let score = 0, ok = true;
    for (const w of words) {
      const i = c.kw.indexOf(w);
      if (i < 0) { ok = false; break; }
      score += (i === 0 ? 6 : c.kw[i - 1] === ' ' ? 4 : 1) + (c.title.toLowerCase().includes(w) ? 3 : 0);
    }
    if (!ok) continue;
    if (num != null && c.num) score += 3;
    if (num != null && !c.num && c.group !== 'Time') score -= 1;
    scored.push({ c, num: c.num ? num : null, score });
  }
  return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, max);
}

/** A command, with its keywords normalised. `when: false` leaves it out (a take-down is offered only for what is in place). */
export function command(group: string, title: string, run: (n: number | null) => void, o: { kw?: string; num?: string | null; hint?: string } = {}): Command {
  return { group, title, run, kw: norm(`${title} ${o.kw ?? ''}`), num: o.num ?? null, hint: o.hint ?? '' };
}
