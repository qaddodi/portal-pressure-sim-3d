// The order a talk plays its slides in, against the 2D app's order. A review may move a slide (`MOVE_AFTER` in scripts/source-edits.mjs: the owner, 27 Nov 2026, put the HVPG talk's PPG slide after its two EUS slides);
// everything the 2D app recorded for a talk (the 2D numbers, the inventory) stays in the 2D order and is joined to the talk by slide id through these two functions, never by position.
import { SOURCE_PATCHES } from './source-edits.mjs';

/** The slide ids of a talk in play order, from the ids in the 2D order. */
export function playOrder(deck, ids) {
  const out = [...ids];
  for (const p of SOURCE_PATCHES.filter((x) => x.deck === deck && x.moveAfter)) {
    const from = p.at.split('.').at(-1), to = p.moveAfter.split('.').at(-1);
    if (!out.includes(from) || !out.includes(to)) continue;
    out.splice(out.indexOf(from), 1);
    out.splice(out.indexOf(to) + 1, 0, from);
  }
  return out;
}

/** Rows that carry a slide `id`, in the 2D order, put in the order the talk plays (rows already in play order stay as they are). */
export function inPlayOrder(deck, rows) {
  if (!rows) return rows;
  const by = new Map(rows.map((r) => [r.id, r]));
  const ids = playOrder(deck, rows.map((r) => r.id));
  return ids.map((id) => by.get(id));
}
