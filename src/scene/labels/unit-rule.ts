// One unit rule for the whole figure (capture 3531bdfa F-D4: "Portal vein 18.8" beside "IVC 4.8 mmHg" on one screen).
// The solver picks a form per label, and a squeezed label sheds its unit first (2D shortenItem), so one tight corner
// made one label bare while its neighbours kept "mmHg". A figure's reading labels now all say the unit or none does:
// where the first solve left any of them bare, the whole figure is solved again with the bare forms only (the lens key
// says the unit once). Pure data: node judges it.
import type { Item, Placement, Form } from './solver.ts';

/** A label is a reading label when one of its forms is the bare one (it carries a unit, badge or alert that can go). */
export const hasBare = (it: Pick<Item, 'forms'>): boolean => it.forms.some((f) => f.bare);

/** True when the labels placed carry the unit unevenly: some of the reading labels stand bare and some still say it. */
export function mixedUnits(items: readonly Item[], placed: readonly Placement[]): boolean {
  const by = new Map(items.map((i) => [i.id, i]));
  let bare = 0, whole = 0;
  for (const p of placed) {
    const it = by.get(p.id);
    if (!it || !it.forms.some((f) => f.bare) || !it.forms.some((f) => !f.bare)) continue;
    if (it.forms[p.form]?.bare) bare++; else whole++;
  }
  return bare > 0 && whole > 0;
}

/**
 * The same items with the unit gone from every reading label: each keeps only its bare forms, and its standing form is
 * found again by its words (the forms are shorter by the dropped ones, so an index would point elsewhere).
 */
export function bareItems(items: readonly Item[], full: ReadonlyMap<string, readonly Form[]>): Item[] {
  return items.map((it) => {
    const all = full.get(it.id) ?? it.forms;
    if (!all.some((f) => f.bare)) return it;
    const forms = all.filter((f) => f.bare);
    const kept = it.optional ? forms.slice(0, 1) : forms;
    const was = it.was && all[it.was.form] ? { ...it.was, form: kept.findIndex((f) => f.text === all[it.was!.form]!.text) } : undefined;
    const { was: _old, ...rest } = it;
    return { ...rest, forms: kept, ...(was && was.form >= 0 ? { was } : {}) };
  });
}
