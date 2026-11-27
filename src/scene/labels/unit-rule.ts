// One unit rule for the whole figure (capture 3531bdfa F-D4: "Portal vein 18.8" beside "IVC 4.8 mmHg" on one screen).
// The solver picks a form per label, and a squeezed label sheds its unit first (2D shortenItem), so one tight corner
// made one label bare while its neighbours kept "mmHg". A figure's reading labels now all say the unit or none does:
// where the first solve left any of them bare, the whole figure is solved again with the bare forms only (the lens key
// says the unit once). Pure data: node judges it.
import type { Item, Placement, Form } from './solver.ts';

/** A label is a reading label when one of its forms is the bare one (it carries a unit, badge or alert that can go). */
export const hasBare = (it: Pick<Item, 'forms'>): boolean => it.forms.some((f) => f.bare);

/** How many of the reading labels placed stand bare and how many say their unit. */
export function unitCounts(items: readonly Item[], placed: readonly Placement[]): { bare: number; whole: number } {
  const by = new Map(items.map((i) => [i.id, i]));
  let bare = 0, whole = 0;
  for (const p of placed) {
    const it = by.get(p.id);
    if (!it || !it.forms.some((f) => f.bare) || !it.forms.some((f) => !f.bare)) continue;
    if (it.forms[p.form]?.bare) bare++; else whole++;
  }
  return { bare, whole };
}

/** True when the labels placed carry the unit unevenly: some of the reading labels stand bare and some still say it. */
export function mixedUnits(items: readonly Item[], placed: readonly Placement[]): boolean {
  const n = unitCounts(items, placed);
  return n.bare > 0 && n.whole > 0;
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

/**
 * The same items with every reading label keeping its unit: only the forms that carry it. Where the key says no unit, a figure whose labels
 * could not all keep theirs is tried again like this (the unit said on every label if nothing is lost for it), before the last resort of bare
 * labels that no key explains.
 */
export function unitItems(items: readonly Item[], full: ReadonlyMap<string, readonly Form[]>): Item[] {
  return items.map((it) => {
    const all = full.get(it.id) ?? it.forms;
    if (!all.some((f) => f.bare)) return it;
    const forms = all.filter((f) => !f.bare);
    const kept = it.optional ? forms.slice(0, 1) : forms;
    const was = it.was && all[it.was.form] ? { ...it.was, form: kept.findIndex((f) => f.text === all[it.was!.form]!.text && !all[it.was!.form]!.bare) } : undefined;
    const { was: _old, ...rest } = it;
    return { ...rest, forms: kept, ...(was && was.form >= 0 ? { was } : {}) };
  });
}

// ── Who says the unit: the key or the label (owner W19, 27 Nov: "bare labels, the key says the unit") ──
// A figure's reading labels and its lens key never both say a unit and never both leave it out. The key of a lens that counts in a unit
// names it beside the lens ("Pressure mmHg"); a reading label of that unit on a slide stands bare. A reading in some other unit than the key's
// (a flow in L/min on a pressure figure) keeps its own, so it is never a bare number. The shared place: legend caption units are the table's source
// (tests/labels-unit-key.test.ts holds the two together), and readings.ts, the key's model and the label sweeps all read these two functions.
export const KEY_UNIT: Readonly<Record<string, string>> = { pressure: 'mmHg', drop: 'mmHg', delta: 'mmHg', since: 'mmHg', heat: 'mmHg', flow: 'L/min', oxygen: '%', velocity: 'cm/s' };
/** The unit a lens's key names beside its name, or null where it names none (the stream lenses, velocity's "vs normal", Anatomy). */
export const keyUnit = (key: string | null | undefined): string | null => (key ? KEY_UNIT[key] ?? null : null);
/** True where the key says the unit a label would carry ("% O₂" is the key's "%"). */
export const keyStates = (key: string | null | undefined, unit: string): boolean => { const k = keyUnit(key); return !!k && unit.startsWith(k); };
/** The unit a reading label says: its own where the slide (or a tapped station) asks for one and the key does not already say it, else none. */
export const labelUnit = (o: { selected: boolean; presenting: boolean; key: string | null | undefined; unit: string }): string =>
  ((o.selected || o.presenting) && !keyStates(o.key, o.unit) ? o.unit : '');
